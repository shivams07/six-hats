import { startServer } from './server.js';

const passcode = process.env.TEAM_PASSCODE;
if (!passcode) {
  console.error('TEAM_PASSCODE must be set');
  process.exit(1);
}

const server = await startServer({
  passcode,
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? './data',
  webDir: process.env.WEB_DIR,
});
console.log(`Six Hats listening on :${server.port}`);

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
