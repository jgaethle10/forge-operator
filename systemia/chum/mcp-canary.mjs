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

async function registryState(name) {
  if (!name) return { checked: false, present: null, reason: 'registry_name_missing' };
  try {
    const url = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(name)}&version=latest`;
    const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM/0.2' } });
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

async function checkTarget(t) {
  try {
    const init = await postMcp(t.mcp, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'evercraft-chum-canary', version: '0.2' } }
    });
    const initValid = init.ok && /serverInfo/.test(init.text);
    const tools = initValid
      ? await postMcp(t.mcp, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
      : { ok: false, status: 0, text: '' };
    const toolsValid = tools.ok && /\"tools\"/.test(tools.text);
    return {
      ...t,
      initialize: { ok: init.ok, status: init.status, valid: initValid },
      tools_list: { ok: tools.ok, status: tools.status, valid: toolsValid },
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

const rows = await Promise.all(targets.map(checkTarget));

const failed = rows.filter((r) => !r.initialize.valid || !r.tools_list.valid);
const registryMissing = rows.filter((r) =>
  r.registry.checked &&
  r.registry.ok &&
  (r.registry.present !== true || r.registry.active !== true || r.registry.latest !== true)
);
const receipt = {
  schema: 'evercraft.chum.mcp-canary.v1',
  checked_at: new Date().toISOString(),
  targets: rows.length,
  failed_mcp: failed.length,
  registry_missing: registryMissing.length,
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
  '',
  '| Capability | MCP initialize | tools/list | Registry |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.initialize.valid ? 'pass' : 'FAIL'} | ${r.tools_list.valid ? 'pass' : 'FAIL'} | ${r.registry.present === true && r.registry.active === true && r.registry.latest === true ? `active/latest ${r.registry.version || ''}`.trim() : r.registry.present === false ? 'MISSING' : r.registry.active === false ? 'INACTIVE' : r.registry.latest === false ? 'NOT_LATEST' : 'unknown'} |`)
].join('\n') + '\n');

console.log(JSON.stringify({ targets: receipt.targets, failed_mcp: receipt.failed_mcp, registry_missing: receipt.registry_missing }));
if (failed.length) throw new Error(`CHUM MCP canary found ${failed.length} live MCP failure(s)`);
if (registryMissing.length) throw new Error(`CHUM Registry canary found ${registryMissing.length} published entry mismatch(es)`);
