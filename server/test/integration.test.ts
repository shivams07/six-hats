import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Command, CommandAck, View, WritingMode } from '../../shared/src/protocol.js';
import { startServer, type RunningServer } from '../src/server.js';

const PASSCODE = 'team-secret';
let skew = 0;
const clock = () => Date.now() + skew;
let dir: string;
let server: RunningServer;
const clients: Client[] = [];

class Client {
  readonly socket: Socket;
  last: View | undefined;

  constructor(port: number, code: string, token: string) {
    this.socket = io(`http://127.0.0.1:${port}`, { auth: { code, token }, transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('state', (v: View) => {
      this.last = v;
    });
    clients.push(this);
  }

  /** Resolves with the latest state matching `predicate`, waiting for new states if needed. */
  wait(predicate: (v: View) => boolean, timeoutMs = 5_000): Promise<View> {
    if (this.last && predicate(this.last)) return Promise.resolve(this.last);
    return new Promise((resolve, reject) => {
      const onState = (v: View) => {
        if (!predicate(v)) return;
        clearTimeout(timer);
        this.socket.off('state', onState);
        resolve(v);
      };
      const timer = setTimeout(() => {
        this.socket.off('state', onState);
        reject(new Error('Timed out waiting for state'));
      }, timeoutMs);
      this.socket.on('state', onState);
    });
  }

  send(cmd: Command): Promise<CommandAck> {
    return this.socket.timeout(5_000).emitWithAck('command', cmd);
  }
}

async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

const createSession = (mode: WritingMode = 'everyone') =>
  post<{ code: string; facilitatorToken: string }>(
    '/api/sessions',
    { title: 'Sandbox', focus: 'Should we build a sandbox?', facilitatorName: 'Fac', votesPerPerson: 3, mode, steps: [{ hat: 'green', durationSec: 60 }] },
    { 'x-team-passcode': PASSCODE },
  );
const join = (code: string, name: string) => post<{ participantId: string; token: string }>(`/api/sessions/${code}/join`, { name });

beforeEach(async () => {
  skew = 0;
  dir = mkdtempSync(joinPath(tmpdir(), 'six-hats-int-'));
  server = await startServer({ passcode: PASSCODE, dataDir: dir, port: 0, clock });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('live session', () => {
  it('runs a full session from lobby to Markdown summary', async () => {
    const { code, facilitatorToken } = await createSession();
    const asha = await join(code, 'Asha');
    const ravi = await join(code, 'Ravi');
    const fac = new Client(server.port, code, facilitatorToken);
    const a = new Client(server.port, code, asha.token);
    const r = new Client(server.port, code, ravi.token);
    await fac.wait((v) => v.participants.every((p) => p.online));

    const writing = r.wait((v) => v.phase === 'writing');
    expect(await fac.send({ type: 'start' })).toEqual({ ok: true });
    await writing;

    expect(await a.send({ type: 'addPoint', text: 'Build a sandbox' })).toEqual({ ok: true });
    expect(await r.send({ type: 'addPoint', text: 'Ask customers first' })).toEqual({ ok: true });
    const ravisView = await r.wait((v) => v.points.length > 0);
    expect(ravisView.points.map((p) => p.text)).toEqual(['Ask customers first']);
    const facView = await fac.wait((v) => v.currentStepCounts?.[ravi.participantId] === 1);
    expect(facView.points).toEqual([]);
    expect(facView.currentStepCounts?.[asha.participantId]).toBe(1);

    // Move the server clock to just before 0:00; the next state change re-arms the timer with ~300 ms left.
    const revealed = r.wait((v) => v.phase === 'revealed');
    skew = 59_700;
    expect(await fac.send({ type: 'addPoint', text: 'Time-box it' })).toEqual({ ok: true });
    expect((await revealed).points.map((p) => p.text).sort()).toEqual(['Ask customers first', 'Build a sandbox', 'Time-box it']);
    expect(await a.send({ type: 'addPoint', text: 'Too late' })).toEqual({ ok: false, error: 'Writing is locked for this step' });

    const voting = a.wait((v) => v.status === 'voting');
    await fac.send({ type: 'nextStep' });
    const sandbox = (await voting).points.find((p) => p.text === 'Build a sandbox')!.id;
    expect(await a.send({ type: 'vote', pointId: sandbox })).toEqual({ ok: true });
    expect(await r.send({ type: 'vote', pointId: sandbox })).toEqual({ ok: true });
    const counted = a.wait((v) => v.votingClosed);
    await fac.send({ type: 'closeVoting' });
    expect((await counted).points.find((p) => p.id === sandbox)?.votes).toBe(2);

    await fac.send({ type: 'goToDecision' });
    await fac.send({ type: 'setDecision', text: 'Build the sandbox' });
    await fac.send({ type: 'addAction', action: { text: 'Spike it', owner: 'Asha', due: '2026-10-21' } });
    const ended = r.wait((v) => v.status === 'closed');
    expect(await fac.send({ type: 'closeSession' })).toEqual({ ok: true });
    await ended;

    const res = await fetch(`http://127.0.0.1:${server.port}/api/sessions/${code}/summary.md`, { headers: { 'x-session-token': ravi.token } });
    const md = await res.text();
    expect(md).toContain('## Decision\nBuild the sandbox');
    expect(md).toContain('1. (2 votes) [Green] Build a sandbox — Asha');
    expect(md).toContain('- [ ] Spike it — **Asha** — due 2026-10-21');
  });

  it('lets only the scribe write in scribe mode and shares notes live', async () => {
    const { code, facilitatorToken } = await createSession('scribe');
    const asha = await join(code, 'Asha');
    const ravi = await join(code, 'Ravi');
    const fac = new Client(server.port, code, facilitatorToken);
    const a = new Client(server.port, code, asha.token);
    const r = new Client(server.port, code, ravi.token);
    await fac.wait((v) => v.participants.every((p) => p.online));

    expect(await fac.send({ type: 'start' })).toEqual({ ok: false, error: 'Choose a scribe before starting' });
    expect(await fac.send({ type: 'setScribe', participantId: ravi.participantId })).toEqual({ ok: true });
    const writing = a.wait((v) => v.phase === 'writing');
    expect(await fac.send({ type: 'start' })).toEqual({ ok: true });
    await writing;

    expect(await a.send({ type: 'addPoint', text: 'Mine' })).toEqual({ ok: false, error: 'Only the scribe takes notes in this session' });
    const shared = a.wait((v) => v.points.length === 1);
    expect(await r.send({ type: 'addPoint', text: 'Pilot first', saidBy: asha.participantId })).toEqual({ ok: true });
    const view = await shared;
    expect(view.phase).toBe('writing');
    expect(view.points[0]).toMatchObject({ text: 'Pilot first', authorName: 'Ravi', saidByName: 'Asha' });
  });

  it('refuses a socket with a wrong token', async () => {
    const { code } = await createSession();
    const bad = new Client(server.port, code, 'not-a-token');
    const err = await new Promise<Error>((resolve) => bad.socket.on('connect_error', resolve));
    expect(err.message).toBe('invalid_token');
  });

  it('resumes a running step after a restart and reveals it when due', async () => {
    const { code, facilitatorToken } = await createSession();
    const asha = await join(code, 'Asha');
    const fac = new Client(server.port, code, facilitatorToken);
    const a = new Client(server.port, code, asha.token);
    await Promise.all([fac.wait(() => true), a.wait(() => true)]);
    await fac.send({ type: 'start' });
    expect(await a.send({ type: 'addPoint', text: 'Pilot with one team' })).toEqual({ ok: true });

    for (const c of clients.splice(0)) c.socket.disconnect();
    await server.close();
    skew = 61_000;
    server = await startServer({ passcode: PASSCODE, dataDir: dir, port: 0, clock });

    const again = new Client(server.port, code, asha.token);
    const view = await again.wait((v) => v.phase === 'revealed');
    expect(view.points.map((p) => p.text)).toEqual(['Pilot with one team']);
  });
});
