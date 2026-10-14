import { describe, expect, it } from 'vitest';
import { attempt, makeSession, pointId, run, T0, toVoting } from './fixtures.js';

const LOCKED = { ok: false, error: 'Writing is locked for this step' };

function writing() {
  const { s, fac, asha, ravi } = makeSession();
  return { s: run(s, fac, { type: 'start' }), fac, asha, ravi };
}

describe('addPoint', () => {
  it('adds a trimmed point to the current step', () => {
    const { s, asha } = writing();
    const next = run(s, asha, { type: 'addPoint', text: '  Churn is up  ' }, T0 + 5);
    expect(next.points).toEqual([
      { id: expect.any(String), stepIndex: 0, authorId: asha, text: 'Churn is up', createdAt: T0 + 5, updatedAt: T0 + 5 },
    ]);
  });

  it('is allowed while paused, refused once revealed', () => {
    const { s, fac, asha } = writing();
    expect(attempt(run(s, fac, { type: 'pause' }), asha, { type: 'addPoint', text: 'ok' }).ok).toBe(true);
    expect(attempt(run(s, fac, { type: 'revealNow' }), asha, { type: 'addPoint', text: 'late' })).toEqual(LOCKED);
  });

  it('enforces text limits and 30 points per person per step', () => {
    const { s, asha } = writing();
    expect(attempt(s, asha, { type: 'addPoint', text: ' ' })).toEqual({ ok: false, error: "Point can't be empty" });
    expect(attempt(s, asha, { type: 'addPoint', text: 'x'.repeat(501) })).toEqual({ ok: false, error: 'Point must be at most 500 characters' });
    let full = s;
    for (let i = 0; i < 30; i++) full = run(full, asha, { type: 'addPoint', text: `p${i}` });
    expect(attempt(full, asha, { type: 'addPoint', text: 'one more' })).toEqual({ ok: false, error: 'You can add at most 30 points per step' });
  });
});

describe('editPoint and deletePoint', () => {
  it('lets the author edit and delete their point while writing', () => {
    const { s: base, asha } = writing();
    const s = run(base, asha, { type: 'addPoint', text: 'draft' });
    const id = pointId(s, 'draft');
    const edited = run(s, asha, { type: 'editPoint', pointId: id, text: ' final ' }, T0 + 9);
    expect(edited.points[0]).toMatchObject({ text: 'final', updatedAt: T0 + 9 });
    expect(run(edited, asha, { type: 'deletePoint', pointId: id }).points).toEqual([]);
  });

  it('hides other people\'s points and locks them after the reveal', () => {
    const { s: base, fac, asha, ravi } = writing();
    const s = run(base, asha, { type: 'addPoint', text: 'mine' });
    const id = pointId(s, 'mine');
    expect(attempt(s, ravi, { type: 'editPoint', pointId: id, text: 'x' })).toEqual({ ok: false, error: 'Point not found' });
    expect(attempt(s, ravi, { type: 'deletePoint', pointId: id })).toEqual({ ok: false, error: 'Point not found' });
    const revealed = run(s, fac, { type: 'revealNow' });
    expect(attempt(revealed, asha, { type: 'editPoint', pointId: id, text: 'x' })).toEqual(LOCKED);
    expect(attempt(revealed, asha, { type: 'deletePoint', pointId: id })).toEqual(LOCKED);
  });

  it('lets the facilitator delete any point until the steps end', () => {
    const { s: base, fac, asha } = writing();
    const revealed = run(run(base, asha, { type: 'addPoint', text: 'spam' }), fac, { type: 'revealNow' });
    expect(run(revealed, fac, { type: 'deletePoint', pointId: pointId(revealed, 'spam') }).points).toEqual([]);
    const { s: voting, fac: vf } = toVoting();
    expect(attempt(voting, vf, { type: 'deletePoint', pointId: pointId(voting, 'Migration risk') })).toEqual({ ok: false, error: 'Points can no longer be deleted' });
  });
});

