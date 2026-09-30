import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPERATION_PATHS = Object.freeze({
  '/api/core/invoke-llm': 'invoke_llm',
  '/api/core/upload-file': 'upload_file',
  '/api/core/send-email': 'send_email',
  '/api/core/send-sms': 'send_sms',
  '/api/core/generate-image': 'generate_image',
  '/api/core/extract-data': 'extract_data',
});

const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;

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

async function readJson(req, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function safeFilename(value = 'upload.bin') {
  const base = path.basename(String(value || 'upload.bin'));
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'upload.bin').slice(0, 180);
}

function normalizeBase64(value) {
  const raw = String(value ?? '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  return {
    mimeType: match ? clean(match[1], 160) : '',
    data: match ? match[2] : raw,
  };
}

function decodeUpload(payload = {}) {
  const encoded = normalizeBase64(payload.data_base64 ?? payload.base64 ?? payload.data_uri ?? '');
  if (!encoded.data) throw new Error('upload_data_missing');
  const bytes = Buffer.from(encoded.data, 'base64');
  if (!bytes.length) throw new Error('upload_data_empty');
  return {
    bytes,
    filename: safeFilename(payload.filename || payload.name || 'upload.bin'),
    mimeType: clean(payload.mime_type || payload.mimeType || encoded.mimeType || 'application/octet-stream', 160),
  };
}

function digestBuffer(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      row.push(field);
      field = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((item) => item.length)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some((item) => item.length)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((item, index) => clean(item, 200) || `column_${index + 1}`);
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  );
}

function extractLocal(payload = {}) {
  const encoded = normalizeBase64(payload.data_base64 ?? payload.base64 ?? payload.data_uri ?? '');
  const mimeType = clean(payload.mime_type || payload.mimeType || encoded.mimeType || '', 160).toLowerCase();
  const filename = clean(payload.filename || payload.name || '', 240).toLowerCase();
  let text = '';

  if (encoded.data) text = Buffer.from(encoded.data, 'base64').toString('utf8');
  else if (payload.text !== undefined) text = String(payload.text);
  else if (payload.content !== undefined) text = typeof payload.content === 'string'
    ? payload.content
    : JSON.stringify(payload.content);
  else throw new Error('extract_input_missing');

  if (mimeType.includes('json') || filename.endsWith('.json')) {
    return { type: 'json', data: JSON.parse(text) };
  }
  if (mimeType.includes('csv') || filename.endsWith('.csv')) {
    return { type: 'csv', data: parseCsv(text) };
  }
  return { type: 'text', data: text };
}

function adapterUrl(value) {
  const raw = clean(value, 2000);
  if (!raw) return '';
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('adapter_url_protocol_invalid');
  return url.toString();
}

function environmentConfig(env = process.env) {
  return {
    uploadRoot: path.resolve(env.SYSTEMIA_CORE_UPLOAD_ROOT || './runtime/core-uploads'),
    uploadPublicBase: clean(env.SYSTEMIA_CORE_UPLOAD_PUBLIC_BASE || '', 2000).replace(/\/$/, ''),
    corsOrigin: clean(env.SYSTEMIA_CORE_CORS_ORIGIN || '', 1000),
    adapterSecret: clean(env.SYSTEMIA_CORE_ADAPTER_SECRET || '', 4000),
    adapterUrls: {
      invoke_llm: adapterUrl(env.SYSTEMIA_CORE_INVOKE_LLM_URL || ''),
      send_email: adapterUrl(env.SYSTEMIA_CORE_SEND_EMAIL_URL || ''),
      send_sms: adapterUrl(env.SYSTEMIA_CORE_SEND_SMS_URL || ''),
      generate_image: adapterUrl(env.SYSTEMIA_CORE_GENERATE_IMAGE_URL || ''),
    },
  };
}

