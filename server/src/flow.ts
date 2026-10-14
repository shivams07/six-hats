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
