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

function summarizeCall(messages) {
  const resultMessage = findResult(messages, 3);
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

const capabilityTool = byName.get('get_network_capabilities');
const requiredArgs = Array.isArray(capabilityTool?.inputSchema?.required)
  ? capabilityTool.inputSchema.required
  : [];

if (requiredArgs.length) {
  throw new Error(`get_network_capabilities unexpectedly requires arguments: ${requiredArgs.join(', ')}`);
}

const call = await post({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'get_network_capabilities',
    arguments: {}
  }
});

const callSummary = summarizeCall(call.messages);
if (!call.ok || !callSummary.has_result || callSummary.is_error || callSummary.error_code != null) {
  throw new Error(`get_network_capabilities live read-only call failed: HTTP ${call.status} ${callSummary.error_message || ''}`.trim());
}

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
  live_read_only_call: {
    tool: 'get_network_capabilities',
    http_status: call.status,
    ...callSummary
  },
  truth_boundary: {
    verified: [
      'production MCP initialize returned serverInfo',
      'production tools/list exposed all three declared Evercraft Network tools',
      'production get_network_capabilities read-only tool call returned a non-error result'
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
  live_read_only_call: callSummary
}, null, 2));
