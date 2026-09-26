import http from 'node:http';
import { randomBytes } from 'node:crypto';

export const SPECIALIST_HANDOFFS = [
  {
    slug: 'ibmi-rescue',
    path: '/mcp/ibmi-rescue',
    server_name: 'evercraft-ibmi-rescue',
    title: 'Evercraft IBM i Rescue',
    public_id: 'ibmi-rescue-v1',
    get_offer_tool: 'get_ibmi_rescue_offer',
    prepare_handoff_tool: 'prepare_ibmi_rescue_handoff',
    description: 'IBM i / AS400 estate assessment, dependency mapping, upgrade-risk review, modernization proof, and rollback/test planning.',
    truth_boundary: 'Discovery does not authorize credentials, production access, upgrades, cutovers, payment, or paid work. This MCP is read-only offer and human-handoff preparation.',
  },
  {
    slug: 'foundry-app-escape',
    path: '/mcp/foundry-app-escape',
    server_name: 'evercraft-foundry-app-escape',
    title: 'Evercraft Foundry App Escape Audit',
    public_id: 'foundry-app-escape-audit-v1',
    get_offer_tool: 'get_foundry_app_escape_offer',
    prepare_handoff_tool: 'prepare_foundry_app_escape_handoff',
    description: 'App portability, builder lock-in, dependency, security, reconstruction, migration, and rollback analysis.',
    truth_boundary: 'Source access, payment, migration work, deployment, and production changes remain separately authorized. This MCP is read-only offer and human-handoff preparation.',
  },
  {
    slug: 'site-survive',
    path: '/mcp/site-survive',
    server_name: 'evercraft-site-survive',
    title: 'Site-Survive Rapid Audit',
    public_id: 'site-survive-rapid-audit-v1',
    get_offer_tool: 'get_site_survive_offer',
    prepare_handoff_tool: 'prepare_site_survive_handoff',
    description: 'Site continuity and connectivity-outage dependency analysis with prioritized resilience planning.',
    truth_boundary: 'This MCP does not create payment, perform the paid resilience audit, change networks, or guarantee continuity. It is read-only offer and human-handoff preparation.',
  },
];

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': data.length,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function toolList(def) {
  return [
    {
      name: def.get_offer_tool,
      title: `Get ${def.title} offer`,
      description: `Read the current published offer, pricing, invocation state, and confirmation boundary for ${def.title}. Creates no checkout, payment, obligation, entitlement, access, or work.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: def.prepare_handoff_tool,
      title: `Prepare ${def.title} human review`,
      description: `Return the current human review handoff for ${def.title}. Creates no checkout, payment, obligation, entitlement, source access, production access, or paid work.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function defaultGatewayFetch(gatewayUrl, action, publicId) {
  const target = new URL(gatewayUrl);
  if (target.protocol !== 'https:') throw new Error('machine_commerce_gateway_must_use_https');
  target.searchParams.set('action', action);
  target.searchParams.set('public_id', publicId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(target, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Evercraft-Specialist-Handoff-Runtime/0.1.0',
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `machine_commerce_gateway_http_${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function executeSpecialistRpc(def, rpc, gatewayFetch) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: def.server_name, version: '0.1.0' },
      instructions: `${def.description} ${def.truth_boundary}`,
    });
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: toolList(def) });
  }

  if (method === 'notifications/initialized') return null;

  if (method === 'tools/call') {
    const tool = String(rpc?.params?.name || '');
    let action = null;
    if (tool === def.get_offer_tool) action = 'offer';
    if (tool === def.prepare_handoff_tool) action = 'service_handoff';
    if (!action) return rpcError(id, -32602, 'Unknown or unsupported specialist tool.');

    const data = await gatewayFetch(action, def.public_id);
    const payload = {
      ...data,
      direct_specialist: true,
      specialist: def.title,
      public_id: def.public_id,
      checkout_created: false,
      payment_created: false,
      payment_obligation_created: false,
      truth_boundary: def.truth_boundary,
    };
    return rpcResult(id, {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: false,
    });
  }

  return rpcError(id, -32601, 'Method not found.');
}

export async function startSpecialistHandoffRuntime({
  host = '127.0.0.1',
  port = 0,
  gatewayUrl = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway',
  gatewayFetch = null,
} = {}) {
  const instanceId = `specialist_handoff_${randomBytes(12).toString('hex')}`;
  let deploymentReceiptRef = '';
  const callGateway = gatewayFetch || ((action, publicId) =>
    defaultGatewayFetch(gatewayUrl, action, publicId));

  const health = () => ({
    ok: true,
    service: 'specialist-handoff-mcp',
    runtime: 'Evercraft Compute',
    instance_id: instanceId,
    version: '0.1.0',
    deployment_receipt_bound: Boolean(deploymentReceiptRef),
    deployment_receipt_ref: deploymentReceiptRef || null,
    checkout_enabled: false,
    payment_enabled: false,
    legacy_adapter: 'evercraft_machine_commerce_gateway',
    specialist_paths: SPECIALIST_HANDOFFS.map((x) => ({
      product: x.title,
      path: x.path,
      public_id: x.public_id,
      tools: [x.get_offer_tool, x.prepare_handoff_tool],
    })),
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, health());
      }

      const def = SPECIALIST_HANDOFFS.find((x) => x.path === req.url);
      if (!def) return sendJson(res, 404, { error: 'not_found' });

      if (req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          service: def.title,
          server: def.server_name,
          version: '0.1.0',
          public_id: def.public_id,
          transport: 'Streamable HTTP',
          tools: [def.get_offer_tool, def.prepare_handoff_tool],
          checkout_enabled: false,
          payment_enabled: false,
          human_review_handoff_enabled: true,
          runtime: 'Evercraft Compute',
          instance_id: instanceId,
          deployment_receipt_bound: Boolean(deploymentReceiptRef),
          truth_boundary: def.truth_boundary,
        });
      }

      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'method_not_allowed' });
      }

      const rpc = await readJson(req);
      const response = await executeSpecialistRpc(def, rpc, callGateway);
      if (response === null) {
        res.writeHead(202, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      return sendJson(res, 200, response);
    } catch (error) {
      return sendJson(res, 502, rpcError(
        null,
        -32000,
        error instanceof Error ? error.message : String(error)
      ));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;

  return {
    schema: 'evercraft.specialist-handoff-runtime.v1',
    instanceId,
    url,
    health,
    setDeploymentReceipt(ref) {
      const value = String(ref || '').trim();
      if (!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/i.test(value)) {
        throw new Error('deployment_receipt_ref_invalid');
      }
      deploymentReceiptRef = value;
      return health();
    },
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
  };
}
