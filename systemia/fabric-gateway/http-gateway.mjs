import path from 'node:path';
import { buildFabricPublicManifest, EvercraftFabricGateway } from './gateway.mjs';

function jsonRpc(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function toolResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: false,
  };
}

function fabricTools() {
  return [
    {
      name: 'discover_evercraft',
      title: 'Discover Evercraft capabilities',
      description: 'Match a plain-language problem to truthful public Evercraft capabilities. This grants no private context, execution authority, entitlement, or payment authority.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', minLength: 3 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        },
        required: ['intent'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'connect_evercraft_fabric',
      title: 'Connect this host to Evercraft Fabric',
      description: 'Register the authenticated host instance with Evercraft Fabric. Connection itself grants no new scope, private context, or execution authority.',
      inputSchema: {
        type: 'object',
        properties: {
          host_instance_ref: { type: 'string', minLength: 1 },
          host_type: { type: 'string' },
          adapter: { type: 'string' },
          declared_capabilities: { type: 'array', items: { type: 'string' } },
        },
        required: ['host_instance_ref'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: 'query_evercraft_context',
      title: 'Query authorized Evercraft context',
      description: 'Retrieve only Context Fabric records permitted by this host credential and Passport grant. Unauthorized namespaces are filtered before ranking and are not revealed.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1 },
          namespaces: { type: 'array', items: { type: 'string' } },
          evidence_states: { type: 'array', items: { type: 'string' } },
          include_history: { type: 'boolean', default: false },
          max_results: { type: 'integer', minimum: 1, maximum: 100 },
          max_chars: { type: 'integer', minimum: 200, maximum: 50000 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'emit_evercraft_event',
      title: 'Send a host event into Evercraft Fabric',
      description: 'Project an authenticated host event into an explicitly authorized Context Fabric namespace. Host content remains evidence, never instruction or inherited authority.',
      inputSchema: {
        type: 'object',
        properties: {
          event_id: { type: 'string', minLength: 1 },
          namespace: { type: 'string', minLength: 1 },
          kind: { type: 'string' },
          title: { type: 'string', minLength: 1 },
          text: { type: 'string', minLength: 1 },
          tags: { type: 'array', items: { type: 'string' } },
          entity_ref: { type: 'string' },
          predicate: { type: 'string' },
          claim_value: {},
          evidence_state: { type: 'string' },
          content_trust_state: { type: 'string' },
          visibility: { type: 'string' },
          source_ref: { type: 'string' },
          source_sha256: { type: 'string' },
          observed_at: { type: 'string' },
        },
        required: ['event_id', 'namespace', 'title', 'text'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'prepare_evercraft_action',
      title: 'Prepare an Evercraft action intent',
      description: 'Create a receipt-bearing action intent for later Systemia admission and Execution Gate review. This tool does not execute the action, create payment, or produce an external side effect.',
      inputSchema: {
        type: 'object',
        properties: {
          idempotency_key: { type: 'string' },
          capability_key: { type: 'string', minLength: 1 },
          intent: { type: 'string', minLength: 1 },
          resource_refs: { type: 'array', items: { type: 'string' } },
          host_context_refs: { type: 'array', items: { type: 'string' } },
          human_confirmation_required: { type: 'boolean', default: true },
        },
        required: ['capability_key', 'intent'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}

function authorizationFrom(headers = {}) {
  return String(headers.authorization || headers.Authorization || '').trim();
}

function gatewayRequired(gateway) {
  if (!gateway) throw new Error('fabric_private_gateway_not_configured');
  return gateway;
}

export async function executeFabricMcpRpc({
  rpc,
  gateway = null,
  authorization = '',
  discoverPublic,
} = {}) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return jsonRpc(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'evercraft-fabric', version: '0.1.0' },
      instructions:
        'Evercraft Fabric is a thin connective gateway into Systemia. Public discovery is available without private authority. Private context, host event writes, and action-intent preparation require explicit scoped credentials. Installing or connecting never grants admin authority.',
    });
  }

  if (method === 'tools/list') {
    return jsonRpc(id, { tools: fabricTools() });
  }

  if (method === 'notifications/initialized') return null;

  if (method !== 'tools/call') {
    return jsonRpcError(id, -32601, 'Method not found.');
  }

  const toolName = String(rpc?.params?.name || '');
  const args = rpc?.params?.arguments || {};

  try {
    if (toolName === 'discover_evercraft') {
      if (gateway) {
        return jsonRpc(id, toolResult(await gateway.discover(args, authorization || null)));
      }
      if (typeof discoverPublic !== 'function') {
        throw new Error('fabric_public_discovery_not_configured');
      }
      const intent = String(args.intent || '').trim();
      if (!intent) throw new Error('intent_required');
      const limit = Math.min(Math.max(Number(args.limit || 5), 1), 20);
      const result = await discoverPublic(intent, limit);
      return jsonRpc(id, toolResult({
        schema: 'evercraft.fabric.discovery-result.v1',
        intent,
        limit,
        result,
        public_only: true,
        private_authority_granted: false,
      }));
    }

    const privateTools = new Set([
      'connect_evercraft_fabric',
      'query_evercraft_context',
      'emit_evercraft_event',
      'prepare_evercraft_action',
    ]);
    if (!privateTools.has(toolName)) {
      return jsonRpcError(id, -32602, 'Unknown or unsupported Fabric tool.');
    }

    const privateGateway = gatewayRequired(gateway);
    if (!authorization) throw new Error('fabric_credential_required');

    if (toolName === 'connect_evercraft_fabric') {
      return jsonRpc(id, toolResult(privateGateway.connectHost(authorization, args)));
    }
    if (toolName === 'query_evercraft_context') {
      return jsonRpc(id, toolResult(privateGateway.queryContext(authorization, args)));
    }
    if (toolName === 'emit_evercraft_event') {
      return jsonRpc(id, toolResult(privateGateway.emitEvent(authorization, args)));
    }
    if (toolName === 'prepare_evercraft_action') {
      return jsonRpc(id, toolResult(privateGateway.prepareAction(authorization, args)));
    }

    return jsonRpcError(id, -32602, 'Unknown or unsupported Fabric tool.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'fabric_tool_failed');
    const authFailure =
      /credential|authentication|authorization|scope_denied|not_authorized|private_gateway_not_configured/i.test(message);
    return jsonRpcError(id, authFailure ? -32001 : -32000, message);
  }
}

function createConfiguredGateway(options = {}) {
  const verificationPepper =
    options.verificationPepper || process.env.EVERCRAFT_FABRIC_VERIFICATION_PEPPER || '';
  const authorityReceiptRef =
    options.authorityReceiptRef || process.env.EVERCRAFT_FABRIC_AUTHORITY_RECEIPT_REF || '';

  if (!verificationPepper || !authorityReceiptRef) return null;

  const stateRoot =
    options.stateRoot ||
    process.env.EVERCRAFT_FABRIC_STATE_DIR ||
    path.join('/tmp', 'evercraft-fabric');

  return new EvercraftFabricGateway({
    stateDir: path.join(stateRoot, 'gateway'),
    passportStateDir:
      options.passportStateDir ||
      process.env.EVERCRAFT_FABRIC_PASSPORT_STATE_DIR ||
      path.join(stateRoot, 'passport'),
    contextStateDir:
      options.contextStateDir ||
      process.env.EVERCRAFT_FABRIC_CONTEXT_STATE_DIR ||
      path.join(stateRoot, 'context'),
    verificationPepper,
    authorityReceiptRef,
    capabilityProvider: options.capabilityProvider,
  });
}

export function registerEvercraftFabricGateway(app, options = {}) {
  const gateway = options.gateway || createConfiguredGateway(options);
  const discoverPublic =
    options.discoverPublic ||
    options.capabilityProvider ||
    (async () => ({ ok: false, error: 'fabric_public_discovery_not_configured' }));

  app.get('/api/fabric/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'evercraft-fabric-gateway',
      version: '0.1.0',
      runtime: 'Forge/Yard',
      private_gateway_configured: Boolean(gateway),
      public_discovery_configured: typeof discoverPublic === 'function',
      install_grants_authority: false,
    });
  });

  app.get('/api/fabric/manifest', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(buildFabricPublicManifest());
  });

  app.get('/mcp/evercraft-fabric', (req, res) => {
    if (String(req.query.action || '') !== 'health') {
      res.status(405).json({
        ok: false,
        error: 'Use MCP Streamable HTTP POST or ?action=health.',
      });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'Evercraft Fabric',
      server: 'evercraft-fabric',
      version: '0.1.0',
      transport: 'Streamable HTTP',
      private_gateway_configured: Boolean(gateway),
      public_discovery_enabled: true,
      tools: fabricTools().map((tool) => tool.name),
      runtime: 'yard_evercraft_compute',
      install_grants_authority: false,
    });
  });

  app.post('/mcp/evercraft-fabric', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    const response = await executeFabricMcpRpc({
      rpc: req.body,
      gateway,
      authorization: authorizationFrom(req.headers),
      discoverPublic,
    });

    if (response === null) {
      res.status(202).end();
      return;
    }
    res.type('application/json').json(response);
  });

  return { gateway };
}
