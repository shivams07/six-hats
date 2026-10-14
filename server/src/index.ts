import { startServer } from './server.js';

const passcode = process.env.TEAM_PASSCODE;
if (!passcode) {
  console.error('TEAM_PASSCODE must be set');
  process.exit(1);
}

const parseTrustProxy = (raw: string | undefined): boolean | number => {
  if (raw === 'true') return true;
  const hops = Number(raw);
  return raw && Number.isInteger(hops) && hops >= 0 ? hops : false;
};

const server = await startServer({
  passcode,
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? './data',
  webDir: process.env.WEB_DIR,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
});
console.log(`Six Hats listening on :${server.port}`);

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
