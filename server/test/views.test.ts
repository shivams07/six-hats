import { describe, expect, it } from 'vitest';
import type { SessionStatus, StepPhase } from '../../shared/src/protocol.js';
import { isStepRevealed } from '../../shared/src/rules.js';
import type { Session } from '../src/session.js';
import { buildView } from '../src/views.js';
import { makeSession, pointId, run, T0, toVoting } from './fixtures.js';

const NOBODY = new Set<string>();

function writingWithPoints() {
  const { s: lobby, fac, asha, ravi } = makeSession();
  let s = run(lobby, fac, { type: 'start' });
  s = run(s, asha, { type: 'addPoint', text: 'asha idea' });
  s = run(s, ravi, { type: 'addPoint', text: 'ravi idea 1' });
  s = run(s, ravi, { type: 'addPoint', text: 'ravi idea 2' });
  return { s, fac, asha, ravi };
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('buildView', () => {
  it('shows a participant only their own points before the reveal', () => {
    const { s, ravi } = writingWithPoints();
    const view = buildView(s, ravi, NOBODY, T0);
    expect(view.points.map((p) => p.text)).toEqual(['ravi idea 1', 'ravi idea 2']);
    expect(view.currentStepCounts).toBeUndefined();
  });

  it('gives the facilitator counts, not text', () => {
    const { s, fac, asha, ravi } = writingWithPoints();
    const view = buildView(s, fac, NOBODY, T0);
    expect(view.points).toEqual([]);
    expect(view.currentStepCounts).toEqual({ [fac]: 0, [asha]: 1, [ravi]: 2 });
    expect(view.me).toEqual({ id: fac, name: 'Fac', isFacilitator: true });
  });

  it('shows everyone every point with author names after the reveal', () => {
    const { s: base, fac, asha } = writingWithPoints();
    const s = run(base, fac, { type: 'revealNow' });
    const view = buildView(s, asha, NOBODY, T0);
    expect(view.points.map((p) => `${p.authorName}: ${p.text}`)).toEqual(['Asha: asha idea', 'Ravi: ravi idea 1', 'Ravi: ravi idea 2']);
  });

  it('shows scribe notes to everyone as they are written, credited to the speaker', () => {
    const { s: lobby, fac, asha, ravi } = makeSession(undefined, 'scribe');
    let s = run(run(lobby, fac, { type: 'setScribe', participantId: ravi }), fac, { type: 'start' });
    s = run(s, ravi, { type: 'addPoint', text: 'Pilot first', saidBy: asha });
    s = run(s, ravi, { type: 'addPoint', text: 'Agreed by all' });
    const ashasView = buildView(s, asha, NOBODY, T0);
    expect(ashasView).toMatchObject({ mode: 'scribe', scribeId: ravi, phase: 'writing' });
    expect(ashasView.points.map((p) => [p.text, p.authorName, p.saidByName])).toEqual([
      ['Pilot first', 'Ravi', 'Asha'],
      ['Agreed by all', 'Ravi', undefined],
    ]);
    expect(buildView(s, fac, NOBODY, T0).currentStepCounts).toBeUndefined();
  });

  it('hides vote totals until voting closes', () => {
    const { s: voting, fac, asha, ravi } = toVoting();
    const churn = pointId(voting, 'Churn is 4% monthly');
    const voted = run(voting, asha, { type: 'vote', pointId: churn });
    expect(buildView(voted, asha, NOBODY, T0).myVotes).toEqual([churn]);
    const ravisView = buildView(voted, ravi, NOBODY, T0);
    expect(ravisView.myVotes).toEqual([]);
    expect(ravisView.points.every((p) => p.votes === undefined)).toBe(true);
    const closed = run(voted, fac, { type: 'closeVoting' });
    expect(buildView(closed, ravi, NOBODY, T0).points.find((p) => p.id === churn)?.votes).toBe(1);
  });

  it('marks who is online and carries the server time', () => {
    const { s, asha } = makeSession();
    const view = buildView(s, asha, new Set([asha]), T0 + 7);
    expect(view.participants.map((p) => [p.name, p.online])).toEqual([['Fac', false], ['Asha', true], ['Ravi', false]]);
    expect(view.serverNow).toBe(T0 + 7);
  });

  it('never leaks another person\'s unrevealed point or any token hash', () => {
    const rand = mulberry32(42);
    const statuses: SessionStatus[] = ['lobby', 'running', 'voting', 'decision', 'closed'];
    const phases: StepPhase[] = ['writing', 'paused', 'revealed'];
    const { s: base } = makeSession();
    for (let trial = 0; trial < 300; trial++) {
      const s: Session = {
        ...base,
        status: statuses[Math.floor(rand() * statuses.length)]!,
        currentStep: Math.floor(rand() * 2),
        phase: phases[Math.floor(rand() * phases.length)]!,
        points: Array.from({ length: 12 }, (_, i) => ({
          id: `p${i}`,
          stepIndex: Math.floor(rand() * 2),
          authorId: base.participants[Math.floor(rand() * 3)]!.id,
          text: `t${i}`,
          createdAt: T0 + i,
          updatedAt: T0 + i,
        })),
      };
      for (const viewer of s.participants) {
        const view = buildView(s, viewer.id, NOBODY, T0);
        for (const p of view.points) expect(p.authorId === viewer.id || isStepRevealed(s, p.stepIndex)).toBe(true);
        expect(JSON.stringify(view)).not.toMatch(/hash/i);
      }
    }
  });

  it('refuses a viewer who is not in the session', () => {
    const { s } = makeSession();
    expect(() => buildView(s, 'stranger', NOBODY, T0)).toThrow('Viewer stranger is not in session session-1');
  });
});
