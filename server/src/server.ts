import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { SessionService } from './sessions.js';
import { Store } from './store.js';
import { Timers } from './timers.js';

export interface ServerOptions {
  passcode: string;
  dataDir: string;
  port: number;
  webDir?: string;
  clock?: () => number;
  trustProxy?: boolean | number;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export async function startServer({ passcode, dataDir, port, webDir, clock = Date.now, trustProxy }: ServerOptions): Promise<RunningServer> {
  mkdirSync(dataDir, { recursive: true });
  const store = new Store(join(dataDir, 'six-hats.db'));
  const service = new SessionService(store, clock);
  const timers = new Timers(service, clock);
  service.subscribe((s) => timers.sync(s));
  for (const s of service.loadLive()) timers.sync(s);

  const http = createServer(createApp({ service, store, passcode, webDir, clock, trustProxy }));
  const io = new Server(http, { serveClient: false, maxHttpBufferSize: 64 * 1024 });
  attachRealtime(io, service, clock);

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  return {
    port: typeof address === 'object' && address !== null ? address.port : port,
    close: async () => {
      timers.stopAll();
      await io.close();
      store.close();
    },
  };
}