describe('voting', () => {
  it('allows one vote per point up to the limit, and taking votes back', () => {
    const { s, asha } = toVoting();
    const churn = pointId(s, 'Churn is 4% monthly');
    const risk = pointId(s, 'Migration risk');
    const enterprise = pointId(s, 'No data on\nenterprise');
    let v = run(s, asha, { type: 'vote', pointId: churn });
    expect(attempt(v, asha, { type: 'vote', pointId: churn })).toEqual({ ok: false, error: 'You already voted for this point' });
    v = run(v, asha, { type: 'vote', pointId: risk });
    expect(attempt(v, asha, { type: 'vote', pointId: enterprise })).toEqual({ ok: false, error: 'You have used all 2 votes' });
    v = run(v, asha, { type: 'unvote', pointId: risk });
    expect(v.votes).toEqual([{ pointId: churn, voterId: asha }]);
    expect(attempt(v, asha, { type: 'unvote', pointId: risk })).toEqual({ ok: false, error: 'You have not voted for this point' });
    expect(attempt(v, asha, { type: 'vote', pointId: 'nope' })).toEqual({ ok: false, error: 'Point not found' });
  });

  it('closes voting, then moves to the decision', () => {
    const { s, fac, asha } = toVoting();
    expect(attempt(s, asha, { type: 'closeVoting' })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    expect(attempt(s, fac, { type: 'goToDecision' })).toEqual({ ok: false, error: 'Close voting first' });
    const closed = run(s, fac, { type: 'closeVoting' });
    expect(closed.votingClosed).toBe(true);
    expect(attempt(closed, asha, { type: 'vote', pointId: pointId(s, 'Migration risk') })).toEqual({ ok: false, error: 'Voting is not open' });
    expect(run(closed, fac, { type: 'goToDecision' }).status).toBe('decision');
  });

  it('skipping voting discards votes', () => {
    const { s, fac, asha } = toVoting();
    const voted = run(s, asha, { type: 'vote', pointId: pointId(s, 'Migration risk') });
    const skipped = run(voted, fac, { type: 'skipVoting' });
    expect(skipped).toMatchObject({ status: 'decision', votes: [], votingClosed: false });
  });
});

describe('decision and close', () => {
  function decision() {
    const { s, fac, asha } = toVoting();
    return { s: run(s, fac, { type: 'skipVoting' }), fac, asha };
  }

  it('records the decision and action items', () => {
    const { s, fac, asha } = decision();
    expect(attempt(s, asha, { type: 'setDecision', text: 'x' })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    let d = run(s, fac, { type: 'setDecision', text: '  Go ahead  ' });
    expect(d.decision).toBe('Go ahead');
    d = run(d, fac, { type: 'addAction', action: { text: 'Draft RFC', owner: 'Asha', due: '2026-10-21' } });
    d = run(d, fac, { type: 'addAction', action: { text: 'Tell support', owner: '' } });
    expect(d.actions).toEqual([
      { id: expect.any(String), text: 'Draft RFC', owner: 'Asha', due: '2026-10-21' },
      { id: expect.any(String), text: 'Tell support', owner: '' },
    ]);
    expect(attempt(d, fac, { type: 'addAction', action: { text: '', owner: '' } })).toEqual({ ok: false, error: "Action can't be empty" });
    expect(attempt(d, fac, { type: 'addAction', action: { text: 'x', owner: '', due: 'soon' } })).toEqual({ ok: false, error: 'Due date must be YYYY-MM-DD' });
    const removed = run(d, fac, { type: 'removeAction', actionId: d.actions[0]!.id });
    expect(removed.actions.map((a) => a.text)).toEqual(['Tell support']);
    expect(attempt(removed, fac, { type: 'removeAction', actionId: 'nope' })).toEqual({ ok: false, error: 'Action item not found' });
  });

  it('closes the session and makes it read-only', () => {
    const { s: voting, fac } = toVoting();
    expect(attempt(voting, fac, { type: 'closeSession' })).toEqual({ ok: false, error: 'Finish voting before closing the session' });
    const { s, fac: decidedFac } = decision();
    const closed = run(s, decidedFac, { type: 'closeSession' }, T0 + 99);
    expect(closed).toMatchObject({ status: 'closed', closedAt: T0 + 99 });
    expect(attempt(closed, decidedFac, { type: 'setDecision', text: 'late' })).toEqual({ ok: false, error: 'The session is not at the decision stage' });
  });
});

describe('scribe mode', () => {
  function scribing() {
    const { s: lobby, fac, asha, ravi } = makeSession(undefined, 'scribe');
    const withScribe = run(lobby, fac, { type: 'setScribe', participantId: ravi });
    return { s: run(withScribe, fac, { type: 'start' }), fac, asha, ravi };
  }

  it('lets the facilitator assign and reassign the scribe', () => {
    const { s: lobby, fac, asha } = makeSession(undefined, 'scribe');
    expect(attempt(lobby, asha, { type: 'setScribe', participantId: asha })).toEqual({ ok: false, error: 'Only the facilitator can do that' });
    expect(attempt(lobby, fac, { type: 'setScribe', participantId: 'nobody' })).toEqual({ ok: false, error: 'Participant not found' });
    const { s: running, fac: runningFac, asha: runningAsha } = scribing();
    expect(run(running, runningFac, { type: 'setScribe', participantId: runningAsha }).scribeId).toBe(runningAsha);
    const { s: everyone, fac: everyoneFac, asha: everyoneAsha } = makeSession();
    expect(attempt(everyone, everyoneFac, { type: 'setScribe', participantId: everyoneAsha })).toEqual({ ok: false, error: 'This session has no scribe' });
  });

  it('lets only the scribe write, crediting the speaker', () => {
    const { s, fac, asha, ravi } = scribing();
    expect(attempt(s, asha, { type: 'addPoint', text: 'mine' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    expect(attempt(s, fac, { type: 'addPoint', text: 'mine' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    let notes = run(s, ravi, { type: 'addPoint', text: 'Pilot first', saidBy: asha });
    notes = run(notes, ravi, { type: 'addPoint', text: 'Agreed by all' });
    expect(notes.points.map((p) => [p.text, p.authorId, p.saidBy])).toEqual([
      ['Pilot first', ravi, asha],
      ['Agreed by all', ravi, undefined],
    ]);
    expect(attempt(s, ravi, { type: 'addPoint', text: 'x', saidBy: 'nobody' })).toEqual({ ok: false, error: 'Unknown participant for "said by"' });
  });

  it('lets the current scribe edit and delete any note in the step, even after a handover', () => {
    const { s: base, fac, asha, ravi } = scribing();
    const s = run(base, ravi, { type: 'addPoint', text: 'draft', saidBy: asha });
    const id = pointId(s, 'draft');
    const handedOver = run(s, fac, { type: 'setScribe', participantId: asha });
    expect(attempt(handedOver, ravi, { type: 'editPoint', pointId: id, text: 'x' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    const edited = run(handedOver, asha, { type: 'editPoint', pointId: id, text: 'final' });
    expect(edited.points[0]).toMatchObject({ text: 'final' });
    expect(edited.points[0]!.saidBy).toBeUndefined();
    expect(run(edited, asha, { type: 'deletePoint', pointId: id }).points).toEqual([]);
  });

  it('allows up to 200 notes per step', () => {
    const { s, ravi } = scribing();
    let full = s;
    for (let i = 0; i < 200; i++) full = run(full, ravi, { type: 'addPoint', text: `n${i}` });
    expect(attempt(full, ravi, { type: 'addPoint', text: 'one more' })).toEqual({ ok: false, error: 'You can add at most 200 notes per step' });
  });
});
