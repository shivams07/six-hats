# Six Hats Session Tool — Design

**Date:** 2026-10-14
**Status:** Approved in brainstorming, pending written-spec review

## 1. Purpose

A small self-hosted web app for running Edward de Bono's Six Thinking Hats sessions with a team. Everyone joins live on their own device; a facilitator designs the hat flow, drives the group through it with a timer, and the session ends in ranked points, a recorded decision and action items, exportable as Markdown and kept in an archive.

Some participants do not have claude.ai accounts, so this is a standalone app rather than a hosted Artifact.

## 2. Decisions taken

| Topic | Decision |
|---|---|
| Format | Live, every participant on their own device, one shared board |
| Hat flow | Facilitator-designed sequence; each step has its own hat, timer and optional prompt |
| Visibility | A step's points are private to their author while writing; at 0:00 writing locks and all points auto-reveal to everyone. Facilitator can reveal early |
| Attribution | Points always show their author's name |
| Outputs | Dot-voting, Blue-hat decision + action items, Markdown export, past-session archive |
| Access | No accounts. Participants join by link or 6-character code + name. Facilitator holds a private admin link. A single team passcode gates creating sessions, the archive and templates |
| Hosting | One Docker container (Node + SQLite on a volume); Fly.io to start, portable to CleverTap infra |
| Code location | Standalone repo `~/Documents/clevertap/six-hats`, not Ultron |

## 3. Out of scope

User accounts or SSO; anonymous points; horizontal scaling or multi-instance deploys; pushing results into Slack/Jira/Confluence (export is copy/download only); editing a session after it is closed; internationalisation.

## 4. Architecture

One Node 20 + TypeScript process serves the built web UI, a small HTTP API and a Socket.IO endpoint. State for live sessions is held in memory and written through to SQLite after every accepted command. Sized for one team: 2–50 participants per session, a handful of concurrent sessions.

```
six-hats/
  package.json            npm workspaces: shared, server, web
  shared/src/
    hats.ts               hat definitions, default timers/prompts, built-in presets
    protocol.ts           Command, View and API types shared by server and web
  server/src/
    index.ts              boot: open store, load live sessions, re-arm timers, listen
    app.ts                Express app: static web, JSON API, security headers
    auth.ts               passcode check, token mint/hash/verify, rate limiting
    engine.ts             pure state machine: (session, actor, command, now) -> session | error
    views.ts              pure projection: (session, viewer, now) -> View (redaction lives here)
    store.ts              SQLite: sessions + templates
    timers.ts             one timeout per running step; fires timerExpired into the engine
    realtime.ts           Socket.IO: handshake, command dispatch, per-viewer broadcast, presence
    export.ts             pure: session -> Markdown summary
  server/test/            Vitest unit + integration tests
  web/src/
    main.ts, router.ts, api.ts, socket.ts
    pages/                Home, Create, Join, Board, Summary, Archive
    components/           FlowBuilder, HatBadge, Countdown, PointList, PointComposer,
                          Roster, VotePanel, DecisionPanel
  Dockerfile, fly.toml, README.md
```

Stack: Express, Socket.IO, better-sqlite3 (synchronous, which keeps "persist then commit" trivial), helmet, Vue 3 + Vite + Vue Router, Vitest. No other runtime dependencies.

**Unit boundaries.** `engine`, `views` and `export` are pure functions with injected `now`; they hold every rule in the product and are where the tests concentrate. `realtime`, `timers`, `store` and `app` are thin I/O shells around them.

## 5. The hats

| Hat | Focus | Default prompt | Default timer |
|---|---|---|---|
| White | Facts & information | What do we know? What's missing? What would we need to find out? | 4:00 |
| Red | Feelings & intuition | What's your gut reaction? No justification needed. | 1:00 |
| Black | Caution & risks | What could go wrong? Why might this not work? | 4:00 |
| Yellow | Benefits & value | What are the benefits? Why could this work? | 4:00 |
| Green | Creativity & alternatives | What new ideas, alternatives or possibilities are there? | 5:00 |
| Blue | Process & control | Where are we? What should we focus on? What have we concluded? | 2:00 |

Each hat is always shown with its name and an icon as well as its colour, never colour alone. Text and badge contrast meet WCAG AA in both light and dark themes (the White and Black hats need explicit borders on matching backgrounds).

