import path from 'node:path';
import { createPeopleRuntime } from './runtime.mjs';

function bearer(req) {
  const auth = String(req.headers?.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return String(req.headers?.['x-evercraft-people-token'] || '').trim();
}

function errorStatus(message) {
  if (/not_found/.test(message)) return 404;
  if (/expired|revoked/.test(message)) return 410;
  if (/unauthorized/i.test(message)) return 401;
  if (/required|invalid|exact_|explicit_/.test(message)) return 400;
  if (/not_consented|verified_owner_identity_required|approved_delete_request_required/.test(message)) return 409;
  return 500;
}

export function registerPeopleRoutes(app, {
  stateDir = process.env.PEOPLE_STATE_DIR || path.resolve('.runtime', 'people-layer'),
} = {}) {
  const runtime = createPeopleRuntime({ stateDir });
  const adminToken = String(process.env.PEOPLE_ADMIN_TOKEN || '').trim();

  function requireAdmin(req, res, next) {
    if (!adminToken) {
      res.status(503).json({ ok: false, error: 'people_admin_authority_not_configured' });
      return;
    }
    if (bearer(req) !== adminToken) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    next();
  }

  function handler(fn) {
    return (req, res) => {
      try {
        const result = fn(req, res);
        if (res.headersSent) return;
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.setHeader('Cache-Control', 'no-store');
        res.status(errorStatus(message)).json({ ok: false, error: message });
      }
    };
  }

  app.get('/api/people/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(runtime.health());
  });

  app.get('/api/people/brains', requireAdmin, handler(() => ({
    brains: runtime.listBrains(),
  })));

  app.post('/api/people/brains', requireAdmin, handler((req) => ({
    brain: runtime.createBrain(req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/invite', requireAdmin, handler((req) => ({
    invite: runtime.createInvite(req.params.brainKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/email-challenge', requireAdmin, handler((req) => ({
    challenge: runtime.createEmailChallenge(req.params.brainKey, req.body || {}),
  })));

  app.get('/api/people/brains/:brainKey/export', requireAdmin, handler((req) => ({
    export: runtime.exportBrain(req.params.brainKey),
  })));

  app.post('/api/people/brains/:brainKey/delete-request', requireAdmin, handler((req) => ({
    request: runtime.requestDelete(req.params.brainKey),
  })));

  app.post('/api/people/brains/:brainKey/delete', requireAdmin, handler((req) => ({
    result: runtime.completeDelete(req.params.brainKey, req.body?.confirmation_text),
  })));

  app.get('/api/people/consent/inspect', handler((req) =>
    runtime.inspectInvite(String(req.query?.token || ''))
  ));

  app.post('/api/people/consent/accept', handler((req) =>
    runtime.acceptInvite(req.body?.token, req.body || {})
  ));

  app.get('/api/people/verify-email/inspect', handler((req) =>
    runtime.inspectEmailChallenge(String(req.query?.token || ''))
  ));

  app.post('/api/people/verify-email/verify', handler((req) =>
    runtime.verifyEmail(req.body?.token, req.body || {})
  ));

  return runtime;
}
