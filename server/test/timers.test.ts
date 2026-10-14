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
