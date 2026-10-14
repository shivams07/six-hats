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

  it('sweeps keys whose failures have all expired', () => {
    let now = 0;
    const limiter = new FailureLimiter(10, 1_000, () => now);
    for (let i = 0; i < 150; i++) limiter.recordFailure(`old-${i}`);
    now = 1_001;
    for (let i = 0; i < 100; i++) limiter.recordFailure(`new-${i}`);
    expect(limiter.size).toBeLessThanOrEqual(100);
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
