import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Store } from '../src/store.js';
import { makeSession, run, T0 } from './fixtures.js';

describe('Store', () => {
  it('round-trips a session by id and code', () => {
    const store = new Store(':memory:');
    const { s } = makeSession();
    store.save(s);
    expect(store.get(s.id)).toEqual(s);
    expect(store.getByCode('ABC234')).toEqual(s);
    expect(store.codeExists('ABC234')).toBe(true);
    expect(store.codeExists('ZZZZZZ')).toBe(false);
    expect(store.get('missing')).toBeUndefined();
  });

  it('updates an existing session in place', () => {
    const store = new Store(':memory:');
    const { s, fac } = makeSession();
    store.save(s);
    store.save(run(s, fac, { type: 'start' }));
    expect(store.get(s.id)?.status).toBe('running');
    expect(store.listSummaries()).toHaveLength(1);
  });

  it('loads only live sessions for boot', () => {
    const store = new Store(':memory:');
    const { s } = makeSession();
    store.save(s);
    store.save({ ...s, id: 'session-2', code: 'XYZ789', status: 'closed', closedAt: T0 });
    expect(store.listLive().map((x) => x.id)).toEqual(['session-1']);
  });

  it('skips and logs a live session whose document is corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'six-hats-store-'));
    const file = join(dir, 'six-hats.db');
    const store = new Store(file);
    const raw = new Database(file);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { s } = makeSession();
      store.save(s);
      raw.prepare(`INSERT INTO sessions (id, code, status, title, created_at, doc) VALUES ('broken-1', 'BRK123', 'running', 'Broken', 0, '{not json')`).run();
      expect(store.listLive().map((x) => x.id)).toEqual(['session-1']);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('broken-1'), expect.anything());
    } finally {
      log.mockRestore();
      raw.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('summarises sessions newest first', () => {
    const store = new Store(':memory:');
    const { s } = makeSession();
    store.save(s);
    store.save({ ...s, id: 'session-2', code: 'XYZ789', createdAt: T0 + 1_000, participants: s.participants.slice(0, 1) });
    expect(store.listSummaries()).toEqual([
      { id: 'session-2', code: 'XYZ789', title: 'Migrate billing?', status: 'lobby', createdAt: T0 + 1_000, participantCount: 1 },
      { id: 'session-1', code: 'ABC234', title: 'Migrate billing?', status: 'lobby', createdAt: T0, participantCount: 3 },
    ]);
  });

  it('stores team templates', () => {
    const store = new Store(':memory:');
    store.saveTemplate({ id: 't1', name: 'Retro', steps: [{ hat: 'red', durationSec: 60 }], createdAt: T0 });
    store.saveTemplate({ id: 't2', name: 'Kickoff', steps: [{ hat: 'blue', durationSec: 120 }], createdAt: T0 });
    expect(store.listTemplates().map((t) => t.name)).toEqual(['Kickoff', 'Retro']);
    expect(store.listTemplates()[1]?.steps).toEqual([{ hat: 'red', durationSec: 60 }]);
    expect(store.deleteTemplate('t1')).toBe(true);
    expect(store.deleteTemplate('t1')).toBe(false);
  });
});
