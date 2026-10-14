import type { FlowStep } from '@shared/hats';
import type { CreateSessionInput, CreateSessionResult, JoinResult, SessionSummary, Template } from '@shared/protocol';

const PASSCODE_KEY = 'six-hats:passcode';
const tokenKey = (code: string) => `six-hats:token:${code.toUpperCase()}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the page still works for this visit.
  }
}

export const getPasscode = () => read(PASSCODE_KEY);
export const setPasscode = (passcode: string | null) => write(PASSCODE_KEY, passcode);
export const getToken = (code: string) => read(tokenKey(code));
export const setToken = (code: string, token: string | null) => write(tokenKey(code), token);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

interface RequestOptions {
  body?: unknown;
  passcode?: boolean | string;
  token?: string;
  text?: boolean;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.passcode) headers['x-team-passcode'] = typeof opts.passcode === 'string' ? opts.passcode : (getPasscode() ?? '');
  if (opts.token) headers['x-session-token'] = opts.token;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 401 && opts.passcode === true) setPasscode(null);
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (opts.text ? await res.text() : await res.json()) as T;
}

const enc = encodeURIComponent;

export const api = {
  async checkPasscode(passcode: string): Promise<void> {
    await request('POST', '/api/passcode/check', { passcode });
    setPasscode(passcode);
  },
  createSession: (input: CreateSessionInput) => request<CreateSessionResult>('POST', '/api/sessions', { body: input, passcode: true }),
  listSessions: () => request<SessionSummary[]>('GET', '/api/sessions', { passcode: true }),
  join: (code: string, name: string) => request<JoinResult>('POST', `/api/sessions/${enc(code)}/join`, { body: { name } }),
  facilitatorLink: (code: string) => request<{ token: string }>('POST', `/api/sessions/${enc(code)}/facilitator-link`, { passcode: true }),
  summaryMarkdown: (code: string, token: string | null) =>
    request<string>('GET', `/api/sessions/${enc(code)}/summary.md`, { token: token ?? undefined, passcode: !token, text: true }),
  listTemplates: () => request<Template[]>('GET', '/api/templates', { passcode: true }),
  saveTemplate: (name: string, steps: FlowStep[]) => request<Template>('POST', '/api/templates', { body: { name, steps }, passcode: true }),
  deleteTemplate: (id: string) => request<void>('DELETE', `/api/templates/${enc(id)}`, { passcode: true }),
};

export const participantLink = (code: string) => `${location.origin}/s/${code}`;
export const adminLink = (code: string, token: string) => `${location.origin}/s/${code}/admin#t=${enc(token)}`;
