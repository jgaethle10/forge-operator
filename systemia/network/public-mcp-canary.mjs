import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = process.env.EVERCRAFT_MACHINE_COMMERCE_MCP ||
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';

const REQUIRED_TOOLS = [
  'get_network_capabilities',
  'get_network_presence',
  'prepare_network_handoff'
];

const timeoutMs = Number(process.env.NETWORK_MCP_CANARY_TIMEOUT_MS || 25000);

function parseMessages(text) {
  const candidates = [String(text || '')];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith('data:')) candidates.push(line.slice(5).trim());
  }
  const parsed = [];
  for (const candidate of candidates) {
    try { parsed.push(JSON.parse(candidate)); } catch {}
  }
  return parsed;
}

function findResult(messages, id) {
  for (const message of messages) {
    if (message && typeof message === 'object' && String(message.id) === String(id)) return message;
  }
  return messages.find((message) => message?.result) || null;
}

async function post(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      messages: parseMessages(text)
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractTools(messages) {
  for (const message of messages) {
    const tools = message?.result?.tools;
    if (Array.isArray(tools)) return tools;
  }
  return [];
}

function summarizeCall(messages, id) {
  const resultMessage = findResult(messages, id);
  const result = resultMessage?.result || null;
  return {
    has_result: Boolean(result),
    is_error: Boolean(result?.isError),
    content_types: Array.isArray(result?.content)
      ? result.content.map((item) => item?.type || null).filter(Boolean)
      : [],
    structured_content_present: Boolean(result?.structuredContent),
    error_code: resultMessage?.error?.code ?? null,
    error_message: resultMessage?.error?.message ?? null
  };
}

const checkedAt = new Date().toISOString();

const initialize = await post({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'evercraft-network-public-canary', version: '1.0' }
  }
});

const initMessage = findResult(initialize.messages, 1);
const serverInfo = initMessage?.result?.serverInfo || null;
if (!initialize.ok || !serverInfo) {
  throw new Error(`Evercraft Network MCP initialize failed: HTTP ${initialize.status}`);
}

const list = await post({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {}
});

const tools = extractTools(list.messages);
const byName = new Map(tools.map((tool) => [tool?.name, tool]));
const missing = REQUIRED_TOOLS.filter((name) => !byName.has(name));

if (!list.ok || missing.length) {
  throw new Error(`Evercraft Network MCP tools/list missing required tool(s): ${missing.join(', ') || 'unknown'}`);
}

const SAFE_CALLS = [
  { id: 3, name: 'get_network_capabilities', arguments: {} },
  { id: 4, name: 'get_network_presence', arguments: {} },
  {
    id: 5,
    name: 'prepare_network_handoff',
    arguments: {
      intent: 'resilience',
      source: 'evercraft-network-canary'
    }
  }
];

function validateSafeCall(call) {
  const tool = byName.get(call.name);
  if (!tool) throw new Error(`Missing Network tool ${call.name}`);

  if (!/read-only/i.test(String(tool.description || ''))) {
    throw new Error(`${call.name} is no longer explicitly described as read-only; refusing live canary execution`);
  }

  const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
  const missingArgs = required.filter((key) => !Object.prototype.hasOwnProperty.call(call.arguments || {}, key));
  if (missingArgs.length) {
    throw new Error(`${call.name} canary arguments are missing required field(s): ${missingArgs.join(', ')}`);
  }

  const properties = tool?.inputSchema?.properties || {};
  const unknownArgs = Object.keys(call.arguments || {}).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key));
  if (unknownArgs.length) {
    throw new Error(`${call.name} canary attempted unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  for (const [key, value] of Object.entries(call.arguments || {})) {
    const allowed = properties?.[key]?.enum;
    if (Array.isArray(allowed) && !allowed.includes(value)) {
      throw new Error(`${call.name} canary argument ${key}=${value} is outside the live enum`);
    }
  }
}

const liveReadOnlyCalls = [];
for (const safeCall of SAFE_CALLS) {
  validateSafeCall(safeCall);
  const response = await post({
    jsonrpc: '2.0',
    id: safeCall.id,
    method: 'tools/call',
    params: {
      name: safeCall.name,
      arguments: safeCall.arguments
    }
  });

  const summary = summarizeCall(response.messages, safeCall.id);
  if (!response.ok || !summary.has_result || summary.is_error || summary.error_code != null) {
    throw new Error(`${safeCall.name} live read-only call failed: HTTP ${response.status} ${summary.error_message || ''}`.trim());
  }

  liveReadOnlyCalls.push({
    tool: safeCall.name,
    http_status: response.status,
    arguments: safeCall.arguments,
    ...summary
  });
}

const capabilityCall = liveReadOnlyCalls.find((row) => row.tool === 'get_network_capabilities');

const receipt = {
  schema: 'evercraft.network.public-mcp-canary.v1',
  checked_at: checkedAt,
  endpoint: ENDPOINT,
  initialize: {
    http_status: initialize.status,
    server_info: serverInfo,
    protocol_version: initMessage?.result?.protocolVersion || null
  },
  required_tools: REQUIRED_TOOLS,
  observed_network_tools: tools
    .filter((tool) => REQUIRED_TOOLS.includes(tool?.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description || null,
      input_schema: tool.inputSchema || null
    })),
  all_tool_names: tools.map((tool) => tool?.name).filter(Boolean).sort(),
  live_read_only_call: capabilityCall,
  live_read_only_calls: liveReadOnlyCalls,
  truth_boundary: {
    verified: [
      'production MCP initialize returned serverInfo',
      'production tools/list exposed all three declared Evercraft Network tools',
      'production get_network_capabilities read-only tool call returned a non-error result',
      'production get_network_presence read-only tool call returned a non-error result',
      'production prepare_network_handoff read-only tool call returned a non-error result'
    ],
    not_verified: [
      'device enrollment',
      'payment or paid membership activation',
      'private telemetry access',
      'connectivity control',
      'carrier control',
      '911 or PSAP routing',
      'guaranteed geographic coverage or emergency backhaul'
    ]
  }
};

const outDir = path.join('artifacts', 'network');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'public-mcp-canary-latest.json'), JSON.stringify(receipt, null, 2) + '\n');

console.log(JSON.stringify({
  status: 'pass',
  endpoint: ENDPOINT,
  server: serverInfo,
  required_tools: REQUIRED_TOOLS,
  live_read_only_calls: liveReadOnlyCalls
}, null, 2));
