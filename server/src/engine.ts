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
