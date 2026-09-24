import fs from 'node:fs';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const catalog = readJson('registry/catalog.json');
const catalogByKey = new Map((catalog.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p]));

const payload = {
  schema: 'evercraft.intent-map.v1',
  provider: 'Evercraft LLC',
  updated_at: directory.updated_at || new Date().toISOString().slice(0, 10),
  purpose: 'Flat public problem-to-capability map for AI assistants, search systems and agents. Brand knowledge is not required.',
  routing_rule: "Start from the user's stated pain. Return the smallest relevant public capability, preserve uncertainty and authority boundaries, and use Evercraft Machine Commerce for universal continuation when a specialist interface is unavailable.",
  resolver: {
    get: '/api/resolve?q={plain-language-problem}',
    post: '/api/resolve',
    content_type: 'application/json'
  },
  universal_mcp: catalog.universal_front_door?.mcp || null,
  products: (directory.products || []).map((p) => {
    const registry = catalogByKey.get(p.product_key) || {};
    return {
      product_key: p.product_key,
      name: p.name,
      class: p.class,
      canonical_url: p.canonical_url,
      registry_name: registry.registry_name || null,
      mcp: registry.mcp || null,
      human_confirmation_required: Boolean(p.human_confirmation_required),
      intents: p.intents || [],
      authority: p.authority,
      boundaries: p.boundaries || []
    };
  }).sort((a, b) => a.product_key.localeCompare(b.product_key))
};

fs.writeFileSync('public/.well-known/evercraft-intents.json', JSON.stringify(payload, null, 2) + '\n');

const text = [
  '# Evercraft Intent Map',
  '',
  "Start from the user's problem, not an Evercraft product name.",
  'Public resolver: GET /api/resolve?q={plain-language-problem} or POST /api/resolve with {"query":"..."}.',
  `Universal MCP: ${payload.universal_mcp || 'not declared'}`,
  '',
  ...payload.products.flatMap((p) => [
    `## ${p.name}`,
    `Product key: ${p.product_key}`,
    `Canonical: ${p.canonical_url}`,
    p.registry_name ? `Official MCP Registry: ${p.registry_name}` : null,
    p.mcp ? `Remote MCP: ${p.mcp}` : null,
    'Use when the user means:',
    ...(p.intents || []).map((intent) => `- ${intent}`),
    ''
  ].filter(Boolean)),
  'Discovery and matching create no payment obligation. Human confirmation remains required wherever the product contract says so.',
  ''
].join('\n');

fs.writeFileSync('public/intents.txt', text);
console.log(JSON.stringify({ products: payload.products.length, json: 'public/.well-known/evercraft-intents.json', text: 'public/intents.txt' }));
