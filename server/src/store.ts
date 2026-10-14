import Database from 'better-sqlite3';
import type { SessionSummary, Template } from '../../shared/src/protocol.js';
import type { Session } from './session.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    closed_at   INTEGER,
    doc         TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS templates (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    steps       TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`;

type SummaryRow = Omit<SessionSummary, 'closedAt'> & { closedAt: number | null };
type TemplateRow = { id: string; name: string; steps: string; createdAt: number };

export class Store {
  private readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  save(s: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, code, status, title, created_at, closed_at, doc)
         VALUES (@id, @code, @status, @title, @createdAt, @closedAt, @doc)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status, title = excluded.title, closed_at = excluded.closed_at, doc = excluded.doc`,
      )
      .run({ id: s.id, code: s.code, status: s.status, title: s.title, createdAt: s.createdAt, closedAt: s.closedAt ?? null, doc: JSON.stringify(s) });
  }

  get(id: string): Session | undefined {
    return this.parse(this.db.prepare('SELECT doc FROM sessions WHERE id = ?').get(id));
  }

  getByCode(code: string): Session | undefined {
    return this.parse(this.db.prepare('SELECT doc FROM sessions WHERE code = ?').get(code));
  }

  codeExists(code: string): boolean {
    return this.db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(code) !== undefined;
  }

  listLive(): Session[] {
    const rows = this.db.prepare(`SELECT doc FROM sessions WHERE status != 'closed'`).all() as { doc: string }[];
    return rows.map((r) => JSON.parse(r.doc) as Session);
  }

  listSummaries(): SessionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, code, title, status, created_at AS createdAt, closed_at AS closedAt,
                json_array_length(doc, '$.participants') AS participantCount
         FROM sessions ORDER BY created_at DESC`,
      )
      .all() as SummaryRow[];
    return rows.map(({ closedAt, ...rest }) => (closedAt === null ? rest : { ...rest, closedAt }));
  }

  saveTemplate(t: Template): void {
    this.db
      .prepare('INSERT INTO templates (id, name, steps, created_at) VALUES (?, ?, ?, ?)')
      .run(t.id, t.name, JSON.stringify(t.steps), t.createdAt);
  }

  listTemplates(): Template[] {
    const rows = this.db
      .prepare('SELECT id, name, steps, created_at AS createdAt FROM templates ORDER BY name COLLATE NOCASE')
      .all() as TemplateRow[];
    return rows.map((r) => ({ ...r, steps: JSON.parse(r.steps) }));
  }

  deleteTemplate(id: string): boolean {
    return this.db.prepare('DELETE FROM templates WHERE id = ?').run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private parse(row: unknown): Session | undefined {
    return row ? (JSON.parse((row as { doc: string }).doc) as Session) : undefined;
  }
}
