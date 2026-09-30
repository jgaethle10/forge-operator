import fs from 'node:fs';
import path from 'node:path';
import { normalizeWorldstateScope } from './worldstate.mjs';

export const WORLDSTATE_PILOT_MCP = Object.freeze({
  slug: 'worldstate',
  path: '/mcp/worldstate',
  server_name: 'evercraft-worldstate',
  title: 'Evercraft Worldstate Reality Delta',
  version: '0.1.0',
  public_id: 'worldstate-reality-delta-v1',
  get_offer_tool: 'get_worldstate_offer',
  prepare_handoff_tool: 'prepare_worldstate_pilot_handoff',
  truth_boundary:
    'This MCP prepares a bounded Worldstate commercial-pilot scope. It does not start monitoring, create Passport grants, authorize private-source access, create payment, move money, mutate production, dispatch emergency services, make adverse decisions, or target individual people.'
});

const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const list = (value, maxItems = 100, maxChars = 300) => [
  ...new Set((Array.isArray(value) ? value : value == null ? [] : [value])
    .map((item) => text(item, maxChars))
    .filter(Boolean))
].slice(0, maxItems);

function loadCatalog(catalogPath) {
  const file = path.resolve(catalogPath || 'public/.well-known/evercraft-machine-catalog.json');
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  const offer = (catalog.offers || []).find(
    (row) => row?.public_id === WORLDSTATE_PILOT_MCP.public_id
  );
  if (!offer) throw new Error('worldstate_offer_not_found');
  return { catalog, offer };
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function tools() {
  return [
    {
      name: WORLDSTATE_PILOT_MCP.get_offer_tool,
      title: 'Get Worldstate commercial-pilot offer',
      description:
        'Read the current canonical Worldstate offer, state, pricing boundary, evidence boundary, and next-step contract. Creates no monitoring, payment, access, grant, or obligation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: WORLDSTATE_PILOT_MCP.prepare_handoff_tool,
      title: 'Prepare a bounded Worldstate pilot handoff',
      description:
        'Turn non-personal operating scope into a structured pilot-review packet. This is preparation only and grants no monitoring, source access, payment, production, emergency, or physical-world authority.',
      inputSchema: {
        type: 'object',
        properties: {
          scope_name: { type: 'string', minLength: 1, maxLength: 200 },
          pilot_archetype: {
            type: 'string',
            enum: ['asset_portfolio', 'route_logistics', 'agent_grounding', 'custom']
          },
          region_keys: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 100 },
          domains: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 100 },
          assets: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 100 },
          facilities: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 100 },
          routes: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 100 },
          dependencies: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 100 },
          industries: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 50 },
          topics: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 100 },
          materiality_threshold: { type: 'number', minimum: 0, maximum: 1 },
          cadence_preference: {
            type: 'string',
            enum: ['event_driven', 'hourly', 'daily', 'weekly', 'unspecified']
          },
          delivery_surface: {
            type: 'string',
            enum: ['api', 'mcp', 'dashboard', 'brief', 'mixed', 'unspecified']
          },
          requested_outcome: { type: 'string', maxLength: 2000 }
        },
        required: ['scope_name'],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    }
  ];
}

