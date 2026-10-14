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
