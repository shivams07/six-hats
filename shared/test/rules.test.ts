import { describe, expect, it } from 'vitest';
import { canWrite, creditedName, isStepRevealed, rankByVotes } from '../src/rules.js';

describe('isStepRevealed', () => {
  it('reveals nothing in the lobby', () => {
    expect(isStepRevealed({ status: 'lobby', currentStep: -1, phase: null }, 0)).toBe(false);
  });

  it('reveals earlier steps, and the current one only once revealed', () => {
    const writing = { status: 'running', currentStep: 1, phase: 'writing' } as const;
    expect(isStepRevealed(writing, 0)).toBe(true);
    expect(isStepRevealed(writing, 1)).toBe(false);
    expect(isStepRevealed(writing, 2)).toBe(false);
    expect(isStepRevealed({ ...writing, phase: 'revealed' as const }, 1)).toBe(true);
  });

  it('reveals every step once the steps are over', () => {
    expect(isStepRevealed({ status: 'voting', currentStep: 1, phase: null }, 1)).toBe(true);
    expect(isStepRevealed({ status: 'closed', currentStep: 1, phase: null }, 0)).toBe(true);
  });
});

describe('canWrite', () => {
  it('allows writing while a step is writing or paused', () => {
    expect(canWrite({ status: 'running', currentStep: 0, phase: 'writing' })).toBe(true);
    expect(canWrite({ status: 'running', currentStep: 0, phase: 'paused' })).toBe(true);
    expect(canWrite({ status: 'running', currentStep: 0, phase: 'revealed' })).toBe(false);
    expect(canWrite({ status: 'lobby', currentStep: -1, phase: null })).toBe(false);
  });
});

describe('rankByVotes', () => {
  it('drops unvoted points and breaks ties by step then time', () => {
    const points = [
      { id: 'a', stepIndex: 1, createdAt: 1 },
      { id: 'b', stepIndex: 0, createdAt: 2 },
      { id: 'c', stepIndex: 0, createdAt: 1 },
      { id: 'd', stepIndex: 0, createdAt: 0 },
    ];
    const votes: Record<string, number> = { a: 2, b: 2, c: 3, d: 0 };
    expect(rankByVotes(points, (p) => votes[p.id] ?? 0).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('creditedName', () => {
  it('credits the author, or in scribe mode the speaker or the team', () => {
    expect(creditedName('everyone', 'Asha')).toBe('Asha');
    expect(creditedName('everyone', 'Asha', 'Ravi')).toBe('Asha');
    expect(creditedName('scribe', 'Ravi', 'Asha')).toBe('Asha');
    expect(creditedName('scribe', 'Ravi')).toBe('Team');
  });
});
