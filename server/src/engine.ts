import { LIMITS } from '../../shared/src/hats.js';
import type { Command } from '../../shared/src/protocol.js';
import { FLOW_HANDLERS, timerExpired } from './flow.js';
import type { Ctx, Handler, HandlerMap, Session } from './session.js';
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
