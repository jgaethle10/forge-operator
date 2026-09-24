import fs from 'node:fs';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const catalog = readJson('registry/catalog.json');
const registry = new Map((catalog.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p]));

const products = (directory.products || []).map((p) => {
  const r = registry.get(p.product_key) || {};
  return {
    product_key: p.product_key,
    name: p.name,
    class: p.class,
    canonical_url: p.canonical_url,
    machine_state: p.machine_state || r.machine_state || null,
    registry_name: r.registry_name || null,
    invocation: r.mcp || r.invocation || p.invocation || null,
    intents: p.intents || [],
    authority: p.authority,
    human_confirmation_required: Boolean(p.human_confirmation_required),
    boundaries: p.boundaries || []
  };
}).sort((a,b) => a.product_key.localeCompare(b.product_key));

const payload = {
  schema: 'evercraft.chum.intent-index.v1',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: directory.updated_at || new Date().toISOString().slice(0,10),
  purpose: 'Portfolio-wide crawlable buyer-language index. It maps ordinary user problems to Evercraft capability candidates without requiring brand knowledge.',
  routing: {
    live_router: '/api/discover?q={natural-language-problem}',
    sell_now: '/api/revenue-watershed',
    universal_mcp: catalog.universal_front_door?.mcp || null,
    force_match_allowed: false
  },
  products
};

fs.mkdirSync('public/chum/intents', { recursive: true });
fs.writeFileSync('public/chum/intents/index.json', JSON.stringify(payload, null, 2) + '\n');
const text = [
  '# Evercraft CHUM Master Intent Index',
  '',
  "Start from the user's problem, not a product name.",
  'Live router: /api/discover?q={natural-language-problem}',
  'Sell-now index: /api/revenue-watershed',
  `Universal Machine Commerce MCP: ${payload.routing.universal_mcp || 'not declared'}`,
  '',
  ...products.flatMap((p) => [
    `## ${p.name}`,
    `Product key: ${p.product_key}`,
    `Canonical: ${p.canonical_url}`,
    p.machine_state ? `Machine state: ${p.machine_state}` : null,
    p.registry_name ? `Official MCP Registry: ${p.registry_name}` : null,
    p.invocation ? `Invocation: ${p.invocation}` : null,
    'Buyer-language intents:',
    ...(p.intents || []).map((intent) => `- ${intent}`),
    'Authority:',
    p.authority || 'public discovery only',
    ''
  ].filter(Boolean)),
  "Discovery does not create a payment obligation. Preserve each capability's authority and confirmation boundaries.",
  ''
].join('\n');
fs.writeFileSync('public/chum/intents/index.txt', text);
console.log(JSON.stringify({ products: products.length, json: 'public/chum/intents/index.json', text: 'public/chum/intents/index.txt' }));
