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
    try {
      if (this.target.dispatch(id, null, { type: 'timerExpired' }).ok) return;
    } catch (err) {
      console.error(`Timer dispatch failed for session ${id}`, err);
    }
    const current = this.target.get(id);
    if (current) this.sync(current, RETRY_MS);
  }
}
