import type { FlowStep } from '../../shared/src/hats.js';
import type { WritingMode } from '../../shared/src/protocol.js';
import { applyCommand, createSession, joinSession, type AnyCommand, type EngineResult } from '../src/engine.js';
import type { Ctx, Session } from '../src/session.js';

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

export function attempt(s: Session, actorId: string | null, cmd: AnyCommand, now = T0): EngineResult {
  return applyCommand(s, actorId, cmd, ctx(now));
}

export function run(s: Session, actorId: string | null, cmd: AnyCommand, now = T0): Session {
  const r = attempt(s, actorId, cmd, now);
  if (!r.ok) throw new Error(r.error);
  return r.session;
}

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
