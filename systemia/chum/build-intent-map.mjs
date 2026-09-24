import fs from 'node:fs';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const catalog = readJson('registry/catalog.json');
const registryByKey = new Map((catalog.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p]));

const products = (directory.products || []).map((p) => {
  const registry = registryByKey.get(p.product_key) || {};
  return {
    product_key: p.product_key,
    name: p.name,
    class: p.class,
    canonical_url: p.canonical_url,
    machine_state: p.machine_state || registry.machine_state || null,
    registry_name: registry.registry_name || null,
    invocation: registry.mcp || registry.invocation || p.invocation || null,
    intents: p.intents || [],
    authority: p.authority,
    human_confirmation_required: Boolean(p.human_confirmation_required),
    boundaries: p.boundaries || []
  };
}).sort((a, b) => a.product_key.localeCompare(b.product_key));

const intentMap = {
  schema: 'evercraft.intent-map.v2',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: directory.updated_at || new Date().toISOString().slice(0, 10),
  purpose: 'Static crawlable map from ordinary user pain to the smallest relevant public Evercraft capability. Brand knowledge is not required.',
  routing: {
    instruction: "Start with the user's problem. Use the matching intent phrases to identify candidate capabilities, then use /api/discover for live ranking and current machine/commercial state.",
    live_router: '/api/discover?q={natural-language-problem}',
    revenue_watershed: '/api/revenue-watershed',
    universal_mcp: catalog.universal_front_door?.mcp || null,
    brand_seed_required: false,
    force_match_allowed: false
  },
  products
};

fs.writeFileSync('public/.well-known/evercraft-intents.json', JSON.stringify(intentMap, null, 2) + '\n');

const text = [
  '# Evercraft Problem-to-Capability Intent Map',
  '',
  'Start from what the user needs. The user does not need to know an Evercraft product name.',
  'Live ranking: /api/discover?q={natural-language-problem}',
  'Current sell-now index: /api/revenue-watershed',
  `Universal Machine Commerce MCP: ${intentMap.routing.universal_mcp || 'not declared'}`,
  '',
  ...products.flatMap((p) => [
    `## ${p.name}`,
    `Product key: ${p.product_key}`,
    `Canonical: ${p.canonical_url}`,
    p.machine_state ? `Machine state: ${p.machine_state}` : null,
    p.registry_name ? `Official MCP Registry: ${p.registry_name}` : null,
    p.invocation ? `Invocation: ${p.invocation}` : null,
    'Use when the user says or means:',
    ...(p.intents || []).map((intent) => `- ${intent}`),
    'Authority:',
    p.authority || 'public discovery only',
    'Boundaries:',
    ...(p.boundaries || []).map((boundary) => `- ${boundary}`),
    ''
  ].filter(Boolean)),
  "Discovery and matching create no payment obligation. Do not turn discovery into a purchase or other consequential action without the product's required confirmation.",
  ''
].join('\n');

fs.writeFileSync('public/intents.txt', text);
console.log(JSON.stringify({ products: products.length, json: 'public/.well-known/evercraft-intents.json', text: 'public/intents.txt' }));