async function callHttpAdapter(operation, payload, config) {
  const url = config.adapterUrls?.[operation];
  if (!url) throw new Error(`core_adapter_unconfigured:${operation}`);
  const headers = {
    'content-type': 'application/json',
    'x-evercraft-operation': operation,
  };
  if (config.adapterSecret) headers.authorization = `Bearer ${config.adapterSecret}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ operation, payload }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { value: text };
  }
  if (!response.ok) {
    const message = clean(body?.error || body?.message || text || `adapter_http_${response.status}`, 1200);
    throw new Error(message);
  }
  if (body && Object.prototype.hasOwnProperty.call(body, 'value')) return body.value;
  if (body && Object.prototype.hasOwnProperty.call(body, 'result')) return body.result;
  return body;
}

async function uploadLocal(payload, config) {
  const decoded = decodeUpload(payload);
  fs.mkdirSync(config.uploadRoot, { recursive: true, mode: 0o750 });
  const id = crypto.randomUUID();
  const filename = `${id}-${decoded.filename}`;
  const target = path.join(config.uploadRoot, filename);
  fs.writeFileSync(target, decoded.bytes, { mode: 0o640 });
  const sha256 = digestBuffer(decoded.bytes);
  const fileUrl = config.uploadPublicBase
    ? `${config.uploadPublicBase}/${encodeURIComponent(filename)}`
    : `evercraft://core-uploads/${filename}`;
  return {
    file_url: fileUrl,
    filename,
    mime_type: decoded.mimeType,
    bytes: decoded.bytes.length,
    sha256,
  };
}

function normalizeAdapterResult(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

export async function executeCoreOperation(
  operation,
  payload = {},
  { adapters = {}, config = environmentConfig() } = {},
) {
  if (!Object.values(OPERATION_PATHS).includes(operation)) {
    throw new Error('core_operation_unsupported');
  }

  if (operation === 'upload_file') return uploadLocal(payload, config);
  if (operation === 'extract_data') return extractLocal(payload);

  const adapter = adapters[operation];
  if (typeof adapter === 'function') {
    return normalizeAdapterResult(await adapter(payload, { operation, config }));
  }
  return callHttpAdapter(operation, payload, config);
}

export async function startCoreGateway({
  host = '127.0.0.1',
  port = 8791,
  adapters = {},
  config = environmentConfig(),
} = {}) {
  const health = () => ({
    ok: true,
    service: 'evercraft-core-gateway',
    schema: 'evercraft.systemia.core-gateway-health.v1',
    legacy_provider_transport: false,
    runtime_owner: 'evercraft',
    operations: Object.values(OPERATION_PATHS),
    local_operations: ['upload_file', 'extract_data'],
    configured_adapters: Object.fromEntries(
      ['invoke_llm', 'send_email', 'send_sms', 'generate_image'].map((operation) => [
        operation,
        typeof adapters[operation] === 'function' || Boolean(config.adapterUrls?.[operation]),
      ])
    ),
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

      if (req.method === 'GET' && (req.url === '/health' || req.url === '/api/core/health')) {
        return sendJson(res, 200, health(), { corsOrigin: config.corsOrigin });
      }

      const operation = OPERATION_PATHS[req.url || ''];
      if (!operation) return sendJson(res, 404, { ok: false, error: 'not_found' }, { corsOrigin: config.corsOrigin });
      if (req.method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'method_not_allowed' }, { corsOrigin: config.corsOrigin });
      }

      const payload = await readJson(req);
      const value = await executeCoreOperation(operation, payload, { adapters, config });
      return sendJson(res, 200, {
        ok: true,
        schema: 'evercraft.systemia.core-operation-result.v1',
        operation,
        value,
      }, { corsOrigin: config.corsOrigin });
    } catch (error) {
      return sendJson(res, 502, {
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
      server.close((error) => error ? reject(error) : resolve())
    ),
  };
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const host = String(arg('--host', process.env.SYSTEMIA_CORE_HOST || '127.0.0.1'));
  const port = Number(arg('--port', process.env.SYSTEMIA_CORE_PORT || '8791'));
  const runtime = await startCoreGateway({ host, port });
  process.stdout.write(JSON.stringify({
    ok: true,
    url: runtime.url,
    ...runtime.health(),
  }, null, 2) + '\n');

  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
