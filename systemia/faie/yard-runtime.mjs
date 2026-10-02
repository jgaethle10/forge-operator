import express from 'express';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerFaieRoutes } from './http.mjs';
import { faieCollectorConfigFromEnv } from './collectors.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_FAIE_DIR = path.resolve(MODULE_DIR, '../../public/faie');

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function csv(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 160)).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => clean(item, 160))
    .filter(Boolean);
}

export function resolveFaieYardCollectorConfig({
  officialCollectorsEnabled = true,
  nwsEnabled = true,
  regionProfile = '',
  nwsArea = '',
  usgsWaterSites = [],
  usgsWaterParameters = ['00060', '00065'],
  nwpsGauges = []
} = {}) {
  return faieCollectorConfigFromEnv({
    FAIE_OFFICIAL_COLLECTORS_ENABLED: String(bool(officialCollectorsEnabled, true)),
    FAIE_NWS_ENABLED: String(bool(nwsEnabled, true)),
    FAIE_REGION_PROFILE: clean(regionProfile, 80),
    FAIE_NWS_AREA: clean(nwsArea, 2).toUpperCase(),
    FAIE_USGS_WATER_SITES: csv(usgsWaterSites).join(','),
    FAIE_USGS_WATER_PARAMETERS: csv(usgsWaterParameters).join(','),
    FAIE_NWPS_GAUGES: csv(nwpsGauges).join(',')
  });
}

function rateLimiter(maxRequests = 60, windowMs = 60 * 60 * 1000) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('RateLimit-Limit', String(maxRequests));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - 1)));
      next();
      return;
    }

    if (current.count >= maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      res.status(429).json({ ok: false, error: 'FAIE public request limit exceeded.' });
      return;
    }

    current.count += 1;
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - current.count)));
    next();
  };
}

export async function startFaieYardRuntime({
  stateDir,
  host = '127.0.0.1',
  port = 0,
  intervalMs = 5 * 60 * 1000,
  fetchImpl = globalThis.fetch,
  collectorConfig = null,
  regionProfile = '',
  nwsArea = '',
  usgsWaterSites = [],
  usgsWaterParameters = ['00060', '00065'],
  nwpsGauges = [],
  officialCollectorsEnabled = true,
  nwsEnabled = true,
  internalToken = ''
} = {}) {
  if (!stateDir) throw new Error('faie_yard_state_dir_required');

  const instanceId = 'faie_yard_' + randomBytes(12).toString('hex');
  let deploymentReceiptRef = '';
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }));

  const publicLimiter = rateLimiter(60, 60 * 60 * 1000);
  const resolvedCollectorConfig = collectorConfig || resolveFaieYardCollectorConfig({
    officialCollectorsEnabled,
    nwsEnabled,
    regionProfile,
    nwsArea,
    usgsWaterSites,
    usgsWaterParameters,
    nwpsGauges
  });

  app.get('/', (_req, res) => {
    res.redirect(308, '/faie/');
  });

  const faie = registerFaieRoutes(app, {
    isProd: false,
    stateDir,
    intervalMs,
    radarResident: null,
    fetchImpl,
    collectorConfig: resolvedCollectorConfig,
    internalToken,
    publicInvestigateLimiter: publicLimiter
  });

  app.use('/faie', express.static(PUBLIC_FAIE_DIR, {
    index: 'index.html',
    fallthrough: false,
    maxAge: 60_000
  }));

  const health = () => {
    const engine = faie.health();
    return {
      schema: 'evercraft.faie.yard-health.v1',
      ok: engine.ok === true,
      degraded: engine.degraded === true,
      service: 'faie-yard-runtime',
      product: 'FAIE',
      runtime: 'Evercraft Compute',
      workload_class: 'systemia.faie.v1',
      instance_id: instanceId,
      deployment_receipt_bound: Boolean(deploymentReceiptRef),
      deployment_receipt_ref: deploymentReceiptRef || null,
      human_ui_path: '/faie/',
      native_mcp_path: '/mcp/faie',
      public_investigate_path: '/api/faie/investigate',
      public_signals_path: '/api/faie/signals',
      read_only_public: true,
      public_investigations_persisted: false,
      decision_authority: false,
      publication_authority: false,
      checkout_enabled: false,
      payment_enabled: false,
      base44_required: false,
      external_ai_required: false,
      resident: engine.resident === true,
      running: engine.running === true,
      signal_count: Number(engine.signal_count || 0),
      investigation_count: Number(engine.investigation_count || 0),
      official_collectors: engine.official_collectors || null,
      last_cycle: engine.last_cycle || null
    };
  };

  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(health());
  });

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(Number(port) || 0, host, () => resolve(listener));
    listener.once('error', reject);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : Number(port) || 0;
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${displayHost}:${actualPort}`;

  faie.start();

  return {
    app,
    server,
    faie,
    url,
    instanceId,
    collectorConfig: resolvedCollectorConfig,
    health,
    setDeploymentReceipt(receiptRef) {
      deploymentReceiptRef = clean(receiptRef, 200);
      return health();
    },
    async close() {
      faie.stop();
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}
