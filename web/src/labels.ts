import type { SessionStatus } from '@shared/protocol';

export const STATUS_LABELS: Record<SessionStatus, string> = {
  lobby: 'Lobby',
  running: 'In progress',
  voting: 'Voting',
  decision: 'Decision',
  closed: 'Closed',
};
