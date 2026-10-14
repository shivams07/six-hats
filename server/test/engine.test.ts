import { describe, expect, it } from 'vitest';
import { addFacilitatorToken, createSession, joinSession, uniqueName } from '../src/engine.js';
import { ctx, makeSession, T0 } from './fixtures.js';

const INPUT = {
  title: '  Pricing  ',
  focus: 'Annual only?',
  facilitatorName: 'Fac',
  votesPerPerson: 3,
  steps: [{ hat: 'white', durationSec: 60 }],
};
const INIT = { id: 's-1', code: 'ABC234', tokenHash: 'fac-hash', ...ctx() };

describe('createSession', () => {
  it('creates a lobby with the facilitator as first participant', () => {
    const r = createSession(INPUT, INIT);
    if (!r.ok) throw new Error(r.error);
    expect(r.session).toMatchObject({
      id: 's-1',
      code: 'ABC234',
      title: 'Pricing',
      status: 'lobby',
      mode: 'everyone',
      currentStep: -1,
      phase: null,
      votesPerPerson: 3,
      votingClosed: false,
      decision: '',
      createdAt: T0,
      steps: [{ hat: 'white', durationSec: 60 }],
      points: [],
      votes: [],
      actions: [],
    });
    expect(r.session.participants).toEqual([
      { id: r.facilitatorId, name: 'Fac', isFacilitator: true, tokenHashes: ['fac-hash'], joinedAt: T0 },
    ]);
  });

  it('rejects invalid input with the first problem found', () => {
    expect(createSession({ ...INPUT, title: '' }, INIT)).toEqual({ ok: false, error: "Title can't be empty" });
    expect(createSession({ ...INPUT, focus: undefined }, INIT)).toEqual({ ok: false, error: 'Focus question is required' });
    expect(createSession({ ...INPUT, facilitatorName: 'x'.repeat(41) }, INIT)).toEqual({ ok: false, error: 'Your name must be at most 40 characters' });
    expect(createSession({ ...INPUT, votesPerPerson: 0 }, INIT)).toEqual({ ok: false, error: 'Votes per person must be between 1 and 10' });
    expect(createSession({ ...INPUT, steps: [] }, INIT)).toEqual({ ok: false, error: 'A flow needs at least 1 step' });
    expect(createSession(null, INIT)).toEqual({ ok: false, error: 'Title is required' });
  });

  it('records the writing mode, with no scribe until the lobby picks one', () => {
    const r = createSession({ ...INPUT, mode: 'scribe' }, INIT);
    if (!r.ok) throw new Error(r.error);
    expect(r.session.mode).toBe('scribe');
    expect(r.session.scribeId).toBeUndefined();
    expect(createSession({ ...INPUT, mode: 'chaos' }, INIT)).toEqual({ ok: false, error: 'Mode must be "everyone" or "scribe"' });
  });
});

describe('joinSession', () => {
  it('adds a participant without mutating the input', () => {
    const { s } = makeSession();
    const r = joinSession(s, '  Priya ', 'priya-hash', ctx());
    if (!r.ok) throw new Error(r.error);
    expect(s.participants).toHaveLength(3);
    expect(r.session.participants.at(-1)).toEqual({
      id: r.participantId, name: 'Priya', isFacilitator: false, tokenHashes: ['priya-hash'], joinedAt: T0,
    });
  });

  it('suffixes duplicate names case-insensitively', () => {
    expect(uniqueName(['Asha', 'Ravi'], 'asha')).toBe('asha (2)');
    expect(uniqueName(['Asha', 'asha (2)'], 'ASHA')).toBe('ASHA (3)');
    expect(uniqueName(['Asha'], 'Ravi')).toBe('Ravi');
  });

  it('refuses closed sessions, full sessions and bad names', () => {
    const { s } = makeSession();
    expect(joinSession({ ...s, status: 'closed' }, 'Priya', 'h', ctx())).toEqual({ ok: false, error: 'This session has ended', reason: 'closed' });
    const crowd = Array.from({ length: 50 }, (_, i) => ({ ...s.participants[1]!, id: `p${i}`, name: `P${i}` }));
    expect(joinSession({ ...s, participants: crowd }, 'Priya', 'h', ctx())).toEqual({ ok: false, error: 'This session is full', reason: 'full' });
    expect(joinSession(s, '', 'h', ctx())).toEqual({ ok: false, error: "Name can't be empty", reason: 'invalid' });
  });
});

describe('addFacilitatorToken', () => {
  it('adds a token hash to the facilitator only', () => {
    const { s, fac } = makeSession();
    const next = addFacilitatorToken(s, 'second-hash');
    expect(next.participants.find((p) => p.id === fac)?.tokenHashes).toEqual(['fac-hash', 'second-hash']);
    expect(s.participants.find((p) => p.id === fac)?.tokenHashes).toEqual(['fac-hash']);
  });
});
