import type { View, ViewPoint } from '../../shared/src/protocol.js';
import { isStepRevealed } from '../../shared/src/rules.js';
import type { Session } from './session.js';

/** The only projection of a session that may leave the server over the socket. */
export function buildView(s: Session, viewerId: string, online: ReadonlySet<string>, now: number): View {
  const me = s.participants.find((p) => p.id === viewerId);
  if (!me) throw new Error(`Viewer ${viewerId} is not in session ${s.id}`);

  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const voteCounts = new Map<string, number>();
  if (s.votingClosed) for (const v of s.votes) voteCounts.set(v.pointId, (voteCounts.get(v.pointId) ?? 0) + 1);

  const points: ViewPoint[] = s.points
    .filter((p) => p.authorId === viewerId || s.mode === 'scribe' || isStepRevealed(s, p.stepIndex))
    .map((p) => ({
      id: p.id,
      stepIndex: p.stepIndex,
      authorId: p.authorId,
      authorName: names.get(p.authorId) ?? 'Someone',
      ...(p.saidBy ? { saidById: p.saidBy, saidByName: names.get(p.saidBy) ?? 'Someone' } : {}),
      text: p.text,
      createdAt: p.createdAt,
      ...(s.votingClosed ? { votes: voteCounts.get(p.id) ?? 0 } : {}),
    }));

  const view: View = {
    id: s.id,
    code: s.code,
    title: s.title,
    focus: s.focus,
    status: s.status,
    createdAt: s.createdAt,
    ...(s.closedAt !== undefined ? { closedAt: s.closedAt } : {}),
    mode: s.mode,
    ...(s.scribeId !== undefined ? { scribeId: s.scribeId } : {}),
    steps: s.steps,
    currentStep: s.currentStep,
    phase: s.phase,
    ...(s.endsAt !== undefined ? { endsAt: s.endsAt } : {}),
    ...(s.remainingMs !== undefined ? { remainingMs: s.remainingMs } : {}),
    me: { id: me.id, name: me.name, isFacilitator: me.isFacilitator },
    participants: s.participants.map((p) => ({ id: p.id, name: p.name, isFacilitator: p.isFacilitator, online: online.has(p.id) })),
    points,
    votesPerPerson: s.votesPerPerson,
    votingClosed: s.votingClosed,
    myVotes: s.votes.filter((v) => v.voterId === viewerId).map((v) => v.pointId),
    decision: s.decision,
    actions: s.actions,
    serverNow: now,
  };

  if (me.isFacilitator && s.status === 'running' && s.mode === 'everyone') {
    view.currentStepCounts = Object.fromEntries(
      s.participants.map((p) => [p.id, s.points.filter((pt) => pt.stepIndex === s.currentStep && pt.authorId === p.id).length]),
    );
  }
  return view;
}
