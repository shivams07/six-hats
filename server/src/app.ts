import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS } from '../../shared/src/hats.js';
import { FailureLimiter, passcodeMatches } from './auth.js';
import { toMarkdown } from './export.js';
import { newId } from './ids.js';
import type { SessionService } from './sessions.js';
import type { Store } from './store.js';
import { cleanText, validateSteps } from './validate.js';

export interface AppDeps {
  service: SessionService;
  store: Store;
  passcode: string;
  webDir?: string;
  clock?: () => number;
}

export function createApp({ service, store, passcode, webDir, clock = Date.now }: AppDeps): express.Express {
  const app = express();
  const failures = new FailureLimiter(10, 60_000, clock);

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: '64kb' }));

  const requirePasscode = <P>(req: Request<P>, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    if (failures.isBlocked(key)) return void res.status(429).json({ error: 'Too many wrong passcodes, wait a minute' });
    if (!passcodeMatches(req.get('x-team-passcode'), passcode)) {
      failures.recordFailure(key);
      return void res.status(401).json({ error: 'Wrong team passcode' });
    }
    next();
  };

  app.get('/healthz', (_req, res) => {
    res.type('text/plain').send('ok');
  });

  app.post('/api/passcode/check', requirePasscode, (_req, res) => {
    res.status(204).end();
  });

  app.post('/api/sessions', requirePasscode, (req, res) => {
    const r = service.create(req.body);
    if (!r.ok) return void res.status(r.status).json({ error: r.error });
    res.status(201).json({ code: r.code, facilitatorToken: r.facilitatorToken });
  });

  app.get('/api/sessions', requirePasscode, (_req, res) => {
    res.json(store.listSummaries());
  });

  app.post('/api/sessions/:code/join', (req, res) => {
    const r = service.join(req.params.code, req.body?.name);
    if (!r.ok) return void res.status(r.status).json({ error: r.error });
    res.status(201).json({ participantId: r.participantId, token: r.token });
  });

  app.post('/api/sessions/:code/facilitator-link', requirePasscode, (req, res) => {
    const r = service.mintFacilitatorToken(req.params.code);
    if (!r.ok) return void res.status(r.status).json({ error: r.error });
    res.status(201).json({ token: r.token });
  });

  app.get('/api/sessions/:code/summary.md', (req, res) => {
    const session = service.getByCode(req.params.code);
    if (!session) return void res.status(404).json({ error: 'Session not found' });
    const send = () => {
      res
        .type('text/markdown; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="six-hats-${session.code}.md"`)
        .send(toMarkdown(service.getByCode(session.code) ?? session));
    };
    const token = req.get('x-session-token');
    if (token && service.authenticate(session.code, token).ok) return send();
    requirePasscode(req, res, send);
  });

  app.get('/api/templates', requirePasscode, (_req, res) => {
    res.json(store.listTemplates());
  });

  app.post('/api/templates', requirePasscode, (req, res) => {
    const name = cleanText(req.body?.name, 'Template name', LIMITS.templateName);
    if (!name.ok) return void res.status(400).json({ error: name.error });
    const steps = validateSteps(req.body?.steps);
    if (!steps.ok) return void res.status(400).json({ error: steps.error });
    const template = { id: newId(), name: name.value, steps: steps.value, createdAt: clock() };
    store.saveTemplate(template);
    res.status(201).json(template);
  });

  app.delete('/api/templates/:id', requirePasscode, (req, res) => {
    if (store.deleteTemplate(req.params.id)) res.status(204).end();
    else res.status(404).json({ error: 'Template not found' });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (webDir && existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(join(webDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' ? err.status : 500;
    if (status >= 500) console.error(err);
    const error = status === 400 ? 'Invalid request body' : status === 413 ? 'Request too large' : 'Something went wrong';
    res.status(status).json({ error });
  });

  return app;
}
