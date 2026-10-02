import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { faieCollectorConfigFromEnv } from './collectors.mjs';
import { executeFaieMcpRpc, faieMcpTools, publicFaieInvestigation } from './mcp.mjs';
import { createFaieRuntime, investigationToMarkdown } from './runtime.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_FAIE_FILE = path.resolve(MODULE_DIR, '../../public/faie/index.html');

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

function boundedInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function uniqueStrings(value, maxItems, maxLength = 160) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(
    values
      .map((item) => clean(item, maxLength))
      .filter(Boolean)
  )].slice(0, maxItems);
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

function rateGate(maxRequests = 60, windowMs = 60 * 60 * 1000) {
  const buckets = new Map();
  return (key = 'unknown') => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs };
      buckets.set(key, next);
      return {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - 1),
        retryAfter: 0
      };
    }
    if (current.count >= maxRequests) {
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      };
    }
    current.count += 1;
    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - current.count),
      retryAfter: 0
    };
  };
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  res.end(data);
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  const data = Buffer.from(String(body || ''));
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': data.length,
    'x-content-type-options': 'nosniff',
    ...headers
  });
  res.end(data);
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function publicInvestigationInput(body = {}) {
  const question = clean(body.question || body.query, 1200);
  if (!question) throw new TypeError('question is required.');
  return {
    question,
    region_keys: uniqueStrings(body.region_keys || body.regions || (body.region ? [body.region] : []), 50),
    asset_types: uniqueStrings(body.asset_types || body.assets || [], 30),
    crop: clean(body.crop, 120),
    water_source: clean(body.water_source, 120),
    horizon_days: boundedInt(body.horizon_days, 90, 1, 3650),
    include_weak_evidence: body.include_weak_evidence === true
  };
}

function internalAuthorized(req, internalToken) {
  return Boolean(internalToken) && bearer(req) === internalToken;
}