**Built-in presets** (editable starting points in the flow builder):

| Preset | Sequence |
|---|---|
| Quick feedback | Black, Green |
| Initial ideas | Blue, White, Green, Blue |
| Evaluate an idea | Blue, White, Yellow, Black, Red, Green, Blue |
| Solve a problem | Blue, White, Green, Red, Yellow, Black, Green, Blue |

Team templates saved by facilitators are listed after the presets.

## 6. Session lifecycle

```
lobby ──start──▶ running ──(last step revealed) nextStep──▶ voting ──closeVoting──▶ results
                                                    │                                  │
                                                    └──────────skipVoting──────────────┤
                                                                                       ▼
                                                                   decision ──closeSession──▶ closed
```

`results` is `voting` with `votingClosed = true`; `goToDecision` moves it on.

Within `running`, the current step has a **phase**:

- `writing` — timer counting down (`endsAt` set). Participants add, edit and delete their own points.
- `paused` — timer frozen (`remainingMs` stored). Writing still allowed.
- `revealed` — writing locked, every point in the step visible to everyone. Terminal for the step.

The step reaches `revealed` when the timer hits 0:00 (`timerExpired`), when the facilitator presses Reveal early, or on Skip.

### 6.1 Create

Facilitator, with team passcode. Inputs: title (≤120), focus question (≤500), facilitator's own display name (≤40), votes per person (1–10, default 3), and the flow.

**Flow builder.** An ordered list of 1–20 steps. Each step: hat (any of six, repeats allowed), duration (0:30–30:00, defaults per §5), optional prompt (≤300) overriding the hat's default. Add, remove, duplicate, reorder (drag and up/down buttons). Shows total planned time. Start from a preset, a team template, or blank. **Save as team template** stores the current flow under a name (≤60).

On create the facilitator receives the participant link `/s/<CODE>`, the 6-character code, and the private admin link `/s/<CODE>/admin#t=<token>` with copy buttons and a "save this link" warning. The admin token is also kept in the facilitator's localStorage.

### 6.2 Lobby

Participants open the link or enter the code on Home, then enter a name. Names are trimmed, ≤40 chars, unique per session case-insensitively (a duplicate becomes `Name (2)`). Joining is rejected once a session has 50 participants. The roster shows everyone with an online dot. Facilitator presses **Start**, which puts step 0 into `writing`.

### 6.3 Steps

Everyone sees the step number ("Step 3 of 7"), hat badge, prompt, focus question and the countdown.

- **Writing.** A participant's board shows only their own points for the current step plus all revealed earlier steps. Points ≤500 chars, at most 30 per person per step.
- **Facilitator console** adds: per-participant point counts for the current step (counts only, never text), and controls — Pause/Resume, +1 min (writing/paused only), Reveal now, Skip (reveal now and advance immediately), Next (revealed only), Edit upcoming steps, Delete any point. The facilitator is also a participant and can post and vote.
- **At 0:00** the server locks writing and reveals. Unsent text stays in the composer so nothing typed is lost from the author's screen.
- **Revealed** points list chronologically with author names. Discussion happens out loud.
- **Editing upcoming steps.** Mid-session the facilitator may change hat, duration or prompt of, reorder, add or remove any step with index greater than the current one. Past and current steps are immutable apart from the timer controls. The total stays within 1–20 steps.
- **Late joiners** can write in the current step and see all revealed steps.

### 6.4 Voting

Entered by Next on the last revealed step. Each participant places up to N votes (N = votes per person) on any point from any step, at most one vote per point, and can remove votes while voting is open. Totals are hidden from everyone, facilitator included, until **Close voting**; each person sees only their own votes and remaining count. After closing, points are ranked by votes (ties broken by step order then creation time). The facilitator may **Skip voting** instead, going straight to decision.

### 6.5 Decision

The facilitator writes the decision (≤4000) and action items (each: text ≤300, owner name ≤60, optional due date). Everyone sees them update live, read-only.

### 6.6 Closed

**Close session** makes the session read-only. Every participant's board turns into the Summary page with **Copy Markdown** and **Download .md**. The session stays in the archive.

## 7. Commands and permissions

All mutations are Socket.IO `command` events with an ack. The engine validates actor, state and payload; any failure returns `{ok:false, error}` with a human-readable message and leaves state unchanged.

