import type { View, ViewPoint } from '@shared/protocol';
import { creditedName, rankByVotes } from '@shared/rules';

export function pointsForStep(view: View, index: number): ViewPoint[] {
  return view.points.filter((p) => p.stepIndex === index).sort((a, b) => a.createdAt - b.createdAt);
}

export function topVoted(view: View): ViewPoint[] {
  return rankByVotes(view.points, (p) => p.votes ?? 0);
}

export const creditOf = (view: View, p: ViewPoint) => creditedName(view.mode, p.authorName, p.saidByName);

export const scribeName = (view: View) => view.participants.find((p) => p.id === view.scribeId)?.name;
