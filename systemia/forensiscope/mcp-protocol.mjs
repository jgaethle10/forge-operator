import { listForensiScopeGatewayTools, invokeForensiScopeGatewayTool } from './agent-gateway.mjs';

export const FORENSISCOPE_MCP = Object.freeze({
  serverInfo: {
    name: 'forensiscope',
    title: 'ForensiScope by Evercraft',
    version: '2.0.0-private-proof'
  },
  modernProtocolVersion: '2026-07-28',
  legacyProtocolVersion: '2025-11-25',
  supportedVersions: ['2026-07-28', '2025-11-25']
});

const MODERN_META_KEYS = Object.freeze({
  protocolVersion: 'io.modelcontextprotocol/protocolVersion',
  serverInfo: 'io.modelcontextprotocol/serverInfo'
});

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data = undefined) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function modernResult(value) {
  return {
    ...value,
    resultType: value?.resultType || 'complete',
    _meta: {
      ...(value?._meta || {}),
      [MODERN_META_KEYS.serverInfo]: FORENSISCOPE_MCP.serverInfo
    }
  };
}

function requestProtocolVersion(request) {
  return request?.params?._meta?.[MODERN_META_KEYS.protocolVersion] || null;
}

function isModernRequest(request) {
  return requestProtocolVersion(request) === FORENSISCOPE_MCP.modernProtocolVersion;
}

function discoveryResult() {
  return modernResult({
    supportedVersions: FORENSISCOPE_MCP.supportedVersions,
    capabilities: {
      tools: {
        listChanged: false
      }
    },
    instructions:
      'Query completed ForensiScope evidence by immutable evidence_ref. This interface does not accept raw media, start analysis, or create payment obligations.'
  });
}

function initializeResult(request) {
  const requested = String(request?.params?.protocolVersion || '');
  const negotiated =
    requested === FORENSISCOPE_MCP.legacyProtocolVersion
      ? requested
      : FORENSISCOPE_MCP.legacyProtocolVersion;

  return {
    protocolVersion: negotiated,
    capabilities: {
      tools: {
        listChanged: false
      }
    },
    serverInfo: FORENSISCOPE_MCP.serverInfo,
    instructions:
      'Query completed ForensiScope evidence by immutable evidence_ref. Media intake, analysis admission, and commerce are separate human-gated surfaces.'
  };
}

function listToolsResult({ modern }) {
  const result = {
    tools: listForensiScopeGatewayTools()
  };
  return modern ? modernResult(result) : result;
}

function callToolResult({ request, rootDir, modern }) {
  const name = String(request?.params?.name || '');
  const args = request?.params?.arguments || {};

  if (!name) {
    throw Object.assign(new Error('tools/call requires params.name.'), {
      rpcCode: -32602
    });
  }

  const declared = new Set(listForensiScopeGatewayTools().map((tool) => tool.name));
  if (!declared.has(name)) {
    throw Object.assign(new Error(`Unknown ForensiScope tool: ${name}`), {
      rpcCode: -32602
    });
  }

  try {
    const result = invokeForensiScopeGatewayTool({
      name,
      args,
      rootDir
    });
    const toolResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result)
        }
      ],
      structuredContent: result,
      isError: false
    };
    return modern ? modernResult(toolResult) : toolResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const toolResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'forensiscope_tool_error',
            message
          })
        }
      ],
      isError: true
    };
    return modern ? modernResult(toolResult) : toolResult;
  }
}

export function handleForensiScopeMcpRequest(request, {
  rootDir = process.cwd()
} = {}) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return rpcError(request?.id ?? null, -32600, 'Invalid JSON-RPC request.');
  }

  const id = request.id;
  const notification = id === undefined || id === null;

  if (request.method === 'notifications/initialized') {
    return null;
  }

  if (request.method === 'server/discover') {
    return rpcResult(id, discoveryResult());
  }

  if (request.method === 'initialize') {
    return rpcResult(id, initializeResult(request));
  }

  const modern = isModernRequest(request);
  if (modern && !FORENSISCOPE_MCP.supportedVersions.includes(requestProtocolVersion(request))) {
    return rpcError(id, -32602, 'Unsupported MCP protocol version.');
  }

  try {
    switch (request.method) {
      case 'ping':
        return rpcResult(id, modern ? modernResult({}) : {});

      case 'tools/list':
        return rpcResult(id, listToolsResult({ modern }));

      case 'tools/call':
        return rpcResult(id, callToolResult({ request, rootDir, modern }));

      default:
        if (notification) return null;
        return rpcError(id, -32601, 'Method not found.');
    }
  } catch (error) {
    return rpcError(
      id,
      Number.isInteger(error?.rpcCode) ? error.rpcCode : -32603,
      error instanceof Error ? error.message : String(error)
    );
  }
}
