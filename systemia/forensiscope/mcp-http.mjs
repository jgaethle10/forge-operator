import { handleForensiScopeMcpRequest } from './mcp-protocol.mjs';
import { listForensiScopeGatewayTools } from './agent-gateway.mjs';

const MODERN_VERSION = '2026-07-28';
const VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';

function lowerHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      String(key).toLowerCase(),
      Array.isArray(value) ? value.join(', ') : String(value ?? '')
    ])
  );
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

function headerMismatch(id, field, expected, observed) {
  return {
    status: 400,
    headers: {
      'content-type': 'application/json'
    },
    body: rpcError(
      id,
      -32020,
      'MCP header mismatch.',
      {
        field,
        expected,
        observed: observed || null
      }
    )
  };
}

function modernEnvelopeVersion(body) {
  return body?.params?._meta?.[VERSION_META_KEY] || null;
}

function validateModernHeaders(body, headers) {
  const id = body?.id ?? null;
  const version = modernEnvelopeVersion(body);
  if (version !== MODERN_VERSION) return null;

  if (headers['mcp-protocol-version'] !== version) {
    return headerMismatch(
      id,
      'Mcp-Protocol-Version',
      version,
      headers['mcp-protocol-version']
    );
  }

  if (headers['mcp-method'] !== body.method) {
    return headerMismatch(
      id,
      'Mcp-Method',
      body.method,
      headers['mcp-method']
    );
  }

  if (body.method === 'tools/call') {
    const name = String(body?.params?.name || '');
    if (headers['mcp-name'] !== name) {
      return headerMismatch(
        id,
        'Mcp-Name',
        name,
        headers['mcp-name']
      );
    }

    const tool = listForensiScopeGatewayTools()
      .find((entry) => entry.name === name);
    const properties = tool?.inputSchema?.properties || {};
    const args = body?.params?.arguments || {};

    for (const [propertyName, definition] of Object.entries(properties)) {
      const mirrorName = definition?.['x-mcp-header'];
      if (!mirrorName) continue;

      const headerName = 'mcp-param-' + String(mirrorName).toLowerCase();
      const argumentValue = args[propertyName];
      const headerValue = headers[headerName];
      if (
        (argumentValue !== undefined || headerValue !== undefined) &&
        String(argumentValue ?? '') !== String(headerValue ?? '')
      ) {
        return headerMismatch(
          id,
          'Mcp-Param-' + mirrorName,
          argumentValue !== undefined ? '[matching parameter]' : '[absent]',
          headerValue !== undefined ? '[present but mismatched]' : '[absent]'
        );
      }
    }
  }

  return null;
}

export function handleForensiScopeMcpHttp({
  method = 'POST',
  headers = {},
  body,
  rootDir = process.cwd()
} = {}) {
  const normalizedHeaders = lowerHeaders(headers);

  if (String(method).toUpperCase() !== 'POST') {
    return {
      status: 405,
      headers: {
        allow: 'POST',
        'content-type': 'application/json'
      },
      body: rpcError(body?.id ?? null, -32600, 'ForensiScope MCP accepts POST requests only.')
    };
  }

  const contentType = normalizedHeaders['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return {
      status: 415,
      headers: {
        'content-type': 'application/json'
      },
      body: rpcError(body?.id ?? null, -32600, 'ForensiScope MCP requires application/json.')
    };
  }

  const mismatch = validateModernHeaders(body, normalizedHeaders);
  if (mismatch) return mismatch;

  const response = handleForensiScopeMcpRequest(body, { rootDir });
  if (response === null) {
    return {
      status: 202,
      headers: {},
      body: null
    };
  }

  return {
    status: 200,
    headers: {
      'content-type': 'application/json'
    },
    body: response
  };
}