| Command | Who | Allowed when |
|---|---|---|
| `start` | facilitator | lobby |
| `pause` / `resume` | facilitator | running, writing / paused |
| `addTime` (+60 s) | facilitator | running, writing or paused |
| `revealNow` | facilitator | running, writing or paused |
| `skipStep` | facilitator | running, writing or paused (reveals, then advances) |
| `nextStep` | facilitator | running, revealed |
| `editUpcomingSteps(steps)` | facilitator | lobby (all steps) or running (steps after current) |
| `deletePoint(id)` | facilitator: any point; author: own point in current step while writing/paused | running |
| `addPoint(text)` | any participant | running, current step writing or paused |
| `editPoint(id, text)` | author | running, own point in current step, writing or paused |
| `vote(pointId)` / `unvote(pointId)` | any participant | voting, not closed, within limit |
| `closeVoting` / `skipVoting` | facilitator | voting |
| `goToDecision` | facilitator | voting with votingClosed |
| `setDecision(text)`, `addAction`, `updateAction`, `removeAction` | facilitator | decision |
| `closeSession` | facilitator | decision |
| `timerExpired` | server only (from `timers.ts`) | running, writing, `now ≥ endsAt` |

## 8. Views and the redaction invariant

After every accepted command the server sends each connected viewer a complete `View` for that session (`state` event), never a delta, plus `serverNow` for clock-offset correction. A View contains: session metadata and status; all steps; the current step and phase with `endsAt`/`remainingMs`; the roster (names, facilitator flag, online); points; vote information; decision and actions.

**Redaction rules, enforced only in `views.ts`:**

1. For a step not yet revealed, a viewer receives only points they authored. This applies to the facilitator too.
2. The facilitator's View additionally carries `currentStepCounts: {participantId: number}` — counts only.
3. While voting is open, a viewer receives only their own votes and remaining count. Totals appear only once `votingClosed`.
4. Tokens and token hashes never appear in any View.

The server never emits session data through any path other than `views.ts`.

## 9. Timer

The server is authoritative. `start`, `nextStep` and `resume` set `endsAt = now + duration` (or `+ remainingMs`); `pause` stores `remainingMs`; `addTime` moves `endsAt` or `remainingMs` by 60 s. `timers.ts` keeps one `setTimeout` per running session, re-armed on every state change, which submits `timerExpired`. The engine ignores a `timerExpired` that arrives early or for a step no longer writing, so stray timeouts are harmless. Clients render the countdown from `endsAt - (Date.now() + offset)` where `offset = serverNow - Date.now()` at receipt. On boot, sessions in `writing` are re-armed, or revealed immediately if `endsAt` has passed.

## 10. Data

SQLite file at `${DATA_DIR}/six-hats.db`.

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,        -- crypto.randomUUID()
  code        TEXT NOT NULL UNIQUE,    -- 6 chars from ABCDEFGHJKLMNPQRSTUVWXYZ23456789
  status      TEXT NOT NULL,           -- lobby | running | voting | decision | closed
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  closed_at   INTEGER,
  doc         TEXT NOT NULL            -- full Session JSON
);
CREATE TABLE templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  steps       TEXT NOT NULL,           -- JSON array of {hat, durationSec, prompt?}
  created_at  INTEGER NOT NULL
);
```

The `Session` document holds steps, participants (id, name, isFacilitator, tokenHash, joinedAt), facilitator token hashes, points (id, stepIndex, authorId, text, createdAt, updatedAt), votes (pointId, voterId), votesPerPerson, votingClosed, decision, actions, current step index, phase, `endsAt`, `remainingMs`. A large session is tens of KB, so rewriting the whole document per command is cheap and keeps the store trivial. Deleted points are removed from the document.

**Write path:** engine computes next session → `store.save` (synchronous) → on success replace in-memory copy, re-arm timer, broadcast; on failure reject the command and log. Memory and disk never diverge.

Tokens are 32 random bytes, base64url. Only SHA-256 hashes are stored.

## 11. HTTP API

Passcode is sent as `X-Team-Passcode`, compared in constant time against `TEAM_PASSCODE`, and rate-limited to 10 failed attempts per IP per minute. The web app remembers it in localStorage after first successful use.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/sessions` | passcode | Create; returns code, participant link, admin link |
| `GET /api/sessions` | passcode | Archive list: title, date, status, participant count |
| `POST /api/sessions/:code/join` | none | `{name}` → `{participantId, token}`; 404 if unknown, 410 if closed |
| `POST /api/sessions/:code/facilitator-link` | passcode | Mint a fresh facilitator token for a lost admin link |
| `GET /api/sessions/:code/summary.md` | passcode, or any token of that session | Markdown export (closed sessions; live sessions return revealed content only) |
| `GET /api/templates` · `POST` · `DELETE /:id` | passcode | Team templates |