function applyRateHeaders(headers, gate) {
  headers['RateLimit-Limit'] = String(gate.limit);
  headers['RateLimit-Remaining'] = String(gate.remaining);
  if (!gate.allowed) headers['Retry-After'] = String(gate.retryAfter);
  return headers;
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
  if (!fs.existsSync(PUBLIC_FAIE_FILE)) throw new Error('faie_public_ui_missing');

  const instanceId = 'faie_yard_' + randomBytes(12).toString('hex');
  let deploymentReceiptRef = '';
  const token = clean(internalToken, 512);
  const publicGate = rateGate(60, 60 * 60 * 1000);
  const resolvedCollectorConfig = collectorConfig || resolveFaieYardCollectorConfig({
    officialCollectorsEnabled,
    nwsEnabled,
    regionProfile,
    nwsArea,
    usgsWaterSites,
    usgsWaterParameters,
    nwpsGauges
  });

  const faie = createFaieRuntime({
    stateDir,
    intervalMs,
    radarResident: null,
    fetchImpl,
    collectorConfig: resolvedCollectorConfig
  });

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

  const server = http.createServer(async (req, res) => {
    try {
      const method = String(req.method || 'GET').toUpperCase();
      const url = new URL(req.url || '/', 'http://faie.local');
      const pathname = url.pathname;

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-allow-methods': 'GET, POST, OPTIONS'
        });
        res.end();
        return;
      }

      if (method === 'GET' && pathname === '/') {
        res.writeHead(308, { location: '/faie/' });
        res.end();
        return;
      }

      if (method === 'GET' && (pathname === '/faie/' || pathname === '/faie/index.html')) {
        const html = fs.readFileSync(PUBLIC_FAIE_FILE);
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': html.length,
          'cache-control': 'public, max-age=60, must-revalidate',
          'x-content-type-options': 'nosniff'
        });
        res.end(html);
        return;
      }

      if (method === 'GET' && pathname === '/health') {
        return sendJson(res, 200, health());
      }

      if (method === 'GET' && pathname === '/api/faie/health') {
        return sendJson(res, 200, faie.health());
      }

      if (method === 'GET' && pathname === '/api/faie/signals') {
        const limit = boundedInt(url.searchParams.get('limit'), 50, 1, 200);
        return sendJson(res, 200, faie.snapshot(limit), {
          'cache-control': 'public, max-age=30, must-revalidate'
        });
      }

      if (method === 'GET' && pathname === '/mcp/faie') {
        if (url.searchParams.get('action') !== 'health') {
          return sendJson(res, 405, {
            ok: false,
            error: 'Use MCP Streamable HTTP POST or ?action=health.'
          });
        }
        return sendJson(res, 200, {
          ok: true,
          service: 'FAIE',
          server: 'evercraft-faie',
          version: '1.0.0',
          transport: 'Streamable HTTP',
          tools: faieMcpTools().map((tool) => tool.name),
          runtime: 'Evercraft Compute',
          instance_id: instanceId,
          deployment_receipt_bound: Boolean(deploymentReceiptRef),
          deployment_receipt_ref: deploymentReceiptRef || null,
          persisted_public_investigations: false,
          checkout_enabled: false,
          payment_enabled: false,
          decision_authority: false,
          publication_authority: false
        });
      }

      if (method === 'POST' && pathname === '/mcp/faie') {
        const gate = publicGate(req.socket.remoteAddress || 'unknown');
        const rateHeaders = applyRateHeaders({
          'access-control-allow-origin': '*'
        }, gate);
        if (!gate.allowed) {
          return sendJson(res, 429, {
            ok: false,
            error: 'FAIE public request limit exceeded.'
          }, rateHeaders);
        }
        const rpc = await readJson(req);
        const response = await executeFaieMcpRpc(faie, rpc);
        if (response === null) {
          res.writeHead(202, rateHeaders);
          res.end();
          return;
        }
        return sendJson(res, 200, response, rateHeaders);
      }

      if (method === 'POST' && pathname === '/api/faie/investigate') {
        const gate = publicGate(req.socket.remoteAddress || 'unknown');
        const rateHeaders = applyRateHeaders({}, gate);
        if (!gate.allowed) {
          return sendJson(res, 429, {
            ok: false,
            error: 'FAIE public request limit exceeded.'
          }, rateHeaders);
        }
        try {
          const body = await readJson(req);
          const investigation = faie.preview(publicInvestigationInput(body));
          return sendJson(res, 200, publicFaieInvestigation(investigation), rateHeaders);
        } catch (error) {
          return sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          }, rateHeaders);
        }
      }

      const internalOnly = pathname.startsWith('/api/faie/investigations') ||
        pathname === '/api/faie/ingest' ||
        pathname === '/api/faie/worldstate-dispatch' ||
        pathname === '/api/faie/run';

      if (internalOnly && !token) {
        return sendJson(res, 503, {
          ok: false,
          error: 'FAIE internal write authority is not configured.'
        });
      }
      if (internalOnly && !internalAuthorized(req, token)) {
        return sendJson(res, 401, { ok: false, error: 'Unauthorized.' });
      }

      if (method === 'GET' && pathname === '/api/faie/investigations') {
        const limit = boundedInt(url.searchParams.get('limit'), 10, 1, 50);
        return sendJson(res, 200, {
          schema: 'evercraft.faie.investigation-index.public.v1',
          investigations: faie.latestInvestigations(limit).map(publicFaieInvestigation)
        });
      }

      const markdownMatch = pathname.match(/^\/api\/faie\/investigations\/([^/]+)\/markdown$/);
      if (method === 'GET' && markdownMatch) {
        const investigation = faie.getInvestigation(decodeURIComponent(markdownMatch[1]));
        if (!investigation) return sendText(res, 404, 'FAIE investigation not found.');
        return sendText(
          res,
          200,
          investigationToMarkdown(publicFaieInvestigation(investigation)),
          'text/markdown; charset=utf-8',
          { 'cache-control': 'no-store' }
        );
      }

      const investigationMatch = pathname.match(/^\/api\/faie\/investigations\/([^/]+)$/);
      if (method === 'GET' && investigationMatch) {
        const investigation = faie.getInvestigation(decodeURIComponent(investigationMatch[1]));
        if (!investigation) {
          return sendJson(res, 404, { ok: false, error: 'FAIE investigation not found.' });
        }
        return sendJson(res, 200, publicFaieInvestigation(investigation));
      }

      if (method === 'POST' && pathname === '/api/faie/investigations') {
        try {
          const body = await readJson(req);
          const investigation = faie.investigate(publicInvestigationInput(body));
          return sendJson(res, 201, publicFaieInvestigation(investigation));
        } catch (error) {
          return sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      if (method === 'POST' && pathname === '/api/faie/ingest') {
        try {
          const body = await readJson(req);
          const decision = faie.ingest(body.observation || body);
          return sendJson(res, decision.action === 'ignored' ? 202 : 200, {
            ok: true,
            decision
          });
        } catch (error) {
          return sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      if (method === 'POST' && pathname === '/api/faie/worldstate-dispatch') {
        try {
          const body = await readJson(req);
          if (body.dispatch?.consumer !== 'faie') {
            return sendJson(res, 202, {
              ok: true,
              decision: { action: 'ignored', reason: 'not_faie_consumer' }
            });
          }
          const decision = faie.ingest(body.observation);
          return sendJson(res, decision.action === 'ignored' ? 202 : 200, {
            ok: true,
            dispatch_key: body.dispatch?.dispatch_key || null,
            decision
          });
        } catch (error) {
          return sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      if (method === 'POST' && pathname === '/api/faie/run') {
        const body = await readJson(req);
        const receipt = await faie.runOnce({
          externalObservations: Array.isArray(body.observations) ? body.observations : []
        });
        return sendJson(res, receipt.status === 'partial' ? 207 : 200, receipt);
      }

      return sendJson(res, 404, { ok: false, error: 'FAIE route not found.' });
    } catch (error) {
      const status = String(error?.message || error) === 'request_body_too_large' ? 413 : 500;
      return sendJson(res, status, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port) || 0, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : Number(port) || 0;
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${displayHost}:${actualPort}`;

  faie.start();

  return {
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
