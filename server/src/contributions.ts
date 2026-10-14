import { LIMITS } from '../../shared/src/hats.js';
import { canWrite } from '../../shared/src/rules.js';
import { LOCKED } from './flow.js';
import type { HandlerMap, Participant, Point, Session } from './session.js';
import { cleanText, validateDue, type Check } from './validate.js';

const VOTING_NOT_OPEN = 'Voting is not open';
const NOT_DECISION = 'The session is not at the decision stage';
const SCRIBE_ONLY = 'Only the scribe takes notes in this session';

/** Everyone writes in everyone-writes mode; only the current scribe writes in scribe mode. */
const writesHere = (s: Session, actor: Participant) => s.mode === 'everyone' || s.scribeId === actor.id;

/** Scribe mode: the participant a note is credited to; undefined means "Team". */
function saidByOf(s: Session, raw: unknown): Check<string | undefined> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: undefined };
  if (typeof raw === 'string' && s.participants.some((p) => p.id === raw)) return { ok: true, value: raw };
  return { ok: false, error: 'Unknown participant for "said by"' };
}

/** A current-step point the actor may change (their own, or any note for the scribe), or the reason they can't. */
function editableCurrentPoint(s: Session, actor: Participant, pointId: string): Point | string {
  if (!writesHere(s, actor)) return SCRIBE_ONLY;
  const point = s.points.find((p) => p.id === pointId);
  if (!point || (s.mode === 'everyone' && point.authorId !== actor.id)) return 'Point not found';
  if (point.stepIndex !== s.currentStep || !canWrite(s)) return LOCKED;
  return point;
}

export const CONTRIBUTION_HANDLERS: HandlerMap<
  | 'setScribe' | 'addPoint' | 'editPoint' | 'deletePoint' | 'vote' | 'unvote' | 'closeVoting' | 'skipVoting'
  | 'goToDecision' | 'setDecision' | 'addAction' | 'removeAction' | 'closeSession'
> = {
  setScribe: (s, _actor, cmd) => {
    if (s.mode !== 'scribe') return 'This session has no scribe';
    if (s.status !== 'lobby' && s.status !== 'running') return 'The scribe can no longer be changed';
    if (!s.participants.some((p) => p.id === cmd.participantId)) return 'Participant not found';
    s.scribeId = cmd.participantId;
  },
  addPoint: (s, actor, cmd, ctx) => {
    if (!canWrite(s)) return LOCKED;
    if (!writesHere(s, actor)) return SCRIBE_ONLY;
    const text = cleanText(cmd.text, 'Point', LIMITS.point);
    if (!text.ok) return text.error;
    const scribe = s.mode === 'scribe';
    const saidBy = scribe ? saidByOf(s, cmd.saidBy) : { ok: true as const, value: undefined };
    if (!saidBy.ok) return saidBy.error;
    const cap = scribe ? LIMITS.maxScribeNotesPerStep : LIMITS.maxPointsPerStep;
    const count = s.points.filter((p) => p.stepIndex === s.currentStep && (scribe || p.authorId === actor.id)).length;
    if (count >= cap) return `You can add at most ${cap} ${scribe ? 'notes' : 'points'} per step`;
    s.points.push({
      id: ctx.newId(),
      stepIndex: s.currentStep,
      authorId: actor.id,
      ...(saidBy.value ? { saidBy: saidBy.value } : {}),
      text: text.value,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  },
  editPoint: (s, actor, cmd, ctx) => {
    const point = editableCurrentPoint(s, actor, cmd.pointId);
    if (typeof point === 'string') return point;
    const text = cleanText(cmd.text, 'Point', LIMITS.point);
    if (!text.ok) return text.error;
    if (s.mode === 'scribe') {
      const saidBy = saidByOf(s, cmd.saidBy);
      if (!saidBy.ok) return saidBy.error;
      if (saidBy.value) point.saidBy = saidBy.value;
      else delete point.saidBy;
    }
    point.text = text.value;
    point.updatedAt = ctx.now;
  },
  deletePoint: (s, actor, cmd) => {
    if (s.status !== 'running') return 'Points can no longer be deleted';
    if (actor.isFacilitator) {
      if (!s.points.some((p) => p.id === cmd.pointId)) return 'Point not found';
    } else {
      const point = editableCurrentPoint(s, actor, cmd.pointId);
      if (typeof point === 'string') return point;
    }
    s.points = s.points.filter((p) => p.id !== cmd.pointId);
  },
  vote: (s, actor, cmd) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    if (!s.points.some((p) => p.id === cmd.pointId)) return 'Point not found';
    const mine = s.votes.filter((v) => v.voterId === actor.id);
    if (mine.some((v) => v.pointId === cmd.pointId)) return 'You already voted for this point';
    if (mine.length >= s.votesPerPerson) return `You have used all ${s.votesPerPerson} votes`;
    s.votes.push({ pointId: cmd.pointId, voterId: actor.id });
  },
  unvote: (s, actor, cmd) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    const before = s.votes.length;
    s.votes = s.votes.filter((v) => !(v.pointId === cmd.pointId && v.voterId === actor.id));
    if (s.votes.length === before) return 'You have not voted for this point';
  },
  closeVoting: (s) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    s.votingClosed = true;
  },
  skipVoting: (s) => {
    if (s.status !== 'voting' || s.votingClosed) return VOTING_NOT_OPEN;
    s.votes = [];
    s.status = 'decision';
  },
  goToDecision: (s) => {
    if (s.status !== 'voting' || !s.votingClosed) return 'Close voting first';
    s.status = 'decision';
  },
  setDecision: (s, _actor, cmd) => {
    if (s.status !== 'decision') return NOT_DECISION;
    const text = cleanText(cmd.text, 'Decision', LIMITS.decision, true);
    if (!text.ok) return text.error;
    s.decision = text.value;
  },
  addAction: (s, _actor, cmd, ctx) => {
    if (s.status !== 'decision') return NOT_DECISION;
    if (s.actions.length >= LIMITS.maxActions) return `You can add at most ${LIMITS.maxActions} action items`;
    const raw = (typeof cmd.action === 'object' && cmd.action !== null ? cmd.action : {}) as Record<string, unknown>;
    const text = cleanText(raw.text, 'Action', LIMITS.actionText);
    if (!text.ok) return text.error;
    const owner = cleanText(raw.owner, 'Owner', LIMITS.actionOwner, true);
    if (!owner.ok) return owner.error;
    const due = validateDue(raw.due);
    if (!due.ok) return due.error;
    s.actions.push({ id: ctx.newId(), text: text.value, owner: owner.value, ...(due.value ? { due: due.value } : {}) });
  },
  removeAction: (s, _actor, cmd) => {
    if (s.status !== 'decision') return NOT_DECISION;
    const before = s.actions.length;
    s.actions = s.actions.filter((a) => a.id !== cmd.actionId);
    if (s.actions.length === before) return 'Action item not found';
  },
  closeSession: (s, _actor, _cmd, ctx) => {
    if (s.status !== 'decision') return 'Finish voting before closing the session';
    s.status = 'closed';
    s.closedAt = ctx.now;
  },
};
