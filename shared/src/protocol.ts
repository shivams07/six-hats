import type { FlowStep } from './hats.js';

export type SessionStatus = 'lobby' | 'running' | 'voting' | 'decision' | 'closed';
export type StepPhase = 'writing' | 'paused' | 'revealed';
export type WritingMode = 'everyone' | 'scribe';

export interface ActionItem {
  id: string;
  text: string;
  owner: string;
  due?: string;
}

export interface NewActionItem {
  text: string;
  owner: string;
  due?: string;
}

export type Command =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'addTime' }
  | { type: 'revealNow' }
  | { type: 'skipStep' }
  | { type: 'nextStep' }
  | { type: 'editUpcomingSteps'; steps: FlowStep[] }
  | { type: 'setScribe'; participantId: string }
  /** `saidBy` (a participant id) is used only in scribe mode; omitted means "Team". */
  | { type: 'addPoint'; text: string; saidBy?: string }
  | { type: 'editPoint'; pointId: string; text: string; saidBy?: string }
  | { type: 'deletePoint'; pointId: string }
  | { type: 'vote'; pointId: string }
  | { type: 'unvote'; pointId: string }
  | { type: 'closeVoting' }
  | { type: 'skipVoting' }
  | { type: 'goToDecision' }
  | { type: 'setDecision'; text: string }
  | { type: 'addAction'; action: NewActionItem }
  | { type: 'removeAction'; actionId: string }
  | { type: 'closeSession' };

export type CommandAck = { ok: true } | { ok: false; error: string };

export interface ViewParticipant {
  id: string;
  name: string;
  isFacilitator: boolean;
  online: boolean;
}

export interface ViewPoint {
  id: string;
  stepIndex: number;
  authorId: string;
  authorName: string;
  /** Scribe mode only: who the note is credited to. */
  saidById?: string;
  saidByName?: string;
  text: string;
  createdAt: number;
  /** Present only once voting is closed. */
  votes?: number;
}

export interface View {
  id: string;
  code: string;
  title: string;
  focus: string;
  status: SessionStatus;
  createdAt: number;
  closedAt?: number;
  mode: WritingMode;
  scribeId?: string;
  steps: FlowStep[];
  currentStep: number;
  phase: StepPhase | null;
  endsAt?: number;
  remainingMs?: number;
  me: { id: string; name: string; isFacilitator: boolean };
  participants: ViewParticipant[];
  points: ViewPoint[];
  votesPerPerson: number;
  votingClosed: boolean;
  myVotes: string[];
  decision: string;
  actions: ActionItem[];
  /** Facilitator only, everyone-writes mode, while running: points per participant in the current step. */
  currentStepCounts?: Record<string, number>;
  serverNow: number;
}

export interface CreateSessionInput {
  title: string;
  focus: string;
  facilitatorName: string;
  votesPerPerson: number;
  mode: WritingMode;
  steps: FlowStep[];
}

export interface CreateSessionResult {
  code: string;
  facilitatorToken: string;
}

export interface JoinResult {
  participantId: string;
  token: string;
}

export interface SessionSummary {
  id: string;
  code: string;
  title: string;
  status: SessionStatus;
  createdAt: number;
  closedAt?: number;
  participantCount: number;
}

export interface Template {
  id: string;
  name: string;
  steps: FlowStep[];
  createdAt: number;
}

export const SOCKET_ERRORS = { notFound: 'session_not_found', invalidToken: 'invalid_token' } as const;
export type SocketError = (typeof SOCKET_ERRORS)[keyof typeof SOCKET_ERRORS];
