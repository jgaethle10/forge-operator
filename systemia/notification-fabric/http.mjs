import crypto from 'node:crypto';
import { createNotificationFabric } from './fabric.mjs';

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

export function registerNotificationFabricRoutes(app, options = {}) {
  const fabric = options.fabric || createNotificationFabric(options);
  const ingestToken = options.ingestToken ?? process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN ?? '';
  const enrollToken = options.enrollToken ?? process.env.EVERCRAFT_NOTIFICATION_ENROLL_TOKEN ?? '';
  const requireIngest = requireToken(ingestToken, 'Notification ingestion is not configured.');
  const requireEnroll = requireToken(enrollToken, 'Notification enrollment is not configured.');
  const allowedOrigins = new Set(
    String(options.allowedOrigins ?? process.env.EVERCRAFT_NOTIFICATION_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  app.use('/api/notifications', (req, res, next) => {
    const origin = String(req.get('origin') || '').trim();
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
    res.json({ success: true, web_push_enabled: config.web_push_enabled, vapid_public_key: config.vapid_public_key, transport: config.transport });
  });

  app.post('/api/notifications/subscriptions', requireEnroll, (req, res) => {
    try {
      const subscription = fabric.subscribe({ ...req.body, user_agent: req.get('user-agent') || null });
      res.status(201).json({ success: true, subscription: { ...subscription, keys: undefined } });
    } catch (error) {
      res.status(400).json({ success: false, error: error?.message || String(error) });
    }
  });

  app.delete('/api/notifications/subscriptions/:id', requireEnroll, (req, res) => {
    res.json({ success: true, removed: fabric.unsubscribe(req.params.id) });
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
