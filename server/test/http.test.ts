import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../src/server.js';

const PASSCODE = 'team-secret';
const WITH_PASSCODE = { 'x-team-passcode': PASSCODE };
const FLOW = { title: 'Pricing', focus: 'Annual only?', facilitatorName: 'Fac', votesPerPerson: 3, steps: [{ hat: 'white', durationSec: 60 }] };
const SPA_HTML = '<!doctype html><title>spa</title>';

let server: RunningServer;
let dir: string;
let now = Date.now();

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'six-hats-http-'));
  now = Date.now();
  server = await startServer({ passcode: PASSCODE, dataDir: dir, port: 0, clock: () => now });
});

afterEach(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Reads the whole body up front so no keep-alive socket is left holding an unread response. */
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text: async () => text, json: async () => JSON.parse(text) as unknown };
}

async function restart(options: { trustProxy?: boolean | number }) {
  await server.close();
  server = await startServer({ passcode: PASSCODE, dataDir: dir, port: 0, clock: () => now, ...options });
}

const fromClient = (ip: string, passcode: string) => ({ 'x-forwarded-for': ip, 'x-team-passcode': passcode });

async function createSession() {
  const res = await call('POST', '/api/sessions', FLOW, WITH_PASSCODE);
  expect(res.status).toBe(201);
  return (await res.json()) as { code: string; facilitatorToken: string };
}

