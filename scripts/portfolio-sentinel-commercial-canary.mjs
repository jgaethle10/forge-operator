#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const GATEWAY = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const MCP = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';
const PUBLIC_ID = 'portfolio-sentinel-v1';
const NAME = 'Systemia Portfolio Sentinel';
const PROBES = [
  'software portfolio health monitoring',
  'our company has too many apps and we do not know what is broken',
  'monitor LLM discovery pages and agent endpoints',
  'watch GitHub Actions and public product doors for failures'
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(12000),
    headers: {
      'user-agent': 'Evercraft-Portfolio-Sentinel-Commercial-Canary/1.0',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  return { response, text };
}

const checks = [];
for (const intent of PROBES) {
  const url = new URL(GATEWAY);
  url.searchParams.set('action', 'match');
  url.searchParams.set('intent', intent);
  url.searchParams.set('limit', '3');
  const { response, text } = await read(url);
  ensure(response.ok, `gateway match failed for "${intent}" with HTTP ${response.status}`);
  const payload = JSON.parse(text);
  const top = payload.matches?.[0];
  ensure(top?.offer?.public_id === PUBLIC_ID, `Sentinel was not top match for "${intent}"`);
  checks.push({
    kind: 'gateway_match',
    intent,
    status: response.status,
    top_public_id: top.offer.public_id,
    top_name: top.offer.name,
    score: top.score
  });
}

{
  const url = new URL(GATEWAY);
  url.searchParams.set('action', 'offer');
  url.searchParams.set('public_id', PUBLIC_ID);
  const { response, text } = await read(url);
  ensure(response.ok, `offer endpoint returned HTTP ${response.status}`);
  const payload = JSON.parse(text);
  ensure(payload.offer?.public_id === PUBLIC_ID, 'offer endpoint returned wrong product');
  ensure(payload.offer?.commercial_state === 'commercial_pilot', 'commercial state drifted');
  ensure(payload.offer?.machine_state === 'human_handoff_ready', 'machine state drifted');
  checks.push({ kind: 'offer', status: response.status, commercial_state: payload.offer.commercial_state, machine_state: payload.offer.machine_state });
}

{
  const url = new URL(GATEWAY);
  url.searchParams.set('view', 'service');
  url.searchParams.set('public_id', PUBLIC_ID);
  const { response, text } = await read(url, { headers: { accept: 'text/html' } });
  ensure(response.ok, `service page returned HTTP ${response.status}`);
  ensure(text.includes(NAME), 'service page does not name Sentinel');
  checks.push({ kind: 'service_page', status: response.status, indexed: /index,\s*follow/i.test(text) || /robots/i.test(text) });
}

{
  const url = new URL(GATEWAY);
  url.searchParams.set('view', 'llms');
  const { response, text } = await read(url, { headers: { accept: 'text/plain' } });
  ensure(response.ok, `machine llms view returned HTTP ${response.status}`);
  ensure(text.includes(NAME), 'machine llms view does not contain Sentinel');
  checks.push({ kind: 'llms_view', status: response.status, contains_sentinel: true });
}

{
  const rpc = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'match_offer',
      arguments: {
        intent: 'our company has too many apps and we do not know what is broken',
        limit: 3
      }
    }
  };
  const { response, text } = await read(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify(rpc)
  });
  ensure(response.ok, `MCP tools/call returned HTTP ${response.status}`);
  ensure(text.includes(PUBLIC_ID) && text.includes(NAME), 'MCP response did not contain Sentinel');
  checks.push({ kind: 'mcp_match_offer', status: response.status, content_type: response.headers.get('content-type'), contains_sentinel: true });
}

for (const file of [
  'public/.well-known/evercraft-products.json',
  'public/.well-known/evercraft-machine-catalog.json',
  'registry/catalog.json',
  'conformance/products.json',
  'public/chum/capabilities/portfolio-sentinel-v1/capability.json',
  'public/chum/intents/portfolio-sentinel-v1/offer.json'
]) {
  ensure(fs.existsSync(file), `local discovery source missing: ${file}`);
}

const receipt = {
  schema: 'evercraft.portfolio-sentinel.commercial-discovery-canary.v1',
  status: 'pass',
  observed_at: new Date().toISOString(),
  public_id: PUBLIC_ID,
  probe_count: PROBES.length,
  checks,
  truth_boundary: 'This proves Evercraft public discovery surfaces currently route the tested pain language to Sentinel. It does not prove any third-party LLM has independently indexed, recommended, purchased, or deployed the product.'
};

const out = path.resolve('artifacts/portfolio-sentinel-commercial-canary/latest.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
