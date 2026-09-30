import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteEntityStore } from './entity-store.mjs';

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function sendJson(res, status, body, { corsOrigin = '' } = {}) {
  const data = Buffer.from(JSON.stringify(body));
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(data.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
  if (corsOrigin) headers['access-control-allow-origin'] = corsOrigin;
  res.writeHead(status, headers);
  res.end(data);
}

async function readJson(req, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function environmentConfig(env = process.env) {
  return {
    dataFile: path.resolve(env.SYSTEMIA_APP_DATA_FILE || './runtime/evercraft-app.sqlite'),
    corsOrigin: clean(env.SYSTEMIA_APP_CORS_ORIGIN || '', 1000),
    allowAnonymousRead: String(env.SYSTEMIA_APP_ALLOW_ANONYMOUS_READ || '').toLowerCase() === 'true',
    allowAnonymousWrite: String(env.SYSTEMIA_APP_ALLOW_ANONYMOUS_WRITE || '').toLowerCase() === 'true',
    authAdapterUrl: clean(env.SYSTEMIA_AUTH_ADAPTER_URL || '', 2000),
    authAdapterSecret: clean(env.SYSTEMIA_AUTH_ADAPTER_SECRET || '', 4000),
    functionRouterUrl: clean(env.SYSTEMIA_FUNCTION_ROUTER_URL || '', 2000),
    functionRouterSecret: clean(env.SYSTEMIA_FUNCTION_ROUTER_SECRET || '', 4000),
  };
}

function bearer(req) {
  const raw = clean(req.headers.authorization || '', 8000);
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : '';
}

async function callJsonAdapter(url, secret, body) {
  if (!url) throw new Error('adapter_unconfigured');
  const headers = { 'content-type': 'application/json' };
  if (secret) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { value: text };
  }
  if (!response.ok) throw new Error(clean(parsed?.error || parsed?.message || text || `adapter_http_${response.status}`, 1200));
  return Object.prototype.hasOwnProperty.call(parsed, 'value') ? parsed.value : parsed;
}

async function authorize(req, { action, entity = '', config, adapters }) {
  const token = bearer(req);
  if (typeof adapters.auth === 'function') {
    const result = await adapters.auth('authorize', { token, action, entity });
    if (!result?.allowed) throw new Error('forbidden');
    return result.user || null;
  }
  if (config.authAdapterUrl) {
    const result = await callJsonAdapter(config.authAdapterUrl, config.authAdapterSecret, {
      operation: 'authorize',
      token,
      action,
      entity,
    });
    if (!result?.allowed) throw new Error('forbidden');
    return result.user || null;
  }
  const allowed = action === 'read' ? config.allowAnonymousRead : config.allowAnonymousWrite;
  if (!allowed) throw new Error('auth_adapter_unconfigured');
  return null;
}

async function authOperation(operation, args, req, config, adapters) {
  const token = bearer(req);
  if (typeof adapters.auth === 'function') return adapters.auth(operation, { token, args });
  if (!config.authAdapterUrl) throw new Error('auth_adapter_unconfigured');
  return callJsonAdapter(config.authAdapterUrl, config.authAdapterSecret, {
    operation,
    token,
    args,
  });
}

async function functionOperation(name, payload, req, config, adapters) {
  const token = bearer(req);
  if (typeof adapters.functions === 'function') return adapters.functions(name, payload, { token });
  if (!config.functionRouterUrl) throw new Error('function_router_unconfigured');
  return callJsonAdapter(config.functionRouterUrl, config.functionRouterSecret, {
    function: name,
    payload,
    token,
  });
}

function statusForError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'forbidden') return 403;
  if (message === 'auth_adapter_unconfigured') return 401;
  if (message === 'entity_record_not_found') return 404;
  return 502;
}

export async function startAppGateway({
  host = '127.0.0.1',
  port = 8792,
  store = null,
  adapters = {},
  config = environmentConfig(),
} = {}) {
  const entityStore = store || new SqliteEntityStore({ filename: config.dataFile });
  const ownsStore = !store;

  const health = () => ({
    ok: true,
    service: 'evercraft-app-runtime',
    schema: 'evercraft.systemia.app-runtime-health.v1',
    runtime_owner: 'evercraft',
    legacy_sdk_transport: false,
    data_backend: 'sqlite',
    auth_enforcement: typeof adapters.auth === 'function' || Boolean(config.authAdapterUrl)
      ? 'adapter'
      : (config.allowAnonymousRead || config.allowAnonymousWrite ? 'anonymous_canary_only' : 'fail_closed'),
    function_router_configured: typeof adapters.functions === 'function' || Boolean(config.functionRouterUrl),
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        const headers = {
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
          'cache-control': 'no-store',
        };
        if (config.corsOrigin) headers['access-control-allow-origin'] = config.corsOrigin;
        res.writeHead(204, headers);
        return res.end();
      }

      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/app/health')) {
        return sendJson(res, 200, health(), { corsOrigin: config.corsOrigin });
      }

      const entityMatch = url.pathname.match(/^\/api\/entities\/([A-Za-z][A-Za-z0-9_]{0,79})\/(list|filter|create|update|delete)$/);
      if (entityMatch) {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' }, { corsOrigin: config.corsOrigin });
        const [, entity, operation] = entityMatch;
        const body = await readJson(req);
        const access = ['list', 'filter'].includes(operation) ? 'read' : 'write';
        const user = await authorize(req, { action: access, entity, config, adapters });

        let value;
        if (operation === 'list') {
          value = entityStore.list(entity, body);
        } else if (operation === 'filter') {
          value = entityStore.filter(entity, body.query || {}, body);
        } else if (operation === 'create') {
          value = entityStore.create(entity, body.data || {}, { actorId: user?.id || '' });
        } else if (operation === 'update') {
          value = entityStore.update(entity, body.id, body.data || {});
        } else {
          value = entityStore.delete(entity, body.id);
        }

        return sendJson(res, 200, { ok: true, value }, { corsOrigin: config.corsOrigin });
      }

      if (url.pathname === '/api/functions/invoke') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' }, { corsOrigin: config.corsOrigin });
        const body = await readJson(req);
        await authorize(req, { action: 'read', entity: `function:${clean(body.name, 120)}`, config, adapters });
        const value = await functionOperation(clean(body.name, 120), body.payload || {}, req, config, adapters);
        return sendJson(res, 200, { ok: true, value }, { corsOrigin: config.corsOrigin });
      }

      const authMatch = url.pathname.match(/^\/api\/auth\/([A-Za-z0-9_-]+)$/);
      if (authMatch) {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' }, { corsOrigin: config.corsOrigin });
        const body = await readJson(req);
        const value = await authOperation(authMatch[1], body.args || [], req, config, adapters);
        return sendJson(res, 200, { ok: true, value }, { corsOrigin: config.corsOrigin });
      }

      return sendJson(res, 404, { ok: false, error: 'not_found' }, { corsOrigin: config.corsOrigin });
    } catch (error) {
      return sendJson(res, statusForError(error), {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }, { corsOrigin: config.corsOrigin });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}`,
    health,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => {
        if (ownsStore) entityStore.close();
        error ? reject(error) : resolve();
      })
    ),
  };
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const host = String(arg('--host', process.env.SYSTEMIA_APP_HOST || '127.0.0.1'));
  const port = Number(arg('--port', process.env.SYSTEMIA_APP_PORT || '8792'));
  const runtime = await startAppGateway({ host, port });
  process.stdout.write(JSON.stringify({ ok: true, url: runtime.url, ...runtime.health() }, null, 2) + '\n');
  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
