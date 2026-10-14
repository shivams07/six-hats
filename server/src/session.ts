import type { FlowStep } from '../../shared/src/hats.js';
import type { ActionItem, Command, SessionStatus, StepPhase, WritingMode } from '../../shared/src/protocol.js';

export interface Participant {
  id: string;
  name: string;
  isFacilitator: boolean;
  tokenHashes: string[];
  joinedAt: number;
}

export interface Point {
  id: string;
  stepIndex: number;
  authorId: string;
  /** Scribe mode: the participant the note is credited to; absent means "Team". */
  saidBy?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface Vote {
  pointId: string;
  voterId: string;
}

export interface Session {
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
  /** -1 in the lobby. */
  currentStep: number;
  phase: StepPhase | null;
  endsAt?: number;
  remainingMs?: number;
  participants: Participant[];
  points: Point[];
  votes: Vote[];
  votesPerPerson: number;
  votingClosed: boolean;
  decision: string;
  actions: ActionItem[];
}

export interface Ctx {
  now: number;
  newId: () => string;
}

/** Mutates the (already cloned) session; returns an error message to reject. */
export type Handler<C extends Command> = (s: Session, actor: Participant, cmd: C, ctx: Ctx) => string | void;

export type HandlerMap<K extends Command['type']> = { [T in K]: Handler<Extract<Command, { type: T }>> };
