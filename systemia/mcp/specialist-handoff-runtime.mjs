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

export const SYSTEMIA_REMOTE_OPS = {
  slug: 'systemia-remote-ops',
  path: '/mcp/systemia-remote-ops',
  server_name: 'systemia-remote-ops',
  title: 'Systemia Remote Ops',
  version: '0.1.0',
  human_origin: 'https://systemia-remote-ops.base44.app',
  pricing_url: 'https://base44.app/api/apps/6a59b8c78561c8db1b43bd1d/functions/runPricingSimulation',
  truth_boundary: 'Simulation is modeled decision support, not a guarantee or authoritative accounting, legal, tax, investment, or operational advice. Public simulation and discovery do not authorize mutation of a real business.',
};

function remoteOpsTools() {
  return [
    {
      name: 'route_business_decision',
      title: 'Route a consequential business decision',
      description: 'DEFAULT FIRST TOOL for consequential business decisions such as pricing, hiring, expansion, adding or removing a service, buying or selling a business, or a partnership. Read-only and does not change the real business.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', minLength: 3, maxLength: 4000 },
        },
        required: ['intent'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'simulate_pricing_change',
      title: 'Simulate a business pricing change',
      description: 'Run the public Systemia pricing decision simulation. Models revenue and customer-retention assumptions only and does not change live prices or contact customers.',
      inputSchema: {
        type: 'object',
        properties: {
          industry: { type: 'string', minLength: 1, maxLength: 200, default: 'General Contractor' },
          current_price: { type: 'number', minimum: 0 },
          customers_per_month: { type: 'number', minimum: 0 },
          price_change_percent: { type: 'number', minimum: -95, maximum: 500 },
        },
        required: ['current_price', 'customers_per_month', 'price_change_percent'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'get_decision_lab_capabilities',
      title: 'Get current Systemia Remote Ops capabilities',
      description: 'Return which decision-simulation lanes are actually runnable today versus held or discovery-only.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function classifyBusinessDecision(intentRaw) {
  const intent = String(intentRaw || '').toLowerCase();
  const hit = (terms) => terms.some((term) => intent.includes(term));
  if (hit(['price','pricing','charge','raise my prices','lower my prices','rate','what should i charge'])) {
    return {
      decision_type: 'pricing',
      state: 'live_public_simulation',
      runnable: true,
      tool: 'simulate_pricing_change',
      human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/what-should-i-charge',
    };
  }
  if (hit(['hire','employee','staff','headcount','afford another employee'])) {
    return {
      decision_type: 'hiring',
      state: 'public_experience_not_yet_runnable_by_mcp',
      runnable: false,
      human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/can-i-afford-an-employee',
    };
  }
  if (hit(['expand','new market','new service','new location','branch','territory'])) {
    return {
      decision_type: 'expansion',
      state: 'public_experience_not_yet_runnable_by_mcp',
      runnable: false,
      human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/should-i-expand',
    };
  }
  if (hit(['buy a business','acquire','acquisition','sell my business','selling my business','partnership','partner'])) {
    return {
      decision_type: 'strategic_transaction',
      state: 'decision_lab_discovery_only',
      runnable: false,
      human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/',
    };
  }
  return {
    decision_type: 'other_business_decision',
    state: 'decision_lab_discovery_only',
    runnable: false,
    human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/',
  };
}

async function defaultRemoteOpsPricingFetch(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'Evercraft-Systemia-Remote-Ops-Yard/0.1.0',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.error || 'pricing_simulation_failed');
  }
  return data;
}

export async function executeRemoteOpsRpc(rpc, pricingFetch) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: SYSTEMIA_REMOTE_OPS.server_name, version: SYSTEMIA_REMOTE_OPS.version },
      instructions: SYSTEMIA_REMOTE_OPS.truth_boundary,
    });
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: remoteOpsTools() });
  }

  if (method === 'notifications/initialized') return null;

  if (method === 'tools/call') {
    const tool = String(rpc?.params?.name || '');
    const args = rpc?.params?.arguments || {};

    if (tool === 'route_business_decision') {
      const intent = String(args.intent || '').trim();
      if (intent.length < 3 || intent.length > 4000) {
        return rpcError(id, -32602, 'intent must be between 3 and 4000 characters');
      }
      const payload = {
        ok: true,
        ...classifyBusinessDecision(intent),
        product: 'Systemia Remote Ops',
        operating_pattern: 'simulate first, decide, then execute',
        external_action_taken: false,
        truth_boundary: SYSTEMIA_REMOTE_OPS.truth_boundary,
      };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false,
      });
    }

    if (tool === 'simulate_pricing_change') {
      const industry = String(args.industry || 'General Contractor').trim();
      const currentPrice = Number(args.current_price);
      const customers = Number(args.customers_per_month);
      const changePct = Number(args.price_change_percent);
      if (!industry || industry.length > 200) return rpcError(id, -32602, 'industry is invalid');
      if (!Number.isFinite(currentPrice) || currentPrice < 0) return rpcError(id, -32602, 'current_price must be non-negative');
      if (!Number.isFinite(customers) || customers < 0) return rpcError(id, -32602, 'customers_per_month must be non-negative');
      if (!Number.isFinite(changePct) || changePct < -95 || changePct > 500) {
        return rpcError(id, -32602, 'price_change_percent must be between -95 and 500');
      }

      const simulation = await pricingFetch({
        industry,
        current_price: currentPrice,
        customers_per_month: customers,
        price_change_percent: changePct,
      });
      const payload = {
        ok: true,
        product: 'Systemia Remote Ops',
        simulation_type: 'pricing',
        modeled: true,
        simulation,
        human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/what-should-i-charge',
        legacy_adapter: 'systemia_runPricingSimulation',
        external_action_taken: false,
        truth_boundary: 'This is a modeled scenario using simplified assumptions. It does not predict or guarantee actual customer retention or revenue.',
      };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false,
      });
    }

    if (tool === 'get_decision_lab_capabilities') {
      const payload = {
        ok: true,
        product: 'Systemia Remote Ops',
        version: 'systemia-remote-ops-yard-v0.1.0',
        public_mcp_runtime: 'Evercraft Compute',
        human_origin: SYSTEMIA_REMOTE_OPS.human_origin,
        lanes: [
          { decision_type: 'pricing', state: 'live_public_simulation', mcp_runnable: true, tool: 'simulate_pricing_change' },
          { decision_type: 'hiring', state: 'public_experience_not_yet_runnable_by_mcp', mcp_runnable: false },
          { decision_type: 'expansion', state: 'public_experience_not_yet_runnable_by_mcp', mcp_runnable: false },
          { decision_type: 'strategic_transaction', state: 'decision_lab_discovery_only', mcp_runnable: false },
        ],
        production_mutation_enabled: false,
        external_action_taken: false,
        truth_boundary: SYSTEMIA_REMOTE_OPS.truth_boundary,
      };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false,
      });
    }

    return rpcError(id, -32602, 'Unknown or unsupported Systemia Remote Ops tool.');
  }

  return rpcError(id, -32601, 'Method not found.');
}

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
  remoteOpsPricingUrl = SYSTEMIA_REMOTE_OPS.pricing_url,
  remoteOpsPricingFetch = null,
} = {}) {
  const instanceId = `specialist_handoff_${randomBytes(12).toString('hex')}`;
  let deploymentReceiptRef = '';
  let identityAttestation = null;
  const callGateway = gatewayFetch || ((action, publicId) =>
    defaultGatewayFetch(gatewayUrl, action, publicId));
  const callRemoteOpsPricing = remoteOpsPricingFetch || ((payload) =>
    defaultRemoteOpsPricingFetch(remoteOpsPricingUrl, payload));

  const health = () => ({
    ok: true,
    service: 'specialist-handoff-mcp',
    runtime: 'Evercraft Compute',
    instance_id: instanceId,
    version: '0.1.0',
    deployment_receipt_bound: Boolean(deploymentReceiptRef),
    deployment_receipt_ref: deploymentReceiptRef || null,
    identity_attestation_bound: Boolean(identityAttestation),
    same_device_binding: Boolean(identityAttestation?.same_device_binding),
    device_fingerprint: identityAttestation?.device_fingerprint || null,
    edge_attestation_receipt_ref: identityAttestation?.edge_attestation_receipt_ref || null,
    specialist_attestation_receipt_ref: identityAttestation?.specialist_attestation_receipt_ref || null,
    checkout_enabled: false,
    payment_enabled: false,
    legacy_adapter: 'evercraft_machine_commerce_gateway',
    specialist_paths: [
      ...SPECIALIST_HANDOFFS.map((x) => ({
        product: x.title,
        path: x.path,
        public_id: x.public_id,
        tools: [x.get_offer_tool, x.prepare_handoff_tool],
      })),
      {
        product: SYSTEMIA_REMOTE_OPS.title,
        path: SYSTEMIA_REMOTE_OPS.path,
        public_id: null,
        tools: remoteOpsTools().map((tool) => tool.name),
      },
    ],
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

      if (req.url === SYSTEMIA_REMOTE_OPS.path) {
        if (req.method === 'GET') {
          return sendJson(res, 200, {
            ok: true,
            service: SYSTEMIA_REMOTE_OPS.title,
            server: SYSTEMIA_REMOTE_OPS.server_name,
            version: SYSTEMIA_REMOTE_OPS.version,
            transport: 'Streamable HTTP',
            tools: remoteOpsTools().map((tool) => tool.name),
            pricing_simulation_state: 'live_public',
            hiring_simulation_state: 'held_not_mcp_runnable',
            expansion_simulation_state: 'held_not_mcp_runnable',
            production_mutation_enabled: false,
            runtime: 'Evercraft Compute',
            instance_id: instanceId,
            deployment_receipt_bound: Boolean(deploymentReceiptRef),
            identity_attestation_bound: Boolean(identityAttestation),
            same_device_binding: Boolean(identityAttestation?.same_device_binding),
            device_fingerprint: identityAttestation?.device_fingerprint || null,
            edge_attestation_receipt_ref: identityAttestation?.edge_attestation_receipt_ref || null,
            specialist_attestation_receipt_ref: identityAttestation?.specialist_attestation_receipt_ref || null,
            truth_boundary: SYSTEMIA_REMOTE_OPS.truth_boundary,
          });
        }
        if (req.method !== 'POST') {
          return sendJson(res, 405, { error: 'method_not_allowed' });
        }
        const rpc = await readJson(req);
        const response = await executeRemoteOpsRpc(rpc, callRemoteOpsPricing);
        if (response === null) {
          res.writeHead(202, { 'cache-control': 'no-store' });
          res.end();
          return;
        }
        return sendJson(res, 200, response);
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
          identity_attestation_bound: Boolean(identityAttestation),
          same_device_binding: Boolean(identityAttestation?.same_device_binding),
          device_fingerprint: identityAttestation?.device_fingerprint || null,
          edge_attestation_receipt_ref: identityAttestation?.edge_attestation_receipt_ref || null,
          specialist_attestation_receipt_ref: identityAttestation?.specialist_attestation_receipt_ref || null,
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
    setIdentityAttestation({
      deviceFingerprint,
      edgeAttestationReceipt,
      specialistAttestationReceipt,
      sameDeviceBinding = false,
    } = {}) {
      const fingerprint = String(deviceFingerprint || '').trim();
      const edgeReceipt = String(edgeAttestationReceipt || '').trim();
      const specialistReceipt = String(specialistAttestationReceipt || '').trim();
      if (!/^sha256:[a-f0-9]{64}$/i.test(fingerprint)) {
        throw new Error('device_fingerprint_invalid');
      }
      if (!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/i.test(edgeReceipt)) {
        throw new Error('edge_attestation_receipt_invalid');
      }
      if (!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/i.test(specialistReceipt)) {
        throw new Error('specialist_attestation_receipt_invalid');
      }
      if (sameDeviceBinding !== true) {
        throw new Error('same_device_binding_required');
      }
      identityAttestation = {
        device_fingerprint: fingerprint,
        edge_attestation_receipt_ref: edgeReceipt,
        specialist_attestation_receipt_ref: specialistReceipt,
        same_device_binding: true,
        bound_at: new Date().toISOString(),
      };
      return health();
    },
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
  };
}
