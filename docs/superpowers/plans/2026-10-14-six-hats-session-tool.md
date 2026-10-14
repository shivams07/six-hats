# Six Hats Session Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted web app where a facilitator designs a Six Thinking Hats flow and runs it live with their team: private writing per hat, auto-reveal at 0:00, dot-voting, a recorded decision with action items, Markdown export and an archive.

**Architecture:** One Node 24 process. Pure TypeScript modules (`engine`, `flow`, `contributions`, `views`, `export`) hold every product rule; thin shells (`sessions`, `timers`, `realtime`, `store`, `app`) handle I/O. Every accepted command is persisted to SQLite before it reaches memory or the wire, and every client receives a complete, redacted `View` after each change. A Vue 3 SPA, built by Vite, is served by the same process.

**Tech Stack:** Node 24 LTS, TypeScript 5.9, Express 5, Socket.IO 4, better-sqlite3 12, helmet 8, Vue 3.5, Vue Router 4, Vite 7, Vitest 4, Docker, Fly.io.

**Spec:** `docs/superpowers/specs/2026-10-14-six-hats-session-tool-design.md`

## Global Constraints

- Repo root: `/Users/shivam.singh/Documents/clevertap/six-hats`. Run every command from there.
- Node 24 only. The Bash tool does not keep shell state, so start **every** shell command with `source ~/.nvm/nvm.sh >/dev/null && nvm use >/dev/null && ` (reads `.nvmrc`). The plan's commands omit that prefix for readability; always add it.
- TypeScript is pinned to `~5.9.3`. Do not install TypeScript 6 or 7.
- Runtime dependencies are exactly: `express`, `socket.io`, `better-sqlite3`, `helmet`. Nothing else at runtime.
- Limits (spec §6–§11): title ≤120, focus ≤500, name ≤40, prompt ≤300, point ≤500, decision ≤4000, action text ≤300, action owner ≤60, template name ≤60; 1–20 steps; step duration 30–1800 s; votes per person 1–10; ≤50 participants; ≤30 points per person per step (everyone-writes mode); ≤200 notes per step (scribe mode); ≤50 action items.
- Writing modes: `everyone` (default; points private until the step is revealed) and `scribe` (only the assigned scribe writes; notes visible to all as typed; each note optionally credited via `saidBy`, otherwise "Team").
- Hat timer defaults: White 240 s, Red 60 s, Black 240 s, Yellow 240 s, Green 300 s, Blue 120 s.
- Session codes: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Tokens: 32 random bytes, base64url. Only SHA-256 hashes of tokens are stored.
- Session data leaves the server only through `buildView` (socket) or `toMarkdown` (HTTP). In everyone-writes mode a viewer never receives another person's point from an unrevealed step.
- User text is rendered only through Vue interpolation. Never `v-html`.
- A hat is always shown with its name and icon, never colour alone.
- Commit after every task with `-m "<message>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

## File Map

| File | Responsibility |
|---|---|
| `package.json`, `.nvmrc`, `.gitignore`, `vitest.config.ts`, `vite.config.ts`, `server/tsconfig.json`, `web/tsconfig.json` | Tooling |
| `shared/src/hats.ts` | Hat definitions, presets, limits, `formatDuration`, `presetSteps` |
| `shared/src/protocol.ts` | `Command`, `View`, API and socket-error types |
| `shared/src/rules.ts` | `isStepRevealed`, `canWrite`, `rankByVotes` |
| `server/src/session.ts` | `Session` types, `Ctx`, `Handler`, `HandlerMap` |
| `server/src/validate.ts` | Input validation |
| `server/src/engine.ts` | `createSession`, `joinSession`, `addFacilitatorToken`, `applyCommand` |
| `server/src/flow.ts` | Step-flow handlers + `timerExpired` |
| `server/src/contributions.ts` | Point, vote, decision, close handlers |
| `server/src/views.ts` | `buildView` (redaction) |
| `server/src/export.ts` | `toMarkdown` |
| `server/src/ids.ts` | `newId`, `newCode`, `newToken`, `hashToken` |
| `server/src/auth.ts` | `passcodeMatches`, `FailureLimiter`, `SlidingWindow` |
| `server/src/store.ts` | SQLite `Store` |
| `server/src/sessions.ts` | `SessionService` (write path, listeners) |
| `server/src/timers.ts` | `Timers` |
| `server/src/app.ts` | Express app |
| `server/src/realtime.ts` | Socket.IO wiring |
| `server/src/server.ts` | `startServer` |
| `server/src/index.ts` | Env → `startServer` |
| `server/test/*.test.ts`, `server/test/fixtures.ts`, `shared/test/*.test.ts` | Tests |
| `web/index.html`, `web/src/**` | Vue SPA |
| `Dockerfile`, `.dockerignore`, `fly.toml`, `README.md` | Packaging and docs |

---

### Task 1: Tooling and shared hat model

**Files:**
- Create: `package.json`, `.nvmrc`, `.gitignore`, `vitest.config.ts`, `server/tsconfig.json`
- Create: `shared/src/hats.ts`, `shared/src/protocol.ts`, `shared/src/rules.ts`
- Test: `shared/test/hats.test.ts`, `shared/test/rules.test.ts`

**Interfaces:**
- Produces: `HatId`, `HAT_IDS`, `HATS`, `HatDef`, `FlowStep`, `PRESETS`, `presetSteps(hats)`, `formatDuration(sec)`, `LIMITS` (hats.ts); `SessionStatus`, `StepPhase`, `WritingMode`, `ActionItem`, `NewActionItem`, `Command`, `CommandAck`, `View`, `ViewPoint`, `ViewParticipant`, `CreateSessionInput`, `CreateSessionResult`, `JoinResult`, `SessionSummary`, `Template`, `SOCKET_ERRORS` (protocol.ts); `StepState`, `isStepRevealed(s, i)`, `canWrite(s)`, `rankByVotes(points, votes)`, `creditedName(mode, authorName, saidByName?)` (rules.ts).

- [ ] **Step 1: Create tooling files**

`.nvmrc`:
```
24
```

`.gitignore`:
```
node_modules/
dist/
data/
*.db
*.db-*
.DS_Store
```

`package.json`:
```json
{
  "name": "six-hats",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "concurrently -k -n server,web -c blue,green \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server": "TEAM_PASSCODE=${TEAM_PASSCODE:-dev} DATA_DIR=${DATA_DIR:-./data} tsx watch server/src/index.ts",
    "dev:web": "vite",
    "build": "npm run build:server && npm run build:web",
    "build:server": "tsc -p server/tsconfig.json",
    "build:web": "vue-tsc -p web/tsconfig.json --noEmit && vite build",
    "typecheck": "tsc -p server/tsconfig.json --noEmit && vue-tsc -p web/tsconfig.json --noEmit",
    "start": "WEB_DIR=${WEB_DIR:-dist/web} node dist/server/src/index.js",
    "test": "vitest run"
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "rootDir": "..",
    "outDir": "../dist",
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "../shared/src/**/*.ts"]
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install express@^5 socket.io@^4.8 better-sqlite3@^12 helmet@^8
npm install -D typescript@~5.9.3 tsx@^4 vitest@^4 vite@^7 @vitejs/plugin-vue@^6 vue@^3.5 vue-router@^4 vue-tsc@^3 socket.io-client@^4.8 concurrently@^9 @types/node@^24 @types/express@^5 @types/better-sqlite3
```
Expected: both finish with `added N packages`, no `ERESOLVE` errors. `node -e "require('better-sqlite3')(':memory:')"` prints nothing and exits 0.

- [ ] **Step 3: Write the failing shared tests**

`shared/test/hats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { HAT_IDS, HATS, PRESETS, formatDuration, presetSteps } from '../src/hats.js';

describe('hats', () => {
  it('defines the six hats with the spec timer defaults', () => {
    expect(HAT_IDS).toEqual(['white', 'red', 'black', 'yellow', 'green', 'blue']);
    expect(Object.fromEntries(HAT_IDS.map((id) => [id, HATS[id].defaultDurationSec]))).toEqual({
      white: 240, red: 60, black: 240, yellow: 240, green: 300, blue: 120,
    });
  });

  it('ships the four presets from the spec', () => {
    expect(PRESETS.map((p) => [p.name, p.hats.join(',')])).toEqual([
      ['Quick feedback', 'black,green'],
      ['Initial ideas', 'blue,white,green,blue'],
      ['Evaluate an idea', 'blue,white,yellow,black,red,green,blue'],
      ['Solve a problem', 'blue,white,green,red,yellow,black,green,blue'],
    ]);
  });

  it('turns hats into steps with default timers', () => {
    expect(presetSteps(['red', 'green'])).toEqual([
      { hat: 'red', durationSec: 60 },
      { hat: 'green', durationSec: 300 },
    ]);
  });

  it('formats durations as m:ss', () => {
    expect(formatDuration(240)).toBe('4:00');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(4500)).toBe('75:00');
  });
});
```

`shared/test/rules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { canWrite, creditedName, isStepRevealed, rankByVotes } from '../src/rules.js';

describe('isStepRevealed', () => {
  it('reveals nothing in the lobby', () => {
    expect(isStepRevealed({ status: 'lobby', currentStep: -1, phase: null }, 0)).toBe(false);
  });

  it('reveals earlier steps, and the current one only once revealed', () => {
    const writing = { status: 'running', currentStep: 1, phase: 'writing' } as const;
    expect(isStepRevealed(writing, 0)).toBe(true);
    expect(isStepRevealed(writing, 1)).toBe(false);
    expect(isStepRevealed(writing, 2)).toBe(false);
    expect(isStepRevealed({ ...writing, phase: 'revealed' as const }, 1)).toBe(true);
  });

  it('reveals every step once the steps are over', () => {
    expect(isStepRevealed({ status: 'voting', currentStep: 1, phase: null }, 1)).toBe(true);
    expect(isStepRevealed({ status: 'closed', currentStep: 1, phase: null }, 0)).toBe(true);
  });
});

describe('canWrite', () => {
  it('allows writing while a step is writing or paused', () => {
    expect(canWrite({ status: 'running', currentStep: 0, phase: 'writing' })).toBe(true);
    expect(canWrite({ status: 'running', currentStep: 0, phase: 'paused' })).toBe(true);
    expect(canWrite({ status: 'running', currentStep: 0, phase: 'revealed' })).toBe(false);
    expect(canWrite({ status: 'lobby', currentStep: -1, phase: null })).toBe(false);
  });
});

