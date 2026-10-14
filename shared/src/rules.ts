import type { SessionStatus, StepPhase, WritingMode } from './protocol.js';

export interface StepState {
  status: SessionStatus;
  currentStep: number;
  phase: StepPhase | null;
}

export function isStepRevealed(s: StepState, index: number): boolean {
  if (s.status === 'lobby') return false;
  if (s.status !== 'running') return true;
  return index < s.currentStep || (index === s.currentStep && s.phase === 'revealed');
}

export function canWrite(s: StepState): boolean {
  return s.status === 'running' && (s.phase === 'writing' || s.phase === 'paused');
}

export function rankByVotes<T extends { stepIndex: number; createdAt: number }>(points: T[], votes: (p: T) => number): T[] {
  return points
    .filter((p) => votes(p) > 0)
    .sort((a, b) => votes(b) - votes(a) || a.stepIndex - b.stepIndex || a.createdAt - b.createdAt);
}

/** Who a point is credited to: its author, or in scribe mode the participant who said it (else the team). */
export function creditedName(mode: WritingMode, authorName: string, saidByName?: string): string {
  return mode === 'scribe' ? (saidByName ?? 'Team') : authorName;
}
