import type { Server, Socket } from 'socket.io';
import type { CommandAck } from '../../shared/src/protocol.js';
import { SlidingWindow } from './auth.js';
import type { AnyCommand } from './engine.js';
import type { Session } from './session.js';
import type { SessionService } from './sessions.js';
import { buildView } from './views.js';

interface SocketData {
  sessionId: string;
  participantId: string;
  limiter: SlidingWindow;
}

export function attachRealtime(io: Server, service: SessionService, clock: () => number = Date.now): void {
  const rooms = new Map<string, Set<Socket>>();
  const dataOf = (socket: Socket) => socket.data as SocketData;

  const broadcast = (s: Session): void => {
    const sockets = rooms.get(s.id);
    if (!sockets) return;
    const online = new Set([...sockets].map((sock) => dataOf(sock).participantId));
    const now = clock();
    for (const sock of sockets) sock.emit('state', buildView(s, dataOf(sock).participantId, online, now));
  };

  service.subscribe(broadcast);

  io.use((socket, next) => {
    const { code, token } = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const auth = service.authenticate(code, token);
    if (!auth.ok) return next(new Error(auth.error));
    const data: SocketData = { sessionId: auth.session.id, participantId: auth.participant.id, limiter: new SlidingWindow(20, 10_000, clock) };
    socket.data = data;
    next();
  });

  io.on('connection', (socket) => {
    const { sessionId, participantId, limiter } = dataOf(socket);
    const room = rooms.get(sessionId) ?? new Set<Socket>();
    rooms.set(sessionId, room);
    room.add(socket);
    const current = service.get(sessionId);
    if (current) broadcast(current);

    socket.on('command', (cmd: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      const reply = ack as (result: CommandAck) => void;
      if (!limiter.tryTake()) return reply({ ok: false, error: 'Slow down' });
      reply(service.dispatch(sessionId, participantId, cmd as AnyCommand));
    });

    socket.on('disconnect', () => {
      room.delete(socket);
      if (room.size === 0) rooms.delete(sessionId);
      const latest = service.get(sessionId);
      if (latest) broadcast(latest);
    });
  });
}
