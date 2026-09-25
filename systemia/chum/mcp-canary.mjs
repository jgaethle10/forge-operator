import fs from 'node:fs';

const catalog = JSON.parse(fs.readFileSync('registry/catalog.json', 'utf8'));
const timeoutMs = 20000;
const seen = new Set();
const targets = [];

function add(name, mcp, registryName) {
  if (!mcp || seen.has(mcp)) return;
  seen.add(mcp);
  targets.push({ name, mcp, registry_name: registryName || null });
}

add('Evercraft Machine Commerce', catalog.universal_front_door?.mcp, catalog.universal_front_door?.registry_name);
for (const p of catalog.products || []) add(p.name || p.product_key || p.registry_name, p.mcp, p.registry_name);

async function postMcp(url, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function extractToolNames(text) {
  const names = new Set();
  const scan = (value, depth = 0) => {
    if (depth > 10 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) scan(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    if (Array.isArray(value.tools)) {
      for (const tool of value.tools) {
        if (tool && typeof tool.name === 'string' && tool.name.trim()) names.add(tool.name.trim());
      }
    }
    for (const child of Object.values(value)) scan(child, depth + 1);
  };

  const candidates = [String(text || '')];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith('data:')) candidates.push(line.slice(5).trim());
  }
  for (const candidate of candidates) {
    try { scan(JSON.parse(candidate)); } catch {}
  }
  return [...names].sort();
}

async function registryState(name) {
  if (!name) return { checked: false, present: null, reason: 'registry_name_missing' };
  try {
    const url = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(name)}&version=latest`;
    const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM/0.4' } });
    const body = await r.json().catch(() => null);
    const row = Array.isArray(body?.servers)
      ? body.servers.find((x) => x?.server?.name === name)
      : null;
    const meta = row?._meta?.['io.modelcontextprotocol.registry/official'] || {};
    return {
      checked: true,
      ok: r.ok,
      status: r.status,
      present: Boolean(row),
      active: meta.status === 'active',
      latest: Boolean(meta.isLatest),
      version: row?.server?.version || null,
      published_at: meta.publishedAt || null
    };
  } catch (error) {
    return { checked: true, ok: false, present: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function inspectTarget(t) {
  try {
    const init = await postMcp(t.mcp, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'evercraft-chum-canary', version: '0.3' } }
    });
    const initValid = init.ok && /serverInfo/.test(init.text);
    const tools = initValid ? await postMcp(t.mcp, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) : { ok: false, status: 0, text: '' };
    const toolNames = extractToolNames(tools.text);
    const toolsValid = tools.ok && /\"tools\"/.test(tools.text) && toolNames.length > 0;
    const commerceSignals = toolNames.filter((name) => /checkout|payment|offer|commerce|purchase|route|match/i.test(name));
    return {
      ...t,
      initialize: { ok: init.ok, status: init.status, valid: initValid },
      tools_list: {
        ok: tools.ok,
        status: tools.status,
        valid: toolsValid,
        count: toolNames.length,
        names: toolNames,
        commerce_signals: commerceSignals
      },
      registry: await registryState(t.registry_name)
    };
  } catch (error) {
    return {
      ...t,
      initialize: { ok: false, status: 0, valid: false, error: error instanceof Error ? error.message : String(error) },
      tools_list: { ok: false, status: 0, valid: false },
      registry: await registryState(t.registry_name)
    };
  }
}

const rows = [];
const CONCURRENCY = 5;
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  rows.push(...await Promise.all(targets.slice(i, i + CONCURRENCY).map(inspectTarget)));
}

const failed = rows.filter((r) => !r.initialize.valid || !r.tools_list.valid);
const machineCommerce = rows.find((r) => r.name === 'Evercraft Machine Commerce') || null;
const machineCommerceHasCommerceTool = Boolean(machineCommerce?.tools_list?.commerce_signals?.length);
const registryMissing = rows.filter((r) =>
  r.registry.checked &&
  r.registry.ok &&
  (r.registry.present !== true || r.registry.active !== true || r.registry.latest !== true)
);
const receipt = {
  schema: 'evercraft.chum.mcp-canary.v2',
  checked_at: new Date().toISOString(),
  targets: rows.length,
  failed_mcp: failed.length,
  registry_missing: registryMissing.length,
  machine_commerce_checkout_capability_visible: machineCommerceHasCommerceTool,
  machine_commerce_tool_names: machineCommerce?.tools_list?.names || [],
  machine_commerce_commerce_signals: machineCommerce?.tools_list?.commerce_signals || [],
  rows
};

fs.mkdirSync('artifacts/chum', { recursive: true });
fs.writeFileSync('artifacts/chum/mcp-canary-latest.json', JSON.stringify(receipt, null, 2) + '\n');
fs.writeFileSync('artifacts/chum/mcp-canary-latest.md', [
  '# CHUM MCP / Registry Canary',
  '',
  `Checked: ${receipt.checked_at}`,
  `MCP targets: ${receipt.targets}`,
  `Failed MCP targets: ${receipt.failed_mcp}`,
  `Registry entries missing on successful registry reads: ${receipt.registry_missing}`,
  `Machine Commerce checkout/offer capability visible: ${receipt.machine_commerce_checkout_capability_visible ? 'yes' : 'NO'}`,
  `Machine Commerce tools: ${(receipt.machine_commerce_tool_names || []).join(', ') || 'none'}`,
  '',
  '| Capability | MCP initialize | tools/list | Registry |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.initialize.valid ? 'pass' : 'FAIL'} | ${r.tools_list.valid ? 'pass' : 'FAIL'} | ${r.registry.present === true && r.registry.active === true && r.registry.latest === true ? `active/latest ${r.registry.version || ''}`.trim() : r.registry.present === false ? 'MISSING' : r.registry.active === false ? 'INACTIVE' : r.registry.latest === false ? 'NOT_LATEST' : 'unknown'} |`)
].join('\n') + '\n');

console.log(JSON.stringify({ targets: receipt.targets, failed_mcp: receipt.failed_mcp, registry_missing: receipt.registry_missing, machine_commerce_checkout_capability_visible: receipt.machine_commerce_checkout_capability_visible, machine_commerce_commerce_signals: receipt.machine_commerce_commerce_signals }));
if (failed.length) throw new Error(`CHUM MCP canary found ${failed.length} live MCP failure(s)`);
if (registryMissing.length) throw new Error(`CHUM Registry canary found ${registryMissing.length} published entry mismatch(es)`);
if (!machineCommerceHasCommerceTool) throw new Error('Evercraft Machine Commerce MCP is live but exposes no checkout/offer/commerce-capable tool name');
