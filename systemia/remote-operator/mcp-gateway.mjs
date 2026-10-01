import { createHash, timingSafeEqual } from 'node:crypto';

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

function safeEndpoint(value) {
  const url = new URL(String(value || ''));
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('remote_operator_capacity_endpoint_invalid');
  }
  const loopback = url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error('remote_operator_capacity_endpoint_requires_https');
  }
  return url.toString().replace(/\/$/, '');
}

function tokenHash(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

function bearer(value) {
  const text = String(value || '').trim();
  return text.toLowerCase().startsWith('bearer ') ? text.slice(7).trim() : text;
}

function equalToken(left, right) {
  const a = tokenHash(left);
  const b = tokenHash(right);
  return timingSafeEqual(a, b);
}

export function remoteOperatorTools() {
  return [
    {
      name: 'remote_operator_status',
      title: 'Check Evercraft Remote Operator',
      description: 'Read the bounded capabilities and admitted root keys for the authorized Evercraft node.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'remote_network_status',
      title: 'Inspect authorized node network state',
      description: 'Read the node network observation already attached to Remote Operator status, including interfaces, default routes, listening ports, Evercraft service state, local Fabric/TLS probes, router-map configuration, and an explicit ChromeOS/Crostini host-boundary marker. This tool does not mutate network configuration.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'remote_host_capabilities',
      title: 'List admitted host-side capabilities',
      description: 'List the typed host-boundary capabilities currently admitted by Evercraft for authorized devices. The registry explicitly reports mutation authority, arbitrary desktop-control status, pairing requirements, and privacy properties.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'remote_host_boundary_certification',
      title: 'Certify the ChromeOS host-boundary evidence chain',
      description: 'Read a receipt-backed field certification that reconciles the fresh ChromeOS port-forward setting observation with the LAN witness. A ready certification advances the read-only capability field gate but still does not claim public-route reachability.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'remote_host_capability_check',
      title: 'Run an admitted host-side capability check',
      description: 'Run one typed, explicitly admitted read-only host capability on an authorized device. The capability ID must exist in the host-boundary registry; generic desktop control and unregistered adapters are denied.',
      inputSchema: {
        type: 'object',
        properties: {
          capability_id: { type: 'string', minLength: 3, maxLength: 128 },
          wait_ms: { type: 'integer', minimum: 0, maximum: 45000, default: 35000 },
        },
        required: ['capability_id'],
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
      name: 'remote_host_boundary_status',
      title: 'Inspect ChromeOS host port-forward boundary',
      description: 'Read the latest paired ChromeOS-side observation of the admitted Crostini port-forwarding settings. This is a narrow read-only host-boundary capability; it does not expose screenshots, raw accessibility trees, or arbitrary desktop control.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'remote_host_boundary_check',
      title: 'Request a fresh ChromeOS host-boundary check',
      description: 'Ask the paired ChromeOS companion to perform a fresh read-only check of the admitted Crostini port-forwarding settings. The request may remain pending until the companion polls the local bridge; it cannot change host settings or perform arbitrary desktop actions.',
      inputSchema: {
        type: 'object',
        properties: {
          wait_ms: { type: 'integer', minimum: 0, maximum: 45000, default: 35000 },
        },
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
      name: 'remote_list_files',
      title: 'List files on an authorized Evercraft node',
      description: 'List one relative directory inside an admitted named root. Absolute paths and parent traversal are not accepted.',
      inputSchema: {
        type: 'object',
        properties: {
          root_key: { type: 'string', default: 'home' },
          path: { type: 'string', default: '.' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 250 },
        },
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
      name: 'remote_read_file',
      title: 'Read a file from an authorized Evercraft node',
      description: 'Read one bounded file from an admitted root. Common secret/key locations are blocked by the node before content leaves the device.',
      inputSchema: {
        type: 'object',
        properties: {
          root_key: { type: 'string', default: 'home' },
          path: { type: 'string', minLength: 1 },
          encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' },
          max_bytes: { type: 'integer', minimum: 1, maximum: 8388608 },
        },
        required: ['path'],
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
      name: 'remote_write_file',
      title: 'Write a file on an authorized Evercraft node',
      description: 'Write one file inside an admitted root. Requires an explicit approval reference and never accepts an absolute path.',
      inputSchema: {
        type: 'object',
        properties: {
          root_key: { type: 'string', default: 'home' },
          path: { type: 'string', minLength: 1 },
          content: { type: 'string' },
          encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' },
          overwrite: { type: 'boolean', default: false },
          approval_ref: { type: 'string', minLength: 1 },
        },
        required: ['path', 'content', 'approval_ref'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: 'remote_exec',
      title: 'Run a bounded program on an authorized Evercraft node',
      description: 'Run a non-interactive approved maintenance program as the node user. Requires an explicit approval reference. No root shell or TTY is exposed.',
      inputSchema: {
        type: 'object',
        properties: {
          root_key: { type: 'string', default: 'home' },
          cwd: { type: 'string', default: '.' },
          program: { type: 'string', minLength: 1 },
          args: { type: 'array', items: { type: 'string' }, maxItems: 128 },
          timeout_ms: { type: 'integer', minimum: 1000, maximum: 300000 },
          approval_ref: { type: 'string', minLength: 1 },
        },
        required: ['program', 'approval_ref'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

export class RemoteOperatorGateway {
  constructor({
    capacityEndpoint,
    controlToken,
    clientToken,
    fetchImpl = fetch,
  } = {}) {
    this.capacityEndpoint = safeEndpoint(capacityEndpoint);
    this.controlToken = String(controlToken || '').trim();
    this.clientToken = String(clientToken || '').trim();
    if (this.controlToken.length < 20) throw new Error('remote_operator_control_token_required');
    if (this.clientToken.length < 24) throw new Error('remote_operator_client_token_required');
    if (typeof fetchImpl !== 'function') throw new Error('remote_operator_fetch_required');
    this.fetchImpl = fetchImpl;
  }

  authenticate(authorization) {
    const presented = bearer(authorization);
    return Boolean(presented && equalToken(presented, this.clientToken));
  }

  async invoke(route, { method = 'POST', body } = {}) {
    const response = await this.fetchImpl(this.capacityEndpoint + route, {
      method,
      headers: {
        authorization: 'Bearer ' + this.controlToken,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(String(payload?.error || 'remote_operator_upstream_failed'));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }
}

export async function executeRemoteOperatorMcpRpc({
  rpc,
  gateway,
  authorization = '',
} = {}) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return jsonRpc(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'evercraft-remote-operator', version: '0.7.0' },
      instructions:
        'Evercraft Remote Operator reaches only explicitly authorized Evercraft nodes. Read operations require the client credential. File writes and program execution additionally require an explicit approval_ref and remain constrained by the node-side operator policy.',
    });
  }

  if (method === 'tools/list') {
    return jsonRpc(id, { tools: remoteOperatorTools() });
  }

  if (method === 'notifications/initialized') return null;

  if (method !== 'tools/call') {
    return jsonRpcError(id, -32601, 'Method not found.');
  }

  if (!gateway) {
    return jsonRpcError(id, -32001, 'remote_operator_gateway_not_configured');
  }
  if (!gateway.authenticate(authorization)) {
    return jsonRpcError(id, -32001, 'remote_operator_client_credential_required');
  }

  const name = String(rpc?.params?.name || '');
  const args = rpc?.params?.arguments || {};

  try {
    if (name === 'remote_operator_status') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/status', { method: 'GET' })));
    }
    if (name === 'remote_network_status') {
      const status = await gateway.invoke('/v1/operator/status', { method: 'GET' });
      if (!status?.network_observation) {
        throw new Error('remote_network_observation_unavailable');
      }
      return jsonRpc(id, toolResult(status.network_observation));
    }
    if (name === 'remote_host_capabilities') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/host-capabilities', { method: 'GET' })));
    }
    if (name === 'remote_host_boundary_certification') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/host-boundary/certification', { method: 'GET' })));
    }
    if (name === 'remote_host_capability_check') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/host-capabilities/check', {
        body: args,
      })));
    }
    if (name === 'remote_host_boundary_status') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/host-boundary', { method: 'GET' })));
    }
    if (name === 'remote_host_boundary_check') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/host-boundary/check', {
        body: args,
      })));
    }
    if (name === 'remote_list_files') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/fs/list', { body: args })));
    }
    if (name === 'remote_read_file') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/fs/read', { body: args })));
    }
    if (name === 'remote_write_file') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/fs/write', { body: args })));
    }
    if (name === 'remote_exec') {
      return jsonRpc(id, toolResult(await gateway.invoke('/v1/operator/exec', { body: args })));
    }
    return jsonRpcError(id, -32602, 'Unknown Remote Operator tool.');
  } catch (error) {
    return jsonRpcError(
      id,
      Number(error?.status) === 401 ? -32001 : -32000,
      error instanceof Error ? error.message : String(error || 'remote_operator_tool_failed'),
      error?.payload
    );
  }
}