function handoffPacket(args = {}) {
  for (const forbidden of ['people', 'person_ids', 'individuals']) {
    if (Object.prototype.hasOwnProperty.call(args, forbidden)) {
      throw new Error('individual_people_are_not_valid_worldstate_targets');
    }
  }

  const scope = normalizeWorldstateScope({
    name: text(args.scope_name, 200),
    region_keys: list(args.region_keys),
    domains: list(args.domains),
    assets: list(args.assets),
    facilities: list(args.facilities),
    routes: list(args.routes),
    dependencies: list(args.dependencies),
    industries: list(args.industries, 50),
    topics: list(args.topics),
    materiality_threshold: args.materiality_threshold
  });

  const criteriaCount =
    scope.region_keys.length +
    scope.domains.length +
    scope.assets.length +
    scope.facilities.length +
    scope.routes.length +
    scope.dependencies.length +
    scope.industries.length +
    scope.topics.length;

  if (criteriaCount === 0) throw new Error('worldstate_scope_requires_at_least_one_criterion');

  return {
    schema: 'evercraft.worldstate.pilot-handoff.v1',
    public_id: WORLDSTATE_PILOT_MCP.public_id,
    pilot_archetype: text(args.pilot_archetype || 'custom', 50),
    scope,
    cadence_preference: text(args.cadence_preference || 'unspecified', 50),
    delivery_surface: text(args.delivery_surface || 'unspecified', 50),
    requested_outcome: text(args.requested_outcome, 2000) || null,
    scope_semantics: {
      hard_boundaries: ['region_keys', 'domains', 'assets', 'facilities', 'routes'],
      contextual_interests: ['dependencies', 'industries', 'topics'],
      values_within_group: 'OR',
      populated_hard_groups: 'AND'
    },
    pilot_review_required: true,
    explicit_authority_required_before_monitoring: true,
    monitoring_started: false,
    passport_grant_created: false,
    source_access_granted: false,
    payment_created: false,
    payment_obligation_created: false,
    production_authority_granted: false,
    emergency_authority_granted: false,
    external_action_taken: false,
    next_step:
      'Human commercial review must agree scope, source permissions, cadence, delivery, retention, pricing, and an explicit onboarding authorization before any customer monitoring is activated.',
    truth_boundary: WORLDSTATE_PILOT_MCP.truth_boundary
  };
}

export async function executeWorldstatePilotRpc(rpc, options = {}) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: {
        name: WORLDSTATE_PILOT_MCP.server_name,
        version: WORLDSTATE_PILOT_MCP.version
      },
      instructions: WORLDSTATE_PILOT_MCP.truth_boundary
    });
  }

  if (method === 'tools/list') return rpcResult(id, { tools: tools() });
  if (method === 'notifications/initialized') return null;

  if (method !== 'tools/call') return rpcError(id, -32601, 'Method not found.');

  const tool = String(rpc?.params?.name || '');
  const args = rpc?.params?.arguments || {};

  try {
    if (tool === WORLDSTATE_PILOT_MCP.get_offer_tool) {
      const { offer } = loadCatalog(options.catalogPath);
      const payload = {
        ok: true,
        product: WORLDSTATE_PILOT_MCP.title,
        public_id: WORLDSTATE_PILOT_MCP.public_id,
        offer,
        owned_pilot_mcp_state: 'source_ready_runtime_binding_pending',
        monitoring_started: false,
        payment_created: false,
        payment_obligation_created: false,
        truth_boundary: WORLDSTATE_PILOT_MCP.truth_boundary
      };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false
      });
    }

    if (tool === WORLDSTATE_PILOT_MCP.prepare_handoff_tool) {
      const payload = { ok: true, ...handoffPacket(args) };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false
      });
    }

    return rpcError(id, -32602, 'Unknown or unsupported Worldstate pilot tool.');
  } catch (error) {
    return rpcError(
      id,
      -32602,
      error instanceof Error ? error.message : 'invalid_worldstate_pilot_request'
    );
  }
}

export function registerWorldstatePilotMcp(app, options = {}) {
  app.get(WORLDSTATE_PILOT_MCP.path, (req, res) => {
    if (String(req.query?.action || '') !== 'health') {
      res.status(405).json({
        ok: false,
        error: 'Use MCP Streamable HTTP POST or ?action=health.'
      });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: WORLDSTATE_PILOT_MCP.title,
      server: WORLDSTATE_PILOT_MCP.server_name,
      version: WORLDSTATE_PILOT_MCP.version,
      public_id: WORLDSTATE_PILOT_MCP.public_id,
      transport: 'Streamable HTTP',
      tools: [WORLDSTATE_PILOT_MCP.get_offer_tool, WORLDSTATE_PILOT_MCP.prepare_handoff_tool],
      checkout_enabled: false,
      payment_enabled: false,
      monitoring_activation_enabled: false,
      human_review_handoff_enabled: true,
      runtime: 'yard_evercraft_compute',
      truth_boundary: WORLDSTATE_PILOT_MCP.truth_boundary
    });
  });

  app.post(WORLDSTATE_PILOT_MCP.path, async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    const response = await executeWorldstatePilotRpc(req.body, options);
    if (response === null) {
      res.status(202).end();
      return;
    }
    res.type('application/json').json(response);
  });
}
