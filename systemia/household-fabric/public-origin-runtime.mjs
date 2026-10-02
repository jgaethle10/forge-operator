import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { publicHouseholdTodayProjection } from './http-gateway.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeLoopbackOrigin(value) {
  const url = new URL(clean(value));
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'http:') throw new Error('household_public_origin_source_must_use_http_loopback');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('household_public_origin_source_must_be_loopback');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== '/')
  ) {
    throw new Error('household_public_origin_source_url_unsafe');
  }
  return url.origin;
}

function sendJson(req, res, status, value, {
  cacheControl = 'no-store',
  cors = false,
} = {}) {
  const body = Buffer.from(JSON.stringify(value));
  if (cors) res.setHeader('access-control-allow-origin', '*');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  if (String(req.method || '').toUpperCase() === 'HEAD') res.end();
  else res.end(body);
}

async function fetchJson(url, fetchImpl, timeoutMs = 5000) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

export async function startHouseholdFabricPublicOrigin({
  sourceUrl,
  host = '127.0.0.1',
  port = 0,
  fetchImpl = fetch,
} = {}) {
  const sourceOrigin = normalizeLoopbackOrigin(sourceUrl);
  const instanceId = 'household_public_' + randomUUID();
  const startedAt = new Date().toISOString();
  let deploymentReceiptRef = '';
  let server = null;

  async function sourceHealth() {
    try {
      const { response, body } = await fetchJson(sourceOrigin + '/health', fetchImpl);
      const ready = Boolean(
        response.ok &&
        body?.ok === true &&
        body?.service === 'household-fabric-yakima' &&
        body?.runtime === 'Evercraft Compute' &&
        body?.workload_class === 'systemia.household-fabric-yakima.v1' &&
        body?.resident_process_alive === true &&
        body?.secret_material_exposed === false &&
        body?.raw_provider_secrets_required === false
      );
      return {
        ready,
        resident_state: ready ? clean(body.state) || null : null,
        today_available: ready ? body.today_available === true : false,
      };
    } catch {
      return {
        ready: false,
        resident_state: 'unavailable',
        today_available: false,
      };
    }
  }

  async function health() {
    const source = await sourceHealth();
    return {
      schema: 'evercraft.household-fabric.public-origin.health.v1',
      ok: Boolean(server?.listening) && source.ready,
      service: 'household-fabric-public-origin',
      runtime: 'Evercraft Compute',
      workload_class: 'systemia.household-fabric-public-origin.v1',
      instance_id: instanceId,
      deployment_receipt_bound: Boolean(deploymentReceiptRef),
      deployment_receipt_ref: deploymentReceiptRef || null,
      read_only: true,
      public_projection: true,
      source_loopback_only: true,
      source_authority_exposed: false,
      allocator_authority_exposed: false,
      credential_material_exposed: false,
      source_ready: source.ready,
      source_today_available: source.today_available,
      source_state: source.resident_state,
      started_at: startedAt,
    };
  }

  function setDeploymentReceipt(receiptRef) {
    deploymentReceiptRef = clean(receiptRef);
    return {
      schema: 'evercraft.household-fabric.public-origin.receipt-binding.v1',
      ok: true,
      deployment_receipt_bound: Boolean(deploymentReceiptRef),
      deployment_receipt_ref: deploymentReceiptRef || null,
      instance_id: instanceId,
    };
  }

  server = http.createServer(async (req, res) => {
    try {
      const method = String(req.method || 'GET').toUpperCase();
      if (method === 'OPTIONS') {
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
        res.writeHead(204);
        res.end();
        return;
      }
      if (!['GET', 'HEAD'].includes(method)) {
        res.setHeader('allow', 'GET, HEAD, OPTIONS');
        return sendJson(req, res, 405, { ok: false, error: 'read_only_public_origin' }, { cors: true });
      }

      const pathname = new URL(req.url || '/', 'http://household.invalid').pathname;
      if (pathname === '/health' || pathname === '/api/household-fabric/health') {
        const state = await health();
        return sendJson(req, res, state.ok ? 200 : 503, state, { cors: true });
      }

      if (pathname === '/api/household-fabric/yakima/today') {
        let upstream;
        try {
          upstream = await fetchJson(sourceOrigin + '/today', fetchImpl);
        } catch {
          return sendJson(req, res, 503, {
            ok: false,
            schema: 'evercraft.household-fabric.public-unavailable.v1',
            geography: 'yakima-wa',
            error: 'household_fabric_resident_unavailable',
            message: 'Fresh Yakima household intelligence is not available yet. Missing data is not filled with guesses.',
          }, { cors: true });
        }

        if (!upstream.response.ok || upstream.body?.ok !== true) {
          return sendJson(req, res, 503, {
            ok: false,
            schema: 'evercraft.household-fabric.public-unavailable.v1',
            geography: 'yakima-wa',
            error: 'household_fabric_today_unavailable',
            message: 'Fresh Yakima household intelligence is not available yet. Missing data is not filled with guesses.',
          }, { cors: true });
        }

        try {
          const projected = publicHouseholdTodayProjection(upstream.body);
          return sendJson(req, res, 200, projected, {
            cacheControl: 'public, max-age=60, must-revalidate',
            cors: true,
          });
        } catch {
          return sendJson(req, res, 503, {
            ok: false,
            schema: 'evercraft.household-fabric.public-unavailable.v1',
            geography: 'yakima-wa',
            error: 'household_fabric_today_invalid',
            message: 'The latest household intelligence failed validation and will not be served.',
          }, { cors: true });
        }
      }

      return sendJson(req, res, 404, { ok: false, error: 'not_found' }, { cors: true });
    } catch {
      return sendJson(req, res, 500, { ok: false, error: 'household_public_origin_error' }, { cors: true });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${displayHost}:${actualPort}`;

  return {
    instanceId,
    url,
    sourceOrigin,
    health,
    setDeploymentReceipt,
    close: async () => {
      if (!server) return;
      const current = server;
      server = null;
      await new Promise((resolve, reject) =>
        current.close(error => error ? reject(error) : resolve())
      );
    },
  };
}