function configuredGateway(options = {}) {
  const capacityEndpoint =
    options.capacityEndpoint ||
    process.env.EVERCRAFT_REMOTE_OPERATOR_CAPACITY_ENDPOINT ||
    '';
  const controlToken =
    options.controlToken ||
    process.env.EVERCRAFT_REMOTE_OPERATOR_CONTROL_TOKEN ||
    '';
  const clientToken =
    options.clientToken ||
    process.env.EVERCRAFT_REMOTE_OPERATOR_CLIENT_TOKEN ||
    '';

  if (!capacityEndpoint || !controlToken || !clientToken) return null;

  return new RemoteOperatorGateway({
    capacityEndpoint,
    controlToken,
    clientToken,
    fetchImpl: options.fetchImpl,
  });
}

function authorizationFrom(headers = {}) {
  return String(headers.authorization || headers.Authorization || '').trim();
}

export function registerRemoteOperatorMcp(app, options = {}) {
  const gateway = options.gateway || configuredGateway(options);

  app.get('/api/remote-operator/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'evercraft-remote-operator-gateway',
      version: '0.7.0',
      configured: Boolean(gateway),
      public_node_ingress_required: false,
      node_control_token_exposed: false,
      tools: remoteOperatorTools().map((tool) => tool.name),
    });
  });

  app.get('/mcp/evercraft-remote', (req, res) => {
    if (String(req.query.action || '') !== 'health') {
      res.status(405).json({ ok: false, error: 'Use MCP Streamable HTTP POST or ?action=health.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      server: 'evercraft-remote-operator',
      version: '0.7.0',
      transport: 'Streamable HTTP',
      configured: Boolean(gateway),
      tools: remoteOperatorTools().map((tool) => tool.name),
    });
  });

  app.options('/mcp/evercraft-remote', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.status(204).end();
  });

  app.post('/mcp/evercraft-remote', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const response = await executeRemoteOperatorMcpRpc({
      rpc: req.body,
      gateway,
      authorization: authorizationFrom(req.headers),
    });
    if (response === null) {
      res.status(202).end();
      return;
    }
    res.type('application/json').json(response);
  });

  return { gateway };
}
