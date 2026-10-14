import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../src/sessions.js';
import { Store } from '../src/store.js';

const INPUT = { title: 'Pricing', focus: 'Annual only?', facilitatorName: 'Fac', votesPerPerson: 3, steps: [{ hat: 'white', durationSec: 60 }] };

function setup() {
  const store = new Store(':memory:');
  const service = new SessionService(store, () => 1_000);
  const created = service.create(INPUT);
  if (!created.ok) throw new Error(created.error);
  const auth = service.authenticate(created.code, created.facilitatorToken);
  if (!auth.ok) throw new Error(auth.error);
  return { store, service, code: created.code, facToken: created.facilitatorToken, id: auth.session.id, facId: auth.participant.id };
}

afterEach(() => vi.restoreAllMocks());

describe('SessionService', () => {
  it('creates a persisted session that the facilitator token unlocks', () => {
    const { store, service, code, facToken } = setup();
    const auth = service.authenticate(code, facToken);
    expect(auth.ok && auth.participant.isFacilitator).toBe(true);
    expect(store.getByCode(code)?.title).toBe('Pricing');
  });

  it('rejects invalid input with a 400', () => {
    const service = new SessionService(new Store(':memory:'));
    expect(service.create({ ...INPUT, title: '' })).toEqual({ ok: false, status: 400, error: "Title can't be empty" });
  });

  it('joins by code regardless of case', () => {
    const { service, code } = setup();
    const joined = service.join(code.toLowerCase(), 'Asha');
    if (!joined.ok) throw new Error(joined.error);
    const auth = service.authenticate(code, joined.token);
    expect(auth.ok && auth.participant.name).toBe('Asha');
    expect(auth.ok && auth.participant.isFacilitator).toBe(false);
  });

  it('tells unknown codes and wrong tokens apart', () => {
    const { service, code, facToken } = setup();
    expect(service.authenticate('ZZZZZZ', facToken)).toEqual({ ok: false, error: 'session_not_found' });
    expect(service.authenticate(undefined, undefined)).toEqual({ ok: false, error: 'session_not_found' });
    expect(service.authenticate(code, 'wrong')).toEqual({ ok: false, error: 'invalid_token' });
    expect(service.join('ZZZZZZ', 'Asha')).toEqual({ ok: false, status: 404, error: 'Session not found' });
  });

  it('persists an accepted command before notifying listeners', () => {
    const { store, service, id, facId } = setup();
    const seen: string[] = [];
    service.subscribe((s) => seen.push(`${s.status}/${store.get(s.id)?.status}`));
    expect(service.dispatch(id, facId, { type: 'start' })).toEqual({ ok: true });
    expect(seen).toEqual(['running/running']);
  });

  it('returns engine errors without notifying', () => {
    const { service, id, code } = setup();
    const joined = service.join(code, 'Asha');
    if (!joined.ok) throw new Error(joined.error);
    const listener = vi.fn();
    service.subscribe(listener);
    expect(service.dispatch(id, joined.participantId, { type: 'start' })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    expect(service.dispatch('missing', null, { type: 'timerExpired' })).toEqual({ ok: false, error: 'Session not found' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the previous state when saving fails', () => {
    const { store, service, id, facId } = setup();
    vi.spyOn(store, 'save').mockImplementation(() => {
      throw new Error('disk full');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(service.dispatch(id, facId, { type: 'start' })).toEqual({ ok: false, error: 'Could not save, please try again' });
    expect(service.get(id)?.status).toBe('lobby');
  });

  it('mints extra facilitator tokens', () => {
    const { service, code } = setup();
    const minted = service.mintFacilitatorToken(code);
    if (!minted.ok) throw new Error(minted.error);
    const auth = service.authenticate(code, minted.token);
    expect(auth.ok && auth.participant.isFacilitator).toBe(true);
    expect(service.mintFacilitatorToken('ZZZZZZ')).toEqual({ ok: false, status: 404, error: 'Session not found' });
  });

  it('refuses to join a closed session with a 410', () => {
    const { service, id, facId, code } = setup();
    for (const type of ['start', 'revealNow', 'nextStep', 'skipVoting', 'closeSession'] as const) {
      expect(service.dispatch(id, facId, { type })).toEqual({ ok: true });
    }
    expect(service.join(code, 'Late')).toEqual({ ok: false, status: 410, error: 'This session has ended' });
  });

  it('reloads live sessions from the store', () => {
    const { store, code } = setup();
    expect(new SessionService(store).loadLive().map((s) => s.code)).toEqual([code]);
  });
});
