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
