import type { Server, Socket } from 'socket.io';
import { describe, expect, it, vi } from 'vitest';
import { attachRealtime } from '../src/realtime.js';
import type { SessionService } from '../src/sessions.js';

describe('attachRealtime', () => {
  it('rejects the handshake instead of crashing when authentication throws', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let middleware: ((socket: Socket, next: (err?: Error) => void) => void) | undefined;
    const io = { use: (fn: typeof middleware) => (middleware = fn), on: vi.fn() } as unknown as Server;
    const service = {
      subscribe: vi.fn(),
      authenticate: () => {
        throw new Error('corrupt session document');
      },
    } as unknown as SessionService;
    attachRealtime(io, service);
    const next = vi.fn();
    expect(() => middleware!({ handshake: { auth: { code: 'ABC234', token: 't' } } } as Socket, next)).not.toThrow();
    expect(next).toHaveBeenCalledWith(new Error('session_not_found'));
    expect(log).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    log.mockRestore();
  });
});
