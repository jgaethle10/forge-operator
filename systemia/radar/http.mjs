import path from 'node:path';
import { createRadarResident } from './resident.mjs';

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export function registerRadarRoutes(app, {
  isProd = process.env.NODE_ENV === 'production',
  stateDir = process.env.RADAR_STATE_DIR || path.resolve('.runtime', 'radar'),
  intervalMs = Number(process.env.RADAR_INTERVAL_MS || 5 * 60 * 1000),
  materialityThreshold = Number(process.env.RADAR_MATERIALITY_THRESHOLD || 0.58),
  maxSignals = Number(process.env.RADAR_MAX_SIGNALS || 8),
  journalUrl = process.env.RADAR_JOURNAL_URL || 'https://journal.evercraft.global/'
} = {}) {
  const token = String(process.env.RADAR_INTERNAL_TOKEN || '').trim();
  const resident = createRadarResident({
    stateDir,
    intervalMs,
    materialityThreshold,
    maxSignals,
    journalUrl
  });

  function requireInternal(req, res, next) {
    if (!token) {
      res.status(503).json({
        ok: false,
        error: 'Systemia Radar internal write authority is not configured.'
      });
      return;
    }
    if (bearer(req) !== token) {
      res.status(401).json({ ok: false, error: 'Unauthorized.' });
      return;
    }
    next();
  }

  app.get('/api/radar/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(resident.health());
  });

  app.get('/api/radar/latest', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.json(resident.latest());
  });

  app.get('/api/radar/change-wall', (_req, res) => {
    const latest = resident.latest();
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.json({
      schema: 'evercraft.systemia-radar.change-wall.public.v1',
      edition_id: latest.edition_id || null,
      generated_at: latest.generated_at || null,
      changes: latest.change_wall || []
    });
  });

  app.post('/api/radar/run', requireInternal, async (req, res) => {
    const receipt = await resident.runOnce({
      externalObservations: Array.isArray(req.body?.observations) ? req.body.observations : []
    });
    res.status(receipt.status === 'failed' ? 503 : 200).json(receipt);
  });

  app.post('/api/radar/ingest', requireInternal, (req, res) => {
    try {
      const decision = resident.ingest(req.body?.observation || req.body);
      res.status(decision.action === 'held' ? 202 : 200).json({
        ok: true,
        decision
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const autoStart = process.env.RADAR_RESIDENT_ENABLED == null
    ? isProd
    : String(process.env.RADAR_RESIDENT_ENABLED).toLowerCase() === 'true';

  if (autoStart) resident.start();

  return resident;
}
