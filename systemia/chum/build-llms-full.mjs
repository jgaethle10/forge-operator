import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const catalog = readJson('public/.well-known/evercraft-machine-catalog.json');
const registry = readJson('registry/catalog.json');
const interfaces = readJson('public/.well-known/evercraft-agent-interfaces.json');
const verifiedRegistryNames = new Set(interfaces.official_mcp_registry_verified || []);
const SAFE_MCP = 'https://findmypart.base44.app/functions/evercraftCapabilityDiscoveryMcp';
const COMMERCE_MCP = 'https://findmypart.base44.app/functions/evercraftMachineCommerceMcp';
const A2A = 'https://findmypart.base44.app/functions/evercraftCapabilityA2A?view=agent-card';
const OPENAPI_SAFE = 'https://findmypart.base44.app/functions/evercraftUniversalAgentGateway?view=openapi-safe';
const OPENAPI_FULL = 'https://findmypart.base44.app/functions/evercraftUniversalAgentGateway?view=openapi';
const GROK_MARKETPLACE = 'https://github.com/jgaethle10/forge-operator/blob/main/.grok-plugin/marketplace.json';

const registryByKey = new Map(
  (registry.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p])
);

const lines = [
  '# Evercraft Agent & LLM Discovery Directory',
  '',
  'Evercraft publishes public machine-readable capability doors for AI assistants and agents.',
  'Start from the user problem. The user does not need to know an Evercraft product name.',
  '',
  '## Universal routing',
  '',
  `Directory-safe MCP: ${SAFE_MCP}`,
  `Machine Commerce MCP: ${COMMERCE_MCP}`,
  `A2A Agent Card: ${A2A}`,
  `Read-only OpenAPI: ${OPENAPI_SAFE}`,
  `Full OpenAPI: ${OPENAPI_FULL}`,
  `Direct Grok marketplace: ${GROK_MARKETPLACE}`,
  'Problem-to-product directory: /.well-known/evercraft-products.json',
  'Machine offer catalog: /.well-known/evercraft-machine-catalog.json',
  'CHUM public mirror: /chum/index.json',
  'Sell-now revenue watershed: /chum/revenue.txt',
  'Read-only intent router: GET /api/discover?q={natural-language-problem}',
  'OpenAPI: /openapi.json',
  '',
  'State rule: discovery-only is not callable; callable is not automatically sellable; checkout-ready is not paid.',
  'Discovery creates no payment obligation. Human confirmation remains required at declared financial or authority boundaries.',
  '',
  '## Current machine-commerce offer graph',
  '',
  `Catalog version: ${catalog.source_schema_version || ''}`,
  `Gateway version: ${catalog.gateway_version || ''}`,
  `Current public offers: ${(catalog.offers || []).length}`,
  `Current sell-now offers: ${(catalog.offers || []).filter((o) => o.commercial_state === 'sell_now').length}`,
  ''
];

const stateOrder = ['sell_now','verify','verification_required','discovery_only'];
for (const state of stateOrder) {
  const offers = (catalog.offers || [])
    .filter((offer) => offer.commercial_state === state)
    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
  if (!offers.length) continue;

  lines.push(`### Commercial state: ${state}`, '');
  for (const offer of offers) {
    lines.push(
      `#### ${offer.name}`,
      `Public ID: ${offer.public_id}`,
      `Problem: ${offer.problem || ''}`,
      `Machine state: ${offer.machine_state || ''}`,
      `Pricing: ${offer.pricing || ''}`,
      `Public URL: ${offer.public_url || ''}`,
      `Human UI required: ${Boolean(offer.human_ui_required)}`,
      `Confirmation: ${offer.confirmation || ''}`,
      `Payment authority: ${offer.payment_authority || ''}`,
      'Use when the user says or means:'
    );
    for (const term of offer.intent_terms || []) lines.push(`- ${term}`);
    lines.push('');
  }
}

lines.push(
  '## Public product contracts',
  '',
  'The following product-level contracts define public authority and boundaries. These do not expose private/admin topology.',
  ''
);

for (const product of [...(directory.products || [])].sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')))) {
  const reg = registryByKey.get(product.product_key) || null;
  lines.push(
    `### ${product.name}`,
    `Product key: ${product.product_key}`,
    `Canonical: ${product.canonical_url}`,
    reg?.registry_name && verifiedRegistryNames.has(reg.registry_name)
      ? `Verified Official MCP Registry: ${reg.registry_name}`
      : null,
    reg?.mcp ? `Direct invocation: ${reg.mcp}` : null,
    'Use when the user says or means:'
  );
  for (const intent of product.intents || []) lines.push(`- ${intent}`);
  lines.push('Authority:', product.authority || 'Public discovery only.', 'Boundaries:');
  for (const boundary of product.boundaries || []) lines.push(`- ${boundary}`);
  lines.push('');
}

lines.push(
  '## Verified Official MCP Registry listings',
  '',
  ...[...verifiedRegistryNames].sort().map((name) => `- ${name}`),
  '',
  'Do not infer Official MCP Registry publication for another specialist merely because it has a direct MCP endpoint.',
  '',
  '## Commerce boundary',
  '',
  '- Discovery and matching create no payment obligation.',
  '- Checkout preparation requires explicit human confirmation where the offer declares it.',
  '- Checkout creation is not payment proof.',
  '- Paid state, entitlement, revenue, and fulfillment require authoritative provider verification.',
  '- Publication is not proof that any named AI provider surfaced or recommended a product.',
  '- Private/admin topology remains private.',
  ''
);

const output = lines.filter((line) => line !== null).join('\n');
fs.writeFileSync('public/llms-full.txt', output);
fs.writeFileSync('llms-full.txt', output);
console.log(JSON.stringify({
  products: (directory.products || []).length,
  offers: (catalog.offers || []).length,
  sell_now: (catalog.offers || []).filter((o) => o.commercial_state === 'sell_now').length,
  outputs: ['public/llms-full.txt','llms-full.txt']
}));