describe('HTTP API', () => {
  it('answers the health check', async () => {
    const res = await call('GET', '/healthz');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('requires the team passcode to create a session', async () => {
    const res = await call('POST', '/api/sessions', FLOW);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Wrong team passcode' });
  });

  it('blocks a client after 10 wrong passcodes', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call('POST', '/api/passcode/check', undefined, { 'x-team-passcode': 'nope' })).status).toBe(401);
    }
    expect((await call('POST', '/api/passcode/check', undefined, WITH_PASSCODE)).status).toBe(429);
  });

  it('ignores X-Forwarded-For unless a proxy is trusted', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call('POST', '/api/passcode/check', undefined, fromClient(`10.0.0.${i}`, 'nope'))).status).toBe(401);
    }
    expect((await call('POST', '/api/passcode/check', undefined, fromClient('10.0.0.99', PASSCODE))).status).toBe(429);
  });

  it('keys the limiter on X-Forwarded-For when one proxy is trusted', async () => {
    await restart({ trustProxy: 1 });
    for (let i = 0; i < 10; i++) {
      expect((await call('POST', '/api/passcode/check', undefined, fromClient('10.0.0.1', 'nope'))).status).toBe(401);
    }
    expect((await call('POST', '/api/passcode/check', undefined, fromClient('10.0.0.1', PASSCODE))).status).toBe(429);
    expect((await call('POST', '/api/passcode/check', undefined, fromClient('10.0.0.2', PASSCODE))).status).toBe(204);
  });

  it('answers 429 to every client once 100 wrong passcodes have been seen in a minute', async () => {
    await restart({ trustProxy: 1 });
    for (let i = 0; i < 100; i++) {
      expect((await call('POST', '/api/passcode/check', undefined, fromClient(`10.1.0.${i}`, 'nope'))).status).toBe(401);
    }
    expect((await call('POST', '/api/passcode/check', undefined, fromClient('10.2.0.1', PASSCODE))).status).toBe(429);
    expect((await call('POST', '/api/passcode/check', undefined, fromClient('10.2.0.2', 'nope'))).status).toBe(429);
    now += 60_001;
    expect((await call('POST', '/api/passcode/check', undefined, fromClient('10.2.0.1', PASSCODE))).status).toBe(204);
  });

  it('creates a session and lets people join by code', async () => {
    const { code, facilitatorToken } = await createSession();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(facilitatorToken.length).toBeGreaterThan(20);
    const res = await call('POST', `/api/sessions/${code.toLowerCase()}/join`, { name: 'Asha' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ participantId: expect.any(String), token: expect.any(String) });
  });

  it('rejects an invalid flow with a readable message', async () => {
    const res = await call('POST', '/api/sessions', { ...FLOW, steps: [] }, WITH_PASSCODE);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A flow needs at least 1 step' });
  });

  it('returns 404 for an unknown code and for unknown API routes', async () => {
    expect((await call('POST', '/api/sessions/ZZZZZZ/join', { name: 'Asha' })).status).toBe(404);
    const res = await call('GET', '/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('lists sessions in the archive', async () => {
    const { code } = await createSession();
    const res = await call('GET', '/api/sessions', undefined, WITH_PASSCODE);
    expect(await res.json()).toEqual([expect.objectContaining({ code, title: 'Pricing', status: 'lobby', participantCount: 1 })]);
  });

  it('serves the Markdown summary to a session member or a passcode holder only', async () => {
    const { code, facilitatorToken } = await createSession();
    expect((await call('GET', `/api/sessions/${code}/summary.md`)).status).toBe(401);
    const res = await call('GET', `/api/sessions/${code}/summary.md`, undefined, { 'x-session-token': facilitatorToken });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="six-hats-${code}.md"`);
    expect(await res.text()).toMatch(/^# Six Hats: Pricing\n/);
    expect((await call('GET', `/api/sessions/${code}/summary.md`, undefined, WITH_PASSCODE)).status).toBe(200);
  });

  it('mints a new facilitator link for passcode holders', async () => {
    const { code, facilitatorToken } = await createSession();
    const res = await call('POST', `/api/sessions/${code}/facilitator-link`, undefined, WITH_PASSCODE);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { token: string }).token).not.toBe(facilitatorToken);
  });

  it('saves, lists and deletes team templates', async () => {
    const created = await call('POST', '/api/templates', { name: 'Retro', steps: [{ hat: 'red', durationSec: 60 }] }, WITH_PASSCODE);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(await (await call('GET', '/api/templates', undefined, WITH_PASSCODE)).json()).toEqual([
      expect.objectContaining({ id, name: 'Retro', steps: [{ hat: 'red', durationSec: 60 }] }),
    ]);
    expect((await call('POST', '/api/templates', { name: '', steps: [] }, WITH_PASSCODE)).status).toBe(400);
    expect((await call('DELETE', `/api/templates/${id}`, undefined, WITH_PASSCODE)).status).toBe(204);
    expect((await call('DELETE', `/api/templates/${id}`, undefined, WITH_PASSCODE)).status).toBe(404);
  });

  it.each([
    { method: 'GET', path: '/api/sessions' },
    { method: 'POST', path: '/api/sessions/ABC234/facilitator-link' },
    { method: 'GET', path: '/api/templates' },
    { method: 'POST', path: '/api/templates', body: { name: 'x', steps: [] } },
    { method: 'DELETE', path: '/api/templates/abc' },
  ])('requires the team passcode for $method $path', async ({ method, path, body }) => {
    const res = await call(method, path, body);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Wrong team passcode' });
  });

  it('serves the single-page app for deep links when WEB_DIR is relative', async () => {
    const webDir = mkdtempSync(join(tmpdir(), 'six-hats-web-'));
    const spaDataDir = mkdtempSync(join(tmpdir(), 'six-hats-spa-'));
    writeFileSync(join(webDir, 'index.html'), SPA_HTML);
    try {
      const spa = await startServer({ passcode: PASSCODE, dataDir: spaDataDir, port: 0, webDir: relative(process.cwd(), webDir) });
      try {
        const base = `http://127.0.0.1:${spa.port}`;
        const root = await fetch(`${base}/`);
        expect(root.status).toBe(200);
        expect(await root.text()).toBe(SPA_HTML);
        const deepLink = await fetch(`${base}/s/ABC123`);
        expect(deepLink.status).toBe(200);
        expect(await deepLink.text()).toBe(SPA_HTML);
        const api = await fetch(`${base}/api/nope`);
        expect(api.status).toBe(404);
        expect(await api.json()).toEqual({ error: 'Not found' });
      } finally {
        await spa.close();
      }
    } finally {
      rmSync(webDir, { recursive: true, force: true });
      rmSync(spaDataDir, { recursive: true, force: true });
    }
  });
});
