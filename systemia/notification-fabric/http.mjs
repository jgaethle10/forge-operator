import crypto from 'node:crypto';
import { createNotificationFabric } from './fabric.mjs';
import { issueRelaySession, verifyRelaySession } from './session-token.mjs';

function bearer(req) {
  const header = String(req.get('authorization') || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function tokenEqual(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireToken(expected, unavailableMessage) {
  return (req, res, next) => {
    if (!expected) {
      res.status(503).json({ success: false, error: unavailableMessage });
      return;
    }
    if (!tokenEqual(bearer(req), expected)) {
      res.status(401).json({ success: false, error: 'Unauthorized.' });
      return;
    }
    next();
  };
}

function intersect(requested, allowed) {
  const allow = new Set(Array.isArray(allowed) ? allowed.map(String) : []);
  return (Array.isArray(requested) ? requested.map(String) : []).filter((value) => allow.has(value));
}

export function registerNotificationFabricRoutes(app, options = {}) {
  const fabric = options.fabric || createNotificationFabric(options);
  const ingestToken = options.ingestToken ?? process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN ?? '';
  const enrollToken = options.enrollToken ?? process.env.EVERCRAFT_NOTIFICATION_ENROLL_TOKEN ?? '';
  const sessionSecret = options.sessionSecret ?? process.env.EVERCRAFT_NOTIFICATION_SESSION_SECRET ?? '';
  const requireIngest = requireToken(ingestToken, 'Notification ingestion is not configured.');
  const allowedOrigins = new Set(
    String(options.allowedOrigins ?? process.env.EVERCRAFT_NOTIFICATION_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  function verifySessionRequest(req, permission) {
    return verifyRelaySession(bearer(req), sessionSecret, { permission });
  }

  function requireSession(permission) {
    return (req, res, next) => {
      try {
        req.relaySession = verifySessionRequest(req, permission);
        next();
      } catch (error) {
        res.status(sessionSecret ? 401 : 503).json({
          success: false,
          error: sessionSecret ? (error?.message || 'Unauthorized.') : 'Relay sessions are not configured.',
        });
      }
    };
  }

  function enrollmentClaims(req) {
    const auth = bearer(req);
    if (enrollToken && tokenEqual(auth, enrollToken)) return { legacy: true, sub: null, audiences: null, products: null };
    const claims = verifyRelaySession(auth, sessionSecret, { permission: 'subscribe' });
    return { legacy: false, ...claims };
  }

  app.use('/api/notifications', (req, res, next) => {
    const origin = String(req.get('origin') || '').trim();
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'x-relay-connection-id');
    }
    if (req.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) {
        res.sendStatus(403);
        return;
      }
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/notifications/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...fabric.config() });
  });

  app.get('/api/notifications/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const config = fabric.config();
    res.json({
      success: true,
      brand: config.brand,
      web_push_enabled: config.web_push_enabled,
      vapid_public_key: config.vapid_public_key,
      transports: config.transports,
    });
  });

  app.post('/api/notifications/session-tokens', requireIngest, (req, res) => {
    try {
      const issued = issueRelaySession({
        principal_id: req.body?.principal_id,
        permissions: req.body?.permissions,
        audiences: req.body?.audiences,
        products: req.body?.products,
        ttl_seconds: req.body?.ttl_seconds,
      }, sessionSecret);
      res.status(201).json({ success: true, token: issued.token, expires_at: issued.expires_at });
    } catch (error) {
      res.status(400).json({ success: false, error: error?.message || String(error) });
    }
  });

  app.post('/api/notifications/subscriptions', (req, res) => {
    try {
      const claims = enrollmentClaims(req);
      const requestedPrincipal = String(req.body?.principal_id || '').trim();
      if (!claims.legacy && requestedPrincipal !== claims.sub) {
        res.status(403).json({ success: false, error: 'Relay session cannot enroll another principal.' });
        return;
      }
      const bounded = claims.legacy ? req.body : {
        ...req.body,
        principal_id: claims.sub,
        audiences: intersect(req.body?.audiences, claims.audiences),
        products: intersect(req.body?.products, claims.products),
      };
      const subscription = fabric.subscribe({
        ...bounded,
        user_agent: req.get('user-agent') || null,
      });
      res.status(201).json({ success: true, subscription: { ...subscription, keys: undefined } });
    } catch (error) {
      res.status(sessionSecret || enrollToken ? 401 : 503).json({
        success: false,
        error: sessionSecret || enrollToken ? (error?.message || String(error)) : 'Notification enrollment is not configured.',
      });
    }
  });

  app.delete('/api/notifications/subscriptions/:id', (req, res) => {
    try {
      const claims = enrollmentClaims(req);
      const removed = fabric.unsubscribe(req.params.id, claims.legacy ? null : claims.sub);
      res.json({ success: true, removed });
    } catch (error) {
      res.status(sessionSecret || enrollToken ? 401 : 503).json({
        success: false,
        error: sessionSecret || enrollToken ? (error?.message || String(error)) : 'Notification enrollment is not configured.',
      });
    }
  });

  app.get('/api/notifications/stream', requireSession('stream'), (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const connection = fabric.realtimeHub.connect({
      principalId: req.relaySession.sub,
      res,
      metadata: {
        audiences: req.relaySession.audiences || [],
        products: req.relaySession.products || [],
        jti: req.relaySession.jti,
      },
    });
  });

  app.get('/api/notifications/inbox', requireSession('inbox'), (req, res) => {
    const items = fabric.listInbox(req.relaySession.sub, {
      limit: req.query?.limit,
      unreadOnly: String(req.query?.unread || '').toLowerCase() === 'true',
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, items });
  });

  app.post('/api/notifications/inbox/:id/seen', requireSession('inbox'), (req, res) => {
    const item = fabric.seen(req.relaySession.sub, req.params.id);
    if (!item) {
      res.status(404).json({ success: false, error: 'Notification not found.' });
      return;
    }
    res.json({ success: true, item });
  });

  app.post('/api/notifications/inbox/:id/ack', requireSession('ack'), (req, res) => {
    const item = fabric.acknowledge(req.relaySession.sub, req.params.id);
    if (!item) {
      res.status(404).json({ success: false, error: 'Notification not found.' });
      return;
    }
    res.json({ success: true, item });
  });

  app.get('/api/notifications/metrics', requireIngest, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      delivery: fabric.store.deliverySnapshot(),
      ledger: fabric.store.verifyDeliveryLedger(),
      realtime: fabric.realtimeHub.snapshot(),
    });
  });

  app.post('/api/notifications/intents', requireIngest, async (req, res) => {
    try { res.json({ success: true, ...(await fabric.dispatchIntent(req.body)) }); }
    catch (error) { res.status(400).json({ success: false, error: error?.message || String(error) }); }
  });

  app.post('/api/notifications/signals', requireIngest, async (req, res) => {
    try { res.json({ success: true, ...(await fabric.dispatchSignal(req.body)) }); }
    catch (error) { res.status(400).json({ success: false, error: error?.message || String(error) }); }
  });

  return fabric;
}
