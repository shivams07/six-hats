import { SOCKET_ERRORS, type CommandAck, type CreateSessionResult, type JoinResult, type SocketError } from '../../shared/src/protocol.js';
import { addFacilitatorToken, applyCommand, createSession, joinSession, type AnyCommand } from './engine.js';
import { hashToken, newCode, newId, newToken } from './ids.js';
import type { Participant, Session } from './session.js';
import type { Store } from './store.js';

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };
export type AuthResult = { ok: true; session: Session; participant: Participant } | { ok: false; error: SocketError };
type Listener = (s: Session) => void;

const NOT_FOUND = { ok: false as const, status: 404, error: 'Session not found' };

/** Owns the write path: engine -> store -> memory -> listeners. Memory and disk never diverge. */
export class SessionService {
  private readonly sessions = new Map<string, Session>();
  private readonly listeners: Listener[] = [];

  constructor(
    private readonly store: Store,
    private readonly clock: () => number = Date.now,
  ) {}

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  loadLive(): Session[] {
    const live = this.store.listLive();
    for (const s of live) this.sessions.set(s.id, s);
    return live;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id) ?? this.remember(this.store.get(id));
  }

  getByCode(code: string): Session | undefined {
    const upper = code.toUpperCase();
    for (const s of this.sessions.values()) if (s.code === upper) return s;
    return this.remember(this.store.getByCode(upper));
  }

  create(input: unknown): ServiceResult<CreateSessionResult> {
    const token = newToken();
    const r = createSession(input, {
      id: newId(),
      code: newCode((c) => this.store.codeExists(c)),
      tokenHash: hashToken(token),
      now: this.clock(),
      newId,
    });
    if (!r.ok) return { ok: false, status: 400, error: r.error };
    const saved = this.persist(r.session);
    if (!saved.ok) return saved;
    return { ok: true, code: r.session.code, facilitatorToken: token };
  }

  join(code: string, name: unknown): ServiceResult<JoinResult> {
    const s = this.getByCode(code);
    if (!s) return NOT_FOUND;
    const token = newToken();
    const r = joinSession(s, name, hashToken(token), { now: this.clock(), newId });
    if (!r.ok) return { ok: false, status: r.reason === 'closed' ? 410 : 400, error: r.error };
    const saved = this.persist(r.session);
    if (!saved.ok) return saved;
    return { ok: true, participantId: r.participantId, token };
  }

  mintFacilitatorToken(code: string): ServiceResult<{ token: string }> {
    const s = this.getByCode(code);
    if (!s) return NOT_FOUND;
    const token = newToken();
    const saved = this.persist(addFacilitatorToken(s, hashToken(token)));
    if (!saved.ok) return saved;
    return { ok: true, token };
  }

  authenticate(code: unknown, token: unknown): AuthResult {
    const session = typeof code === 'string' ? this.getByCode(code) : undefined;
    if (!session) return { ok: false, error: SOCKET_ERRORS.notFound };
    const hash = typeof token === 'string' ? hashToken(token) : '';
    const participant = session.participants.find((p) => p.tokenHashes.includes(hash));
    return participant ? { ok: true, session, participant } : { ok: false, error: SOCKET_ERRORS.invalidToken };
  }

  dispatch(sessionId: string, actorId: string | null, cmd: AnyCommand): CommandAck {
    const current = this.get(sessionId);
    if (!current) return { ok: false, error: 'Session not found' };
    const r = applyCommand(current, actorId, cmd, { now: this.clock(), newId });
    if (!r.ok) return r;
    const saved = this.persist(r.session);
    return saved.ok ? { ok: true } : { ok: false, error: saved.error };
  }

  private persist(s: Session): { ok: true } | { ok: false; status: number; error: string } {
    try {
      this.store.save(s);
    } catch (err) {
      console.error(`Failed to save session ${s.id}`, err);
      return { ok: false, status: 500, error: 'Could not save, please try again' };
    }
    this.sessions.set(s.id, s);
    for (const fn of this.listeners) {
      try {
        fn(s);
      } catch (err) {
        console.error('Session listener failed', err);
      }
    }
    return { ok: true };
  }

  private remember(s: Session | undefined): Session | undefined {
    if (s) this.sessions.set(s.id, s);
    return s;
  }
}