Socket.IO handshake: `auth: {code, token}`. Unknown code or bad token → connection refused with a reason the client shows.

## 12. Markdown export

```markdown
# Six Hats: <title>
_<date> · Facilitator: <name> · <n> participants_

**Focus question:** <focus>

## Decision
<decision text>

## Action items
- [ ] <text> — **<owner>** — due <date>

## Top voted
1. (5 votes) [Black] <point> — <author>
2. ...

## Flow
### 1. White hat — Facts & information (4:00)
> <prompt>
- <point> — <author> (2 votes)
```

Sections with no content are omitted. Vote counts appear only if voting was closed.

## 13. Web pages

- **Home** `/` — enter code to join; links to Create and Archive.
- **Create** `/new` — passcode prompt if not remembered; form + FlowBuilder.
- **Join** `/s/:code` — name entry; skipped if a valid token for this code is in localStorage.
- **Board** `/s/:code` (joined) and `/s/:code/admin` (facilitator) — one component tree; facilitator controls render only with a facilitator View. Participant layout works at phone width.
- **Summary** — shown in place of the board once closed.
- **Archive** `/archive` — passcode; list newest first; closed → Summary; live → "Open as facilitator" (mints a facilitator link).

All user text renders through Vue text interpolation; `v-html` is never used on user content.

## 14. Error handling

| Situation | Behaviour |
|---|---|
| Command rejected | Toast with the engine's message (e.g. "Writing is locked for this step") |
| Socket drops | "Reconnecting…" banner; Socket.IO auto-reconnects; server resends full View |
| Server restart | Live sessions reloaded from SQLite, timers re-armed; clients reconnect on their own |
| Unknown code | "Session not found" page with a link Home |
| Closed session, no token | "This session has ended"; summary available from the archive |
| Lost admin link | Archive → Open as facilitator (passcode) |
| Flooding | ≤20 commands per 10 s per socket; excess rejected with "Slow down" |
| Oversized input | Rejected by engine with the limit in the message |
| Persist failure | Command rejected, state unchanged, error logged |

## 15. Testing

**Unit (Vitest), pure modules:**
- `engine`: every command's allowed and rejected states; auto-reveal on `timerExpired` and early/stale `timerExpired` ignored; pause/resume/addTime arithmetic; edit-upcoming cannot touch past or current steps and keeps 1–20 steps; vote limit, one-per-point, unvote; facilitator-only commands rejected for participants; input limits; duplicate-name suffixing.
- `views`: **no viewer ever receives another person's point from an unrevealed step** (property-style test over random sessions and viewers), facilitator gets counts not text, vote totals hidden until closed, no token material in any View.
- `export`: snapshot of a complete session; omitted empty sections; no vote counts when voting skipped.

**Integration:** start the real server on a random port with a temp `DATA_DIR`; one facilitator and two participant Socket.IO clients run create → join → write → auto-reveal (1-second step) → vote → close voting → decision → close → `summary.md`. A second test restarts the server mid-step and asserts the session and timer resume.

**Manual:** run locally with three browser windows (one facilitator, two participants, one at phone width) through a full session before handover.

## 16. Deployment

- Multi-stage `Dockerfile`: build `shared`, `server`, `web`; runtime image runs `node server/dist/index.js` on a slim Node 20 base.
- Environment: `TEAM_PASSCODE` (required; boot fails without it), `PORT` (default 8080), `DATA_DIR` (default `/data`).
- `fly.toml`: one machine, 1 GB volume mounted at `/data`, HTTPS, health check on `GET /healthz`. Render's free tier has no persistent disk, so the archive would be lost on redeploy there.
- `README.md`: local dev (`npm run dev` runs server and Vite together), `docker run`, `fly deploy`, setting the passcode.
- Deploying to Fly.io is done by the user, or by Claude only on explicit instruction.
