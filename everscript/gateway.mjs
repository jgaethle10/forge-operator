import { createServer } from 'node:http';
import { buildCapabilityIndex, compile, run, verifyReceipt } from './everscript.mjs';
import { buildAgentDescriptor, manifestsToMcpTools } from './agent-bridge.mjs';

async function readJson(request, maxBytes = 1_000_000) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(response, status, body) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

export function createAgentGateway({
  capabilities = [],
  approvalProvider,
  meter,
  replayStore,
  authorize = async () => true,
  requireSignedManifests = false,
  trustedManifestKeys = {},
} = {}) {
  const manifests = capabilities.map((capability) => capability.manifest);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const authorized = await authorize(request, { path: url.pathname, method: request.method });
      if (!authorized) return send(response, 401, { error: 'unauthorized' });

      if (request.method === 'GET' && url.pathname === '/.well-known/everscript/capabilities') {
        return send(response, 200, buildCapabilityIndex(manifests));
      }

      if (request.method === 'GET' && url.pathname === '/.well-known/evercraft-agent.json') {
        const host = request.headers.host ? `http://${request.headers.host}` : '';
        return send(response, 200, buildAgentDescriptor(manifests, { baseUrl: host }));
      }

      if (request.method === 'GET' && url.pathname === '/v1/mcp/tools') {
        return send(response, 200, { tools: manifestsToMcpTools(manifests) });
      }

      if (request.method === 'POST' && url.pathname === '/v1/compile') {
        const body = await readJson(request);
        if (typeof body.source !== 'string') return send(response, 400, { error: 'source must be a string' });
        const plan = compile(body.source, { manifests, requireSignedManifests, trustedManifestKeys });
        return send(response, 200, { plan });
      }

      if (request.method === 'POST' && url.pathname === '/v1/run') {
        const body = await readJson(request);
        if (typeof body.source !== 'string') return send(response, 400, { error: 'source must be a string' });
        const plan = compile(body.source, { manifests, requireSignedManifests, trustedManifestKeys });
        const result = await run(plan, body.input ?? {}, {
          capabilities,
          approvalProvider,
          meter,
          replayStore,
        });
        return send(response, 200, { ...result, receiptValid: verifyReceipt(result.receipt) });
      }

      return send(response, 404, { error: 'not_found' });
    } catch (error) {
      return send(response, 400, {
        error: error?.name ?? 'Error',
        message: error instanceof Error ? error.message : String(error),
        receipt: error?.receipt ?? null,
      });
    }
  });
}
