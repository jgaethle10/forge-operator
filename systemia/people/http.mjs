import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  if(/challenge_not_active|mail_delivery_destination_mismatch|trusted_mail_delivery_already_recorded/.test(message))return 409;
  if (/trusted_email_delivery_required|trusted_mail_attestation_required/.test(message)) return 409;
  if (/required|invalid|exact_|explicit_|forbidden/.test(message)) return 400;
  if (/not_consented|verified_owner_identity_required|approved_delete_request_required/.test(message)) return 409;
  return 500;
}

export function registerPeopleRoutes(app, {
  stateDir = process.env.PEOPLE_STATE_DIR || path.resolve('.runtime', 'people-layer'),
  adminTokenFile = process.env.PEOPLE_ADMIN_TOKEN_FILE || '',
  mailDeliveryPublicKeysFile = process.env.PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE || '',
} = {}) {
  function readPrivateText(file) {
    const value = String(file || '').trim();
    if (!value) return '';
    const resolved = path.resolve(value);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return '';
    if ((fs.statSync(resolved).mode & 0o077) !== 0) return '';
    return fs.readFileSync(resolved, 'utf8').trim();
  }

  const adminToken = readPrivateText(adminTokenFile);
  let trustedMailDeliveryPublicKeys = {};
  const mailKeysRaw = readPrivateText(mailDeliveryPublicKeysFile);
  if (mailKeysRaw) {
    try {
      const parsed = JSON.parse(mailKeysRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        trustedMailDeliveryPublicKeys = {
          gmail_agent: typeof parsed.gmail_agent === 'string' ? parsed.gmail_agent : '',
          resend_agent: typeof parsed.resend_agent === 'string' ? parsed.resend_agent : '',
        };
      }
    } catch {}
  }
  const runtime = createPeopleRuntime({ stateDir, trustedMailDeliveryPublicKeys });

  function tokenEqual(actual, expected) {
    if (!actual || !expected) return false;
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function requireAdmin(req, res, next) {
    if (!adminToken) {
      res.status(503).json({ ok: false, error: 'people_admin_authority_not_configured' });
      return;
    }
    if (!tokenEqual(bearer(req), adminToken)) {
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

  app.get('/api/people/brains/:brainKey', requireAdmin, handler((req) => ({
    snapshot: runtime.brainSnapshot(req.params.brainKey),
  })));

  app.post('/api/people/brains/:brainKey/memories', requireAdmin, handler((req) => ({
    memory: runtime.createMemory(req.params.brainKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/relationships', requireAdmin, handler((req) => ({
    relationship: runtime.createRelationship(req.params.brainKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/relationships/:relationshipKey/grant', requireAdmin, handler((req) => ({
    share: runtime.grantShare(req.params.brainKey, req.params.relationshipKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/relationships/:relationshipKey/revoke', requireAdmin, handler((req) => ({
    share: runtime.revokeShare(req.params.brainKey, req.params.relationshipKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/revoke-consent', requireAdmin, handler((req) => ({
    consent: runtime.revokeConsent(req.params.brainKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/opportunities', requireAdmin, handler((req) => ({
    opportunity: runtime.createOpportunity(req.params.brainKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/opportunities/:opportunityKey/authority', requireAdmin, handler((req) => ({
    opportunity: runtime.setOpportunityAuthority(req.params.brainKey, req.params.opportunityKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/invite', requireAdmin, handler((req) => ({
    invite: runtime.createInvite(req.params.brainKey, req.body || {}),
  })));

  // This monolith has no isolated trusted provider dispatcher.
  // Do not release a verification token to operator credentials.
  app.post('/api/people/brains/:brainKey/email-challenge', requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ ok: false, error: 'trusted_email_dispatch_unavailable' });
  });

  app.post('/api/people/identity-challenges/:challengeKey/delivery', requireAdmin, handler((req) => ({
    delivery: runtime.recordEmailDelivery(req.params.challengeKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/export', requireAdmin, handler((req) => ({
    export: runtime.exportBrain(req.params.brainKey, req.body || {}),
  })));

  app.post('/api/people/brains/:brainKey/delete-request', requireAdmin, handler((req) => ({
    request: runtime.requestDelete(req.params.brainKey, req.body || {}),
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
