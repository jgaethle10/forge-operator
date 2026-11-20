import path from 'node:path';
import crypto from 'node:crypto';
import { createTowiResident } from './resident.mjs';

// This is a private owner-only proving surface. Not the old PR #735 public desk.
// It never accepts a caller-provided Radar edition, public source, case or mission.
export function registerTowiPrivateRoutes(app, {
  radarResident = null,
  stateDir = process.env.TOWI_STATE_DIR || path.resolve('.runtime', 'towi'),
  intervalMs = Number(process.env.TOWI_INTERVAL_MS || 5 * 60 * 1000),
  maxItems = Number(process.env.TOWI_MAX_ITEMS || 24),
  internalToken = process.env.TOWI_INTERNAL_TOKEN || '',
  residentEnabled = String(process.env.TOWI_RESIDENT_ENABLED || '').toLowerCase() === 'true',
  clock
} = {}) {
  const secret = String(internalToken).trim();
  const validToken = /^[A-Za-z0-9_-]{32,256}$/.test(secret);
  const resident = createTowiResident({
    radarResident, stateDir, intervalMs, maxItems, ...(clock ? { clock } : {})
  });

  function requireOwner(req, res, next) {
    if (!validToken) {
      res.status(503).json({ ok: false, error: 'TOWI owner authentication is not configured.' });
      return;
    }
    const header = String(req.headers?.authorization || '');
    const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
    const candidate = Buffer.from(supplied, 'utf8');
    const expected = Buffer.from(secret, 'utf8');
    if (candidate.length !== expected.length
        || !crypto.timingSafeEqual(candidate, expected)) {
      res.status(401).json({ ok: false, error: 'Unauthorized.' });
      return;
    }
    next();
  }

  app.get('/api/internal/towi/health', requireOwner, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...resident.health(),
      access_scope: 'owner_private_only',
      external_publication_authority: false
    });
  });

  app.get('/api/internal/towi/dossiers', requireOwner, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      schema: 'evercraft.towi.private-dossiers.v1',
      dossiers: resident.queue(),
      publication_authority: false,
      institutional_contact_authority: false
    });
  });

  app.get('/api/internal/towi/production-candidates', requireOwner, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(resident.productionQueue());
  });

  app.post('/api/internal/towi/run', requireOwner, async (_req, res) => {
    // Only the already-approved in-process Radar resident supplies the edition.
    // Input bodies are intentionally unused. No external collectors or sends.
    const receipt = await resident.runOnce();
    res.status(receipt.status === 'failed' ? 503 : 200).json(receipt);
  });

  // Fail closed: production mode alone must NEVER turn research on or publish it.
  if (validToken && residentEnabled && radarResident?.internalLatest) {
    resident.start();
  }
  return resident;
}