describe('rankByVotes', () => {
  it('drops unvoted points and breaks ties by step then time', () => {
    const points = [
      { id: 'a', stepIndex: 1, createdAt: 1 },
      { id: 'b', stepIndex: 0, createdAt: 2 },
      { id: 'c', stepIndex: 0, createdAt: 1 },
      { id: 'd', stepIndex: 0, createdAt: 0 },
    ];
    const votes: Record<string, number> = { a: 2, b: 2, c: 3, d: 0 };
    expect(rankByVotes(points, (p) => votes[p.id] ?? 0).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('creditedName', () => {
  it('credits the author, or in scribe mode the speaker or the team', () => {
    expect(creditedName('everyone', 'Asha')).toBe('Asha');
    expect(creditedName('everyone', 'Asha', 'Ravi')).toBe('Asha');
    expect(creditedName('scribe', 'Ravi', 'Asha')).toBe('Asha');
    expect(creditedName('scribe', 'Ravi')).toBe('Team');
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run shared`
Expected: FAIL — `Failed to load url ../src/hats.js` (modules do not exist yet).

- [ ] **Step 5: Implement the shared modules**

`shared/src/hats.ts`:
```ts
export const HAT_IDS = ['white', 'red', 'black', 'yellow', 'green', 'blue'] as const;
export type HatId = (typeof HAT_IDS)[number];

export interface HatDef {
  id: HatId;
  name: string;
  label: string;
  focus: string;
  prompt: string;
  defaultDurationSec: number;
  icon: string;
}

export const HATS: Record<HatId, HatDef> = {
  white: { id: 'white', name: 'White hat', label: 'White', focus: 'Facts & information', prompt: "What do we know? What's missing? What would we need to find out?", defaultDurationSec: 240, icon: '📊' },
  red: { id: 'red', name: 'Red hat', label: 'Red', focus: 'Feelings & intuition', prompt: "What's your gut reaction? No justification needed.", defaultDurationSec: 60, icon: '❤️' },
  black: { id: 'black', name: 'Black hat', label: 'Black', focus: 'Caution & risks', prompt: 'What could go wrong? Why might this not work?', defaultDurationSec: 240, icon: '⚠️' },
  yellow: { id: 'yellow', name: 'Yellow hat', label: 'Yellow', focus: 'Benefits & value', prompt: 'What are the benefits? Why could this work?', defaultDurationSec: 240, icon: '☀️' },
  green: { id: 'green', name: 'Green hat', label: 'Green', focus: 'Creativity & alternatives', prompt: 'What new ideas, alternatives or possibilities are there?', defaultDurationSec: 300, icon: '🌱' },
  blue: { id: 'blue', name: 'Blue hat', label: 'Blue', focus: 'Process & control', prompt: 'Where are we? What should we focus on? What have we concluded?', defaultDurationSec: 120, icon: '🧭' },
};

export interface FlowStep {
  hat: HatId;
  durationSec: number;
  prompt?: string;
}

export interface Preset {
  id: string;
  name: string;
  hats: HatId[];
}

export const PRESETS: Preset[] = [
  { id: 'quick-feedback', name: 'Quick feedback', hats: ['black', 'green'] },
  { id: 'initial-ideas', name: 'Initial ideas', hats: ['blue', 'white', 'green', 'blue'] },
  { id: 'evaluate-idea', name: 'Evaluate an idea', hats: ['blue', 'white', 'yellow', 'black', 'red', 'green', 'blue'] },
  { id: 'solve-problem', name: 'Solve a problem', hats: ['blue', 'white', 'green', 'red', 'yellow', 'black', 'green', 'blue'] },
];

export function presetSteps(hats: HatId[]): FlowStep[] {
  return hats.map((hat) => ({ hat, durationSec: HATS[hat].defaultDurationSec }));
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export const LIMITS = {
  title: 120,
  focus: 500,
  name: 40,
  prompt: 300,
  point: 500,
  decision: 4000,
  actionText: 300,
  actionOwner: 60,
  templateName: 60,
  minSteps: 1,
  maxSteps: 20,
  minDurationSec: 30,
  maxDurationSec: 1800,
  minVotes: 1,
  maxVotes: 10,
  maxParticipants: 50,
  maxPointsPerStep: 30,
  maxScribeNotesPerStep: 200,
  maxActions: 50,
} as const;
```

`shared/src/protocol.ts`:
```ts
import type { FlowStep } from './hats.js';

export type SessionStatus = 'lobby' | 'running' | 'voting' | 'decision' | 'closed';
export type StepPhase = 'writing' | 'paused' | 'revealed';
export type WritingMode = 'everyone' | 'scribe';

export interface ActionItem {
  id: string;
  text: string;
  owner: string;
  due?: string;
}

export interface NewActionItem {
  text: string;
  owner: string;
  due?: string;
}

export type Command =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'addTime' }
  | { type: 'revealNow' }
  | { type: 'skipStep' }
  | { type: 'nextStep' }
  | { type: 'editUpcomingSteps'; steps: FlowStep[] }
  | { type: 'setScribe'; participantId: string }
  /** `saidBy` (a participant id) is used only in scribe mode; omitted means "Team". */
  | { type: 'addPoint'; text: string; saidBy?: string }
  | { type: 'editPoint'; pointId: string; text: string; saidBy?: string }
  | { type: 'deletePoint'; pointId: string }
  | { type: 'vote'; pointId: string }
  | { type: 'unvote'; pointId: string }
  | { type: 'closeVoting' }
  | { type: 'skipVoting' }
  | { type: 'goToDecision' }
  | { type: 'setDecision'; text: string }
  | { type: 'addAction'; action: NewActionItem }
  | { type: 'removeAction'; actionId: string }
  | { type: 'closeSession' };

export type CommandAck = { ok: true } | { ok: false; error: string };

export interface ViewParticipant {
  id: string;
  name: string;
  isFacilitator: boolean;
  online: boolean;
}

export interface ViewPoint {
  id: string;
  stepIndex: number;
  authorId: string;
  authorName: string;
  /** Scribe mode only: who the note is credited to. */
  saidById?: string;
  saidByName?: string;
  text: string;
  createdAt: number;
  /** Present only once voting is closed. */
  votes?: number;
}

export interface View {
  id: string;
  code: string;
  title: string;
  focus: string;
  status: SessionStatus;
  createdAt: number;
  closedAt?: number;
  mode: WritingMode;
  scribeId?: string;
  steps: FlowStep[];
  currentStep: number;
  phase: StepPhase | null;
  endsAt?: number;
  remainingMs?: number;
  me: { id: string; name: string; isFacilitator: boolean };
  participants: ViewParticipant[];
  points: ViewPoint[];
  votesPerPerson: number;
  votingClosed: boolean;
  myVotes: string[];
  decision: string;
  actions: ActionItem[];
  /** Facilitator only, everyone-writes mode, while running: points per participant in the current step. */
  currentStepCounts?: Record<string, number>;
  serverNow: number;
}

export interface CreateSessionInput {
  title: string;
  focus: string;
  facilitatorName: string;
  votesPerPerson: number;
  mode: WritingMode;
  steps: FlowStep[];
}

export interface CreateSessionResult {
  code: string;
  facilitatorToken: string;
}

export interface JoinResult {
  participantId: string;
  token: string;
}

export interface SessionSummary {
  id: string;
  code: string;
  title: string;
  status: SessionStatus;
  createdAt: number;
  closedAt?: number;
  participantCount: number;
}

export interface Template {
  id: string;
  name: string;
  steps: FlowStep[];
  createdAt: number;
}

export const SOCKET_ERRORS = { notFound: 'session_not_found', invalidToken: 'invalid_token' } as const;
export type SocketError = (typeof SOCKET_ERRORS)[keyof typeof SOCKET_ERRORS];
```

`shared/src/rules.ts`:
```ts
import type { SessionStatus, StepPhase, WritingMode } from './protocol.js';

export interface StepState {
  status: SessionStatus;
  currentStep: number;
  phase: StepPhase | null;
}

export function isStepRevealed(s: StepState, index: number): boolean {
  if (s.status === 'lobby') return false;
  if (s.status !== 'running') return true;
  return index < s.currentStep || (index === s.currentStep && s.phase === 'revealed');
}

export function canWrite(s: StepState): boolean {
  return s.status === 'running' && (s.phase === 'writing' || s.phase === 'paused');
}

export function rankByVotes<T extends { stepIndex: number; createdAt: number }>(points: T[], votes: (p: T) => number): T[] {
  return points
    .filter((p) => votes(p) > 0)
    .sort((a, b) => votes(b) - votes(a) || a.stepIndex - b.stepIndex || a.createdAt - b.createdAt);
}

/** Who a point is credited to: its author, or in scribe mode the participant who said it (else the team). */
export function creditedName(mode: WritingMode, authorName: string, saidByName?: string): string {
  return mode === 'scribe' ? (saidByName ?? 'Team') : authorName;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run shared`
Expected: PASS — 2 files, 10 tests.

- [ ] **Step 7: Commit**

```bash
git add .nvmrc .gitignore package.json package-lock.json vitest.config.ts server/tsconfig.json shared
git commit -m "feat: tooling and shared hat model" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Session types, validation, create and join

**Files:**
- Create: `server/src/session.ts`, `server/src/validate.ts`, `server/src/engine.ts`
- Test: `server/test/validate.test.ts`, `server/test/engine.test.ts`, `server/test/fixtures.ts`

**Interfaces:**
- Consumes: `HAT_IDS`, `LIMITS`, `FlowStep`, `HatId` (hats.ts); `Command`, `ActionItem`, `SessionStatus`, `StepPhase` (protocol.ts).
- Produces:
  - `session.ts`: `Participant {id, name, isFacilitator, tokenHashes: string[], joinedAt}`, `Point {id, stepIndex, authorId, saidBy?, text, createdAt, updatedAt}`, `Vote {pointId, voterId}`, `Session` (fields below, including `mode` and `scribeId?`), `Ctx {now: number; newId: () => string}`, `Handler<C>`, `HandlerMap<K>`.
  - `validate.ts`: `Check<T>`, `cleanText(raw, label, max, allowEmpty?)`, `validateSteps(raw, min?, max?)`, `validateVotes(raw)`, `validateMode(raw)` (absent → `'everyone'`), `validateDue(raw)`.
  - `engine.ts`: `SessionInit`, `CreateOutcome`, `JoinOutcome`, `createSession(input, init)`, `joinSession(s, rawName, tokenHash, ctx)`, `uniqueName(existing, name)`, `addFacilitatorToken(s, tokenHash)`.
  - `fixtures.ts`: `T0`, `ctx(now?)`, `DEFAULT_STEPS`, `makeSession(steps?, mode?) → {s, fac, asha, ravi}`.

- [ ] **Step 1: Create the session types**

`server/src/session.ts`:
```ts
import type { FlowStep } from '../../shared/src/hats.js';
import type { ActionItem, Command, SessionStatus, StepPhase, WritingMode } from '../../shared/src/protocol.js';

export interface Participant {
  id: string;
  name: string;
  isFacilitator: boolean;
  tokenHashes: string[];
  joinedAt: number;
}

export interface Point {
  id: string;
  stepIndex: number;
  authorId: string;
  /** Scribe mode: the participant the note is credited to; absent means "Team". */
  saidBy?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface Vote {
  pointId: string;
  voterId: string;
}

export interface Session {
  id: string;
  code: string;
  title: string;
  focus: string;
  status: SessionStatus;
  createdAt: number;
  closedAt?: number;
  mode: WritingMode;
  scribeId?: string;
  steps: FlowStep[];
  /** -1 in the lobby. */
  currentStep: number;
  phase: StepPhase | null;
  endsAt?: number;
  remainingMs?: number;
  participants: Participant[];
  points: Point[];
  votes: Vote[];
  votesPerPerson: number;
  votingClosed: boolean;
  decision: string;
  actions: ActionItem[];
}

export interface Ctx {
  now: number;
  newId: () => string;
}

/** Mutates the (already cloned) session; returns an error message to reject. */
export type Handler<C extends Command> = (s: Session, actor: Participant, cmd: C, ctx: Ctx) => string | void;

export type HandlerMap<K extends Command['type']> = { [T in K]: Handler<Extract<Command, { type: T }>> };
```

- [ ] **Step 2: Write the failing validation tests**

`server/test/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cleanText, validateDue, validateMode, validateSteps, validateVotes } from '../src/validate.js';

describe('cleanText', () => {
  it('trims and accepts text within the limit', () => {
    expect(cleanText('  hello ', 'Title', 10)).toEqual({ ok: true, value: 'hello' });
  });
  it('rejects missing, empty, non-string and oversized text', () => {
    expect(cleanText(undefined, 'Title', 10)).toEqual({ ok: false, error: 'Title is required' });
    expect(cleanText('   ', 'Title', 10)).toEqual({ ok: false, error: "Title can't be empty" });
    expect(cleanText(42, 'Title', 10)).toEqual({ ok: false, error: 'Title must be text' });
    expect(cleanText('x'.repeat(11), 'Title', 10)).toEqual({ ok: false, error: 'Title must be at most 10 characters' });
  });
  it('allows empty text when asked', () => {
    expect(cleanText(undefined, 'Owner', 10, true)).toEqual({ ok: true, value: '' });
    expect(cleanText(' ', 'Owner', 10, true)).toEqual({ ok: true, value: '' });
  });
});

describe('validateSteps', () => {
  it('accepts a valid flow and drops empty prompts', () => {
    expect(validateSteps([{ hat: 'red', durationSec: 60, prompt: '  ' }, { hat: 'green', durationSec: 300, prompt: ' Ideas? ' }])).toEqual({
      ok: true,
      value: [{ hat: 'red', durationSec: 60 }, { hat: 'green', durationSec: 300, prompt: 'Ideas?' }],
    });
  });
  it('enforces the step count', () => {
    expect(validateSteps('nope')).toEqual({ ok: false, error: 'Steps are invalid' });
    expect(validateSteps([])).toEqual({ ok: false, error: 'A flow needs at least 1 step' });
    const many = Array.from({ length: 21 }, () => ({ hat: 'white', durationSec: 60 }));
    expect(validateSteps(many)).toEqual({ ok: false, error: 'A flow can have at most 20 steps' });
    expect(validateSteps([], 0, 3)).toEqual({ ok: true, value: [] });
  });
  it('rejects unknown hats, bad durations and long prompts', () => {
    expect(validateSteps([{ hat: 'purple', durationSec: 60 }])).toEqual({ ok: false, error: 'Step 1 has an unknown hat' });
    expect(validateSteps([{ hat: 'red', durationSec: 29 }])).toEqual({ ok: false, error: 'Step 1 must last between 0:30 and 30:00' });
    expect(validateSteps([{ hat: 'red', durationSec: 60.5 }])).toEqual({ ok: false, error: 'Step 1 must last between 0:30 and 30:00' });
    expect(validateSteps([{ hat: 'red', durationSec: 1801 }])).toEqual({ ok: false, error: 'Step 1 must last between 0:30 and 30:00' });
    expect(validateSteps([{ hat: 'red', durationSec: 60, prompt: 'x'.repeat(301) }])).toEqual({ ok: false, error: 'Step 1 prompt must be at most 300 characters' });
  });
});

describe('validateVotes', () => {
  it('accepts 1 to 10', () => {
    expect(validateVotes(3)).toEqual({ ok: true, value: 3 });
    expect(validateVotes(0)).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
    expect(validateVotes(11)).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
    expect(validateVotes('3')).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
  });
});

describe('validateMode', () => {
  it('defaults to everyone and accepts scribe', () => {
    expect(validateMode(undefined)).toEqual({ ok: true, value: 'everyone' });
    expect(validateMode('everyone')).toEqual({ ok: true, value: 'everyone' });
    expect(validateMode('scribe')).toEqual({ ok: true, value: 'scribe' });
    expect(validateMode('chaos')).toEqual({ ok: false, error: 'Mode must be "everyone" or "scribe"' });
  });
});

describe('validateDue', () => {
  it('accepts an absent or real calendar date', () => {
    expect(validateDue(undefined)).toEqual({ ok: true, value: undefined });
    expect(validateDue('')).toEqual({ ok: true, value: undefined });
    expect(validateDue('2026-10-21')).toEqual({ ok: true, value: '2026-10-21' });
  });
  it('rejects anything else', () => {
    for (const bad of ['2026-13-01', '2026-02-30', 'tomorrow', 20261021]) {
      expect(validateDue(bad)).toEqual({ ok: false, error: 'Due date must be YYYY-MM-DD' });
    }
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/test/validate.test.ts`
Expected: FAIL — cannot load `../src/validate.js`.

- [ ] **Step 4: Implement validation**

`server/src/validate.ts`:
```ts
import { HAT_IDS, LIMITS, type FlowStep, type HatId } from '../../shared/src/hats.js';
import type { WritingMode } from '../../shared/src/protocol.js';

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function cleanText(raw: unknown, label: string, max: number, allowEmpty = false): Check<string> {
  if (raw === undefined || raw === null) {
    return allowEmpty ? { ok: true, value: '' } : { ok: false, error: `${label} is required` };
  }
  if (typeof raw !== 'string') return { ok: false, error: `${label} must be text` };
  const value = raw.trim();
  if (!allowEmpty && value.length === 0) return { ok: false, error: `${label} can't be empty` };
  if (value.length > max) return { ok: false, error: `${label} must be at most ${max} characters` };
  return { ok: true, value };
}

export function validateSteps(raw: unknown, min: number = LIMITS.minSteps, max: number = LIMITS.maxSteps): Check<FlowStep[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'Steps are invalid' };
  if (raw.length < min) return { ok: false, error: `A flow needs at least ${LIMITS.minSteps} step` };
  if (raw.length > max) return { ok: false, error: `A flow can have at most ${LIMITS.maxSteps} steps` };
  const steps: FlowStep[] = [];
  for (const [index, item] of raw.entries()) {
    const n = index + 1;
    if (typeof item !== 'object' || item === null) return { ok: false, error: `Step ${n} is invalid` };
    const { hat, durationSec, prompt } = item as Record<string, unknown>;
    if (typeof hat !== 'string' || !(HAT_IDS as readonly string[]).includes(hat)) {
      return { ok: false, error: `Step ${n} has an unknown hat` };
    }
    if (
      typeof durationSec !== 'number' ||
      !Number.isInteger(durationSec) ||
      durationSec < LIMITS.minDurationSec ||
      durationSec > LIMITS.maxDurationSec
    ) {
      return { ok: false, error: `Step ${n} must last between 0:30 and 30:00` };
    }
    const cleanPrompt = cleanText(prompt, `Step ${n} prompt`, LIMITS.prompt, true);
    if (!cleanPrompt.ok) return cleanPrompt;
    const step: FlowStep = { hat: hat as HatId, durationSec };
    if (cleanPrompt.value) step.prompt = cleanPrompt.value;
    steps.push(step);
  }
  return { ok: true, value: steps };
}

export function validateVotes(raw: unknown): Check<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < LIMITS.minVotes || raw > LIMITS.maxVotes) {
    return { ok: false, error: `Votes per person must be between ${LIMITS.minVotes} and ${LIMITS.maxVotes}` };
  }
  return { ok: true, value: raw };
}

export function validateMode(raw: unknown): Check<WritingMode> {
  if (raw === undefined || raw === null) return { ok: true, value: 'everyone' };
  if (raw === 'everyone' || raw === 'scribe') return { ok: true, value: raw };
  return { ok: false, error: 'Mode must be "everyone" or "scribe"' };
}

export function validateDue(raw: unknown): Check<string | undefined> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: undefined };
  const invalid = { ok: false as const, error: 'Due date must be YYYY-MM-DD' };
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return invalid;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return invalid;
  return { ok: true, value: raw };
}
```

- [ ] **Step 5: Run to verify validation passes**

Run: `npx vitest run server/test/validate.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 6: Write the fixtures and failing engine tests**

`server/test/fixtures.ts`:
```ts
import type { FlowStep } from '../../shared/src/hats.js';
import type { WritingMode } from '../../shared/src/protocol.js';
import { createSession, joinSession } from '../src/engine.js';
import type { Ctx } from '../src/session.js';

export const T0 = Date.UTC(2026, 9, 14, 10, 0, 0);

let counter = 0;
export function ctx(now = T0): Ctx {
  return { now, newId: () => `id-${++counter}` };
}

export const DEFAULT_STEPS: FlowStep[] = [
  { hat: 'white', durationSec: 240, prompt: 'What do we know about churn?' },
  { hat: 'black', durationSec: 240 },
];

/** A lobby session with facilitator "Fac" and participants "Asha" and "Ravi". */
export function makeSession(steps: FlowStep[] = DEFAULT_STEPS, mode: WritingMode = 'everyone') {
  const created = createSession(
    { title: 'Migrate billing?', focus: 'Should we migrate billing to Kafka?', facilitatorName: 'Fac', votesPerPerson: 2, mode, steps },
    { id: 'session-1', code: 'ABC234', tokenHash: 'fac-hash', ...ctx() },
  );
  if (!created.ok) throw new Error(created.error);
  const asha = joinSession(created.session, 'Asha', 'asha-hash', ctx());
  if (!asha.ok) throw new Error(asha.error);
  const ravi = joinSession(asha.session, 'Ravi', 'ravi-hash', ctx());
  if (!ravi.ok) throw new Error(ravi.error);
  return { s: ravi.session, fac: created.facilitatorId, asha: asha.participantId, ravi: ravi.participantId };
}
```

`server/test/engine.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addFacilitatorToken, createSession, joinSession, uniqueName } from '../src/engine.js';
import { ctx, makeSession, T0 } from './fixtures.js';

const INPUT = {
  title: '  Pricing  ',
  focus: 'Annual only?',
  facilitatorName: 'Fac',
  votesPerPerson: 3,
  steps: [{ hat: 'white', durationSec: 60 }],
};
const INIT = { id: 's-1', code: 'ABC234', tokenHash: 'fac-hash', ...ctx() };

describe('createSession', () => {
  it('creates a lobby with the facilitator as first participant', () => {
    const r = createSession(INPUT, INIT);
    if (!r.ok) throw new Error(r.error);
    expect(r.session).toMatchObject({
      id: 's-1',
      code: 'ABC234',
      title: 'Pricing',
      status: 'lobby',
      mode: 'everyone',
      currentStep: -1,
      phase: null,
      votesPerPerson: 3,
      votingClosed: false,
      decision: '',
      createdAt: T0,
      steps: [{ hat: 'white', durationSec: 60 }],
      points: [],
      votes: [],
      actions: [],
    });
    expect(r.session.participants).toEqual([
      { id: r.facilitatorId, name: 'Fac', isFacilitator: true, tokenHashes: ['fac-hash'], joinedAt: T0 },
    ]);
  });

  it('rejects invalid input with the first problem found', () => {
    expect(createSession({ ...INPUT, title: '' }, INIT)).toEqual({ ok: false, error: "Title can't be empty" });
    expect(createSession({ ...INPUT, focus: undefined }, INIT)).toEqual({ ok: false, error: 'Focus question is required' });
    expect(createSession({ ...INPUT, facilitatorName: 'x'.repeat(41) }, INIT)).toEqual({ ok: false, error: 'Your name must be at most 40 characters' });
    expect(createSession({ ...INPUT, votesPerPerson: 0 }, INIT)).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
    expect(createSession({ ...INPUT, steps: [] }, INIT)).toEqual({ ok: false, error: 'A flow needs at least 1 step' });
    expect(createSession(null, INIT)).toEqual({ ok: false, error: 'Title is required' });
  });

  it('records the writing mode, with no scribe until the lobby picks one', () => {
    const r = createSession({ ...INPUT, mode: 'scribe' }, INIT);
    if (!r.ok) throw new Error(r.error);
    expect(r.session.mode).toBe('scribe');
    expect(r.session.scribeId).toBeUndefined();
    expect(createSession({ ...INPUT, mode: 'chaos' }, INIT)).toEqual({ ok: false, error: 'Mode must be "everyone" or "scribe"' });
  });
});

describe('joinSession', () => {
  it('adds a participant without mutating the input', () => {
    const { s } = makeSession();
    const r = joinSession(s, '  Priya ', 'priya-hash', ctx());
    if (!r.ok) throw new Error(r.error);
    expect(s.participants).toHaveLength(3);
    expect(r.session.participants.at(-1)).toEqual({
      id: r.participantId, name: 'Priya', isFacilitator: false, tokenHashes: ['priya-hash'], joinedAt: T0,
    });
  });

  it('suffixes duplicate names case-insensitively', () => {
    expect(uniqueName(['Asha', 'Ravi'], 'asha')).toBe('asha (2)');
    expect(uniqueName(['Asha', 'asha (2)'], 'ASHA')).toBe('ASHA (3)');
    expect(uniqueName(['Asha'], 'Ravi')).toBe('Ravi');
  });

  it('refuses closed sessions, full sessions and bad names', () => {
    const { s } = makeSession();
    expect(joinSession({ ...s, status: 'closed' }, 'Priya', 'h', ctx())).toEqual({ ok: false, error: 'This session has ended', reason: 'closed' });
    const crowd = Array.from({ length: 50 }, (_, i) => ({ ...s.participants[1]!, id: `p${i}`, name: `P${i}` }));
    expect(joinSession({ ...s, participants: crowd }, 'Priya', 'h', ctx())).toEqual({ ok: false, error: 'This session is full', reason: 'full' });
    expect(joinSession(s, '', 'h', ctx())).toEqual({ ok: false, error: "Name can't be empty", reason: 'invalid' });
  });
});

describe('addFacilitatorToken', () => {
  it('adds a token hash to the facilitator only', () => {
    const { s, fac } = makeSession();
    const next = addFacilitatorToken(s, 'second-hash');
    expect(next.participants.find((p) => p.id === fac)?.tokenHashes).toEqual(['fac-hash', 'second-hash']);
    expect(s.participants.find((p) => p.id === fac)?.tokenHashes).toEqual(['fac-hash']);
  });
});
```

- [ ] **Step 7: Run to verify they fail**

Run: `npx vitest run server/test/engine.test.ts`
Expected: FAIL — cannot load `../src/engine.js`.

- [ ] **Step 8: Implement create and join**

`server/src/engine.ts`:
```ts
import { LIMITS } from '../../shared/src/hats.js';
import type { Ctx, Session } from './session.js';
import { cleanText, validateMode, validateSteps, validateVotes } from './validate.js';

export interface SessionInit {
  id: string;
  code: string;
  tokenHash: string;
  now: number;
  newId: () => string;
}

export type CreateOutcome = { ok: true; session: Session; facilitatorId: string } | { ok: false; error: string };

export type JoinOutcome =
  | { ok: true; session: Session; participantId: string }
  | { ok: false; error: string; reason: 'closed' | 'full' | 'invalid' };

export function createSession(input: unknown, init: SessionInit): CreateOutcome {
  const i = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const title = cleanText(i.title, 'Title', LIMITS.title);
  if (!title.ok) return title;
  const focus = cleanText(i.focus, 'Focus question', LIMITS.focus);
  if (!focus.ok) return focus;
  const name = cleanText(i.facilitatorName, 'Your name', LIMITS.name);
  if (!name.ok) return name;
  const votes = validateVotes(i.votesPerPerson);
  if (!votes.ok) return votes;
  const mode = validateMode(i.mode);
  if (!mode.ok) return mode;
  const steps = validateSteps(i.steps);
  if (!steps.ok) return steps;

  const facilitatorId = init.newId();
  const session: Session = {
    id: init.id,
    code: init.code,
    title: title.value,
    focus: focus.value,
    status: 'lobby',
    createdAt: init.now,
    mode: mode.value,
    steps: steps.value,
    currentStep: -1,
    phase: null,
    participants: [{ id: facilitatorId, name: name.value, isFacilitator: true, tokenHashes: [init.tokenHash], joinedAt: init.now }],
    points: [],
    votes: [],
    votesPerPerson: votes.value,
    votingClosed: false,
    decision: '',
    actions: [],
  };
  return { ok: true, session, facilitatorId };
}

export function uniqueName(existing: string[], name: string): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function joinSession(s: Session, rawName: unknown, tokenHash: string, ctx: Ctx): JoinOutcome {
  if (s.status === 'closed') return { ok: false, error: 'This session has ended', reason: 'closed' };
  if (s.participants.length >= LIMITS.maxParticipants) return { ok: false, error: 'This session is full', reason: 'full' };
  const name = cleanText(rawName, 'Name', LIMITS.name);
  if (!name.ok) return { ok: false, error: name.error, reason: 'invalid' };

  const next = structuredClone(s);
  const id = ctx.newId();
  next.participants.push({
    id,
    name: uniqueName(next.participants.map((p) => p.name), name.value),
    isFacilitator: false,
    tokenHashes: [tokenHash],
    joinedAt: ctx.now,
  });
  return { ok: true, session: next, participantId: id };
}

export function addFacilitatorToken(s: Session, tokenHash: string): Session {
  const next = structuredClone(s);
  next.participants.find((p) => p.isFacilitator)?.tokenHashes.push(tokenHash);
  return next;
}
```

- [ ] **Step 9: Run to verify they pass**

Run: `npx vitest run server`
Expected: PASS — `validate.test.ts` 10 tests, `engine.test.ts` 7 tests.

- [ ] **Step 10: Commit**

```bash
git add server
git commit -m "feat: session model, validation, create and join" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Command dispatcher and step flow

**Files:**
- Create: `server/src/flow.ts`
- Modify: `server/src/engine.ts` (add `applyCommand`)
- Modify: `server/test/fixtures.ts` (add `attempt`, `run`)
- Test: `server/test/flow.test.ts`

**Interfaces:**
- Consumes: `Session`, `Ctx`, `HandlerMap`, `Handler` (session.ts); `validateSteps` (validate.ts); `canWrite` (rules.ts).
- Produces:
  - `flow.ts`: `MINUTE_MS`, `LOCKED` (`'Writing is locked for this step'`), `timerExpired(s, now)`, `FLOW_HANDLERS`.
  - `engine.ts`: `ServerCommand = {type:'timerExpired'}`, `AnyCommand`, `EngineResult = {ok:true; session} | {ok:false; error}`, `applyCommand(session, actorId: string | null, cmd, ctx)`.
  - `fixtures.ts`: `attempt(s, actorId, cmd, now?) → EngineResult`, `run(s, actorId, cmd, now?) → Session` (throws on error).

- [ ] **Step 1: Add fixture helpers**

Append to `server/test/fixtures.ts`:
```ts
import { applyCommand, type AnyCommand, type EngineResult } from '../src/engine.js';
import type { Session } from '../src/session.js';

export function attempt(s: Session, actorId: string | null, cmd: AnyCommand, now = T0): EngineResult {
  return applyCommand(s, actorId, cmd, ctx(now));
}

export function run(s: Session, actorId: string | null, cmd: AnyCommand, now = T0): Session {
  const r = attempt(s, actorId, cmd, now);
  if (!r.ok) throw new Error(r.error);
  return r.session;
}
```
Then move the two new `import` lines to the top of the file, merging `createSession, joinSession` into the same `../src/engine.js` import.

- [ ] **Step 2: Write the failing flow tests**

`server/test/flow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Command } from '../../shared/src/protocol.js';
import { attempt, makeSession, run, T0 } from './fixtures.js';

const FACILITATOR_ONLY = { ok: false, error: 'Only the facilitator can do that' };

function started() {
  const { s, fac, asha, ravi } = makeSession();
  return { s: run(s, fac, { type: 'start' }), fac, asha, ravi };
}

describe('dispatch', () => {
  it('rejects unknown commands, including prototype keys', () => {
    const { s, fac } = makeSession();
    expect(attempt(s, fac, { type: 'explode' } as unknown as Command)).toEqual({ ok: false, error: 'Unknown command' });
    expect(attempt(s, fac, { type: 'toString' } as unknown as Command)).toEqual({ ok: false, error: 'Unknown command' });
    expect(attempt(s, fac, null as unknown as Command)).toEqual({ ok: false, error: 'Unknown command' });
  });

  it('rejects actors who are not in the session', () => {
    const { s } = makeSession();
    expect(attempt(s, 'stranger', { type: 'start' })).toEqual({ ok: false, error: 'You are not part of this session' });
  });

  it('never mutates the input session', () => {
    const { s, fac } = makeSession();
    const before = structuredClone(s);
    run(s, fac, { type: 'start' });
    expect(s).toEqual(before);
  });
});

describe('start', () => {
  it('puts the first step into writing with its timer', () => {
    const { s } = started();
    expect(s).toMatchObject({ status: 'running', currentStep: 0, phase: 'writing', endsAt: T0 + 240_000 });
  });

  it('is facilitator-only and happens once', () => {
    const { s: lobby, asha } = makeSession();
    expect(attempt(lobby, asha, { type: 'start' })).toEqual(FACILITATOR_ONLY);
    const { s, fac } = started();
    expect(attempt(s, fac, { type: 'start' })).toEqual({ ok: false, error: 'The session has already started' });
  });

  it('needs a scribe before a scribe-mode session can start', () => {
    const { s, fac } = makeSession(undefined, 'scribe');
    expect(attempt(s, fac, { type: 'start' })).toEqual({ ok: false, error: 'Choose a scribe before starting' });
    expect(run({ ...s, scribeId: fac }, fac, { type: 'start' }).status).toBe('running');
  });
});

describe('timer controls', () => {
  it('pauses and resumes keeping the remaining time', () => {
    const { s: running, fac } = started();
    const paused = run(running, fac, { type: 'pause' }, T0 + 60_000);
    expect(paused).toMatchObject({ phase: 'paused', remainingMs: 180_000 });
    expect(paused.endsAt).toBeUndefined();
    const resumed = run(paused, fac, { type: 'resume' }, T0 + 100_000);
    expect(resumed).toMatchObject({ phase: 'writing', endsAt: T0 + 280_000 });
    expect(resumed.remainingMs).toBeUndefined();
  });

  it('adds a minute while writing or paused', () => {
    const { s: running, fac } = started();
    expect(run(running, fac, { type: 'addTime' }).endsAt).toBe(T0 + 300_000);
    const paused = run(running, fac, { type: 'pause' }, T0 + 60_000);
    expect(run(paused, fac, { type: 'addTime' }).remainingMs).toBe(240_000);
  });

  it('refuses timer changes once revealed or when not running', () => {
    const { s: running, fac } = started();
    const revealed = run(running, fac, { type: 'revealNow' });
    expect(attempt(revealed, fac, { type: 'addTime' })).toEqual({ ok: false, error: 'This step is already revealed' });
    expect(attempt(revealed, fac, { type: 'pause' })).toEqual({ ok: false, error: 'The timer is not running' });
    expect(attempt(running, fac, { type: 'resume' })).toEqual({ ok: false, error: 'The timer is not paused' });
    const { s: lobby, fac: lobbyFac } = makeSession();
    expect(attempt(lobby, lobbyFac, { type: 'addTime' })).toEqual({ ok: false, error: 'No step is in progress' });
  });
});

describe('timerExpired', () => {
  it('reveals the step once the time is up', () => {
    const { s } = started();
    const revealed = run(s, null, { type: 'timerExpired' }, T0 + 240_000);
    expect(revealed.phase).toBe('revealed');
    expect(revealed.endsAt).toBeUndefined();
  });

  it('ignores early, paused and participant-sent expiries', () => {
    const { s, fac, asha } = started();
    expect(attempt(s, null, { type: 'timerExpired' }, T0 + 239_999)).toEqual({ ok: false, error: 'The timer has not finished' });
    const paused = run(s, fac, { type: 'pause' }, T0 + 1_000);
    expect(attempt(paused, null, { type: 'timerExpired' }, T0 + 999_999)).toEqual({ ok: false, error: 'No timer is running' });
    expect(attempt(s, asha, { type: 'timerExpired' }, T0 + 240_000)).toEqual({ ok: false, error: 'Unknown command' });
  });
});

describe('reveal and advance', () => {
  it('reveals once', () => {
    const { s, fac } = started();
    const revealed = run(s, fac, { type: 'revealNow' });
    expect(revealed.phase).toBe('revealed');
    expect(attempt(revealed, fac, { type: 'revealNow' })).toEqual({ ok: false, error: 'This step is already revealed' });
  });

  it('moves to the next step only after the reveal', () => {
    const { s, fac } = started();
    expect(attempt(s, fac, { type: 'nextStep' })).toEqual({ ok: false, error: 'Reveal this step before moving on' });
    const next = run(run(s, fac, { type: 'revealNow' }), fac, { type: 'nextStep' }, T0 + 5_000);
    expect(next).toMatchObject({ currentStep: 1, phase: 'writing', endsAt: T0 + 245_000 });
  });

  it('goes to voting after the last step', () => {
    const { s, fac } = started();
    let after = run(run(s, fac, { type: 'revealNow' }), fac, { type: 'nextStep' });
    after = run(run(after, fac, { type: 'revealNow' }), fac, { type: 'nextStep' });
    expect(after).toMatchObject({ status: 'voting', phase: null, currentStep: 1 });
  });

  it('skip reveals and advances in one go', () => {
    const { s, fac, asha } = started();
    expect(attempt(s, asha, { type: 'skipStep' })).toEqual(FACILITATOR_ONLY);
    const skipped = run(s, fac, { type: 'skipStep' });
    expect(skipped).toMatchObject({ currentStep: 1, phase: 'writing' });
    expect(run(skipped, fac, { type: 'skipStep' })).toMatchObject({ status: 'voting' });
  });
});

describe('editUpcomingSteps', () => {
  it('replaces the whole flow in the lobby', () => {
    const { s, fac } = makeSession();
    const next = run(s, fac, { type: 'editUpcomingSteps', steps: [{ hat: 'red', durationSec: 60 }] });
    expect(next.steps).toEqual([{ hat: 'red', durationSec: 60 }]);
    expect(attempt(s, fac, { type: 'editUpcomingSteps', steps: [] })).toEqual({ ok: false, error: 'A flow needs at least 1 step' });
  });

  it('keeps past and current steps while running', () => {
    const { s, fac } = started();
    const next = run(s, fac, { type: 'editUpcomingSteps', steps: [{ hat: 'green', durationSec: 300 }, { hat: 'blue', durationSec: 120 }] });
    expect(next.steps.map((st) => st.hat)).toEqual(['white', 'green', 'blue']);
    expect(run(s, fac, { type: 'editUpcomingSteps', steps: [] }).steps.map((st) => st.hat)).toEqual(['white']);
  });

  it('enforces the 20-step total and step validity', () => {
    const { s, fac } = started();
    const twenty = Array.from({ length: 20 }, () => ({ hat: 'white' as const, durationSec: 60 }));
    expect(attempt(s, fac, { type: 'editUpcomingSteps', steps: twenty })).toEqual({ ok: false, error: 'A flow can have at most 20 steps' });
    expect(attempt(s, fac, { type: 'editUpcomingSteps', steps: [{ hat: 'red', durationSec: 5 }] })).toEqual({ ok: false, error: 'Step 1 must last between 0:30 and 30:00' });
  });

  it('is facilitator-only and closed after the steps', () => {
    const { s, fac, asha } = started();
    expect(attempt(s, asha, { type: 'editUpcomingSteps', steps: [] })).toEqual(FACILITATOR_ONLY);
    expect(attempt({ ...s, status: 'voting', phase: null }, fac, { type: 'editUpcomingSteps', steps: [] })).toEqual({ ok: false, error: 'The flow can no longer be changed' });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/test/flow.test.ts`
Expected: FAIL — `applyCommand` is not exported by `../src/engine.js`.

- [ ] **Step 4: Implement the step-flow handlers**

`server/src/flow.ts`:
```ts
import { LIMITS } from '../../shared/src/hats.js';
import { canWrite } from '../../shared/src/rules.js';
import type { HandlerMap, Session } from './session.js';
import { validateSteps } from './validate.js';

export const MINUTE_MS = 60_000;
export const LOCKED = 'Writing is locked for this step';

const notWriting = (s: Session) => (s.status === 'running' ? 'This step is already revealed' : 'No step is in progress');

function startStep(s: Session, index: number, now: number): void {
  s.currentStep = index;
  s.phase = 'writing';
  s.endsAt = now + s.steps[index]!.durationSec * 1000;
  delete s.remainingMs;
}

function reveal(s: Session): void {
  s.phase = 'revealed';
  delete s.endsAt;
  delete s.remainingMs;
}

function advance(s: Session, now: number): void {
  if (s.currentStep < s.steps.length - 1) {
    startStep(s, s.currentStep + 1, now);
  } else {
    s.status = 'voting';
    s.phase = null;
  }
}

export function timerExpired(s: Session, now: number): string | void {
  if (s.status !== 'running' || s.phase !== 'writing' || s.endsAt === undefined) return 'No timer is running';
  if (now < s.endsAt) return 'The timer has not finished';
  reveal(s);
}

export const FLOW_HANDLERS: HandlerMap<
  'start' | 'pause' | 'resume' | 'addTime' | 'revealNow' | 'skipStep' | 'nextStep' | 'editUpcomingSteps'
> = {
  start: (s, _actor, _cmd, ctx) => {
    if (s.status !== 'lobby') return 'The session has already started';
    if (s.mode === 'scribe' && !s.scribeId) return 'Choose a scribe before starting';
    s.status = 'running';
    startStep(s, 0, ctx.now);
  },
  pause: (s, _actor, _cmd, ctx) => {
    if (s.status !== 'running' || s.phase !== 'writing' || s.endsAt === undefined) return 'The timer is not running';
    s.remainingMs = Math.max(0, s.endsAt - ctx.now);
    delete s.endsAt;
    s.phase = 'paused';
  },
  resume: (s, _actor, _cmd, ctx) => {
    if (s.status !== 'running' || s.phase !== 'paused') return 'The timer is not paused';
    s.endsAt = ctx.now + (s.remainingMs ?? 0);
    delete s.remainingMs;
    s.phase = 'writing';
  },
  addTime: (s, _actor, _cmd, ctx) => {
    if (!canWrite(s)) return notWriting(s);
    if (s.phase === 'writing') s.endsAt = (s.endsAt ?? ctx.now) + MINUTE_MS;
    else s.remainingMs = (s.remainingMs ?? 0) + MINUTE_MS;
  },
  revealNow: (s) => {
    if (!canWrite(s)) return notWriting(s);
    reveal(s);
  },
  skipStep: (s, _actor, _cmd, ctx) => {
    if (!canWrite(s)) return notWriting(s);
    reveal(s);
    advance(s, ctx.now);
  },
  nextStep: (s, _actor, _cmd, ctx) => {
    if (s.status !== 'running' || s.phase !== 'revealed') return 'Reveal this step before moving on';
    advance(s, ctx.now);
  },
  editUpcomingSteps: (s, _actor, cmd) => {
    if (s.status === 'lobby') {
      const steps = validateSteps(cmd.steps);
      if (!steps.ok) return steps.error;
      s.steps = steps.value;
      return;
    }
    if (s.status !== 'running') return 'The flow can no longer be changed';
    const kept = s.steps.slice(0, s.currentStep + 1);
    const upcoming = validateSteps(cmd.steps, 0, LIMITS.maxSteps - kept.length);
    if (!upcoming.ok) return upcoming.error;
    s.steps = [...kept, ...upcoming.value];
  },
};
```

- [ ] **Step 5: Add `applyCommand` to the engine**

Add to the import block at the top of `server/src/engine.ts`:
```ts
import type { Command } from '../../shared/src/protocol.js';
import { FLOW_HANDLERS, timerExpired } from './flow.js';
import type { Handler, HandlerMap } from './session.js';
```
(Merge the `./session.js` import with the existing `Ctx, Session` type import.)

Append to `server/src/engine.ts`:
```ts
export type ServerCommand = { type: 'timerExpired' };
export type AnyCommand = Command | ServerCommand;
export type EngineResult = { ok: true; session: Session } | { ok: false; error: string };

const HANDLERS: Partial<HandlerMap<Command['type']>> = { ...FLOW_HANDLERS };

const FACILITATOR_ONLY = new Set<string>([
  'start', 'pause', 'resume', 'addTime', 'revealNow', 'skipStep', 'nextStep', 'editUpcomingSteps', 'setScribe',
  'closeVoting', 'skipVoting', 'goToDecision', 'setDecision', 'addAction', 'removeAction', 'closeSession',
]);

const fail = (error: string): EngineResult => ({ ok: false, error });
const finish = (s: Session, error: string | void): EngineResult => (error ? fail(error) : { ok: true, session: s });

/** Pure: returns a new session or an error; never mutates `session`. `actorId` is null only for server commands. */
export function applyCommand(session: Session, actorId: string | null, cmd: AnyCommand, ctx: Ctx): EngineResult {
  const type: unknown = (cmd as { type?: unknown } | null)?.type;
  if (type === 'timerExpired') {
    if (actorId !== null) return fail('Unknown command');
    const s = structuredClone(session);
    return finish(s, timerExpired(s, ctx.now));
  }
  if (typeof type !== 'string' || !Object.hasOwn(HANDLERS, type)) return fail('Unknown command');
  if (!session.participants.some((p) => p.id === actorId)) return fail('You are not part of this session');

  const s = structuredClone(session);
  const actor = s.participants.find((p) => p.id === actorId)!;
  if (FACILITATOR_ONLY.has(type) && !actor.isFacilitator) return fail('Only the facilitator can do that');
  const handler = HANDLERS[type as Command['type']] as Handler<Command>;
  return finish(s, handler(s, actor, cmd as Command, ctx));
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run server`
Expected: PASS — `flow.test.ts` 19 tests plus the earlier files.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: command dispatcher and step flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Points, votes, decision and close

**Files:**
- Create: `server/src/contributions.ts`
- Modify: `server/src/engine.ts` (complete the handler map)
- Modify: `server/test/fixtures.ts` (add `pointId`, `toVoting`)
- Test: `server/test/contributions.test.ts`

**Interfaces:**
- Consumes: `LOCKED` (flow.ts); `cleanText`, `validateDue` (validate.ts); `canWrite` (rules.ts).
- Produces: `CONTRIBUTION_HANDLERS` (including `setScribe` and the scribe-mode write rules); `HANDLERS` in engine.ts becomes a complete `HandlerMap<Command['type']>`; fixtures `pointId(s, text)`, `toVoting() → {s, fac, asha, ravi}` (both steps done, three points: "Churn is 4% monthly" by Asha at T0+1 in step 0, "No data on\nenterprise" by Ravi at T0+2 in step 0, "Migration risk" by Fac at T0+3 in step 1; status `voting`).

- [ ] **Step 1: Add fixture helpers**

Append to `server/test/fixtures.ts`:
```ts
export function pointId(s: Session, text: string): string {
  const p = s.points.find((pt) => pt.text === text);
  if (!p) throw new Error(`No point "${text}"`);
  return p.id;
}

/** Runs both default steps and stops at the start of voting. */
export function toVoting() {
  const { s: lobby, fac, asha, ravi } = makeSession();
  let s = run(lobby, fac, { type: 'start' });
  s = run(s, asha, { type: 'addPoint', text: 'Churn is 4% monthly' }, T0 + 1);
  s = run(s, ravi, { type: 'addPoint', text: 'No data on\nenterprise' }, T0 + 2);
  s = run(s, fac, { type: 'revealNow' });
  s = run(s, fac, { type: 'nextStep' });
  s = run(s, fac, { type: 'addPoint', text: 'Migration risk' }, T0 + 3);
  s = run(s, fac, { type: 'revealNow' });
  s = run(s, fac, { type: 'nextStep' });
  return { s, fac, asha, ravi };
}
```

- [ ] **Step 2: Write the failing tests**

`server/test/contributions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { attempt, makeSession, pointId, run, T0, toVoting } from './fixtures.js';

const LOCKED = { ok: false, error: 'Writing is locked for this step' };

function writing() {
  const { s, fac, asha, ravi } = makeSession();
  return { s: run(s, fac, { type: 'start' }), fac, asha, ravi };
}

describe('addPoint', () => {
  it('adds a trimmed point to the current step', () => {
    const { s, asha } = writing();
    const next = run(s, asha, { type: 'addPoint', text: '  Churn is up  ' }, T0 + 5);
    expect(next.points).toEqual([
      { id: expect.any(String), stepIndex: 0, authorId: asha, text: 'Churn is up', createdAt: T0 + 5, updatedAt: T0 + 5 },
    ]);
  });

  it('is allowed while paused, refused once revealed', () => {
    const { s, fac, asha } = writing();
    expect(attempt(run(s, fac, { type: 'pause' }), asha, { type: 'addPoint', text: 'ok' }).ok).toBe(true);
    expect(attempt(run(s, fac, { type: 'revealNow' }), asha, { type: 'addPoint', text: 'late' })).toEqual(LOCKED);
  });

  it('enforces text limits and 30 points per person per step', () => {
    const { s, asha } = writing();
    expect(attempt(s, asha, { type: 'addPoint', text: ' ' })).toEqual({ ok: false, error: "Point can't be empty" });
    expect(attempt(s, asha, { type: 'addPoint', text: 'x'.repeat(501) })).toEqual({ ok: false, error: 'Point must be at most 500 characters' });
    let full = s;
    for (let i = 0; i < 30; i++) full = run(full, asha, { type: 'addPoint', text: `p${i}` });
    expect(attempt(full, asha, { type: 'addPoint', text: 'one more' })).toEqual({ ok: false, error: 'You can add at most 30 points per step' });
  });
});

describe('editPoint and deletePoint', () => {
  it('lets the author edit and delete their point while writing', () => {
    const { s: base, asha } = writing();
    const s = run(base, asha, { type: 'addPoint', text: 'draft' });
    const id = pointId(s, 'draft');
    const edited = run(s, asha, { type: 'editPoint', pointId: id, text: ' final ' }, T0 + 9);
    expect(edited.points[0]).toMatchObject({ text: 'final', updatedAt: T0 + 9 });
    expect(run(edited, asha, { type: 'deletePoint', pointId: id }).points).toEqual([]);
  });

  it('hides other people\'s points and locks them after the reveal', () => {
    const { s: base, fac, asha, ravi } = writing();
    const s = run(base, asha, { type: 'addPoint', text: 'mine' });
    const id = pointId(s, 'mine');
    expect(attempt(s, ravi, { type: 'editPoint', pointId: id, text: 'x' })).toEqual({ ok: false, error: 'Point not found' });
    expect(attempt(s, ravi, { type: 'deletePoint', pointId: id })).toEqual({ ok: false, error: 'Point not found' });
    const revealed = run(s, fac, { type: 'revealNow' });
    expect(attempt(revealed, asha, { type: 'editPoint', pointId: id, text: 'x' })).toEqual(LOCKED);
    expect(attempt(revealed, asha, { type: 'deletePoint', pointId: id })).toEqual(LOCKED);
  });

  it('lets the facilitator delete any point until the steps end', () => {
    const { s: base, fac, asha } = writing();
    const revealed = run(run(base, asha, { type: 'addPoint', text: 'spam' }), fac, { type: 'revealNow' });
    expect(run(revealed, fac, { type: 'deletePoint', pointId: pointId(revealed, 'spam') }).points).toEqual([]);
    const { s: voting, fac: vf } = toVoting();
    expect(attempt(voting, vf, { type: 'deletePoint', pointId: pointId(voting, 'Migration risk') })).toEqual({ ok: false, error: 'Points can no longer be deleted' });
  });
});

describe('voting', () => {
  it('allows one vote per point up to the limit, and taking votes back', () => {
    const { s, asha } = toVoting();
    const churn = pointId(s, 'Churn is 4% monthly');
    const risk = pointId(s, 'Migration risk');
    const enterprise = pointId(s, 'No data on\nenterprise');
    let v = run(s, asha, { type: 'vote', pointId: churn });
    expect(attempt(v, asha, { type: 'vote', pointId: churn })).toEqual({ ok: false, error: 'You already voted for this point' });
    v = run(v, asha, { type: 'vote', pointId: risk });
    expect(attempt(v, asha, { type: 'vote', pointId: enterprise })).toEqual({ ok: false, error: 'You have used all 2 votes' });
    v = run(v, asha, { type: 'unvote', pointId: risk });
    expect(v.votes).toEqual([{ pointId: churn, voterId: asha }]);
    expect(attempt(v, asha, { type: 'unvote', pointId: risk })).toEqual({ ok: false, error: 'You have not voted for this point' });
    expect(attempt(v, asha, { type: 'vote', pointId: 'nope' })).toEqual({ ok: false, error: 'Point not found' });
  });

  it('closes voting, then moves to the decision', () => {
    const { s, fac, asha } = toVoting();
    expect(attempt(s, asha, { type: 'closeVoting' })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    expect(attempt(s, fac, { type: 'goToDecision' })).toEqual({ ok: false, error: 'Close voting first' });
    const closed = run(s, fac, { type: 'closeVoting' });
    expect(closed.votingClosed).toBe(true);
    expect(attempt(closed, asha, { type: 'vote', pointId: pointId(s, 'Migration risk') })).toEqual({ ok: false, error: 'Voting is not open' });
    expect(run(closed, fac, { type: 'goToDecision' }).status).toBe('decision');
  });

  it('skipping voting discards votes', () => {
    const { s, fac, asha } = toVoting();
    const voted = run(s, asha, { type: 'vote', pointId: pointId(s, 'Migration risk') });
    const skipped = run(voted, fac, { type: 'skipVoting' });
    expect(skipped).toMatchObject({ status: 'decision', votes: [], votingClosed: false });
  });
});

describe('decision and close', () => {
  function decision() {
    const { s, fac, asha } = toVoting();
    return { s: run(s, fac, { type: 'skipVoting' }), fac, asha };
  }

  it('records the decision and action items', () => {
    const { s, fac, asha } = decision();
    expect(attempt(s, asha, { type: 'setDecision', text: 'x' })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    let d = run(s, fac, { type: 'setDecision', text: '  Go ahead  ' });
    expect(d.decision).toBe('Go ahead');
    d = run(d, fac, { type: 'addAction', action: { text: 'Draft RFC', owner: 'Asha', due: '2026-10-21' } });
    d = run(d, fac, { type: 'addAction', action: { text: 'Tell support', owner: '' } });
    expect(d.actions).toEqual([
      { id: expect.any(String), text: 'Draft RFC', owner: 'Asha', due: '2026-10-21' },
      { id: expect.any(String), text: 'Tell support', owner: '' },
    ]);
    expect(attempt(d, fac, { type: 'addAction', action: { text: '', owner: '' } })).toEqual({ ok: false, error: "Action can't be empty" });
    expect(attempt(d, fac, { type: 'addAction', action: { text: 'x', owner: '', due: 'soon' } })).toEqual({ ok: false, error: 'Due date must be YYYY-MM-DD' });
    const removed = run(d, fac, { type: 'removeAction', actionId: d.actions[0]!.id });
    expect(removed.actions.map((a) => a.text)).toEqual(['Tell support']);
    expect(attempt(removed, fac, { type: 'removeAction', actionId: 'nope' })).toEqual({ ok: false, error: 'Action item not found' });
  });

  it('closes the session and makes it read-only', () => {
    const { s: voting, fac } = toVoting();
    expect(attempt(voting, fac, { type: 'closeSession' })).toEqual({ ok: false, error: 'Finish voting before closing the session' });
    const { s } = decision();
    const closed = run(s, fac, { type: 'closeSession' }, T0 + 99);
    expect(closed).toMatchObject({ status: 'closed', closedAt: T0 + 99 });
    expect(attempt(closed, fac, { type: 'setDecision', text: 'late' })).toEqual({ ok: false, error: 'The session is not at the decision stage' });
  });
});

describe('scribe mode', () => {
  function scribing() {
    const { s: lobby, fac, asha, ravi } = makeSession(undefined, 'scribe');
    const withScribe = run(lobby, fac, { type: 'setScribe', participantId: ravi });
    return { s: run(withScribe, fac, { type: 'start' }), fac, asha, ravi };
  }

  it('lets the facilitator assign and reassign the scribe', () => {
    const { s: lobby, fac, asha } = makeSession(undefined, 'scribe');
    expect(attempt(lobby, asha, { type: 'setScribe', participantId: asha })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    expect(attempt(lobby, fac, { type: 'setScribe', participantId: 'nobody' })).toEqual({ ok: false, error: 'Participant not found' });
    const { s: running, fac: runningFac, asha: runningAsha } = scribing();
    expect(run(running, runningFac, { type: 'setScribe', participantId: runningAsha }).scribeId).toBe(runningAsha);
    const { s: everyone, fac: everyoneFac, asha: everyoneAsha } = makeSession();
    expect(attempt(everyone, everyoneFac, { type: 'setScribe', participantId: everyoneAsha })).toEqual({ ok: false, error: 'This session has no scribe' });
  });

  it('lets only the scribe write, crediting the speaker', () => {
    const { s, fac, asha, ravi } = scribing();
    expect(attempt(s, asha, { type: 'addPoint', text: 'mine' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    expect(attempt(s, fac, { type: 'addPoint', text: 'mine' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    let notes = run(s, ravi, { type: 'addPoint', text: 'Pilot first', saidBy: asha });
    notes = run(notes, ravi, { type: 'addPoint', text: 'Agreed by all' });
    expect(notes.points.map((p) => [p.text, p.authorId, p.saidBy])).toEqual([
      ['Pilot first', ravi, asha],
      ['Agreed by all', ravi, undefined],
    ]);
    expect(attempt(s, ravi, { type: 'addPoint', text: 'x', saidBy: 'nobody' })).toEqual({ ok: false, error: 'Unknown participant for "said by"' });
  });

  it('lets the current scribe edit and delete any note in the step, even after a handover', () => {
    const { s: base, fac, asha, ravi } = scribing();
    const s = run(base, ravi, { type: 'addPoint', text: 'draft', saidBy: asha });
    const id = pointId(s, 'draft');
    const handedOver = run(s, fac, { type: 'setScribe', participantId: asha });
    expect(attempt(handedOver, ravi, { type: 'editPoint', pointId: id, text: 'x' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    const edited = run(handedOver, asha, { type: 'editPoint', pointId: id, text: 'final' });
    expect(edited.points[0]).toMatchObject({ text: 'final' });
    expect(edited.points[0]!.saidBy).toBeUndefined();
    expect(run(edited, asha, { type: 'deletePoint', pointId: id }).points).toEqual([]);
  });

  it('allows up to 200 notes per step', () => {
    const { s, ravi } = scribing();
    let full = s;
    for (let i = 0; i < 200; i++) full = run(full, ravi, { type: 'addPoint', text: `n${i}` });
    expect(attempt(full, ravi, { type: 'addPoint', text: 'one more' })).toEqual({ ok: false, error: 'You can add at most 200 notes per step' });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/test/contributions.test.ts`
Expected: FAIL — `addPoint` returns `Unknown command`, so `run` throws `Unknown command`.

- [ ] **Step 4: Implement the handlers**

`server/src/contributions.ts`:
```ts
import { LIMITS } from '../../shared/src/hats.js';
import { canWrite } from '../../shared/src/rules.js';
import { LOCKED } from './flow.js';
import type { HandlerMap, Participant, Point, Session } from './session.js';
import { cleanText, validateDue, type Check } from './validate.js';

const VOTING_NOT_OPEN = 'Voting is not open';
const NOT_DECISION = 'The session is not at the decision stage';
const SCRIBE_ONLY = 'Only the scribe takes notes in this session';

/** Everyone writes in everyone-writes mode; only the current scribe writes in scribe mode. */
const writesHere = (s: Session, actor: Participant) => s.mode === 'everyone' || s.scribeId === actor.id;

/** Scribe mode: the participant a note is credited to; undefined means "Team". */
function saidByOf(s: Session, raw: unknown): Check<string | undefined> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: undefined };
  if (typeof raw === 'string' && s.participants.some((p) => p.id === raw)) return { ok: true, value: raw };
  return { ok: false, error: 'Unknown participant for "said by"' };
}

/** A current-step point the actor may change (their own, or any note for the scribe), or the reason they can't. */
function editableCurrentPoint(s: Session, actor: Participant, pointId: string): Point | string {
  if (!writesHere(s, actor)) return SCRIBE_ONLY;
  const point = s.points.find((p) => p.id === pointId);
  if (!point || (s.mode === 'everyone' && point.authorId !== actor.id)) return 'Point not found';
  if (point.stepIndex !== s.currentStep || !canWrite(s)) return LOCKED;
  return point;
}

export const CONTRIBUTION_HANDLERS: HandlerMap<
  | 'setScribe' | 'addPoint' | 'editPoint' | 'deletePoint' | 'vote' | 'unvote' | 'closeVoting' | 'skipVoting'
  | 'goToDecision' | 'setDecision' | 'addAction' | 'removeAction' | 'closeSession'
> = {
  setScribe: (s, _actor, cmd) => {
    if (s.mode !== 'scribe') return 'This session has no scribe';
    if (s.status !== 'lobby' && s.status !== 'running') return 'The scribe can no longer be changed';
    if (!s.participants.some((p) => p.id === cmd.participantId)) return 'Participant not found';
    s.scribeId = cmd.participantId;
  },
  addPoint: (s, actor, cmd, ctx) => {
    if (!canWrite(s)) return LOCKED;
    if (!writesHere(s, actor)) return SCRIBE_ONLY;
    const text = cleanText(cmd.text, 'Point', LIMITS.point);
    if (!text.ok) return text.error;
    const scribe = s.mode === 'scribe';
    const saidBy = scribe ? saidByOf(s, cmd.saidBy) : { ok: true as const, value: undefined };
    if (!saidBy.ok) return saidBy.error;
    const cap = scribe ? LIMITS.maxScribeNotesPerStep : LIMITS.maxPointsPerStep;
    const count = s.points.filter((p) => p.stepIndex === s.currentStep && (scribe || p.authorId === actor.id)).length;
    if (count >= cap) return `You can add at most ${cap} ${scribe ? 'notes' : 'points'} per step`;
    s.points.push({
      id: ctx.newId(),
      stepIndex: s.currentStep,
      authorId: actor.id,
      ...(saidBy.value ? { saidBy: saidBy.value } : {}),
      text: text.value,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  },
  editPoint: (s, actor, cmd, ctx) => {
    const point = editableCurrentPoint(s, actor, cmd.pointId);
    if (typeof point === 'string') return point;
    const text = cleanText(cmd.text, 'Point', LIMITS.point);
    if (!text.ok) return text.error;
    if (s.mode === 'scribe') {
      const saidBy = saidByOf(s, cmd.saidBy);
      if (!saidBy.ok) return saidBy.error;
      if (saidBy.value) point.saidBy = saidBy.value;
      else delete point.saidBy;
    }
    point.text = text.value;
    point.updatedAt = ctx.now;
  },
  deletePoint: (s, actor, cmd) => {
    if (s.status !== 'running') return 'Points can no longer be deleted';
    if (actor.isFacilitator) {
      if (!s.points.some((p) => p.id === cmd.pointId)) return 'Point not found';
    } else {
      const point = editableCurrentPoint(s, actor, cmd.pointId);
      if (typeof point === 'string') return point;
    }
    s.points = s.points.filter((p) => p.id !== cmd.pointId);
  },
  vote: (s, actor, cmd) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    if (!s.points.some((p) => p.id === cmd.pointId)) return 'Point not found';
    const mine = s.votes.filter((v) => v.voterId === actor.id);
    if (mine.some((v) => v.pointId === cmd.pointId)) return 'You already voted for this point';
    if (mine.length >= s.votesPerPerson) return `You have used all ${s.votesPerPerson} votes`;
    s.votes.push({ pointId: cmd.pointId, voterId: actor.id });
  },
  unvote: (s, actor, cmd) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    const before = s.votes.length;
    s.votes = s.votes.filter((v) => !(v.pointId === cmd.pointId && v.voterId === actor.id));
    if (s.votes.length === before) return 'You have not voted for this point';
  },
  closeVoting: (s) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    s.votingClosed = true;
  },
  skipVoting: (s) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    s.votes = [];
    s.status = 'decision';
  },
  goToDecision: (s) => {
    if (s.status !== 'voting' || !s.votingClosed) return 'Close voting first';
    s.status = 'decision';
  },
  setDecision: (s, _actor, cmd) => {
    if (s.status !== 'decision') return NOT_DECISION;
    const text = cleanText(cmd.text, 'Decision', LIMITS.decision, true);
    if (!text.ok) return text.error;
    s.decision = text.value;
  },
  addAction: (s, _actor, cmd, ctx) => {
    if (s.status !== 'decision') return NOT_DECISION;
    if (s.actions.length >= LIMITS.maxActions) return `You can add at most ${LIMITS.maxActions} action items`;
    const raw = (typeof cmd.action === 'object' && cmd.action !== null ? cmd.action : {}) as Record<string, unknown>;
    const text = cleanText(raw.text, 'Action', LIMITS.actionText);
    if (!text.ok) return text.error;
    const owner = cleanText(raw.owner, 'Owner', LIMITS.actionOwner, true);
    if (!owner.ok) return owner.error;
    const due = validateDue(raw.due);
    if (!due.ok) return due.error;
    s.actions.push({ id: ctx.newId(), text: text.value, owner: owner.value, ...(due.value ? { due: due.value } : {}) });
  },
  removeAction: (s, _actor, cmd) => {
    if (s.status !== 'decision') return NOT_DECISION;
    const before = s.actions.length;
    s.actions = s.actions.filter((a) => a.id !== cmd.actionId);
    if (s.actions.length === before) return 'Action item not found';
  },
  closeSession: (s, _actor, _cmd, ctx) => {
    if (s.status !== 'decision') return 'Finish voting before closing the session';
    s.status = 'closed';
    s.closedAt = ctx.now;
  },
};
```

- [ ] **Step 5: Complete the handler map**

In `server/src/engine.ts`, add `import { CONTRIBUTION_HANDLERS } from './contributions.js';` to the import block and replace:
```ts
const HANDLERS: Partial<HandlerMap<Command['type']>> = { ...FLOW_HANDLERS };
```
with:
```ts
const HANDLERS: HandlerMap<Command['type']> = { ...FLOW_HANDLERS, ...CONTRIBUTION_HANDLERS };
```
The compiler now fails if any `Command` lacks a handler.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run server && npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS — `contributions.test.ts` 15 tests plus earlier files; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: points, voting, decision and close" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Per-viewer views (redaction)

**Files:**
- Create: `server/src/views.ts`
- Test: `server/test/views.test.ts`

**Interfaces:**
- Consumes: `Session` (session.ts); `View`, `ViewPoint` (protocol.ts); `isStepRevealed` (rules.ts).
- Produces: `buildView(s: Session, viewerId: string, online: ReadonlySet<string>, now: number): View` — throws if `viewerId` is not a participant. Everyone-writes mode hides other people's unrevealed points; scribe mode shows every note immediately. `currentStepCounts` only in everyone-writes mode.

- [ ] **Step 1: Write the failing tests**

`server/test/views.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { SessionStatus, StepPhase } from '../../shared/src/protocol.js';
import { isStepRevealed } from '../../shared/src/rules.js';
import type { Session } from '../src/session.js';
import { buildView } from '../src/views.js';
import { makeSession, pointId, run, T0, toVoting } from './fixtures.js';

const NOBODY = new Set<string>();

function writingWithPoints() {
  const { s: lobby, fac, asha, ravi } = makeSession();
  let s = run(lobby, fac, { type: 'start' });
  s = run(s, asha, { type: 'addPoint', text: 'asha idea' });
  s = run(s, ravi, { type: 'addPoint', text: 'ravi idea 1' });
  s = run(s, ravi, { type: 'addPoint', text: 'ravi idea 2' });
  return { s, fac, asha, ravi };
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('buildView', () => {
  it('shows a participant only their own points before the reveal', () => {
    const { s, ravi } = writingWithPoints();
    const view = buildView(s, ravi, NOBODY, T0);
    expect(view.points.map((p) => p.text)).toEqual(['ravi idea 1', 'ravi idea 2']);
    expect(view.currentStepCounts).toBeUndefined();
  });

  it('gives the facilitator counts, not text', () => {
    const { s, fac, asha, ravi } = writingWithPoints();
    const view = buildView(s, fac, NOBODY, T0);
    expect(view.points).toEqual([]);
    expect(view.currentStepCounts).toEqual({ [fac]: 0, [asha]: 1, [ravi]: 2 });
    expect(view.me).toEqual({ id: fac, name: 'Fac', isFacilitator: true });
  });

  it('shows everyone every point with author names after the reveal', () => {
    const { s: base, fac, asha } = writingWithPoints();
    const s = run(base, fac, { type: 'revealNow' });
    const view = buildView(s, asha, NOBODY, T0);
    expect(view.points.map((p) => `${p.authorName}: ${p.text}`)).toEqual(['Asha: asha idea', 'Ravi: ravi idea 1', 'Ravi: ravi idea 2']);
  });

  it('shows scribe notes to everyone as they are written, credited to the speaker', () => {
    const { s: lobby, fac, asha, ravi } = makeSession(undefined, 'scribe');
    let s = run(run(lobby, fac, { type: 'setScribe', participantId: ravi }), fac, { type: 'start' });
    s = run(s, ravi, { type: 'addPoint', text: 'Pilot first', saidBy: asha });
    s = run(s, ravi, { type: 'addPoint', text: 'Agreed by all' });
    const ashasView = buildView(s, asha, NOBODY, T0);
    expect(ashasView).toMatchObject({ mode: 'scribe', scribeId: ravi, phase: 'writing' });
    expect(ashasView.points.map((p) => [p.text, p.authorName, p.saidByName])).toEqual([
      ['Pilot first', 'Ravi', 'Asha'],
      ['Agreed by all', 'Ravi', undefined],
    ]);
    expect(buildView(s, fac, NOBODY, T0).currentStepCounts).toBeUndefined();
  });

  it('hides vote totals until voting closes', () => {
    const { s: voting, fac, asha, ravi } = toVoting();
    const churn = pointId(voting, 'Churn is 4% monthly');
    const voted = run(voting, asha, { type: 'vote', pointId: churn });
    expect(buildView(voted, asha, NOBODY, T0).myVotes).toEqual([churn]);
    const ravisView = buildView(voted, ravi, NOBODY, T0);
    expect(ravisView.myVotes).toEqual([]);
    expect(ravisView.points.every((p) => p.votes === undefined)).toBe(true);
    const closed = run(voted, fac, { type: 'closeVoting' });
    expect(buildView(closed, ravi, NOBODY, T0).points.find((p) => p.id === churn)?.votes).toBe(1);
  });

  it('marks who is online and carries the server time', () => {
    const { s, asha } = makeSession();
    const view = buildView(s, asha, new Set([asha]), T0 + 7);
    expect(view.participants.map((p) => [p.name, p.online])).toEqual([['Fac', false], ['Asha', true], ['Ravi', false]]);
    expect(view.serverNow).toBe(T0 + 7);
  });

  it('never leaks another person\'s unrevealed point or any token hash', () => {
    const rand = mulberry32(42);
    const statuses: SessionStatus[] = ['lobby', 'running', 'voting', 'decision', 'closed'];
    const phases: StepPhase[] = ['writing', 'paused', 'revealed'];
    const { s: base } = makeSession();
    for (let trial = 0; trial < 300; trial++) {
      const s: Session = {
        ...base,
        status: statuses[Math.floor(rand() * statuses.length)]!,
        currentStep: Math.floor(rand() * 2),
        phase: phases[Math.floor(rand() * phases.length)]!,
        points: Array.from({ length: 12 }, (_, i) => ({
          id: `p${i}`,
          stepIndex: Math.floor(rand() * 2),
          authorId: base.participants[Math.floor(rand() * 3)]!.id,
          text: `t${i}`,
          createdAt: T0 + i,
          updatedAt: T0 + i,
        })),
      };
      for (const viewer of s.participants) {
        const view = buildView(s, viewer.id, NOBODY, T0);
        for (const p of view.points) expect(p.authorId === viewer.id || isStepRevealed(s, p.stepIndex)).toBe(true);
        expect(JSON.stringify(view)).not.toMatch(/hash/i);
      }
    }
  });

  it('refuses a viewer who is not in the session', () => {
    const { s } = makeSession();
    expect(() => buildView(s, 'stranger', NOBODY, T0)).toThrow('Viewer stranger is not in session session-1');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/test/views.test.ts`
Expected: FAIL — cannot load `../src/views.js`.

- [ ] **Step 3: Implement `buildView`**

`server/src/views.ts`:
```ts
import type { View, ViewPoint } from '../../shared/src/protocol.js';
import { isStepRevealed } from '../../shared/src/rules.js';
import type { Session } from './session.js';

/** The only projection of a session that may leave the server over the socket. */
export function buildView(s: Session, viewerId: string, online: ReadonlySet<string>, now: number): View {
  const me = s.participants.find((p) => p.id === viewerId);
  if (!me) throw new Error(`Viewer ${viewerId} is not in session ${s.id}`);

  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const voteCounts = new Map<string, number>();
  if (s.votingClosed) for (const v of s.votes) voteCounts.set(v.pointId, (voteCounts.get(v.pointId) ?? 0) + 1);

  const points: ViewPoint[] = s.points
    .filter((p) => p.authorId === viewerId || s.mode === 'scribe' || isStepRevealed(s, p.stepIndex))
    .map((p) => ({
      id: p.id,
      stepIndex: p.stepIndex,
      authorId: p.authorId,
      authorName: names.get(p.authorId) ?? 'Someone',
      ...(p.saidBy ? { saidById: p.saidBy, saidByName: names.get(p.saidBy) ?? 'Someone' } : {}),
      text: p.text,
      createdAt: p.createdAt,
      ...(s.votingClosed ? { votes: voteCounts.get(p.id) ?? 0 } : {}),
    }));

  const view: View = {
    id: s.id,
    code: s.code,
    title: s.title,
    focus: s.focus,
    status: s.status,
    createdAt: s.createdAt,
    ...(s.closedAt !== undefined ? { closedAt: s.closedAt } : {}),
    mode: s.mode,
    ...(s.scribeId !== undefined ? { scribeId: s.scribeId } : {}),
    steps: s.steps,
    currentStep: s.currentStep,
    phase: s.phase,
    ...(s.endsAt !== undefined ? { endsAt: s.endsAt } : {}),
    ...(s.remainingMs !== undefined ? { remainingMs: s.remainingMs } : {}),
    me: { id: me.id, name: me.name, isFacilitator: me.isFacilitator },
    participants: s.participants.map((p) => ({ id: p.id, name: p.name, isFacilitator: p.isFacilitator, online: online.has(p.id) })),
    points,
    votesPerPerson: s.votesPerPerson,
    votingClosed: s.votingClosed,
    myVotes: s.votes.filter((v) => v.voterId === viewerId).map((v) => v.pointId),
    decision: s.decision,
    actions: s.actions,
    serverNow: now,
  };

  if (me.isFacilitator && s.status === 'running' && s.mode === 'everyone') {
    view.currentStepCounts = Object.fromEntries(
      s.participants.map((p) => [p.id, s.points.filter((pt) => pt.stepIndex === s.currentStep && pt.authorId === p.id).length]),
    );
  }
  return view;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/test/views.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: per-viewer views with reveal redaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Markdown export

**Files:**
- Create: `server/src/export.ts`
- Test: `server/test/export.test.ts`

**Interfaces:**
- Consumes: `HATS`, `formatDuration` (hats.ts); `isStepRevealed`, `rankByVotes`, `creditedName` (rules.ts); `Session`, `Point`.
- Produces: `toMarkdown(s: Session): string` — only revealed content; vote counts only when `votingClosed`; top voted capped at 10; scribe sessions add `· Scribe: <name>` to the header and credit notes to the speaker or "Team".

- [ ] **Step 1: Write the failing tests**

`server/test/export.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../src/export.js';
import { makeSession, pointId, run, T0, toVoting } from './fixtures.js';

function finished(withVotes: boolean) {
  const { s: voting, fac, asha, ravi } = toVoting();
  let s = voting;
  if (withVotes) {
    const churn = pointId(s, 'Churn is 4% monthly');
    s = run(s, asha, { type: 'vote', pointId: churn });
    s = run(s, ravi, { type: 'vote', pointId: churn });
    s = run(s, fac, { type: 'vote', pointId: pointId(s, 'Migration risk') });
    s = run(s, fac, { type: 'closeVoting' });
    s = run(s, fac, { type: 'goToDecision' });
  } else {
    s = run(s, fac, { type: 'skipVoting' });
  }
  s = run(s, fac, { type: 'setDecision', text: 'Go ahead' });
  s = run(s, fac, { type: 'addAction', action: { text: 'Draft RFC', owner: 'Asha', due: '2026-10-21' } });
  return run(s, fac, { type: 'closeSession' });
}

describe('toMarkdown', () => {
  it('renders a complete session', () => {
    expect(toMarkdown(finished(true))).toBe(
      [
        '# Six Hats: Migrate billing?',
        '_2026-10-14 · Facilitator: Fac · 3 participants_',
        '',
        '**Focus question:** Should we migrate billing to Kafka?',
        '',
        '## Decision',
        'Go ahead',
        '',
        '## Action items',
        '- [ ] Draft RFC — **Asha** — due 2026-10-21',
        '',
        '## Top voted',
        '1. (2 votes) [White] Churn is 4% monthly — Asha',
        '2. (1 vote) [Black] Migration risk — Fac',
        '',
        '## Flow',
        '',
        '### 1. White hat — Facts & information (4:00)',
        '> What do we know about churn?',
        '',
        '- Churn is 4% monthly — Asha (2 votes)',
        '- No data on enterprise — Ravi',
        '',
        '### 2. Black hat — Caution & risks (4:00)',
        '> What could go wrong? Why might this not work?',
        '',
        '- Migration risk — Fac (1 vote)',
      ].join('\n') + '\n',
    );
  });

  it('omits vote counts when voting was skipped', () => {
    const md = toMarkdown(finished(false));
    expect(md).not.toContain('## Top voted');
    expect(md).not.toMatch(/\(\d+ votes?\)/);
  });

  it('never includes points from an unrevealed step', () => {
    const { s: lobby, fac, asha } = makeSession();
    const s = run(run(lobby, fac, { type: 'start' }), asha, { type: 'addPoint', text: 'secret idea' });
    const md = toMarkdown(s);
    expect(md).not.toContain('secret idea');
    expect(md).not.toContain('## Flow');
  });

  it('credits scribe notes to the speaker or the team', () => {
    const { s: lobby, fac, asha, ravi } = makeSession([{ hat: 'green', durationSec: 60 }], 'scribe');
    let s = run(run(lobby, fac, { type: 'setScribe', participantId: ravi }), fac, { type: 'start' });
    s = run(s, ravi, { type: 'addPoint', text: 'Pilot first', saidBy: asha }, T0 + 1);
    s = run(s, ravi, { type: 'addPoint', text: 'Agreed by all' }, T0 + 2);
    const md = toMarkdown(run(s, fac, { type: 'revealNow' }));
    expect(md).toContain('_2026-10-14 · Facilitator: Fac · 3 participants · Scribe: Ravi_');
    expect(md).toContain('- Pilot first — Asha\n- Agreed by all — Team\n');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/test/export.test.ts`
Expected: FAIL — cannot load `../src/export.js`.

- [ ] **Step 3: Implement `toMarkdown`**

`server/src/export.ts`:
```ts
import { HATS, formatDuration } from '../../shared/src/hats.js';
import { creditedName, isStepRevealed, rankByVotes } from '../../shared/src/rules.js';
import type { Point, Session } from './session.js';

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function toMarkdown(s: Session): string {
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const author = (id: string) => names.get(id) ?? 'Someone';
  const credit = (p: Point) => creditedName(s.mode, author(p.authorId), p.saidBy ? author(p.saidBy) : undefined);
  const facilitator = s.participants.find((p) => p.isFacilitator)?.name ?? 'Unknown';
  const scribe = s.mode === 'scribe' && s.scribeId ? ` · Scribe: ${author(s.scribeId)}` : '';
  const votes = new Map<string, number>();
  if (s.votingClosed) for (const v of s.votes) votes.set(v.pointId, (votes.get(v.pointId) ?? 0) + 1);
  const voteCount = (id: string) => votes.get(id) ?? 0;
  const visible = s.points.filter((p) => isStepRevealed(s, p.stepIndex));

  const out = [
    `# Six Hats: ${oneLine(s.title)}`,
    `_${new Date(s.createdAt).toISOString().slice(0, 10)} · Facilitator: ${facilitator} · ${plural(s.participants.length, 'participant')}${scribe}_`,
    '',
    `**Focus question:** ${oneLine(s.focus)}`,
  ];

  if (s.decision) out.push('', '## Decision', s.decision);

  if (s.actions.length) {
    out.push('', '## Action items');
    for (const a of s.actions) {
      out.push(`- [ ] ${oneLine(a.text)}${a.owner ? ` — **${a.owner}**` : ''}${a.due ? ` — due ${a.due}` : ''}`);
    }
  }

  const top = rankByVotes(visible, (p) => voteCount(p.id)).slice(0, 10);
  if (top.length) {
    out.push('', '## Top voted');
    top.forEach((p, i) => {
      const hat = HATS[s.steps[p.stepIndex]!.hat];
      out.push(`${i + 1}. (${plural(voteCount(p.id), 'vote')}) [${hat.label}] ${oneLine(p.text)} — ${credit(p)}`);
    });
  }

  const revealedSteps = s.steps.map((step, i) => ({ step, i })).filter(({ i }) => isStepRevealed(s, i));
  if (revealedSteps.length) {
    out.push('', '## Flow');
    for (const { step, i } of revealedSteps) {
      const hat = HATS[step.hat];
      out.push('', `### ${i + 1}. ${hat.name} — ${hat.focus} (${formatDuration(step.durationSec)})`, `> ${oneLine(step.prompt ?? hat.prompt)}`, '');
      const points = visible.filter((p) => p.stepIndex === i).sort((a, b) => a.createdAt - b.createdAt);
      if (!points.length) out.push('_No points._');
      for (const p of points) {
        const n = voteCount(p.id);
        out.push(`- ${oneLine(p.text)} — ${credit(p)}${n ? ` (${plural(n, 'vote')})` : ''}`);
      }
    }
  }

  return out.join('\n') + '\n';
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/test/export.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: Markdown summary export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ids, tokens, passcode and rate limits

**Files:**
- Create: `server/src/ids.ts`, `server/src/auth.ts`
- Test: `server/test/ids.test.ts`, `server/test/auth.test.ts`

**Interfaces:**
- Produces:
  - `ids.ts`: `CODE_ALPHABET`, `newId(): string`, `newToken(): string`, `hashToken(token): string` (64-char hex), `newCode(isTaken: (code) => boolean): string` (throws after 20 collisions).
  - `auth.ts`: `passcodeMatches(given: unknown, expected: string): boolean`; `class FailureLimiter(max = 10, windowMs = 60_000, clock = Date.now)` with `isBlocked(key)`, `recordFailure(key)`; `class SlidingWindow(max, windowMs, clock = Date.now)` with `tryTake(): boolean`.

- [ ] **Step 1: Write the failing tests**

`server/test/ids.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, hashToken, newCode, newToken } from '../src/ids.js';

describe('ids', () => {
  it('makes 6-character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = newCode(() => false);
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it('retries taken codes and gives up after 20 tries', () => {
    let calls = 0;
    newCode(() => ++calls <= 3);
    expect(calls).toBe(4);
    expect(() => newCode(() => true)).toThrow('Could not allocate a session code');
  });

  it('makes unguessable tokens and stable hashes', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});
```

`server/test/auth.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FailureLimiter, SlidingWindow, passcodeMatches } from '../src/auth.js';

describe('passcodeMatches', () => {
  it('matches only the exact passcode', () => {
    expect(passcodeMatches('s3cret', 's3cret')).toBe(true);
    expect(passcodeMatches('s3cret ', 's3cret')).toBe(false);
    expect(passcodeMatches('', 's3cret')).toBe(false);
    expect(passcodeMatches(undefined, 's3cret')).toBe(false);
  });
});

describe('FailureLimiter', () => {
  it('blocks a key after max failures within the window', () => {
    let now = 0;
    const limiter = new FailureLimiter(3, 1_000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(limiter.isBlocked('ip')).toBe(false);
      limiter.recordFailure('ip');
    }
    expect(limiter.isBlocked('ip')).toBe(true);
    expect(limiter.isBlocked('other')).toBe(false);
    now = 1_001;
    expect(limiter.isBlocked('ip')).toBe(false);
  });
});

describe('SlidingWindow', () => {
  it('allows max takes per window', () => {
    let now = 0;
    const window = new SlidingWindow(2, 1_000, () => now);
    expect(window.tryTake()).toBe(true);
    expect(window.tryTake()).toBe(true);
    expect(window.tryTake()).toBe(false);
    now = 1_001;
    expect(window.tryTake()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/test/ids.test.ts server/test/auth.test.ts`
Expected: FAIL — cannot load `../src/ids.js` / `../src/auth.js`.

- [ ] **Step 3: Implement**

`server/src/ids.ts`:
```ts
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId(): string {
  return randomUUID();
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not allocate a session code');
}
```

`server/src/auth.ts`:
```ts
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

export function passcodeMatches(given: unknown, expected: string): boolean {
  return typeof given === 'string' && timingSafeEqual(digest(given), digest(expected));
}

export class FailureLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 60_000,
    private readonly clock: () => number = Date.now,
  ) {}

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.max;
  }

  recordFailure(key: string): void {
    this.failures.set(key, [...this.recent(key), this.clock()]);
  }

  private recent(key: string): number[] {
    const cutoff = this.clock() - this.windowMs;
    const recent = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length) this.failures.set(key, recent);
    else this.failures.delete(key);
    return recent;
  }
}

export class SlidingWindow {
  private stamps: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  tryTake(): boolean {
    const now = this.clock();
    this.stamps = this.stamps.filter((t) => t > now - this.windowMs);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/test/ids.test.ts server/test/auth.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: ids, tokens, passcode check and rate limits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: SQLite store

**Files:**
- Create: `server/src/store.ts`
- Test: `server/test/store.test.ts`

**Interfaces:**
- Consumes: `Session`; `SessionSummary`, `Template` (protocol.ts).
- Produces: `class Store(file: string)` (`':memory:'` for tests) with `save(s)`, `get(id)`, `getByCode(code)`, `codeExists(code)`, `listLive(): Session[]`, `listSummaries(): SessionSummary[]` (newest first, `closedAt` omitted when absent), `saveTemplate(t)`, `listTemplates(): Template[]` (sorted by name), `deleteTemplate(id): boolean`, `close()`.

- [ ] **Step 1: Write the failing tests**

`server/test/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import { makeSession, run, T0 } from './fixtures.js';

describe('Store', () => {
  it('round-trips a session by id and code', () => {
    const store = new Store(':memory:');
    const { s } = makeSession();
    store.save(s);
    expect(store.get(s.id)).toEqual(s);
    expect(store.getByCode('ABC234')).toEqual(s);
    expect(store.codeExists('ABC234')).toBe(true);
    expect(store.codeExists('ZZZZZZ')).toBe(false);
    expect(store.get('missing')).toBeUndefined();
  });

  it('updates an existing session in place', () => {
    const store = new Store(':memory:');
    const { s, fac } = makeSession();
    store.save(s);
    store.save(run(s, fac, { type: 'start' }));
    expect(store.get(s.id)?.status).toBe('running');
    expect(store.listSummaries()).toHaveLength(1);
  });

  it('loads only live sessions for boot', () => {
    const store = new Store(':memory:');
    const { s } = makeSession();
    store.save(s);
    store.save({ ...s, id: 'session-2', code: 'XYZ789', status: 'closed', closedAt: T0 });
    expect(store.listLive().map((x) => x.id)).toEqual(['session-1']);
  });

  it('summarises sessions newest first', () => {
    const store = new Store(':memory:');
    const { s } = makeSession();
    store.save(s);
    store.save({ ...s, id: 'session-2', code: 'XYZ789', createdAt: T0 + 1_000, participants: s.participants.slice(0, 1) });
    expect(store.listSummaries()).toEqual([
      { id: 'session-2', code: 'XYZ789', title: 'Migrate billing?', status: 'lobby', createdAt: T0 + 1_000, participantCount: 1 },
      { id: 'session-1', code: 'ABC234', title: 'Migrate billing?', status: 'lobby', createdAt: T0, participantCount: 3 },
    ]);
  });

  it('stores team templates', () => {
    const store = new Store(':memory:');
    store.saveTemplate({ id: 't1', name: 'Retro', steps: [{ hat: 'red', durationSec: 60 }], createdAt: T0 });
    store.saveTemplate({ id: 't2', name: 'Kickoff', steps: [{ hat: 'blue', durationSec: 120 }], createdAt: T0 });
    expect(store.listTemplates().map((t) => t.name)).toEqual(['Kickoff', 'Retro']);
    expect(store.listTemplates()[1]?.steps).toEqual([{ hat: 'red', durationSec: 60 }]);
    expect(store.deleteTemplate('t1')).toBe(true);
    expect(store.deleteTemplate('t1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/test/store.test.ts`
Expected: FAIL — cannot load `../src/store.js`.

- [ ] **Step 3: Implement the store**

`server/src/store.ts`:
```ts
import Database from 'better-sqlite3';
import type { SessionSummary, Template } from '../../shared/src/protocol.js';
import type { Session } from './session.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    closed_at   INTEGER,
    doc         TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS templates (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    steps       TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`;

type SummaryRow = Omit<SessionSummary, 'closedAt'> & { closedAt: number | null };
type TemplateRow = { id: string; name: string; steps: string; createdAt: number };

export class Store {
  private readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  save(s: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, code, status, title, created_at, closed_at, doc)
         VALUES (@id, @code, @status, @title, @createdAt, @closedAt, @doc)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status, title = excluded.title, closed_at = excluded.closed_at, doc = excluded.doc`,
      )
      .run({ id: s.id, code: s.code, status: s.status, title: s.title, createdAt: s.createdAt, closedAt: s.closedAt ?? null, doc: JSON.stringify(s) });
  }

  get(id: string): Session | undefined {
    return this.parse(this.db.prepare('SELECT doc FROM sessions WHERE id = ?').get(id));
  }

  getByCode(code: string): Session | undefined {
    return this.parse(this.db.prepare('SELECT doc FROM sessions WHERE code = ?').get(code));
  }

  codeExists(code: string): boolean {
    return this.db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(code) !== undefined;
  }

  listLive(): Session[] {
    const rows = this.db.prepare(`SELECT doc FROM sessions WHERE status != 'closed'`).all() as { doc: string }[];
    return rows.map((r) => JSON.parse(r.doc) as Session);
  }

  listSummaries(): SessionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, code, title, status, created_at AS createdAt, closed_at AS closedAt,
                json_array_length(doc, '$.participants') AS participantCount
         FROM sessions ORDER BY created_at DESC`,
      )
      .all() as SummaryRow[];
    return rows.map(({ closedAt, ...rest }) => (closedAt === null ? rest : { ...rest, closedAt }));
  }

  saveTemplate(t: Template): void {
    this.db
      .prepare('INSERT INTO templates (id, name, steps, created_at) VALUES (?, ?, ?, ?)')
      .run(t.id, t.name, JSON.stringify(t.steps), t.createdAt);
  }

  listTemplates(): Template[] {
    const rows = this.db
      .prepare('SELECT id, name, steps, created_at AS createdAt FROM templates ORDER BY name COLLATE NOCASE')
      .all() as TemplateRow[];
    return rows.map((r) => ({ ...r, steps: JSON.parse(r.steps) }));
  }

  deleteTemplate(id: string): boolean {
    return this.db.prepare('DELETE FROM templates WHERE id = ?').run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private parse(row: unknown): Session | undefined {
    return row ? (JSON.parse((row as { doc: string }).doc) as Session) : undefined;
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/test/store.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: SQLite store for sessions and templates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Session service and timers

**Files:**
- Create: `server/src/sessions.ts`, `server/src/timers.ts`
- Test: `server/test/sessions.test.ts`, `server/test/timers.test.ts`

**Interfaces:**
- Consumes: `Store`; `createSession`, `joinSession`, `addFacilitatorToken`, `applyCommand`, `AnyCommand` (engine.ts); `newId`, `newCode`, `newToken`, `hashToken` (ids.ts); `SOCKET_ERRORS`, `CommandAck`, `CreateSessionResult`, `JoinResult` (protocol.ts).
- Produces:
  - `sessions.ts`: `ServiceResult<T> = ({ok:true} & T) | {ok:false; status:number; error:string}`; `AuthResult = {ok:true; session; participant} | {ok:false; error: SocketError}`; `class SessionService(store, clock = Date.now)` with `subscribe(fn)`, `loadLive(): Session[]`, `get(id)`, `getByCode(code)` (case-insensitive), `create(input): ServiceResult<CreateSessionResult>`, `join(code, name): ServiceResult<JoinResult>`, `mintFacilitatorToken(code): ServiceResult<{token}>`, `authenticate(code: unknown, token: unknown): AuthResult`, `dispatch(sessionId, actorId | null, cmd): CommandAck`.
  - `timers.ts`: `interface TimerTarget { get(id); dispatch(id, actorId, cmd) }`; `class Timers(target, clock = Date.now)` with `sync(s, minDelayMs = 0)`, `stopAll()`.

- [ ] **Step 1: Write the failing service tests**

`server/test/sessions.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../src/sessions.js';
import { Store } from '../src/store.js';

const INPUT = { title: 'Pricing', focus: 'Annual only?', facilitatorName: 'Fac', votesPerPerson: 3, steps: [{ hat: 'white', durationSec: 60 }] };

function setup() {
  const store = new Store(':memory:');
  const service = new SessionService(store, () => 1_000);
  const created = service.create(INPUT);
  if (!created.ok) throw new Error(created.error);
  const auth = service.authenticate(created.code, created.facilitatorToken);
  if (!auth.ok) throw new Error(auth.error);
  return { store, service, code: created.code, facToken: created.facilitatorToken, id: auth.session.id, facId: auth.participant.id };
}

afterEach(() => vi.restoreAllMocks());

describe('SessionService', () => {
  it('creates a persisted session that the facilitator token unlocks', () => {
    const { store, service, code, facToken } = setup();
    const auth = service.authenticate(code, facToken);
    expect(auth.ok && auth.participant.isFacilitator).toBe(true);
    expect(store.getByCode(code)?.title).toBe('Pricing');
  });

  it('rejects invalid input with a 400', () => {
    const service = new SessionService(new Store(':memory:'));
    expect(service.create({ ...INPUT, title: '' })).toEqual({ ok: false, status: 400, error: "Title can't be empty" });
  });

  it('joins by code regardless of case', () => {
    const { service, code } = setup();
    const joined = service.join(code.toLowerCase(), 'Asha');
    if (!joined.ok) throw new Error(joined.error);
    const auth = service.authenticate(code, joined.token);
    expect(auth.ok && auth.participant.name).toBe('Asha');
    expect(auth.ok && auth.participant.isFacilitator).toBe(false);
  });

  it('tells unknown codes and wrong tokens apart', () => {
    const { service, code, facToken } = setup();
    expect(service.authenticate('ZZZZZZ', facToken)).toEqual({ ok: false, error: 'session_not_found' });
    expect(service.authenticate(undefined, undefined)).toEqual({ ok: false, error: 'session_not_found' });
    expect(service.authenticate(code, 'wrong')).toEqual({ ok: false, error: 'invalid_token' });
    expect(service.join('ZZZZZZ', 'Asha')).toEqual({ ok: false, status: 404, error: 'Session not found' });
  });

  it('persists an accepted command before notifying listeners', () => {
    const { store, service, id, facId } = setup();
    const seen: string[] = [];
    service.subscribe((s) => seen.push(`${s.status}/${store.get(s.id)?.status}`));
    expect(service.dispatch(id, facId, { type: 'start' })).toEqual({ ok: true });
    expect(seen).toEqual(['running/running']);
  });

  it('returns engine errors without notifying', () => {
    const { service, id, code } = setup();
    const joined = service.join(code, 'Asha');
    if (!joined.ok) throw new Error(joined.error);
    const listener = vi.fn();
    service.subscribe(listener);
    expect(service.dispatch(id, joined.participantId, { type: 'start' })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    expect(service.dispatch('missing', null, { type: 'timerExpired' })).toEqual({ ok: false, error: 'Session not found' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the previous state when saving fails', () => {
    const { store, service, id, facId } = setup();
    vi.spyOn(store, 'save').mockImplementation(() => {
      throw new Error('disk full');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(service.dispatch(id, facId, { type: 'start' })).toEqual({ ok: false, error: 'Could not save, please try again' });
    expect(service.get(id)?.status).toBe('lobby');
  });

  it('mints extra facilitator tokens', () => {
    const { service, code } = setup();
    const minted = service.mintFacilitatorToken(code);
    if (!minted.ok) throw new Error(minted.error);
    const auth = service.authenticate(code, minted.token);
    expect(auth.ok && auth.participant.isFacilitator).toBe(true);
    expect(service.mintFacilitatorToken('ZZZZZZ')).toEqual({ ok: false, status: 404, error: 'Session not found' });
  });

  it('refuses to join a closed session with a 410', () => {
    const { service, id, facId, code } = setup();
    for (const type of ['start', 'revealNow', 'nextStep', 'skipVoting', 'closeSession'] as const) {
      expect(service.dispatch(id, facId, { type })).toEqual({ ok: true });
    }
    expect(service.join(code, 'Late')).toEqual({ ok: false, status: 410, error: 'This session has ended' });
  });

  it('reloads live sessions from the store', () => {
    const { store, code } = setup();
    expect(new SessionService(store).loadLive().map((s) => s.code)).toEqual([code]);
  });
});
```

- [ ] **Step 2: Write the failing timer tests**

`server/test/timers.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../src/session.js';
import { Timers } from '../src/timers.js';
import { makeSession, run, T0 } from './fixtures.js';

function writingSession(): Session {
  const { s, fac } = makeSession();
  return run(s, fac, { type: 'start' }, T0);
}

describe('Timers', () => {
  beforeEach(() => vi.useFakeTimers({ now: T0 }));
  afterEach(() => vi.useRealTimers());

  it('submits timerExpired when the step ends', () => {
    const s = writingSession();
    const dispatch = vi.fn(() => ({ ok: true as const }));
    new Timers({ get: () => s, dispatch }, () => Date.now()).sync(s);
    vi.advanceTimersByTime(239_999);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispatch).toHaveBeenCalledWith(s.id, null, { type: 'timerExpired' });
  });

  it('cancels the timer once the step is no longer writing', () => {
    const s = writingSession();
    const dispatch = vi.fn(() => ({ ok: true as const }));
    const timers = new Timers({ get: () => s, dispatch }, () => Date.now());
    timers.sync(s);
    timers.sync({ ...s, phase: 'revealed' });
    vi.advanceTimersByTime(300_000);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('retries shortly when the expiry is rejected', () => {
    const s = writingSession();
    const dispatch = vi.fn().mockReturnValueOnce({ ok: false, error: 'The timer has not finished' }).mockReturnValue({ ok: true });
    new Timers({ get: () => s, dispatch }, () => Date.now()).sync(s);
    vi.advanceTimersByTime(240_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('stopAll cancels every timer', () => {
    const s = writingSession();
    const dispatch = vi.fn(() => ({ ok: true as const }));
    const timers = new Timers({ get: () => s, dispatch }, () => Date.now());
    timers.sync(s);
    timers.stopAll();
    vi.advanceTimersByTime(300_000);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/test/sessions.test.ts server/test/timers.test.ts`
Expected: FAIL — cannot load `../src/sessions.js` / `../src/timers.js`.

- [ ] **Step 4: Implement the service**

`server/src/sessions.ts`:
```ts
import { SOCKET_ERRORS, type CommandAck, type CreateSessionResult, type JoinResult, type SocketError } from '../../shared/src/protocol.js';
import { addFacilitatorToken, applyCommand, createSession, joinSession, type AnyCommand } from './engine.js';
import { hashToken, newCode, newId, newToken } from './ids.js';
import type { Participant, Session } from './session.js';
import type { Store } from './store.js';

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };
export type AuthResult = { ok: true; session: Session; participant: Participant } | { ok: false; error: SocketError };
type Listener = (s: Session) => void;

const NOT_FOUND = { ok: false as const, status: 404, error: 'Session not found' };

/** Owns the write path: engine -> store -> memory -> listeners. Memory and disk never diverge. */
export class SessionService {
  private readonly sessions = new Map<string, Session>();
  private readonly listeners: Listener[] = [];

  constructor(
    private readonly store: Store,
    private readonly clock: () => number = Date.now,
  ) {}

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  loadLive(): Session[] {
    const live = this.store.listLive();
    for (const s of live) this.sessions.set(s.id, s);
    return live;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id) ?? this.remember(this.store.get(id));
  }

  getByCode(code: string): Session | undefined {
    const upper = code.toUpperCase();
    for (const s of this.sessions.values()) if (s.code === upper) return s;
    return this.remember(this.store.getByCode(upper));
  }

  create(input: unknown): ServiceResult<CreateSessionResult> {
    const token = newToken();
    const r = createSession(input, {
      id: newId(),
      code: newCode((c) => this.store.codeExists(c)),
      tokenHash: hashToken(token),
      now: this.clock(),
      newId,
    });
    if (!r.ok) return { ok: false, status: 400, error: r.error };
    const saved = this.persist(r.session);
    if (!saved.ok) return saved;
    return { ok: true, code: r.session.code, facilitatorToken: token };
  }

  join(code: string, name: unknown): ServiceResult<JoinResult> {
    const s = this.getByCode(code);
    if (!s) return NOT_FOUND;
    const token = newToken();
    const r = joinSession(s, name, hashToken(token), { now: this.clock(), newId });
    if (!r.ok) return { ok: false, status: r.reason === 'closed' ? 410 : 400, error: r.error };
    const saved = this.persist(r.session);
    if (!saved.ok) return saved;
    return { ok: true, participantId: r.participantId, token };
  }

  mintFacilitatorToken(code: string): ServiceResult<{ token: string }> {
    const s = this.getByCode(code);
    if (!s) return NOT_FOUND;
    const token = newToken();
    const saved = this.persist(addFacilitatorToken(s, hashToken(token)));
    if (!saved.ok) return saved;
    return { ok: true, token };
  }

  authenticate(code: unknown, token: unknown): AuthResult {
    const session = typeof code === 'string' ? this.getByCode(code) : undefined;
    if (!session) return { ok: false, error: SOCKET_ERRORS.notFound };
    const hash = typeof token === 'string' ? hashToken(token) : '';
    const participant = session.participants.find((p) => p.tokenHashes.includes(hash));
    return participant ? { ok: true, session, participant } : { ok: false, error: SOCKET_ERRORS.invalidToken };
  }

  dispatch(sessionId: string, actorId: string | null, cmd: AnyCommand): CommandAck {
    const current = this.get(sessionId);
    if (!current) return { ok: false, error: 'Session not found' };
    const r = applyCommand(current, actorId, cmd, { now: this.clock(), newId });
    if (!r.ok) return r;
    const saved = this.persist(r.session);
    return saved.ok ? { ok: true } : { ok: false, error: saved.error };
  }

  private persist(s: Session): { ok: true } | { ok: false; status: number; error: string } {
    try {
      this.store.save(s);
    } catch (err) {
      console.error(`Failed to save session ${s.id}`, err);
      return { ok: false, status: 500, error: 'Could not save, please try again' };
    }
    this.sessions.set(s.id, s);
    for (const fn of this.listeners) {
      try {
        fn(s);
      } catch (err) {
        console.error('Session listener failed', err);
      }
    }
    return { ok: true };
  }

  private remember(s: Session | undefined): Session | undefined {
    if (s) this.sessions.set(s.id, s);
    return s;
  }
}
```

- [ ] **Step 5: Implement the timers**

`server/src/timers.ts`:
```ts
import type { CommandAck } from '../../shared/src/protocol.js';
import type { AnyCommand } from './engine.js';
import type { Session } from './session.js';

export interface TimerTarget {
  get(id: string): Session | undefined;
  dispatch(id: string, actorId: string | null, cmd: AnyCommand): CommandAck;
}

const RETRY_MS = 250;

export class Timers {
  private readonly handles = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly target: TimerTarget,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Re-arms (or clears) the session's timer to match its current state. */
  sync(s: Session, minDelayMs = 0): void {
    const existing = this.handles.get(s.id);
    if (existing) clearTimeout(existing);
    this.handles.delete(s.id);
    if (s.status !== 'running' || s.phase !== 'writing' || s.endsAt === undefined) return;
    const delay = Math.max(minDelayMs, s.endsAt - this.clock());
    this.handles.set(s.id, setTimeout(() => this.fire(s.id), delay));
  }

  stopAll(): void {
    for (const handle of this.handles.values()) clearTimeout(handle);
    this.handles.clear();
  }

  private fire(id: string): void {
    this.handles.delete(id);
    const result = this.target.dispatch(id, null, { type: 'timerExpired' });
    if (result.ok) return;
    const current = this.target.get(id);
    if (current) this.sync(current, RETRY_MS);
  }
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run server`
Expected: PASS — `sessions.test.ts` 10 tests, `timers.test.ts` 4 tests, earlier files unchanged.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: session service write path and server-owned timers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: HTTP API, realtime and server boot

**Files:**
- Create: `server/src/app.ts`, `server/src/realtime.ts`, `server/src/server.ts`, `server/src/index.ts`
- Test: `server/test/http.test.ts`, `server/test/integration.test.ts`

**Interfaces:**
- Consumes: `SessionService`, `Store`, `Timers`, `buildView`, `toMarkdown`, `passcodeMatches`, `FailureLimiter`, `SlidingWindow`, `cleanText`, `validateSteps`, `newId`.
- Produces:
  - `app.ts`: `createApp({service, store, passcode, webDir?, clock?}): express.Express`.
  - `realtime.ts`: `attachRealtime(io, service, clock?)`. Socket events: client → `command` (with ack); server → `state` (`View`). Handshake `auth: {code, token}`; rejection message is `session_not_found` or `invalid_token`.
  - `server.ts`: `startServer({passcode, dataDir, port, webDir?, clock?}): Promise<RunningServer>`; `RunningServer = {port: number; close(): Promise<void>}`.
  - HTTP: `GET /healthz`; `POST /api/passcode/check`; `POST|GET /api/sessions`; `POST /api/sessions/:code/join`; `POST /api/sessions/:code/facilitator-link`; `GET /api/sessions/:code/summary.md`; `GET|POST /api/templates`; `DELETE /api/templates/:id`. Headers: `X-Team-Passcode`, `X-Session-Token`.

- [ ] **Step 1: Write the failing HTTP tests**

`server/test/http.test.ts`:
```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../src/server.js';

const PASSCODE = 'team-secret';
const WITH_PASSCODE = { 'x-team-passcode': PASSCODE };
const FLOW = { title: 'Pricing', focus: 'Annual only?', facilitatorName: 'Fac', votesPerPerson: 3, steps: [{ hat: 'white', durationSec: 60 }] };

let server: RunningServer;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'six-hats-http-'));
  server = await startServer({ passcode: PASSCODE, dataDir: dir, port: 0 });
});

afterEach(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createSession() {
  const res = await call('POST', '/api/sessions', FLOW, WITH_PASSCODE);
  expect(res.status).toBe(201);
  return (await res.json()) as { code: string; facilitatorToken: string };
}

describe('HTTP API', () => {
  it('answers the health check', async () => {
    const res = await call('GET', '/healthz');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('requires the team passcode to create a session', async () => {
    const res = await call('POST', '/api/sessions', FLOW);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Wrong team passcode' });
  });

  it('blocks a client after 10 wrong passcodes', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call('POST', '/api/passcode/check', undefined, { 'x-team-passcode': 'nope' })).status).toBe(401);
    }
    expect((await call('POST', '/api/passcode/check', undefined, WITH_PASSCODE)).status).toBe(429);
  });

  it('creates a session and lets people join by code', async () => {
    const { code, facilitatorToken } = await createSession();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(facilitatorToken.length).toBeGreaterThan(20);
    const res = await call('POST', `/api/sessions/${code.toLowerCase()}/join`, { name: 'Asha' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ participantId: expect.any(String), token: expect.any(String) });
  });

  it('rejects an invalid flow with a readable message', async () => {
    const res = await call('POST', '/api/sessions', { ...FLOW, steps: [] }, WITH_PASSCODE);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A flow needs at least 1 step' });
  });

  it('returns 404 for an unknown code and for unknown API routes', async () => {
    expect((await call('POST', '/api/sessions/ZZZZZZ/join', { name: 'Asha' })).status).toBe(404);
    const res = await call('GET', '/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('lists sessions in the archive', async () => {
    const { code } = await createSession();
    const res = await call('GET', '/api/sessions', undefined, WITH_PASSCODE);
    expect(await res.json()).toEqual([expect.objectContaining({ code, title: 'Pricing', status: 'lobby', participantCount: 1 })]);
  });

  it('serves the Markdown summary to a session member or a passcode holder only', async () => {
    const { code, facilitatorToken } = await createSession();
    expect((await call('GET', `/api/sessions/${code}/summary.md`)).status).toBe(401);
    const res = await call('GET', `/api/sessions/${code}/summary.md`, undefined, { 'x-session-token': facilitatorToken });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="six-hats-${code}.md"`);
    expect(await res.text()).toMatch(/^# Six Hats: Pricing\n/);
    expect((await call('GET', `/api/sessions/${code}/summary.md`, undefined, WITH_PASSCODE)).status).toBe(200);
  });

  it('mints a new facilitator link for passcode holders', async () => {
    const { code, facilitatorToken } = await createSession();
    const res = await call('POST', `/api/sessions/${code}/facilitator-link`, undefined, WITH_PASSCODE);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { token: string }).token).not.toBe(facilitatorToken);
  });

  it('saves, lists and deletes team templates', async () => {
    const created = await call('POST', '/api/templates', { name: 'Retro', steps: [{ hat: 'red', durationSec: 60 }] }, WITH_PASSCODE);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(await (await call('GET', '/api/templates', undefined, WITH_PASSCODE)).json()).toEqual([
      expect.objectContaining({ id, name: 'Retro', steps: [{ hat: 'red', durationSec: 60 }] }),
    ]);
    expect((await call('POST', '/api/templates', { name: '', steps: [] }, WITH_PASSCODE)).status).toBe(400);
    expect((await call('DELETE', `/api/templates/${id}`, undefined, WITH_PASSCODE)).status).toBe(204);
    expect((await call('DELETE', `/api/templates/${id}`, undefined, WITH_PASSCODE)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Write the failing integration tests**

`server/test/integration.test.ts`:
```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Command, CommandAck, View, WritingMode } from '../../shared/src/protocol.js';
import { startServer, type RunningServer } from '../src/server.js';

const PASSCODE = 'team-secret';
let skew = 0;
const clock = () => Date.now() + skew;
let dir: string;
let server: RunningServer;
const clients: Client[] = [];

class Client {
  readonly socket: Socket;
  last: View | undefined;

  constructor(port: number, code: string, token: string) {
    this.socket = io(`http://127.0.0.1:${port}`, { auth: { code, token }, transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('state', (v: View) => {
      this.last = v;
    });
    clients.push(this);
  }

  /** Resolves with the latest state matching `predicate`, waiting for new states if needed. */
  wait(predicate: (v: View) => boolean, timeoutMs = 5_000): Promise<View> {
    if (this.last && predicate(this.last)) return Promise.resolve(this.last);
    return new Promise((resolve, reject) => {
      const onState = (v: View) => {
        if (!predicate(v)) return;
        clearTimeout(timer);
        this.socket.off('state', onState);
        resolve(v);
      };
      const timer = setTimeout(() => {
        this.socket.off('state', onState);
        reject(new Error('Timed out waiting for state'));
      }, timeoutMs);
      this.socket.on('state', onState);
    });
  }

  send(cmd: Command): Promise<CommandAck> {
    return this.socket.timeout(5_000).emitWithAck('command', cmd);
  }
}

async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

const createSession = (mode: WritingMode = 'everyone') =>
  post<{ code: string; facilitatorToken: string }>(
    '/api/sessions',
    { title: 'Sandbox', focus: 'Should we build a sandbox?', facilitatorName: 'Fac', votesPerPerson: 3, mode, steps: [{ hat: 'green', durationSec: 60 }] },
    { 'x-team-passcode': PASSCODE },
  );
const join = (code: string, name: string) => post<{ participantId: string; token: string }>(`/api/sessions/${code}/join`, { name });

beforeEach(async () => {
  skew = 0;
  dir = mkdtempSync(join(tmpdir(), 'six-hats-int-'));
  server = await startServer({ passcode: PASSCODE, dataDir: dir, port: 0, clock });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('live session', () => {
  it('runs a full session from lobby to Markdown summary', async () => {
    const { code, facilitatorToken } = await createSession();
    const asha = await join(code, 'Asha');
    const ravi = await join(code, 'Ravi');
    const fac = new Client(server.port, code, facilitatorToken);
    const a = new Client(server.port, code, asha.token);
    const r = new Client(server.port, code, ravi.token);
    await fac.wait((v) => v.participants.every((p) => p.online));

    const writing = r.wait((v) => v.phase === 'writing');
    expect(await fac.send({ type: 'start' })).toEqual({ ok: true });
    await writing;

    expect(await a.send({ type: 'addPoint', text: 'Build a sandbox' })).toEqual({ ok: true });
    expect(await r.send({ type: 'addPoint', text: 'Ask customers first' })).toEqual({ ok: true });
    const ravisView = await r.wait((v) => v.points.length > 0);
    expect(ravisView.points.map((p) => p.text)).toEqual(['Ask customers first']);
    const facView = await fac.wait((v) => v.currentStepCounts?.[ravi.participantId] === 1);
    expect(facView.points).toEqual([]);
    expect(facView.currentStepCounts?.[asha.participantId]).toBe(1);

    // Move the server clock to just before 0:00; the next state change re-arms the timer with ~300 ms left.
    const revealed = r.wait((v) => v.phase === 'revealed');
    skew = 59_700;
    expect(await fac.send({ type: 'addPoint', text: 'Time-box it' })).toEqual({ ok: true });
    expect((await revealed).points.map((p) => p.text).sort()).toEqual(['Ask customers first', 'Build a sandbox', 'Time-box it']);
    expect(await a.send({ type: 'addPoint', text: 'Too late' })).toEqual({ ok: false, error: 'Writing is locked for this step' });

    const voting = a.wait((v) => v.status === 'voting');
    await fac.send({ type: 'nextStep' });
    const sandbox = (await voting).points.find((p) => p.text === 'Build a sandbox')!.id;
    expect(await a.send({ type: 'vote', pointId: sandbox })).toEqual({ ok: true });
    expect(await r.send({ type: 'vote', pointId: sandbox })).toEqual({ ok: true });
    const counted = a.wait((v) => v.votingClosed);
    await fac.send({ type: 'closeVoting' });
    expect((await counted).points.find((p) => p.id === sandbox)?.votes).toBe(2);

    await fac.send({ type: 'goToDecision' });
    await fac.send({ type: 'setDecision', text: 'Build the sandbox' });
    await fac.send({ type: 'addAction', action: { text: 'Spike it', owner: 'Asha', due: '2026-10-21' } });
    const ended = r.wait((v) => v.status === 'closed');
    expect(await fac.send({ type: 'closeSession' })).toEqual({ ok: true });
    await ended;

    const res = await fetch(`http://127.0.0.1:${server.port}/api/sessions/${code}/summary.md`, { headers: { 'x-session-token': ravi.token } });
    const md = await res.text();
    expect(md).toContain('## Decision\nBuild the sandbox');
    expect(md).toContain('1. (2 votes) [Green] Build a sandbox — Asha');
    expect(md).toContain('- [ ] Spike it — **Asha** — due 2026-10-21');
  });

  it('lets only the scribe write in scribe mode and shares notes live', async () => {
    const { code, facilitatorToken } = await createSession('scribe');
    const asha = await join(code, 'Asha');
    const ravi = await join(code, 'Ravi');
    const fac = new Client(server.port, code, facilitatorToken);
    const a = new Client(server.port, code, asha.token);
    const r = new Client(server.port, code, ravi.token);
    await fac.wait((v) => v.participants.every((p) => p.online));

    expect(await fac.send({ type: 'start' })).toEqual({ ok: false, error: 'Choose a scribe before starting' });
    expect(await fac.send({ type: 'setScribe', participantId: ravi.participantId })).toEqual({ ok: true });
    const writing = a.wait((v) => v.phase === 'writing');
    expect(await fac.send({ type: 'start' })).toEqual({ ok: true });
    await writing;

    expect(await a.send({ type: 'addPoint', text: 'Mine' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    const shared = a.wait((v) => v.points.length === 1);
    expect(await r.send({ type: 'addPoint', text: 'Pilot first', saidBy: asha.participantId })).toEqual({ ok: true });
    const view = await shared;
    expect(view.phase).toBe('writing');
    expect(view.points[0]).toMatchObject({ text: 'Pilot first', authorName: 'Ravi', saidByName: 'Asha' });
  });

  it('refuses a socket with a wrong token', async () => {
    const { code } = await createSession();
    const bad = new Client(server.port, code, 'not-a-token');
    const err = await new Promise<Error>((resolve) => bad.socket.on('connect_error', resolve));
    expect(err.message).toBe('invalid_token');
  });

  it('resumes a running step after a restart and reveals it when due', async () => {
    const { code, facilitatorToken } = await createSession();
    const asha = await join(code, 'Asha');
    const fac = new Client(server.port, code, facilitatorToken);
    const a = new Client(server.port, code, asha.token);
    await Promise.all([fac.wait(() => true), a.wait(() => true)]);
    await fac.send({ type: 'start' });
    expect(await a.send({ type: 'addPoint', text: 'Pilot with one team' })).toEqual({ ok: true });

    for (const c of clients.splice(0)) c.socket.disconnect();
    await server.close();
    skew = 61_000;
    server = await startServer({ passcode: PASSCODE, dataDir: dir, port: 0, clock });

    const again = new Client(server.port, code, asha.token);
    const view = await again.wait((v) => v.phase === 'revealed');
    expect(view.points.map((p) => p.text)).toEqual(['Pilot with one team']);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/test/http.test.ts server/test/integration.test.ts`
Expected: FAIL — cannot load `../src/server.js`.

- [ ] **Step 4: Implement the Express app**

`server/src/app.ts`:
```ts
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS } from '../../shared/src/hats.js';
import { FailureLimiter, passcodeMatches } from './auth.js';
import { toMarkdown } from './export.js';
import { newId } from './ids.js';
import type { SessionService } from './sessions.js';
import type { Store } from './store.js';
import { cleanText, validateSteps } from './validate.js';

export interface AppDeps {
  service: SessionService;
  store: Store;
  passcode: string;
  webDir?: string;
  clock?: () => number;
}

export function createApp({ service, store, passcode, webDir, clock = Date.now }: AppDeps): express.Express {
  const app = express();
  const failures = new FailureLimiter(10, 60_000, clock);

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: '64kb' }));

  const requirePasscode = (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    if (failures.isBlocked(key)) return void res.status(429).json({ error: 'Too many wrong passcodes, wait a minute' });
    if (!passcodeMatches(req.get('x-team-passcode'), passcode)) {
      failures.recordFailure(key);
      return void res.status(401).json({ error: 'Wrong team passcode' });
    }
    next();
  };

  app.get('/healthz', (_req, res) => {
    res.type('text/plain').send('ok');
  });

  app.post('/api/passcode/check', requirePasscode, (_req, res) => {
    res.status(204).end();
  });

  app.post('/api/sessions', requirePasscode, (req, res) => {
    const r = service.create(req.body);
    if (!r.ok) return void res.status(r.status).json({ error: r.error });
    res.status(201).json({ code: r.code, facilitatorToken: r.facilitatorToken });
  });

  app.get('/api/sessions', requirePasscode, (_req, res) => {
    res.json(store.listSummaries());
  });

  app.post('/api/sessions/:code/join', (req, res) => {
    const r = service.join(req.params.code, req.body?.name);
    if (!r.ok) return void res.status(r.status).json({ error: r.error });
    res.status(201).json({ participantId: r.participantId, token: r.token });
  });

  app.post('/api/sessions/:code/facilitator-link', requirePasscode, (req, res) => {
    const r = service.mintFacilitatorToken(req.params.code);
    if (!r.ok) return void res.status(r.status).json({ error: r.error });
    res.status(201).json({ token: r.token });
  });

  app.get('/api/sessions/:code/summary.md', (req, res) => {
    const session = service.getByCode(req.params.code);
    if (!session) return void res.status(404).json({ error: 'Session not found' });
    const send = () => {
      res
        .type('text/markdown; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="six-hats-${session.code}.md"`)
        .send(toMarkdown(service.getByCode(session.code) ?? session));
    };
    const token = req.get('x-session-token');
    if (token && service.authenticate(session.code, token).ok) return send();
    requirePasscode(req, res, send);
  });

  app.get('/api/templates', requirePasscode, (_req, res) => {
    res.json(store.listTemplates());
  });

  app.post('/api/templates', requirePasscode, (req, res) => {
    const name = cleanText(req.body?.name, 'Template name', LIMITS.templateName);
    if (!name.ok) return void res.status(400).json({ error: name.error });
    const steps = validateSteps(req.body?.steps);
    if (!steps.ok) return void res.status(400).json({ error: steps.error });
    const template = { id: newId(), name: name.value, steps: steps.value, createdAt: clock() };
    store.saveTemplate(template);
    res.status(201).json(template);
  });

  app.delete('/api/templates/:id', requirePasscode, (req, res) => {
    if (store.deleteTemplate(req.params.id)) res.status(204).end();
    else res.status(404).json({ error: 'Template not found' });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (webDir && existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(join(webDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' ? err.status : 500;
    if (status >= 500) console.error(err);
    const error = status === 400 ? 'Invalid request body' : status === 413 ? 'Request too large' : 'Something went wrong';
    res.status(status).json({ error });
  });

  return app;
}
```

- [ ] **Step 5: Implement realtime**

`server/src/realtime.ts`:
```ts
import type { Server, Socket } from 'socket.io';
import type { CommandAck } from '../../shared/src/protocol.js';
import { SlidingWindow } from './auth.js';
import type { AnyCommand } from './engine.js';
import type { Session } from './session.js';
import type { SessionService } from './sessions.js';
import { buildView } from './views.js';

interface SocketData {
  sessionId: string;
  participantId: string;
  limiter: SlidingWindow;
}

export function attachRealtime(io: Server, service: SessionService, clock: () => number = Date.now): void {
  const rooms = new Map<string, Set<Socket>>();
  const dataOf = (socket: Socket) => socket.data as SocketData;

  const broadcast = (s: Session): void => {
    const sockets = rooms.get(s.id);
    if (!sockets) return;
    const online = new Set([...sockets].map((sock) => dataOf(sock).participantId));
    const now = clock();
    for (const sock of sockets) sock.emit('state', buildView(s, dataOf(sock).participantId, online, now));
  };

  service.subscribe(broadcast);

  io.use((socket, next) => {
    const { code, token } = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const auth = service.authenticate(code, token);
    if (!auth.ok) return next(new Error(auth.error));
    const data: SocketData = { sessionId: auth.session.id, participantId: auth.participant.id, limiter: new SlidingWindow(20, 10_000, clock) };
    socket.data = data;
    next();
  });

  io.on('connection', (socket) => {
    const { sessionId, participantId, limiter } = dataOf(socket);
    const room = rooms.get(sessionId) ?? new Set<Socket>();
    rooms.set(sessionId, room);
    room.add(socket);
    const current = service.get(sessionId);
    if (current) broadcast(current);

    socket.on('command', (cmd: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      const reply = ack as (result: CommandAck) => void;
      if (!limiter.tryTake()) return reply({ ok: false, error: 'Slow down' });
      reply(service.dispatch(sessionId, participantId, cmd as AnyCommand));
    });

    socket.on('disconnect', () => {
      room.delete(socket);
      if (room.size === 0) rooms.delete(sessionId);
      const latest = service.get(sessionId);
      if (latest) broadcast(latest);
    });
  });
}
```

- [ ] **Step 6: Implement the server and entry point**

`server/src/server.ts`:
```ts
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { SessionService } from './sessions.js';
import { Store } from './store.js';
import { Timers } from './timers.js';

export interface ServerOptions {
  passcode: string;
  dataDir: string;
  port: number;
  webDir?: string;
  clock?: () => number;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export async function startServer({ passcode, dataDir, port, webDir, clock = Date.now }: ServerOptions): Promise<RunningServer> {
  mkdirSync(dataDir, { recursive: true });
  const store = new Store(join(dataDir, 'six-hats.db'));
  const service = new SessionService(store, clock);
  const timers = new Timers(service, clock);
  service.subscribe((s) => timers.sync(s));
  for (const s of service.loadLive()) timers.sync(s);

  const http = createServer(createApp({ service, store, passcode, webDir, clock }));
  const io = new Server(http, { serveClient: false, maxHttpBufferSize: 64 * 1024 });
  attachRealtime(io, service, clock);

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  return {
    port: typeof address === 'object' && address !== null ? address.port : port,
    close: async () => {
      timers.stopAll();
      await io.close();
      store.close();
    },
  };
}
```

`server/src/index.ts`:
```ts
import { startServer } from './server.js';

const passcode = process.env.TEAM_PASSCODE;
if (!passcode) {
  console.error('TEAM_PASSCODE must be set');
  process.exit(1);
}

const server = await startServer({
  passcode,
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? './data',
  webDir: process.env.WEB_DIR,
});
console.log(`Six Hats listening on :${server.port}`);

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `npx vitest run && npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS — all files including `http.test.ts` (10 tests) and `integration.test.ts` (4 tests); `tsc` prints nothing.

- [ ] **Step 8: Smoke-test the server entry point**

Run:
```bash
(TEAM_PASSCODE=dev DATA_DIR=./data npx tsx server/src/index.ts & echo $! > /tmp/six-hats.pid; sleep 3; curl -s localhost:8080/healthz; echo; kill $(cat /tmp/six-hats.pid))
```
Expected: `Six Hats listening on :8080` then `ok`.

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "feat: HTTP API, realtime sync and server boot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web shell, home and archive

**Files:**
- Create: `vite.config.ts`, `web/tsconfig.json`, `web/index.html`
- Create: `web/src/main.ts`, `web/src/App.vue`, `web/src/router.ts`, `web/src/styles.css`, `web/src/api.ts`, `web/src/toast.ts`, `web/src/files.ts`, `web/src/labels.ts`
- Create: `web/src/components/ToastHost.vue`, `web/src/components/HatBadge.vue`, `web/src/components/PasscodeGate.vue`, `web/src/components/ArchiveList.vue`
- Create: `web/src/pages/HomePage.vue`, `web/src/pages/ArchivePage.vue`

**Interfaces:**
- Consumes: shared modules through the `@shared/*` alias (`@shared/hats`, `@shared/protocol`, `@shared/rules`).
- Produces:
  - `api.ts`: `getPasscode()`, `setPasscode(p | null)`, `getToken(code)`, `setToken(code, token | null)`, `class ApiError(status, message)`, `errorMessage(e)`, `participantLink(code)`, `adminLink(code, token)`, and `api.{checkPasscode, createSession, listSessions, join, facilitatorLink, summaryMarkdown, listTemplates, saveTemplate, deleteTemplate}`.
  - `toast.ts`: `toasts`, `showToast(message, kind = 'error')`.
  - `files.ts`: `downloadText(filename, text)`, `copyText(text): Promise<boolean>`.
  - `labels.ts`: `STATUS_LABELS`.
  - Components: `<HatBadge hat size?>`, `<PasscodeGate>` (default slot renders once unlocked).

- [ ] **Step 1: Vite and TypeScript config**

`vite.config.ts`:
```ts
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/socket.io': { target: 'http://localhost:8080', ws: true },
    },
  },
});
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"],
    "paths": { "@shared/*": ["../shared/src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "../shared/src/**/*.ts"]
}
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Six Hats</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Styles**

`web/src/styles.css`:
```css
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface-2: #eef0f3;
  --text: #1b1c1f;
  --muted: #5f6368;
  --border: #d3d6db;
  --accent: #1a5fb4;
  --accent-text: #ffffff;
  --danger: #b3261e;
  --focus: #1a5fb4;
  --hat-white: #f8f9fa; --hat-white-text: #202124; --hat-white-edge: #9aa0a6;
  --hat-red: #c5221f; --hat-red-text: #ffffff; --hat-red-edge: #c5221f;
  --hat-black: #202124; --hat-black-text: #ffffff; --hat-black-edge: #202124;
  --hat-yellow: #f9c513; --hat-yellow-text: #202124; --hat-yellow-edge: #e0a800;
  --hat-green: #137333; --hat-green-text: #ffffff; --hat-green-edge: #137333;
  --hat-blue: #1967d2; --hat-blue-text: #ffffff; --hat-blue-edge: #1967d2;
  --radius: 10px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121316;
    --surface: #1d1e22;
    --surface-2: #2a2c31;
    --text: #e8eaed;
    --muted: #a0a4ab;
    --border: #3f4349;
    --accent: #8ab4f8;
    --accent-text: #0b1a33;
    --danger: #f2b8b5;
    --focus: #8ab4f8;
    --hat-black-edge: #5f6368;
  }
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
h1, h2, h3 { margin: 0; line-height: 1.2; }
h1 { font-size: 1.6rem; }
h2 { font-size: 1.25rem; }
h3, .h3 { font-size: 1.05rem; }
a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.topbar { padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
.brand { font-weight: 700; color: var(--text); text-decoration: none; }
.container { max-width: 1040px; margin: 0 auto; padding: 16px; }
.narrow { max-width: 460px; margin: 32px auto; }
.hero { max-width: 640px; margin: 24px auto; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.tight { gap: 4px; }
.row { display: flex; align-items: center; gap: 8px; }
.wrap { flex-wrap: wrap; }
.between { justify-content: space-between; }
.grow { flex: 1 1 auto; min-width: 0; }
.muted { color: var(--muted); }
.small { font-size: 0.875rem; }
.error { color: var(--danger); margin: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.field { display: flex; flex-direction: column; gap: 4px; font-weight: 500; }
input, textarea, select {
  font: inherit; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; width: 100%;
}
textarea { resize: vertical; }
input[type='radio'], input[type='checkbox'] { width: auto; margin-top: 4px; }
fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin: 0; }
legend { font-weight: 500; padding: 0 4px; }
.mode-choice label { display: flex; align-items: flex-start; gap: 8px; }

.btn {
  font: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--surface-2); color: var(--text); cursor: pointer; text-decoration: none; white-space: nowrap;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.btn-ghost { background: transparent; }
.btn-small { padding: 4px 10px; font-size: 0.875rem; }
.btn-icon { padding: 4px 8px; min-width: 32px; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-size: 0.8rem; }
.banner { position: sticky; top: 0; z-index: 10; padding: 8px 16px; background: #fbbc04; color: #202124; text-align: center; font-weight: 600; }

.hat-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); font-weight: 600; font-size: 0.9rem; }
.hat-badge.lg { font-size: 1.15rem; padding: 6px 14px; }
.hat-badge.sm { font-size: 0.78rem; padding: 1px 8px; }
.hat-white { background: var(--hat-white); color: var(--hat-white-text); }
.hat-red { background: var(--hat-red); color: var(--hat-red-text); }
.hat-black { background: var(--hat-black); color: var(--hat-black-text); }
.hat-yellow { background: var(--hat-yellow); color: var(--hat-yellow-text); }
.hat-green { background: var(--hat-green); color: var(--hat-green-text); }
.hat-blue { background: var(--hat-blue); color: var(--hat-blue-text); }
.step-card { border-left-width: 6px; }
.hat-edge-white { border-left-color: var(--hat-white-edge); }
.hat-edge-red { border-left-color: var(--hat-red-edge); }
.hat-edge-black { border-left-color: var(--hat-black-edge); }
.hat-edge-yellow { border-left-color: var(--hat-yellow-edge); }
.hat-edge-green { border-left-color: var(--hat-green-edge); }
.hat-edge-blue { border-left-color: var(--hat-blue-edge); }
.hat-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.hat-grid li { display: flex; flex-direction: column; gap: 4px; }

.prompt { font-size: 1.15rem; margin: 0; }
.focus { margin: 0; font-size: 1.05rem; color: var(--muted); }
.decision { margin: 0; white-space: pre-wrap; }
.countdown { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
.countdown-value { font-size: 2rem; font-weight: 700; }
.countdown.urgent .countdown-value { color: var(--danger); }

.points, .actions, .roster, .archive { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ranked, .outline, .flow-list { margin: 0; padding-left: 1.5rem; display: flex; flex-direction: column; gap: 8px; }
.ranked li, .outline li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.point { background: var(--surface-2); border-radius: 8px; padding: 10px 12px; }
.point-text { margin: 0 0 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.votes { font-weight: 700; font-variant-numeric: tabular-nums; }
.actions li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.roster li { display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); flex: none; }
.dot.online { background: #34a853; }
.count { margin-left: auto; font-weight: 600; font-variant-numeric: tabular-nums; }

.board-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 16px; align-items: start; }
.board-main { min-width: 0; }
@media (max-width: 760px) {
  .board-grid { grid-template-columns: minmax(0, 1fr); }
  .board-side { order: -1; }
}

.flow-step { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.flow-step-main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.flow-step-main select { width: auto; flex: 1 1 180px; }
.inline-field { display: inline-flex; align-items: center; gap: 6px; }
.inline-field input { width: 84px; }
.step-group summary { cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; }
.step-group > .points, .step-group > p { margin-top: 8px; }

.toasts { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; flex-direction: column; gap: 8px; width: min(420px, calc(100vw - 32px)); }
.toast { padding: 10px 14px; border-radius: 8px; background: var(--text); color: var(--bg); box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }
.toast.error { border-left: 6px solid var(--danger); }
.link-box { font-family: ui-monospace, monospace; font-size: 0.85rem; padding: 6px 8px; background: var(--surface-2); border-radius: 6px; overflow-wrap: anywhere; }
.code-big { font-family: ui-monospace, monospace; font-size: 2rem; font-weight: 700; letter-spacing: 0.15em; }
```

- [ ] **Step 3: Client helpers**

`web/src/api.ts`:
```ts
import type { FlowStep } from '@shared/hats';
import type { CreateSessionInput, CreateSessionResult, JoinResult, SessionSummary, Template } from '@shared/protocol';

const PASSCODE_KEY = 'six-hats:passcode';
const tokenKey = (code: string) => `six-hats:token:${code.toUpperCase()}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the page still works for this visit.
  }
}

export const getPasscode = () => read(PASSCODE_KEY);
export const setPasscode = (passcode: string | null) => write(PASSCODE_KEY, passcode);
export const getToken = (code: string) => read(tokenKey(code));
export const setToken = (code: string, token: string | null) => write(tokenKey(code), token);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

interface RequestOptions {
  body?: unknown;
  passcode?: boolean;
  token?: string;
  text?: boolean;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.passcode) headers['x-team-passcode'] = getPasscode() ?? '';
  if (opts.token) headers['x-session-token'] = opts.token;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 401 && opts.passcode) setPasscode(null);
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (opts.text ? await res.text() : await res.json()) as T;
}

const enc = encodeURIComponent;

export const api = {
  checkPasscode(passcode: string): Promise<void> {
    setPasscode(passcode);
    return request('POST', '/api/passcode/check', { passcode: true });
  },
  createSession: (input: CreateSessionInput) => request<CreateSessionResult>('POST', '/api/sessions', { body: input, passcode: true }),
  listSessions: () => request<SessionSummary[]>('GET', '/api/sessions', { passcode: true }),
  join: (code: string, name: string) => request<JoinResult>('POST', `/api/sessions/${enc(code)}/join`, { body: { name } }),
  facilitatorLink: (code: string) => request<{ token: string }>('POST', `/api/sessions/${enc(code)}/facilitator-link`, { passcode: true }),
  summaryMarkdown: (code: string, token: string | null) =>
    request<string>('GET', `/api/sessions/${enc(code)}/summary.md`, { token: token ?? undefined, passcode: !token, text: true }),
  listTemplates: () => request<Template[]>('GET', '/api/templates', { passcode: true }),
  saveTemplate: (name: string, steps: FlowStep[]) => request<Template>('POST', '/api/templates', { body: { name, steps }, passcode: true }),
  deleteTemplate: (id: string) => request<void>('DELETE', `/api/templates/${enc(id)}`, { passcode: true }),
};

export const participantLink = (code: string) => `${location.origin}/s/${code}`;
export const adminLink = (code: string, token: string) => `${location.origin}/s/${code}/admin#t=${enc(token)}`;
```

`web/src/toast.ts`:
```ts
import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

export const toasts = reactive<Toast[]>([]);
let nextId = 0;

export function showToast(message: string, kind: Toast['kind'] = 'error'): void {
  const id = ++nextId;
  toasts.push({ id, message, kind });
  setTimeout(() => {
    const index = toasts.findIndex((t) => t.id === id);
    if (index >= 0) toasts.splice(index, 1);
  }, 4_000);
}
```

`web/src/files.ts`:
```ts
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
```

`web/src/labels.ts`:
```ts
import type { SessionStatus } from '@shared/protocol';

export const STATUS_LABELS: Record<SessionStatus, string> = {
  lobby: 'Lobby',
  running: 'In progress',
  voting: 'Voting',
  decision: 'Decision',
  closed: 'Closed',
};
```

- [ ] **Step 4: Shared components**

`web/src/components/ToastHost.vue`:
```vue
<script setup lang="ts">
import { toasts } from '../toast';
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">{{ t.message }}</div>
  </div>
</template>
```

`web/src/components/HatBadge.vue`:
```vue
<script setup lang="ts">
import { HATS, type HatId } from '@shared/hats';

withDefaults(defineProps<{ hat: HatId; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' });
</script>

<template>
  <span class="hat-badge" :class="[`hat-${hat}`, size]"><span aria-hidden="true">{{ HATS[hat].icon }}</span>{{ HATS[hat].name }}</span>
</template>
```

`web/src/components/PasscodeGate.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { api, errorMessage, getPasscode } from '../api';

const unlocked = ref(getPasscode() !== null);
const value = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await api.checkPasscode(value.value);
    unlocked.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <slot v-if="unlocked" />
  <form v-else class="card stack narrow" @submit.prevent="submit">
    <h1>Team passcode</h1>
    <p class="muted">Creating sessions and opening the archive needs your team's passcode.</p>
    <label class="field">
      <span>Passcode</span>
      <input v-model="value" type="password" autocomplete="current-password" required />
    </label>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div><button class="btn btn-primary" :disabled="busy || !value">Continue</button></div>
  </form>
</template>
```

`web/src/components/ArchiveList.vue`:
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { SessionSummary } from '@shared/protocol';
import { api, errorMessage, setToken } from '../api';
import { STATUS_LABELS } from '../labels';
import { showToast } from '../toast';

const router = useRouter();
const sessions = ref<SessionSummary[] | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    sessions.value = await api.listSessions();
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function open(s: SessionSummary) {
  try {
    const { token } = await api.facilitatorLink(s.code);
    setToken(s.code, token);
    await router.push(`/s/${s.code}/admin`);
  } catch (e) {
    showToast(errorMessage(e));
  }
}
</script>

<template>
  <section class="stack">
    <div class="row between wrap">
      <h1>Archive</h1>
      <RouterLink class="btn btn-primary" to="/new">New session</RouterLink>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }} <a href="/archive">Re-enter passcode</a></p>
    <p v-else-if="!sessions" class="muted">Loading…</p>
    <p v-else-if="!sessions.length" class="muted">No sessions yet.</p>
    <ul v-else class="archive">
      <li v-for="s in sessions" :key="s.id" class="card row between wrap">
        <div class="stack tight">
          <strong>{{ s.title }}</strong>
          <span class="muted small">
            {{ new Date(s.createdAt).toLocaleDateString() }} · {{ s.participantCount }} people · {{ STATUS_LABELS[s.status] }} · {{ s.code }}
          </span>
        </div>
        <button class="btn" @click="open(s)">{{ s.status === 'closed' ? 'View summary' : 'Open as facilitator' }}</button>
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 5: Pages, router, app**

`web/src/pages/HomePage.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { HAT_IDS, HATS } from '@shared/hats';
import HatBadge from '../components/HatBadge.vue';

const router = useRouter();
const code = ref('');

function join() {
  const c = code.value.trim().toUpperCase();
  if (c) void router.push(`/s/${c}`);
}
</script>

<template>
  <section class="hero stack">
    <h1>Six Thinking Hats</h1>
    <p class="muted">Look at one thing from one angle at a time, together. Everyone writes privately under each hat, then the points are revealed together.</p>
    <form class="card row wrap" @submit.prevent="join">
      <label class="field grow">
        <span>Session code</span>
        <input v-model="code" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ABC234" required />
      </label>
      <button class="btn btn-primary">Join</button>
    </form>
    <div class="row wrap">
      <RouterLink class="btn" to="/new">Create a session</RouterLink>
      <RouterLink class="btn btn-ghost" to="/archive">Archive</RouterLink>
    </div>
    <ul class="hat-grid">
      <li v-for="id in HAT_IDS" :key="id" class="card">
        <HatBadge :hat="id" />
        <span class="muted small">{{ HATS[id].focus }}</span>
      </li>
    </ul>
  </section>
</template>
```

`web/src/pages/ArchivePage.vue`:
```vue
<script setup lang="ts">
import ArchiveList from '../components/ArchiveList.vue';
import PasscodeGate from '../components/PasscodeGate.vue';
</script>

<template>
  <PasscodeGate><ArchiveList /></PasscodeGate>
</template>
```

`web/src/router.ts`:
```ts
import { createRouter, createWebHistory } from 'vue-router';
import ArchivePage from './pages/ArchivePage.vue';
import HomePage from './pages/HomePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/archive', component: ArchivePage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
```

`web/src/App.vue`:
```vue
<script setup lang="ts">
import ToastHost from './components/ToastHost.vue';
</script>

<template>
  <header class="topbar"><RouterLink to="/" class="brand">🎩 Six Hats</RouterLink></header>
  <main class="container"><RouterView :key="$route.path" /></main>
  <ToastHost />
</template>
```

`web/src/main.ts`:
```ts
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles.css';

createApp(App).use(router).mount('#app');
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no type errors; Vite prints `✓ built in …` and writes `dist/web/index.html`.

- [ ] **Step 7: Check in the browser**

Run `npm run dev` in the background. Open `http://localhost:5173` in the built-in browser and verify:
1. Home shows the code field, the two buttons and six hat cards, each with name and icon.
2. Archive asks for a passcode; `wrong` shows "Wrong team passcode"; `dev` shows "No sessions yet."
3. At phone width (375 px) nothing scrolls horizontally; with `colorScheme: dark` the page is readable.
Stop the dev server afterwards.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts web
git commit -m "feat: web shell with home and archive" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Create session and flow builder

**Files:**
- Create: `web/src/components/FlowBuilder.vue`, `web/src/components/CreateForm.vue`, `web/src/pages/CreatePage.vue`
- Modify: `web/src/router.ts` (add `/new`)

**Interfaces:**
- Consumes: `api`, `setToken`, `participantLink`, `adminLink`, `copyText`, `showToast`; `HATS`, `HAT_IDS`, `LIMITS`, `PRESETS`, `presetSteps`, `formatDuration`.
- Produces: `<FlowBuilder v-model="steps" :start-number? :min-steps? :max-steps?>` — emits `update:modelValue` with a new array on every edit (hat change resets duration to the hat default; duration entered in minutes, step 0.5, clamped 0.5–30; empty prompt removes the `prompt` key).

- [ ] **Step 1: Flow builder**

`web/src/components/FlowBuilder.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { HAT_IDS, HATS, LIMITS, formatDuration, type FlowStep, type HatId } from '@shared/hats';

const props = withDefaults(
  defineProps<{ modelValue: FlowStep[]; startNumber?: number; minSteps?: number; maxSteps?: number }>(),
  { startNumber: 1, minSteps: LIMITS.minSteps, maxSteps: LIMITS.maxSteps },
);
const emit = defineEmits<{ 'update:modelValue': [steps: FlowStep[]] }>();

const total = computed(() => props.modelValue.reduce((sum, s) => sum + s.durationSec, 0));
const full = computed(() => props.modelValue.length >= props.maxSteps);

const update = (steps: FlowStep[]) => emit('update:modelValue', steps);
const replace = (index: number, step: FlowStep) => update(props.modelValue.map((s, i) => (i === index ? step : s)));

function setHat(index: number, hat: HatId) {
  const { prompt } = props.modelValue[index]!;
  replace(index, { hat, durationSec: HATS[hat].defaultDurationSec, ...(prompt ? { prompt } : {}) });
}

function setMinutes(index: number, raw: string) {
  const minutes = Number(raw);
  if (!Number.isFinite(minutes)) return;
  const durationSec = Math.min(LIMITS.maxDurationSec, Math.max(LIMITS.minDurationSec, Math.round(minutes * 60)));
  replace(index, { ...props.modelValue[index]!, durationSec });
}

function setPrompt(index: number, value: string) {
  const { hat, durationSec } = props.modelValue[index]!;
  replace(index, value.trim() ? { hat, durationSec, prompt: value } : { hat, durationSec });
}

function move(index: number, delta: number) {
  const next = [...props.modelValue];
  const [step] = next.splice(index, 1);
  next.splice(index + delta, 0, step!);
  update(next);
}

function duplicate(index: number) {
  const next = [...props.modelValue];
  next.splice(index + 1, 0, { ...next[index]! });
  update(next);
}

const remove = (index: number) => update(props.modelValue.filter((_, i) => i !== index));
const add = () => update([...props.modelValue, { hat: 'green', durationSec: HATS.green.defaultDurationSec }]);
const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
</script>

<template>
  <div class="stack">
    <ol class="flow-list" :start="startNumber">
      <li v-for="(step, i) in modelValue" :key="i" class="flow-step">
        <div class="flow-step-main">
          <select :value="step.hat" :aria-label="`Step ${startNumber + i} hat`" @change="setHat(i, valueOf($event) as HatId)">
            <option v-for="id in HAT_IDS" :key="id" :value="id">{{ HATS[id].icon }} {{ HATS[id].name }} — {{ HATS[id].focus }}</option>
          </select>
          <label class="inline-field">
            <input
              type="number"
              min="0.5"
              max="30"
              step="0.5"
              :value="step.durationSec / 60"
              :aria-label="`Step ${startNumber + i} minutes`"
              @change="setMinutes(i, valueOf($event))"
            />
            <span class="muted small">min</span>
          </label>
          <div class="row">
            <button type="button" class="btn btn-icon btn-ghost" :disabled="i === 0" :aria-label="`Move step ${startNumber + i} up`" @click="move(i, -1)">↑</button>
            <button type="button" class="btn btn-icon btn-ghost" :disabled="i === modelValue.length - 1" :aria-label="`Move step ${startNumber + i} down`" @click="move(i, 1)">↓</button>
            <button type="button" class="btn btn-icon btn-ghost" :disabled="full" :aria-label="`Duplicate step ${startNumber + i}`" @click="duplicate(i)">⧉</button>
            <button type="button" class="btn btn-icon btn-ghost" :disabled="modelValue.length <= minSteps" :aria-label="`Remove step ${startNumber + i}`" @click="remove(i)">✕</button>
          </div>
        </div>
        <input
          :value="step.prompt ?? ''"
          :placeholder="HATS[step.hat].prompt"
          :maxlength="LIMITS.prompt"
          :aria-label="`Step ${startNumber + i} prompt`"
          @input="setPrompt(i, valueOf($event))"
        />
      </li>
    </ol>
    <p v-if="!modelValue.length" class="muted">No upcoming steps.</p>
    <div class="row between wrap">
      <button type="button" class="btn" :disabled="full" @click="add">+ Add step</button>
      <span class="muted small">{{ modelValue.length }} steps · {{ formatDuration(total) }} total</span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Create form and page**

`web/src/components/CreateForm.vue`:
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { HATS, LIMITS, PRESETS, presetSteps, type FlowStep } from '@shared/hats';
import type { Template, WritingMode } from '@shared/protocol';
import { adminLink, api, errorMessage, participantLink, setToken } from '../api';
import { copyText } from '../files';
import { showToast } from '../toast';
import FlowBuilder from './FlowBuilder.vue';

const DEFAULT_PRESET = PRESETS[2]!;

const router = useRouter();
const title = ref('');
const focus = ref('');
const name = ref('');
const votes = ref(3);
const mode = ref<WritingMode>('everyone');
const steps = ref<FlowStep[]>(presetSteps(DEFAULT_PRESET.hats));
const startFrom = ref(`preset:${DEFAULT_PRESET.id}`);
const templates = ref<Template[]>([]);
const templateName = ref('');
const busy = ref(false);
const error = ref('');
const created = ref<{ code: string; token: string } | null>(null);

onMounted(async () => {
  try {
    templates.value = await api.listTemplates();
  } catch {
    // Templates are optional; the presets still work.
  }
});

function applyStart() {
  const [kind, id] = startFrom.value.split(':');
  if (kind === 'blank') steps.value = [{ hat: 'blue', durationSec: HATS.blue.defaultDurationSec }];
  if (kind === 'preset') {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) steps.value = presetSteps(preset.hats);
  }
  if (kind === 'template') {
    const template = templates.value.find((t) => t.id === id);
    if (template) steps.value = template.steps.map((s) => ({ ...s }));
  }
}

async function saveTemplate() {
  try {
    const template = await api.saveTemplate(templateName.value, steps.value);
    templates.value = [...templates.value, template].sort((a, b) => a.name.localeCompare(b.name));
    templateName.value = '';
    showToast(`Saved template "${template.name}"`, 'info');
  } catch (e) {
    showToast(errorMessage(e));
  }
}

async function deleteSelectedTemplate() {
  const id = startFrom.value.slice('template:'.length);
  const template = templates.value.find((t) => t.id === id);
  if (!template || !confirm(`Delete the template "${template.name}"?`)) return;
  try {
    await api.deleteTemplate(id);
    templates.value = templates.value.filter((t) => t.id !== id);
    startFrom.value = `preset:${DEFAULT_PRESET.id}`;
  } catch (e) {
    showToast(errorMessage(e));
  }
}

async function create() {
  busy.value = true;
  error.value = '';
  try {
    const r = await api.createSession({
      title: title.value,
      focus: focus.value,
      facilitatorName: name.value,
      votesPerPerson: votes.value,
      mode: mode.value,
      steps: steps.value,
    });
    setToken(r.code, r.facilitatorToken);
    created.value = { code: r.code, token: r.facilitatorToken };
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function copy(text: string, what: string) {
  const ok = await copyText(text);
  showToast(ok ? `${what} copied` : 'Could not copy; select the text instead', ok ? 'info' : 'error');
}
</script>

<template>
  <section v-if="created" class="card stack narrow">
    <h1>Session ready</h1>
    <p class="muted">Share the code or the invite link with your team.</p>
    <div class="code-big">{{ created.code }}</div>
    <div class="stack tight">
      <strong>Invite link</strong>
      <div class="link-box">{{ participantLink(created.code) }}</div>
      <div><button class="btn btn-small" @click="copy(participantLink(created.code), 'Invite link')">Copy invite link</button></div>
    </div>
    <div class="stack tight">
      <strong>Your admin link (keep it private)</strong>
      <div class="link-box">{{ adminLink(created.code, created.token) }}</div>
      <div><button class="btn btn-small" @click="copy(adminLink(created.code, created.token), 'Admin link')">Copy admin link</button></div>
      <p class="muted small">This browser remembers it. Anyone with the team passcode can also reopen the session from the archive.</p>
    </div>
    <div><button class="btn btn-primary" @click="router.push(`/s/${created.code}/admin`)">Open facilitator console</button></div>
  </section>

  <form v-else class="stack" @submit.prevent="create">
    <h1>New session</h1>
    <section class="card stack">
      <label class="field">
        <span>Title</span>
        <input v-model="title" :maxlength="LIMITS.title" required placeholder="Q4 pricing change" />
      </label>
      <label class="field">
        <span>Focus question</span>
        <textarea v-model="focus" :maxlength="LIMITS.focus" rows="2" required placeholder="Should we move the Pro plan to annual billing only?" />
      </label>
      <div class="row wrap">
        <label class="field grow">
          <span>Your name</span>
          <input v-model="name" :maxlength="LIMITS.name" required autocomplete="name" />
        </label>
        <label class="field">
          <span>Votes per person</span>
          <input v-model.number="votes" type="number" :min="LIMITS.minVotes" :max="LIMITS.maxVotes" required />
        </label>
      </div>
      <fieldset class="stack tight mode-choice">
        <legend>How do people write?</legend>
        <label>
          <input v-model="mode" type="radio" name="mode" value="everyone" />
          <span><strong>Everyone writes</strong> — each person adds their own points privately; they're revealed at 0:00.</span>
        </label>
        <label>
          <input v-model="mode" type="radio" name="mode" value="scribe" />
          <span><strong>A scribe takes notes</strong> — one person captures the discussion for everyone, visible as they type. You pick the scribe in the lobby.</span>
        </label>
      </fieldset>
    </section>

    <section class="card stack">
      <div class="row between wrap">
        <h2>Flow</h2>
        <div class="row wrap">
          <label class="sr-only" for="start-from">Start from</label>
          <select id="start-from" v-model="startFrom" @change="applyStart">
            <option value="blank">Blank</option>
            <optgroup label="Presets">
              <option v-for="p in PRESETS" :key="p.id" :value="`preset:${p.id}`">{{ p.name }}</option>
            </optgroup>
            <optgroup v-if="templates.length" label="Team templates">
              <option v-for="t in templates" :key="t.id" :value="`template:${t.id}`">{{ t.name }}</option>
            </optgroup>
          </select>
          <button v-if="startFrom.startsWith('template:')" type="button" class="btn btn-small btn-ghost" @click="deleteSelectedTemplate">Delete template</button>
        </div>
      </div>
      <FlowBuilder v-model="steps" />
      <div class="row wrap">
        <label class="sr-only" for="template-name">Template name</label>
        <input id="template-name" v-model="templateName" class="grow" :maxlength="LIMITS.templateName" placeholder="Name this flow to reuse it" />
        <button type="button" class="btn" :disabled="!templateName.trim()" @click="saveTemplate">Save as team template</button>
      </div>
    </section>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div><button class="btn btn-primary" :disabled="busy">Create session</button></div>
  </form>
</template>
```

`web/src/pages/CreatePage.vue`:
```vue
<script setup lang="ts">
import CreateForm from '../components/CreateForm.vue';
import PasscodeGate from '../components/PasscodeGate.vue';
</script>

<template>
  <PasscodeGate><CreateForm /></PasscodeGate>
</template>
```

- [ ] **Step 3: Route**

In `web/src/router.ts`, add `import CreatePage from './pages/CreatePage.vue';` and the route `{ path: '/new', component: CreatePage },` after the `/` route.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Check in the browser**

With `npm run dev` running, in the built-in browser at `http://localhost:5173/new` (passcode `dev`):
1. The flow starts as "Evaluate an idea" (7 steps, total 21:00 = 2+4+4+4+1+5+2 minutes).
2. Change step 1's hat to Red: its minutes become 1. Move it down, duplicate it, remove a step; the total updates.
3. Type a prompt, then clear it; the placeholder (default prompt) returns.
4. Save the flow as template "Test flow"; it appears under "Team templates"; select it and delete it.
5. "Everyone writes" is selected by default; switching to "A scribe takes notes" and back works with keyboard and mouse.
6. Submit with an empty title: the browser blocks it. Fill everything and create: the code, invite link and admin link appear and the copy buttons toast.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat: create session with flow builder and team templates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Live board — join, lobby and steps

**Files:**
- Create: `web/src/socket.ts`, `web/src/session-context.ts`, `web/src/points.ts`
- Create: `web/src/pages/BoardPage.vue`
- Create: `web/src/components/SessionBoard.vue`, `SessionHeader.vue`, `Roster.vue`, `LobbyPanel.vue`, `ScribePicker.vue`, `FlowEditor.vue`, `FlowOutline.vue`, `StepPanel.vue`, `Countdown.vue`, `FacilitatorControls.vue`, `PointComposer.vue`, `PointList.vue`, `StepGroups.vue` (all under `web/src/components/`)
- Modify: `web/src/router.ts` (add `/s/:code` and `/s/:code/admin`)

**Interfaces:**
- Consumes: `View`, `ViewPoint`, `Command`, `CommandAck`, `SOCKET_ERRORS` (protocol); `canWrite`, `rankByVotes` (rules); `api`, `getToken`, `setToken`, `participantLink`, `adminLink`.
- Produces:
  - `socket.ts`: `useSessionSocket(code, token) → {view, connection, rejection, clockOffset, send}`; `connection` is `'connecting' | 'connected' | 'reconnecting' | 'rejected'`.
  - `session-context.ts`: `Run = (cmd: Command) => Promise<boolean>`, `RUN_KEY`, `useRun()`.
  - `points.ts`: `pointsForStep(view, index)`, `topVoted(view)`, `creditOf(view, point)` (author, or speaker / "Team" in scribe mode), `scribeName(view)`.
  - `<ScribePicker :view>`: facilitator's select that sends `setScribe`.
  - `<PointList :points :view :editable? :voting? :show-votes? :empty-text?>`, `<StepGroups :view :indices :title? :open? :voting? :show-votes?>` — reused by Task 14.

- [ ] **Step 1: Client session plumbing**

`web/src/socket.ts`:
```ts
import { io } from 'socket.io-client';
import { onBeforeUnmount, ref, shallowRef } from 'vue';
import type { Command, CommandAck, View } from '@shared/protocol';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'rejected';

/** Must be called from a component's setup; disconnects when the component unmounts. */
export function useSessionSocket(code: string, token: string) {
  const view = shallowRef<View | null>(null);
  const connection = ref<ConnectionState>('connecting');
  const rejection = ref<string | null>(null);
  const clockOffset = ref(0);

  const socket = io({ auth: { code, token } });
  socket.on('connect', () => {
    connection.value = 'connected';
  });
  socket.on('disconnect', () => {
    connection.value = 'reconnecting';
  });
  socket.on('connect_error', (err) => {
    if (socket.active) {
      connection.value = 'reconnecting';
    } else {
      connection.value = 'rejected';
      rejection.value = err.message;
    }
  });
  socket.on('state', (v: View) => {
    clockOffset.value = v.serverNow - Date.now();
    view.value = v;
  });

  async function send(cmd: Command): Promise<CommandAck> {
    try {
      return await socket.timeout(5_000).emitWithAck('command', cmd);
    } catch {
      return { ok: false, error: 'No response from the server' };
    }
  }

  onBeforeUnmount(() => {
    socket.disconnect();
  });

  return { view, connection, rejection, clockOffset, send };
}
```

`web/src/session-context.ts`:
```ts
import { inject, type InjectionKey } from 'vue';
import type { Command } from '@shared/protocol';

/** Sends a command; toasts and returns false when the server rejects it. */
export type Run = (cmd: Command) => Promise<boolean>;

export const RUN_KEY: InjectionKey<Run> = Symbol('run');

export function useRun(): Run {
  const run = inject(RUN_KEY);
  if (!run) throw new Error('useRun() must be used inside SessionBoard');
  return run;
}
```

`web/src/points.ts`:
```ts
import type { View, ViewPoint } from '@shared/protocol';
import { creditedName, rankByVotes } from '@shared/rules';

export function pointsForStep(view: View, index: number): ViewPoint[] {
  return view.points.filter((p) => p.stepIndex === index).sort((a, b) => a.createdAt - b.createdAt);
}

export function topVoted(view: View): ViewPoint[] {
  return rankByVotes(view.points, (p) => p.votes ?? 0);
}

export const creditOf = (view: View, p: ViewPoint) => creditedName(view.mode, p.authorName, p.saidByName);

export const scribeName = (view: View) => view.participants.find((p) => p.id === view.scribeId)?.name;
```

- [ ] **Step 2: Small display components**

`web/src/components/Countdown.vue`:
```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { formatDuration } from '@shared/hats';
import type { StepPhase } from '@shared/protocol';

const props = defineProps<{ endsAt?: number; remainingMs?: number; phase: StepPhase | null; offset: number }>();

const now = ref(Date.now());
const tick = setInterval(() => {
  now.value = Date.now();
}, 250);
onBeforeUnmount(() => clearInterval(tick));

const ms = computed(() => {
  if (props.phase === 'paused') return props.remainingMs ?? 0;
  if (props.phase === 'writing' && props.endsAt) return Math.max(0, props.endsAt - (now.value + props.offset));
  return 0;
});

const label = computed(() => {
  if (props.phase === 'revealed') return 'Revealed';
  if (props.phase === 'writing' && ms.value === 0) return "Time's up";
  return formatDuration(Math.ceil(ms.value / 1000));
});
</script>

<template>
  <div class="countdown" :class="{ urgent: phase === 'writing' && ms <= 10_000 }" role="timer">
    <span class="countdown-value">{{ label }}</span>
    <span v-if="phase === 'paused'" class="muted small">Paused</span>
  </div>
</template>
```

`web/src/components/FlowOutline.vue`:
```vue
<script setup lang="ts">
import { HATS, formatDuration, type FlowStep } from '@shared/hats';
import HatBadge from './HatBadge.vue';

defineProps<{ steps: FlowStep[] }>();
</script>

<template>
  <ol class="outline">
    <li v-for="(s, i) in steps" :key="i">
      <HatBadge :hat="s.hat" size="sm" />
      <span>{{ s.prompt ?? HATS[s.hat].prompt }}</span>
      <span class="muted small">{{ formatDuration(s.durationSec) }}</span>
    </li>
  </ol>
</template>
```

`web/src/components/SessionHeader.vue`:
```vue
<script setup lang="ts">
import type { View } from '@shared/protocol';
import { adminLink, getToken, participantLink } from '../api';
import { copyText } from '../files';
import { STATUS_LABELS } from '../labels';
import { showToast } from '../toast';

const props = defineProps<{ view: View }>();
const token = getToken(props.view.code);

async function copy(text: string, what: string) {
  const ok = await copyText(text);
  showToast(ok ? `${what} copied` : 'Could not copy', ok ? 'info' : 'error');
}
</script>

<template>
  <header class="stack tight">
    <div class="row between wrap">
      <h1>{{ view.title }}</h1>
      <div class="row">
        <span class="tag">{{ STATUS_LABELS[view.status] }}</span>
        <span class="tag">Code {{ view.code }}</span>
      </div>
    </div>
    <p class="focus">{{ view.focus }}</p>
    <div v-if="view.status !== 'closed'" class="row wrap">
      <button class="btn btn-small" @click="copy(participantLink(view.code), 'Invite link')">Copy invite link</button>
      <button v-if="view.me.isFacilitator && token" class="btn btn-small btn-ghost" @click="copy(adminLink(view.code, token), 'Admin link')">
        Copy admin link
      </button>
    </div>
  </header>
</template>
```

`web/src/components/Roster.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '@shared/protocol';

const props = defineProps<{ view: View }>();
const onlineCount = computed(() => props.view.participants.filter((p) => p.online).length);
</script>

<template>
  <section class="card stack">
    <h2 class="h3">People · {{ onlineCount }}/{{ view.participants.length }} online</h2>
    <p v-if="view.currentStepCounts" class="muted small">Points written this step (text stays hidden until the reveal).</p>
    <ul class="roster">
      <li v-for="p in view.participants" :key="p.id">
        <span class="dot" :class="{ online: p.online }" aria-hidden="true"></span>
        <span class="sr-only">{{ p.online ? 'Online' : 'Offline' }}</span>
        <span>{{ p.name }}<span v-if="p.id === view.me.id" class="muted"> (you)</span></span>
        <span v-if="p.isFacilitator" class="tag">Facilitator</span>
        <span v-if="p.id === view.scribeId" class="tag">Scribe</span>
        <span v-if="view.currentStepCounts" class="count">{{ view.currentStepCounts[p.id] ?? 0 }}</span>
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 3: Points**

`web/src/components/PointList.vue`:
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { LIMITS } from '@shared/hats';
import type { View, ViewPoint } from '@shared/protocol';
import { creditOf } from '../points';
import { useRun } from '../session-context';

const props = defineProps<{
  points: ViewPoint[];
  view: View;
  editable?: boolean;
  voting?: boolean;
  showVotes?: boolean;
  emptyText?: string;
}>();
const run = useRun();

const editingId = ref<string | null>(null);
const editText = ref('');
const myVotes = computed(() => new Set(props.view.myVotes));
const votesLeft = computed(() => props.view.votesPerPerson - props.view.myVotes.length);

const isMine = (p: ViewPoint) => p.authorId === props.view.me.id;
// `editable` is only passed to whoever may write this step: each author, or the scribe for every note.
const canEdit = (p: ViewPoint) => Boolean(props.editable) && (props.view.mode === 'scribe' || isMine(p));
const canDelete = (p: ViewPoint) => props.view.status === 'running' && (props.view.me.isFacilitator || canEdit(p));

function startEdit(p: ViewPoint) {
  editingId.value = p.id;
  editText.value = p.text;
}

async function saveEdit(p: ViewPoint) {
  const ok = await run({ type: 'editPoint', pointId: p.id, text: editText.value, ...(p.saidById ? { saidBy: p.saidById } : {}) });
  if (ok) editingId.value = null;
}

async function remove(p: ViewPoint) {
  if (confirm('Delete this point?')) await run({ type: 'deletePoint', pointId: p.id });
}

function toggleVote(p: ViewPoint) {
  if (myVotes.value.has(p.id)) void run({ type: 'unvote', pointId: p.id });
  else void run({ type: 'vote', pointId: p.id });
}
</script>

<template>
  <p v-if="!points.length" class="muted">{{ emptyText ?? 'No points.' }}</p>
  <ul v-else class="points">
    <li v-for="p in points" :key="p.id" class="point">
      <form v-if="editingId === p.id" class="stack tight" @submit.prevent="saveEdit(p)">
        <label class="sr-only" :for="`edit-${p.id}`">Edit point</label>
        <textarea :id="`edit-${p.id}`" v-model="editText" rows="2" :maxlength="LIMITS.point" />
        <div class="row">
          <button class="btn btn-small btn-primary">Save</button>
          <button type="button" class="btn btn-small btn-ghost" @click="editingId = null">Cancel</button>
        </div>
      </form>
      <template v-else>
        <p class="point-text">{{ p.text }}</p>
        <div class="row between wrap small">
          <span class="muted">— {{ creditOf(view, p) }}</span>
          <div class="row wrap">
            <span v-if="showVotes && p.votes !== undefined" class="votes">{{ p.votes }} vote{{ p.votes === 1 ? '' : 's' }}</span>
            <button
              v-if="voting"
              class="btn btn-small"
              :class="{ 'btn-primary': myVotes.has(p.id) }"
              :aria-pressed="myVotes.has(p.id)"
              :disabled="!myVotes.has(p.id) && votesLeft <= 0"
              @click="toggleVote(p)"
            >
              {{ myVotes.has(p.id) ? '● Voted' : '○ Vote' }}
            </button>
            <button v-if="canEdit(p)" class="btn btn-small btn-ghost" @click="startEdit(p)">Edit</button>
            <button v-if="canDelete(p)" class="btn btn-small btn-ghost" @click="remove(p)">Delete</button>
          </div>
        </div>
      </template>
    </li>
  </ul>
</template>
```

`web/src/components/PointComposer.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { LIMITS } from '@shared/hats';
import type { ViewParticipant } from '@shared/protocol';
import { useRun } from '../session-context';

/** `speakers` is set in scribe mode: the scribe credits each note to one of them, or to the team. */
const props = defineProps<{ locked: boolean; speakers?: ViewParticipant[] }>();
const run = useRun();
const text = ref('');
const saidBy = ref('');
const busy = ref(false);

async function submit() {
  if (props.locked || !text.value.trim()) return;
  busy.value = true;
  const ok = await run({ type: 'addPoint', text: text.value, ...(props.speakers && saidBy.value ? { saidBy: saidBy.value } : {}) });
  if (ok) text.value = '';
  busy.value = false;
}
</script>

<template>
  <form class="stack tight" @submit.prevent="submit">
    <label v-if="speakers" class="row wrap">
      <span>Said by</span>
      <select v-model="saidBy" style="width: auto">
        <option value="">Team</option>
        <option v-for="p in speakers" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <label class="sr-only" for="point-input">Add a point</label>
    <textarea
      id="point-input"
      v-model="text"
      rows="2"
      :maxlength="LIMITS.point"
      :readonly="locked"
      :placeholder="locked ? 'Writing is locked for this step' : 'Add a point… (Enter to add, Shift+Enter for a new line)'"
      @keydown.enter.exact.prevent="submit"
    />
    <div class="row between">
      <span class="muted small">{{ text.length }}/{{ LIMITS.point }}</span>
      <button class="btn btn-primary" :disabled="locked || busy || !text.trim()">Add point</button>
    </div>
  </form>
</template>
```

`web/src/components/StepGroups.vue`:
```vue
<script setup lang="ts">
import { HATS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { pointsForStep } from '../points';
import HatBadge from './HatBadge.vue';
import PointList from './PointList.vue';

defineProps<{ view: View; indices: number[]; title?: string; open?: boolean; voting?: boolean; showVotes?: boolean }>();
</script>

<template>
  <section v-if="indices.length" class="card stack">
    <h2 v-if="title" class="h3">{{ title }}</h2>
    <details v-for="i in indices" :key="i" class="step-group" :open="open">
      <summary>
        <HatBadge :hat="view.steps[i]!.hat" size="sm" />
        <span>Step {{ i + 1 }} · {{ view.steps[i]!.prompt ?? HATS[view.steps[i]!.hat].prompt }}</span>
        <span class="muted">({{ pointsForStep(view, i).length }})</span>
      </summary>
      <PointList :points="pointsForStep(view, i)" :view="view" :voting="voting" :show-votes="showVotes" />
    </details>
  </section>
</template>
```

- [ ] **Step 4: Lobby and step panels**

`web/src/components/FlowEditor.vue`:
```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FlowStep } from '@shared/hats';
import { useRun } from '../session-context';
import FlowBuilder from './FlowBuilder.vue';

const props = defineProps<{ steps: FlowStep[]; startNumber: number; minSteps: number; maxSteps: number }>();
const run = useRun();

const copy = (steps: FlowStep[]) => steps.map((s) => ({ ...s }));
const draft = ref(copy(props.steps));
const editing = ref(false);
const busy = ref(false);

watch(
  () => props.steps,
  (steps) => {
    if (!editing.value) draft.value = copy(steps);
  },
);

function onEdit(steps: FlowStep[]) {
  draft.value = steps;
  editing.value = true;
}

async function save() {
  busy.value = true;
  const ok = await run({ type: 'editUpcomingSteps', steps: draft.value });
  busy.value = false;
  if (ok) discard();
}

function discard() {
  editing.value = false;
  draft.value = copy(props.steps);
}
</script>

<template>
  <div class="stack">
    <FlowBuilder :model-value="draft" :start-number="startNumber" :min-steps="minSteps" :max-steps="maxSteps" @update:model-value="onEdit" />
    <div v-if="editing" class="row">
      <button class="btn btn-primary" :disabled="busy" @click="save">Save flow</button>
      <button class="btn btn-ghost" @click="discard">Discard changes</button>
    </div>
  </div>
</template>
```

`web/src/components/ScribePicker.vue`:
```vue
<script setup lang="ts">
import type { View } from '@shared/protocol';
import { useRun } from '../session-context';

defineProps<{ view: View }>();
const run = useRun();

function choose(participantId: string) {
  if (participantId) void run({ type: 'setScribe', participantId });
}
</script>

<template>
  <label class="row wrap">
    <span>Scribe</span>
    <select :value="view.scribeId ?? ''" style="width: auto" @change="choose(($event.target as HTMLSelectElement).value)">
      <option value="" disabled>Choose a scribe…</option>
      <option v-for="p in view.participants" :key="p.id" :value="p.id">{{ p.name }}{{ p.id === view.me.id ? ' (you)' : '' }}</option>
    </select>
  </label>
</template>
```

`web/src/components/LobbyPanel.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { LIMITS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { scribeName } from '../points';
import { useRun } from '../session-context';
import FlowEditor from './FlowEditor.vue';
import FlowOutline from './FlowOutline.vue';
import ScribePicker from './ScribePicker.vue';

const props = defineProps<{ view: View }>();
const run = useRun();
const needsScribe = computed(() => props.view.mode === 'scribe' && !props.view.scribeId);
</script>

<template>
  <section class="card stack">
    <template v-if="view.me.isFacilitator">
      <div class="row between wrap">
        <h2>Lobby</h2>
        <button class="btn btn-primary" :disabled="needsScribe" @click="run({ type: 'start' })">Start session</button>
      </div>
      <p class="muted">Share the code <strong>{{ view.code }}</strong> or the invite link. You can still adjust the flow.</p>
      <template v-if="view.mode === 'scribe'">
        <ScribePicker :view="view" />
        <p v-if="needsScribe" class="muted small">Choose who takes notes before you start. You can hand the role over later.</p>
      </template>
      <FlowEditor :steps="view.steps" :start-number="1" :min-steps="LIMITS.minSteps" :max-steps="LIMITS.maxSteps" />
    </template>
    <template v-else>
      <h2>Waiting for the facilitator to start</h2>
      <p v-if="view.mode === 'scribe'" class="muted">
        {{ scribeName(view) ? `${scribeName(view)} will take notes for everyone.` : 'A scribe will take notes for everyone.' }}
      </p>
      <p class="muted">Here's the plan:</p>
      <FlowOutline :steps="view.steps" />
    </template>
  </section>
</template>
```

`web/src/components/FacilitatorControls.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '@shared/protocol';
import { canWrite } from '@shared/rules';
import { useRun } from '../session-context';

const props = defineProps<{ view: View }>();
const run = useRun();
const writable = computed(() => canWrite(props.view));
const isLast = computed(() => props.view.currentStep >= props.view.steps.length - 1);
</script>

<template>
  <div class="row wrap" role="group" aria-label="Facilitator controls">
    <template v-if="writable">
      <button v-if="view.phase === 'writing'" class="btn" @click="run({ type: 'pause' })">Pause</button>
      <button v-else class="btn" @click="run({ type: 'resume' })">Resume</button>
      <button class="btn" @click="run({ type: 'addTime' })">+1 min</button>
      <button class="btn btn-primary" @click="run({ type: 'revealNow' })">Reveal now</button>
      <button class="btn btn-ghost" @click="run({ type: 'skipStep' })">Skip step</button>
    </template>
    <button v-else class="btn btn-primary" @click="run({ type: 'nextStep' })">{{ isLast ? 'Go to voting' : 'Next step' }}</button>
  </div>
</template>
```

`web/src/components/StepPanel.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { HATS, LIMITS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { canWrite } from '@shared/rules';
import { pointsForStep, scribeName } from '../points';
import Countdown from './Countdown.vue';
import FacilitatorControls from './FacilitatorControls.vue';
import FlowEditor from './FlowEditor.vue';
import HatBadge from './HatBadge.vue';
import PointComposer from './PointComposer.vue';
import PointList from './PointList.vue';
import ScribePicker from './ScribePicker.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View; offset: number }>();

const step = computed(() => props.view.steps[props.view.currentStep]!);
const hat = computed(() => HATS[step.value.hat]);
const writable = computed(() => canWrite(props.view));
const scribeMode = computed(() => props.view.mode === 'scribe');
const canCompose = computed(() => !scribeMode.value || props.view.scribeId === props.view.me.id);
const heading = computed(() => {
  if (scribeMode.value) return 'Notes — visible to everyone';
  return props.view.phase === 'revealed' ? "Everyone's points" : 'Your points — only you can see them until the reveal';
});
const current = computed(() => pointsForStep(props.view, props.view.currentStep));
const upcoming = computed(() => props.view.steps.slice(props.view.currentStep + 1));
const earlier = computed(() => props.view.steps.map((_, i) => i).filter((i) => i < props.view.currentStep));
</script>

<template>
  <section class="card stack step-card" :class="`hat-edge-${step.hat}`">
    <div class="row between wrap">
      <div class="stack tight">
        <span class="muted small">Step {{ view.currentStep + 1 }} of {{ view.steps.length }}</span>
        <HatBadge :hat="step.hat" size="lg" />
        <span class="muted">{{ hat.focus }}</span>
      </div>
      <Countdown :ends-at="view.endsAt" :remaining-ms="view.remainingMs" :phase="view.phase" :offset="offset" />
    </div>
    <p class="prompt">{{ step.prompt ?? hat.prompt }}</p>
    <FacilitatorControls v-if="view.me.isFacilitator" :view="view" />
    <ScribePicker v-if="view.me.isFacilitator && scribeMode" :view="view" />
    <PointComposer v-if="canCompose" :locked="!writable" :speakers="scribeMode ? view.participants : undefined" />
    <p v-else class="muted">{{ scribeName(view) ?? 'The scribe' }} is taking notes for everyone.</p>
    <h3>{{ heading }}</h3>
    <PointList :points="current" :view="view" :editable="writable && canCompose" empty-text="No points yet." />
    <p v-if="upcoming.length" class="muted small">Up next: {{ HATS[upcoming[0]!.hat].name }}</p>
  </section>

  <StepGroups :view="view" :indices="earlier" title="Earlier steps" />

  <details v-if="view.me.isFacilitator" class="card">
    <summary>Edit upcoming steps</summary>
    <FlowEditor
      :key="view.currentStep"
      :steps="upcoming"
      :start-number="view.currentStep + 2"
      :min-steps="0"
      :max-steps="LIMITS.maxSteps - view.currentStep - 1"
    />
  </details>
</template>
```

- [ ] **Step 5: Board container and page**

`web/src/components/SessionBoard.vue`:
```vue
<script setup lang="ts">
import { provide, watch } from 'vue';
import type { Command } from '@shared/protocol';
import { RUN_KEY } from '../session-context';
import { useSessionSocket } from '../socket';
import { showToast } from '../toast';
import LobbyPanel from './LobbyPanel.vue';
import Roster from './Roster.vue';
import SessionHeader from './SessionHeader.vue';
import StepPanel from './StepPanel.vue';

const props = defineProps<{ code: string; token: string }>();
const emit = defineEmits<{ rejected: [reason: string] }>();

const { view, connection, rejection, clockOffset, send } = useSessionSocket(props.code, props.token);

watch(rejection, (reason) => {
  if (reason) emit('rejected', reason);
});

async function run(cmd: Command): Promise<boolean> {
  const result = await send(cmd);
  if (!result.ok) showToast(result.error);
  return result.ok;
}
provide(RUN_KEY, run);
</script>

<template>
  <div v-if="connection === 'reconnecting'" class="banner" role="status">Reconnecting…</div>
  <p v-if="!view" class="muted">Connecting…</p>
  <div v-else class="stack">
    <SessionHeader :view="view" />
    <div class="board-grid">
      <div class="board-main stack">
        <LobbyPanel v-if="view.status === 'lobby'" :view="view" />
        <StepPanel v-else-if="view.status === 'running'" :view="view" :offset="clockOffset" />
        <section v-else class="card"><p class="muted">Voting, decision and summary views arrive in Task 14.</p></section>
      </div>
      <aside class="board-side"><Roster :view="view" /></aside>
    </div>
  </div>
</template>
```

`web/src/pages/BoardPage.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { LIMITS } from '@shared/hats';
import { SOCKET_ERRORS } from '@shared/protocol';
import { api, ApiError, errorMessage, getToken, setToken } from '../api';
import SessionBoard from '../components/SessionBoard.vue';

const props = defineProps<{ code: string; admin: boolean }>();

const fromLink = new URLSearchParams(location.hash.slice(1)).get('t');
if (fromLink) {
  setToken(props.code, fromLink);
  history.replaceState(history.state, '', location.pathname);
}

const token = ref(getToken(props.code));
const name = ref('');
const error = ref('');
const busy = ref(false);
const notFound = ref(false);
const ended = ref(false);

async function join() {
  busy.value = true;
  error.value = '';
  try {
    const r = await api.join(props.code, name.value);
    setToken(props.code, r.token);
    token.value = r.token;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true;
    else if (e instanceof ApiError && e.status === 410) ended.value = true;
    else error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

function onRejected(reason: string) {
  setToken(props.code, null);
  token.value = null;
  if (reason === SOCKET_ERRORS.notFound) notFound.value = true;
  else error.value = 'Your link is no longer valid. Join again with your name.';
}
</script>

<template>
  <SessionBoard v-if="token" :key="token" :code="code" :token="token" @rejected="onRejected" />
  <section v-else-if="notFound" class="card stack narrow">
    <h1>Session not found</h1>
    <p>No session has the code <strong>{{ code }}</strong>. Check it and try again.</p>
    <div><RouterLink to="/" class="btn">Back home</RouterLink></div>
  </section>
  <section v-else-if="ended" class="card stack narrow">
    <h1>This session has ended</h1>
    <p class="muted">Its summary is in the archive.</p>
    <div><RouterLink to="/archive" class="btn">Open the archive</RouterLink></div>
  </section>
  <section v-else-if="admin" class="card stack narrow">
    <h1>Admin link incomplete</h1>
    <p class="muted">This link is missing its key. Open the session as facilitator from the archive.</p>
    <div><RouterLink to="/archive" class="btn">Open the archive</RouterLink></div>
  </section>
  <form v-else class="card stack narrow" @submit.prevent="join">
    <h1>Join session {{ code }}</h1>
    <label class="field">
      <span>Your name</span>
      <input v-model="name" :maxlength="LIMITS.name" autocomplete="name" required />
    </label>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div><button class="btn btn-primary" :disabled="busy || !name.trim()">Join</button></div>
  </form>
</template>
```

- [ ] **Step 6: Routes**

In `web/src/router.ts`, add `import BoardPage from './pages/BoardPage.vue';` and, before the catch-all:
```ts
    { path: '/s/:code', component: BoardPage, props: (r) => ({ code: String(r.params.code).toUpperCase(), admin: false }) },
    { path: '/s/:code/admin', component: BoardPage, props: (r) => ({ code: String(r.params.code).toUpperCase(), admin: true }) },
```

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 8: Check a live session in the browser**

With `npm run dev` running, create a session with a flow of two steps (White 0.5 min, Red 0.5 min) and open the facilitator console. In two more built-in browser tabs open the invite link and join as "Asha" and "Ravi" (set one tab to 375 px wide). Verify:
1. The roster shows three people online in every tab; closing a tab turns that person offline.
2. Participants see the flow outline in the lobby; the facilitator can edit the flow and Save it, and participants' outline updates.
3. Start: every tab shows Step 1 of 2, White hat, the countdown.
4. Asha adds two points, Ravi one; neither sees the other's points; the facilitator sees counts 2 and 1 and no text.
5. Pause stops the countdown for everyone, Resume restarts it, +1 min adds a minute.
6. At 0:00 every tab shows "Time's up", then "Revealed", with all three points and author names; the composer is read-only and keeps any unsent text.
7. Asha can edit and delete her own point only while writing; the facilitator can delete any point.
8. Next step → Red hat; "Earlier steps" lists White with its points; Edit upcoming steps is empty on the last step.
9. Stop the dev server and start it again: tabs show "Reconnecting…" then recover with the same state.
10. Create a second session with "A scribe takes notes" and the same two participants. In the lobby, Start is disabled until the facilitator picks Ravi as scribe, and Asha's lobby says "Ravi will take notes for everyone." After Start, only Ravi has a composer, with a "Said by" picker. A note credited to Asha appears at once in every tab as "— Asha"; a note left on "Team" shows "— Team". The roster shows Ravi's "Scribe" tag and no point counts. Reassign the scribe to Asha mid-step: her composer appears, Ravi's disappears, and she can edit Ravi's notes.
Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add web
git commit -m "feat: live board with join, lobby, timed steps and reveal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Voting, decision and summary

**Files:**
- Create: `web/src/components/RankedList.vue`, `ActionList.vue`, `VotingPanel.vue`, `DecisionPanel.vue`, `SummaryView.vue` (under `web/src/components/`)
- Modify: `web/src/components/SessionBoard.vue` (replace the placeholder)

**Interfaces:**
- Consumes: `useRun`, `topVoted`, `PointList`, `StepGroups`, `HatBadge`, `api.summaryMarkdown`, `copyText`, `downloadText`.
- Produces: the remaining board states, completing the UI.

- [ ] **Step 1: Shared result lists**

`web/src/components/RankedList.vue`:
```vue
<script setup lang="ts">
import type { View, ViewPoint } from '@shared/protocol';
import { creditOf } from '../points';
import HatBadge from './HatBadge.vue';

defineProps<{ points: ViewPoint[]; view: View }>();
</script>

<template>
  <ol v-if="points.length" class="ranked">
    <li v-for="p in points" :key="p.id">
      <span class="votes">{{ p.votes }} vote{{ p.votes === 1 ? '' : 's' }}</span>
      <HatBadge :hat="view.steps[p.stepIndex]!.hat" size="sm" />
      <span>{{ p.text }}</span>
      <span class="muted small">— {{ creditOf(view, p) }}</span>
    </li>
  </ol>
  <p v-else class="muted">No votes were cast.</p>
</template>
```

`web/src/components/ActionList.vue`:
```vue
<script setup lang="ts">
import type { ActionItem } from '@shared/protocol';
import { useRun } from '../session-context';

defineProps<{ actions: ActionItem[]; removable?: boolean }>();
const run = useRun();
</script>

<template>
  <ul v-if="actions.length" class="actions">
    <li v-for="a in actions" :key="a.id">
      <span>☐ {{ a.text }}</span>
      <span v-if="a.owner" class="tag">{{ a.owner }}</span>
      <span v-if="a.due" class="muted small">due {{ a.due }}</span>
      <button v-if="removable" class="btn btn-small btn-ghost" :aria-label="`Remove ${a.text}`" @click="run({ type: 'removeAction', actionId: a.id })">✕</button>
    </li>
  </ul>
  <p v-else class="muted">No action items yet.</p>
</template>
```

- [ ] **Step 2: Voting**

`web/src/components/VotingPanel.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '@shared/protocol';
import { topVoted } from '../points';
import { useRun } from '../session-context';
import RankedList from './RankedList.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View }>();
const run = useRun();
const all = computed(() => props.view.steps.map((_, i) => i));
const left = computed(() => props.view.votesPerPerson - props.view.myVotes.length);
</script>

<template>
  <section class="card stack">
    <div class="row between wrap">
      <h2>{{ view.votingClosed ? 'Voting results' : 'Vote for the points that matter most' }}</h2>
      <div v-if="view.me.isFacilitator" class="row wrap">
        <template v-if="!view.votingClosed">
          <button class="btn btn-primary" @click="run({ type: 'closeVoting' })">Close voting</button>
          <button class="btn btn-ghost" @click="run({ type: 'skipVoting' })">Skip voting</button>
        </template>
        <button v-else class="btn btn-primary" @click="run({ type: 'goToDecision' })">Go to decision</button>
      </div>
    </div>
    <p v-if="!view.votingClosed" class="muted">
      You have {{ left }} of {{ view.votesPerPerson }} votes left. Totals stay hidden until the facilitator closes voting.
    </p>
    <RankedList v-else :points="topVoted(view)" :view="view" />
  </section>
  <StepGroups v-if="!view.votingClosed" :view="view" :indices="all" open voting />
</template>
```

- [ ] **Step 3: Decision**

`web/src/components/DecisionPanel.vue`:
```vue
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { LIMITS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { topVoted } from '../points';
import { useRun } from '../session-context';
import ActionList from './ActionList.vue';
import RankedList from './RankedList.vue';

const props = defineProps<{ view: View }>();
const run = useRun();

const draft = ref(props.view.decision);
const focused = ref(false);
watch(
  () => props.view.decision,
  (decision) => {
    if (!focused.value) draft.value = decision;
  },
);
const dirty = computed(() => draft.value.trim() !== props.view.decision);
const ranked = computed(() => topVoted(props.view));
const action = reactive({ text: '', owner: '', due: '' });

async function saveDecision() {
  await run({ type: 'setDecision', text: draft.value });
}

async function addAction() {
  const ok = await run({ type: 'addAction', action: { text: action.text, owner: action.owner, ...(action.due ? { due: action.due } : {}) } });
  if (ok) Object.assign(action, { text: '', owner: '', due: '' });
}

async function closeSession() {
  if (!confirm('Close the session? Everyone will see the final summary and it becomes read-only.')) return;
  if (dirty.value && !(await run({ type: 'setDecision', text: draft.value }))) return;
  await run({ type: 'closeSession' });
}
</script>

<template>
  <section class="card stack">
    <div class="row between wrap">
      <h2>Decision</h2>
      <button v-if="view.me.isFacilitator" class="btn btn-primary" @click="closeSession">Close session</button>
    </div>

    <template v-if="view.me.isFacilitator">
      <label class="field">
        <span>What did we decide?</span>
        <textarea v-model="draft" rows="4" :maxlength="LIMITS.decision" @focus="focused = true" @blur="focused = false" />
      </label>
      <div class="row">
        <button class="btn" :disabled="!dirty" @click="saveDecision">Save decision</button>
        <span v-if="dirty" class="muted small">Unsaved changes</span>
      </div>
    </template>
    <p v-else-if="view.decision" class="decision">{{ view.decision }}</p>
    <p v-else class="muted">The facilitator is writing up the decision…</p>

    <h3>Action items</h3>
    <ActionList :actions="view.actions" :removable="view.me.isFacilitator" />
    <form v-if="view.me.isFacilitator" class="row wrap" @submit.prevent="addAction">
      <label class="sr-only" for="action-text">Action</label>
      <input id="action-text" v-model="action.text" class="grow" :maxlength="LIMITS.actionText" placeholder="What needs doing?" required />
      <label class="sr-only" for="action-owner">Owner</label>
      <input id="action-owner" v-model="action.owner" :maxlength="LIMITS.actionOwner" placeholder="Owner" style="width: 140px" />
      <label class="sr-only" for="action-due">Due date</label>
      <input id="action-due" v-model="action.due" type="date" style="width: 170px" />
      <button class="btn">Add</button>
    </form>
  </section>

  <section v-if="ranked.length" class="card stack">
    <h2 class="h3">Top voted</h2>
    <RankedList :points="ranked" :view="view" />
  </section>
</template>
```

- [ ] **Step 4: Summary**

`web/src/components/SummaryView.vue`:
```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { View } from '@shared/protocol';
import { api, errorMessage } from '../api';
import { copyText, downloadText } from '../files';
import { topVoted } from '../points';
import { showToast } from '../toast';
import ActionList from './ActionList.vue';
import RankedList from './RankedList.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View; token: string }>();
const all = computed(() => props.view.steps.map((_, i) => i));
const markdown = ref<string | null>(null);

onMounted(async () => {
  try {
    markdown.value = await api.summaryMarkdown(props.view.code, props.token);
  } catch (e) {
    showToast(errorMessage(e));
  }
});

async function copy() {
  if (!markdown.value) return;
  const ok = await copyText(markdown.value);
  showToast(ok ? 'Summary copied' : 'Could not copy; use Download instead', ok ? 'info' : 'error');
}

function download() {
  if (markdown.value) downloadText(`six-hats-${props.view.code}.md`, markdown.value);
}
</script>

<template>
  <section class="card stack">
    <div class="row between wrap">
      <h2>Summary</h2>
      <div class="row">
        <button class="btn" :disabled="!markdown" @click="copy">Copy Markdown</button>
        <button class="btn btn-primary" :disabled="!markdown" @click="download">Download .md</button>
      </div>
    </div>
    <p class="muted small">Closed {{ new Date(view.closedAt ?? view.createdAt).toLocaleString() }}</p>
    <h3>Decision</h3>
    <p class="decision">{{ view.decision || 'No decision recorded.' }}</p>
    <h3>Action items</h3>
    <ActionList :actions="view.actions" />
    <template v-if="view.votingClosed">
      <h3>Top voted</h3>
      <RankedList :points="topVoted(view)" :view="view" />
    </template>
  </section>
  <StepGroups :view="view" :indices="all" title="All points" open show-votes />
</template>
```

- [ ] **Step 5: Wire into the board**

In `web/src/components/SessionBoard.vue`, add the imports:
```ts
import DecisionPanel from './DecisionPanel.vue';
import SummaryView from './SummaryView.vue';
import VotingPanel from './VotingPanel.vue';
```
and replace:
```vue
        <section v-else class="card"><p class="muted">Voting, decision and summary views arrive in Task 14.</p></section>
```
with:
```vue
        <VotingPanel v-else-if="view.status === 'voting'" :view="view" />
        <DecisionPanel v-else-if="view.status === 'decision'" :view="view" />
        <SummaryView v-else :view="view" :token="token" />
```

- [ ] **Step 6: Typecheck, build, full test run**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: no type errors, build succeeds, all tests pass.

- [ ] **Step 7: Check the end of a session in the browser**

Continue the Task 13 three-tab session (or run a new one to the end of its steps) and verify:
1. Voting: each tab shows "N of 3 votes left"; vote buttons disable at 0; nobody sees totals; unvote works.
2. Close voting: every tab shows ranked results; "Go to decision" moves everyone on.
3. Decision: the facilitator saves a decision and adds two action items (one with a due date); participants see both update live and cannot edit.
4. Close session: every tab shows the Summary; Copy Markdown toasts; Download .md saves `six-hats-<CODE>.md` whose content matches the spec §12 layout.
5. Archive (passcode `dev`) lists the session as Closed; "View summary" opens the read-only summary.
6. Run another session and press "Skip voting": the summary has no vote counts.
Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat: voting, decision and summary views" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Container, deploy config and README

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `fly.toml`, `README.md`

**Interfaces:**
- Consumes: `npm run build`, `dist/server/src/index.js`, `dist/web`.
- Produces: an image that serves the app on port 8080 with SQLite at `/data/six-hats.db`.

- [ ] **Step 1: Container files**

`.dockerignore`:
```
node_modules
dist
data
*.db
*.db-*
.git
docs
```

`Dockerfile`:
```dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data WEB_DIR=/app/dist/web
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "dist/server/src/index.js"]
```
The container runs as root so it can write to a Fly volume, which is mounted root-owned.

`fly.toml`:
```toml
# Change `app` to a globally unique name before the first deploy.
app = "six-hats"
primary_region = "bom"

[build]

[env]
  PORT = "8080"
  DATA_DIR = "/data"

[[mounts]]
  source = "six_hats_data"
  destination = "/data"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/healthz"
    timeout = "5s"
```

- [ ] **Step 2: README**

`README.md`:
````markdown
# Six Hats

Run Six Thinking Hats sessions with your team. The facilitator designs the flow (which hats, in what order, how long each), everyone writes privately under each hat, and at 0:00 the points are revealed to all. Then the team dot-votes, records a decision and action items, and exports a Markdown summary.

## Requirements

- Node 24 (`nvm use` reads `.nvmrc`)
- Docker, for the container build

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:5173. The team passcode in development is `dev`; data lives in `./data`.

## Test

```bash
npm test
npm run typecheck
```

## Build and run locally

```bash
npm run build
TEAM_PASSCODE=change-me npm start
```

Open http://localhost:8080.

## Run with Docker

```bash
docker build -t six-hats .
docker run --rm -p 8080:8080 -e TEAM_PASSCODE=change-me -v six-hats-data:/data six-hats
```

## Deploy to Fly.io

```bash
fly launch --no-deploy --copy-config
fly volumes create six_hats_data --size 1 --region bom
fly secrets set TEAM_PASSCODE='a-long-team-passcode'
fly deploy
```

Keep exactly one machine: sessions live in that machine's memory and SQLite file.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TEAM_PASSCODE` | required | Needed to create sessions, open the archive and manage templates |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `./data` (`/data` in the image) | SQLite location |
| `WEB_DIR` | unset (`/app/dist/web` in the image) | Built UI to serve; unset in development, where Vite serves it |

## Running a session

1. **Create** (`/new`, team passcode): title, focus question, your name, votes per person, and the flow. Start from a preset or a saved team template.
2. **Share** the 6-character code or invite link. Keep the admin link for yourself.
3. **Lobby**: people join with their name. Press **Start**.
4. **Each step**: everyone writes privately until 0:00, then all points appear with names. Pause, add a minute, reveal early, skip, or edit upcoming steps from the console.
5. **Vote**, then record the **decision** and **action items**, then **close** to get the summary.

Lost the admin link? Open the archive with the team passcode and choose **Open as facilitator**.
````

- [ ] **Step 3: Build and smoke-test the image**

Run:
```bash
docker build -t six-hats .
docker run -d --rm --name six-hats-smoke -p 8090:8080 -e TEAM_PASSCODE=smoke six-hats
sleep 3
curl -s localhost:8090/healthz; echo
curl -s -o /dev/null -w '%{http_code}\n' localhost:8090/
curl -s -o /dev/null -w '%{http_code}\n' localhost:8090/s/ABC234
curl -s -X POST -H 'x-team-passcode: smoke' localhost:8090/api/passcode/check -o /dev/null -w '%{http_code}\n'
docker stop six-hats-smoke
```
Expected: build succeeds; then `ok`, `200`, `200` (SPA fallback), `204`.

- [ ] **Step 4: Full run-through against the container**

Start the container again on port 8090 (`-v six-hats-smoke:/data`), and in the built-in browser repeat a short three-tab session (one 0.5-minute Green step) from create to closed summary. Then `docker restart six-hats-smoke` and confirm the archive still lists the session. Remove the volume afterwards: `docker volume rm six-hats-smoke`.

- [ ] **Step 5: Final checks**

Run: `npm test && npm run typecheck && git status --short`
Expected: all tests pass, no type errors, only the new Task 15 files listed.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore fly.toml README.md
git commit -m "feat: container, Fly.io config and README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deploying to Fly.io is the user's step (or Claude's, only on explicit instruction): it needs a Fly account, a unique app name and a real `TEAM_PASSCODE`.
