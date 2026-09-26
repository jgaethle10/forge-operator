import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handleForensiScopeMcpHttp } from './mcp-http.mjs';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(res, status, body, headers = {}) {
  const payload = body === null ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...(body === null ? {} : {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload)
    }),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  res.end(payload);
}

async function readJson(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw Object.assign(new Error('request_body_too_large'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    throw Object.assign(new Error('json_body_required'), { statusCode: 400 });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('invalid_json'), { statusCode: 400 });
  }
}

function cleanHeaders(headers = {}) {
  const allowed = new Set([
    'content-type',
    'mcp-protocol-version',
    'mcp-method',
    'mcp-name',
    'mcp-param-evidence-access',
    'mcp-param-evidence-access-a',
    'mcp-param-evidence-access-b'
  ]);
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => allowed.has(String(key).toLowerCase()))
      .map(([key, value]) => [String(key).toLowerCase(), value])
  );
}

export async function startForensiScopeEvidenceService({
  stateRoot,
  host = '127.0.0.1',
  port = 0,
  deploymentReceiptRef = null
} = {}) {
  const rootDir = path.resolve(String(stateRoot || ''));
  if (!rootDir) throw new Error('ForensiScope evidence service requires stateRoot.');
  fs.mkdirSync(path.join(rootDir, 'artifacts', 'forensiscope-results'), {
    recursive: true,
    mode: 0o700
  });

  const instanceId = 'forensiscope-evidence-' + crypto.randomBytes(12).toString('hex');
  const startedAt = new Date().toISOString();

  const runtime = {
    endpoint: null,
    instanceId,
    health() {
      return {
        ok: true,
        service: 'forensiscope-evidence-query',
        schema: 'evercraft.forensiscope.evidence-service-health.v1',
        instance_id: instanceId,
        started_at: startedAt,
        runtime: 'Evercraft Compute',
        mcp_path: '/mcp',
        raw_media_intake: false,
        starts_analysis_jobs: false,
        checkout_or_payment: false,
        evidence_access_required: true,
        deployment_receipt_bound: Boolean(deploymentReceiptRef),
        deployment_receipt_ref: deploymentReceiptRef || null
      };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/v1/health') {
        return sendJson(res, 200, runtime.health());
      }

      if (req.method === 'POST' && req.url === '/mcp') {
        const body = await readJson(req);
        const response = handleForensiScopeMcpHttp({
          method: req.method,
          headers: cleanHeaders(req.headers),
          body,
          rootDir
        });
        return sendJson(
          res,
          response.status,
          response.body,
          response.headers || {}
        );
      }

      if (req.method === 'GET' && req.url === '/mcp') {
        return sendJson(res, 405, {
          error: 'post_required',
          raw_media_intake: false
        }, { allow: 'POST' });
      }

      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      return sendJson(
        res,
        Number(error?.statusCode || 500),
        {
          error: String(error?.message || error),
          service: 'forensiscope-evidence-query'
        }
      );
    }
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const boundHost =
    typeof address === 'object' && address
      ? (address.address === '::' ? '[::1]' : address.address)
      : host;
  const boundPort = typeof address === 'object' && address ? address.port : port;
  runtime.endpoint = `http://${boundHost}:${boundPort}`;

  return runtime;
}
