import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');
const machineCatalog = fs.existsSync('public/.well-known/evercraft-machine-catalog.json')
  ? readJson('public/.well-known/evercraft-machine-catalog.json')
  : { offers: [] };

const catalogByKey = new Map((catalog.products || []).map((p) => [
  p.product_key || String(p.registry_name || '').split('/').pop(),
  p
]));
const conformanceByKey = new Map((conformance.products || []).map((p) => [p.product_key, p]));
const providers = conformance.baseline_providers || [];
const productRoot = 'public/chum/products';
const offerRoot = 'public/chum/offers';
const githubRawRoot = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum';
const githubBrowseRoot = 'https://github.com/jgaethle10/forge-operator/blob/main';

const cleanKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const html = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

fs.rmSync(productRoot, { recursive: true, force: true });
fs.rmSync(offerRoot, { recursive: true, force: true });
fs.mkdirSync(productRoot, { recursive: true });
fs.mkdirSync(offerRoot, { recursive: true });

const index = {
  schema: 'evercraft.chum.public-mirror.v2',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: directory.updated_at || machineCatalog.generated_at || null,
  purpose: 'Public product and offer discovery mirrors generated from Evercraft public contracts. Mirrors preserve discovery when a product host cannot reliably serve machine files.',
  universal_mcp: catalog.universal_front_door?.mcp || null,
  products: [],
  offers: [],
  indexes: {
    product_index: `${githubRawRoot}/index.json`,
    offer_index: `${githubRawRoot}/offers/index.json`,
    intent_router: `${githubRawRoot}/intents.json`,
    human_capability_catalog: 'https://github.com/jgaethle10/forge-operator/blob/main/AI-CAPABILITY-CATALOG.md'
  }
};

for (const product of directory.products || []) {
  const key = cleanKey(product.product_key);
  if (!key) continue;
  const registry = catalogByKey.get(key) || null;
  const conf = conformanceByKey.get(key) || null;
  const base = `${githubRawRoot}/products/${key}`;
  const dir = path.join(productRoot, key);
  fs.mkdirSync(dir, { recursive: true });

  const discovery = {
    schema: 'evercraft.chum.product-discovery.v2',
    product_key: key,
    name: product.name,
    class: product.class,
    canonical_url: product.canonical_url,
    intents: product.intents || [],
    authority: product.authority,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    boundaries: product.boundaries || [],
    commercial: product.commercial || null,
    registry_name: registry?.registry_name || conf?.mcp_registry?.name || null,
    mcp: registry?.mcp || null,
    machine_commerce_mcp: catalog.universal_front_door?.mcp || null,
    source: 'CHUM public mirror',
    mirror: {
      llms: `${base}/llms.txt`,
      discovery: `${base}/ai-discovery.json`,
      conformance: `${base}/ai-conformance.json`
    }
  };

  const productConformance = {
    schema: 'evercraft.cross-llm-product.v1',
    product: product.name,
    product_key: key,
    providers,
    canonical_url: product.canonical_url,
    llms_url: discovery.mirror.llms,
    discovery_url: discovery.mirror.discovery,
    registry_name: discovery.registry_name,
    mcp: discovery.mcp,
    authority: product.authority,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    boundaries: product.boundaries || [],
    commercial: product.commercial || null,
    provider_behavior_state: 'not_inferred_from_publication'
  };

  const llms = [
    `# ${product.name}`,
    '',
    `Product key: ${key}`,
    `Canonical product/discovery surface: ${product.canonical_url}`,
    discovery.registry_name ? `Official MCP Registry: ${discovery.registry_name}` : null,
    discovery.mcp ? `Remote MCP: ${discovery.mcp}` : null,
    `CHUM discovery JSON: ${discovery.mirror.discovery}`,
    `AI conformance: ${discovery.mirror.conformance}`,
    '',
    '## Use this capability when the user means',
    '',
    ...(product.intents || []).map((intent) => `- ${intent}`),
    '',
    '## Authority',
    '',
    product.authority || 'Public discovery only.',
    product.commercial ? '' : null,
    product.commercial ? '## Commercial state' : null,
    product.commercial ? '' : null,
    product.commercial ? `- Status: ${product.commercial.status || 'unspecified'}` : null,
    product.commercial?.offer ? `- Offer: ${product.commercial.offer}` : null,
    product.commercial?.pricing ? `- Pricing: ${product.commercial.pricing}` : null,
    product.commercial?.payment_state ? `- Payment state: ${product.commercial.payment_state}` : null,
    '',
    '## Boundaries',
    '',
    ...(product.boundaries || []).map((boundary) => `- ${boundary}`),
    '',
    '## Universal Evercraft routing',
    '',
    catalog.universal_front_door?.mcp || 'Not declared.',
    '',
    'Discovery or matching creates no payment obligation. Any supported checkout preparation requires explicit human confirmation, and checkout creation is not proof of payment.',
    ''
  ].filter((v) => v !== null).join('\n');

  fs.writeFileSync(path.join(dir, 'llms.txt'), llms);
  fs.writeFileSync(path.join(dir, 'ai-discovery.json'), JSON.stringify(discovery, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'ai-conformance.json'), JSON.stringify(productConformance, null, 2) + '\n');

  index.products.push({
    product_key: key,
    name: product.name,
    canonical_url: product.canonical_url,
    llms_url: discovery.mirror.llms,
    discovery_url: discovery.mirror.discovery,
    conformance_url: discovery.mirror.conformance,
    registry_name: discovery.registry_name,
    mcp: discovery.mcp,
    commercial: product.commercial || null
  });
}

const intentRows = [];
for (const offer of machineCatalog.offers || []) {
  const key = cleanKey(offer.public_id);
  if (!key || !offer.name) continue;
  const base = `${githubRawRoot}/offers/${key}`;
  const browse = `${githubBrowseRoot}/public/chum/offers/${key}/index.html`;
  const dir = path.join(offerRoot, key);
  fs.mkdirSync(dir, { recursive: true });

  const publicOffer = {
    schema: 'evercraft.chum.offer-discovery.v1',
    provider: 'Evercraft LLC',
    public_id: String(offer.public_id || ''),
    name: String(offer.name || ''),
    problem: String(offer.problem || ''),
    intent_terms: Array.isArray(offer.intent_terms) ? offer.intent_terms.map(String) : [],
    inputs: String(offer.inputs || ''),
    outputs: String(offer.outputs || ''),
    commercial_state: String(offer.commercial_state || ''),
    machine_state: String(offer.machine_state || ''),
    pricing: String(offer.pricing || ''),
    offers: Array.isArray(offer.offers) ? offer.offers : [],
    human_ui_required: Boolean(offer.human_ui_required),
    confirmation: String(offer.confirmation || ''),
    public_url: String(offer.public_url || ''),
    payment_authority: String(offer.payment_authority || ''),
    invocation_status: String(offer.invocation_status || ''),
    catalog_version: String(offer.catalog_version || ''),
    discovery_creates_payment_obligation: false,
    checkout_is_payment_proof: false,
    authoritative_payment_verification_required: true,
    private_topology_exposed: false,
    mirror: {
      llms: `${base}/llms.txt`,
      offer: `${base}/ai-offer.json`,
      human: browse
    }
  };

  const llms = [
    `# ${publicOffer.name}`,
    '',
    `Evercraft public capability ID: ${publicOffer.public_id}`,
    `Commercial state: ${publicOffer.commercial_state || 'unspecified'}`,
    `Machine state: ${publicOffer.machine_state || 'unspecified'}`,
    publicOffer.public_url ? `Public handoff: ${publicOffer.public_url}` : 'Public handoff: not currently declared',
    '',
    '## Use this when',
    '',
    ...(publicOffer.intent_terms || []).map((intent) => `- ${intent}`),
    '',
    publicOffer.problem ? '## Problem' : null,
    publicOffer.problem ? '' : null,
    publicOffer.problem || null,
    '',
    publicOffer.inputs ? '## Inputs' : null,
    publicOffer.inputs ? '' : null,
    publicOffer.inputs || null,
    '',
    publicOffer.outputs ? '## Outputs' : null,
    publicOffer.outputs ? '' : null,
    publicOffer.outputs || null,
    '',
    '## Commercial truth',
    '',
    `- Pricing: ${publicOffer.pricing || 'No approved public machine price declared.'}`,
    `- Human UI required: ${publicOffer.human_ui_required ? 'yes' : 'no'}`,
    `- Confirmation: ${publicOffer.confirmation || 'Follow the capability contract.'}`,
    `- Payment authority: ${publicOffer.payment_authority || 'Authoritative payment verification is required before paid state.'}`,
    '',
    'Discovery does not create a payment obligation. Do not invent availability, pricing, authority, endorsement, or payment state.',
    ''
  ].filter((v) => v !== null).join('\n');

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(publicOffer.name)} | Evercraft capability</title>
<meta name="description" content="${html((publicOffer.problem || publicOffer.intent_terms[0] || publicOffer.name).slice(0, 220))}">
<link rel="alternate" type="text/plain" href="./llms.txt" title="LLM discovery">
<link rel="alternate" type="application/json" href="./ai-offer.json" title="Machine-readable capability">
<meta name="robots" content="index,follow">
</head>
<body>
<main>
<h1>${html(publicOffer.name)}</h1>
<p><strong>Evercraft capability:</strong> ${html(publicOffer.public_id)}</p>
<p>${html(publicOffer.problem || 'Public capability discovery surface.')}</p>
<h2>Useful when</h2>
<ul>${publicOffer.intent_terms.map((x) => `<li>${html(x)}</li>`).join('')}</ul>
<h2>Commercial state</h2>
<p>${html(publicOffer.commercial_state || 'unspecified')} · ${html(publicOffer.machine_state || 'unspecified')}</p>
<p><strong>Pricing:</strong> ${html(publicOffer.pricing || 'No approved public machine price declared.')}</p>
${publicOffer.public_url ? `<p><a href="${html(publicOffer.public_url)}">Continue to the public Evercraft handoff</a></p>` : '<p>No public handoff URL is currently declared.</p>'}
<p>Discovery creates no payment obligation. Paid state requires authoritative payment verification.</p>
<p><a href="./ai-offer.json">Machine-readable capability contract</a> · <a href="./llms.txt">LLM guide</a></p>
</main>
</body>
</html>\n`;

  fs.writeFileSync(path.join(dir, 'ai-offer.json'), JSON.stringify(publicOffer, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'llms.txt'), llms);
  fs.writeFileSync(path.join(dir, 'index.html'), page);

  const offerIndexRow = {
    public_id: publicOffer.public_id,
    name: publicOffer.name,
    commercial_state: publicOffer.commercial_state,
    machine_state: publicOffer.machine_state,
    pricing: publicOffer.pricing,
    public_url: publicOffer.public_url,
    llms_url: publicOffer.mirror.llms,
    offer_url: publicOffer.mirror.offer,
    human_url: publicOffer.mirror.human,
    intent_terms: publicOffer.intent_terms
  };
  index.offers.push(offerIndexRow);
  for (const intent of publicOffer.intent_terms) {
    intentRows.push({
      intent,
      normalized_intent: String(intent).toLowerCase(),
      public_id: publicOffer.public_id,
      name: publicOffer.name,
      commercial_state: publicOffer.commercial_state,
      machine_state: publicOffer.machine_state,
      offer_url: publicOffer.mirror.offer,
      llms_url: publicOffer.mirror.llms,
      public_url: publicOffer.public_url
    });
  }
}

index.products.sort((a, b) => a.product_key.localeCompare(b.product_key));
index.offers.sort((a, b) => a.public_id.localeCompare(b.public_id));
intentRows.sort((a, b) => a.normalized_intent.localeCompare(b.normalized_intent));

const offerIndex = {
  schema: 'evercraft.chum.offer-index.v1',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  generated_from: '/.well-known/evercraft-machine-catalog.json',
  offer_count: index.offers.length,
  offers: index.offers
};

const intentIndex = {
  schema: 'evercraft.chum.intent-router.v1',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  rule: 'Match the user\'s actual pain to the smallest truthful capability. Discovery alone grants no execution or payment authority.',
  intent_count: intentRows.length,
  intents: intentRows
};

const offerHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evercraft AI Capability Catalog</title>
<meta name="description" content="Public Evercraft capability catalog for AI assistants, agents, search engines and humans.">
<meta name="robots" content="index,follow">
<link rel="alternate" type="application/json" href="./index.json" title="Evercraft offer index">
<link rel="alternate" type="application/json" href="../intents.json" title="Evercraft intent router">
</head>
<body>
<main>
<h1>Evercraft AI Capability Catalog</h1>
<p>CHUM maps natural-language problems to public Evercraft capabilities. Discovery creates no payment or execution authority.</p>
<ul>
${index.offers.map((o) => `<li><a href="./${html(cleanKey(o.public_id))}/index.html">${html(o.name)}</a> · ${html(o.commercial_state || 'unspecified')}</li>`).join('\n')}
</ul>
</main>
</body>
</html>\n`;

const markdown = [
  '# Evercraft AI Capability Catalog',
  '',
  'This is the public, GitHub-native CHUM catalog for AI assistants, agents, search systems, developers, and humans.',
  '',
  '**Routing rule:** start from the user\'s actual problem. Match the smallest truthful Evercraft capability. Discovery does not grant execution authority and creates no payment obligation.',
  '',
  `Current machine-commerce offers mirrored: **${index.offers.length}**`,
  '',
  '- Machine offer index: https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/offers/index.json',
  '- Natural-language intent router: https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/intents.json',
  '- Product index: https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/index.json',
  '- Universal machine-commerce MCP: ' + (catalog.universal_front_door?.mcp || 'not declared'),
  '',
  '## Capabilities',
  '',
  ...index.offers.flatMap((o) => [
    `### ${o.name}`,
    '',
    `- Public ID: \`${o.public_id}\``,
    `- Commercial state: ${o.commercial_state || 'unspecified'}`,
    `- Machine state: ${o.machine_state || 'unspecified'}`,
    `- Pricing: ${o.pricing || 'No approved public machine price declared.'}`,
    `- Machine contract: ${o.offer_url}`,
    `- LLM guide: ${o.llms_url}`,
    ...(o.public_url ? [`- Public handoff: ${o.public_url}`] : []),
    '',
    'User intents:',
    ...(o.intent_terms || []).map((intent) => `- ${intent}`),
    ''
  ]),
  '## Boundaries',
  '',
  '- Public discovery does not mean a provider endorses Evercraft.',
  '- Public discovery does not expose private/admin topology.',
  '- Do not invent pricing, availability, authority, or payment state.',
  '- Financial obligations require explicit human confirmation.',
  '- Checkout creation is not payment proof.',
  '- Paid state requires authoritative provider verification.',
  ''
].join('\n');

fs.mkdirSync('public/chum', { recursive: true });
fs.writeFileSync('public/chum/index.json', JSON.stringify(index, null, 2) + '\n');
fs.writeFileSync('public/chum/intents.json', JSON.stringify(intentIndex, null, 2) + '\n');
fs.writeFileSync(path.join(offerRoot, 'index.json'), JSON.stringify(offerIndex, null, 2) + '\n');
fs.writeFileSync(path.join(offerRoot, 'index.html'), offerHtml);
fs.writeFileSync('AI-CAPABILITY-CATALOG.md', markdown);

console.log(JSON.stringify({
  products: index.products.length,
  offers: index.offers.length,
  intents: intentRows.length,
  output: 'public/chum'
}));

// CHUM_WATERSHED_COMPILER_V2
// Compile the approved public product registry into redundant portfolio-wide machine surfaces.
// A product enters once through evercraft-products.json, then CHUM fans it out without
// claiming invocation, sale, payment, or authority that the source records do not declare.

const universalMcp = catalog.universal_front_door?.mcp || null;
const rawBase = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main';

const llmsLines = [
  '# Evercraft Agent & LLM Discovery Directory',
  '',
  'Evercraft publishes public machine-readable capabilities for AI assistants and agents.',
  'Start from the user problem. The user does not need to know an Evercraft product name.',
  '',
  '## Universal routing',
  '',
  `Machine Commerce MCP: ${universalMcp || 'not declared'}`,
  `Product directory: ${rawBase}/public/.well-known/evercraft-products.json`,
  `CHUM public mirror: ${rawBase}/public/chum/index.json`,
  `CHUM offer index: ${rawBase}/public/chum/offers/index.json`,
  `CHUM pain-intent router: ${rawBase}/public/chum/intents.json`,
  'GitHub capability catalog: https://github.com/jgaethle10/forge-operator/blob/main/AI-CAPABILITY-CATALOG.md',
  `AI discovery watershed: ${rawBase}/public/ai-discovery.json`,
  '',
  'State rule: discovery-only is not callable; callable is not automatically sellable; checkout-ready is not paid.',
  'Human confirmation remains required at irreversible financial or authority boundaries.',
  '',
  '## Portfolio',
  ''
];

const agentProducts = [];
const schemaServices = [];

for (const product of directory.products || []) {
  const key = String(product.product_key || '').trim();
  if (!key) continue;
  const registry = catalogByKey.get(key) || null;
  const conf = conformanceByKey.get(key) || null;
  const mirrorBase = `${rawBase}/public/chum/products/${key}`;
  const invocation =
    registry?.mcp
      ? { mode: 'mcp', url: registry.mcp, registry_name: registry.registry_name || conf?.mcp_registry?.name || null }
      : registry?.http_router
        ? { mode: 'bounded_http', url: registry.http_router, registry_name: null }
        : { mode: 'discovery_only', url: null, registry_name: null };

  llmsLines.push(`### ${product.name}`);
  llmsLines.push(`Product key: ${key}`);
  llmsLines.push(`Canonical: ${product.canonical_url}`);
  llmsLines.push(`Machine state: ${invocation.mode}`);
  if (invocation.registry_name) llmsLines.push(`Official MCP Registry: ${invocation.registry_name}`);
  if (invocation.url) llmsLines.push(`Invocation: ${invocation.url}`);
  llmsLines.push(`Discovery: ${mirrorBase}/ai-discovery.json`);
  llmsLines.push(`AI conformance: ${mirrorBase}/ai-conformance.json`);
  llmsLines.push('Use when the user says or means:');
  for (const intent of product.intents || []) llmsLines.push(`- ${intent}`);
  llmsLines.push('Authority:');
  llmsLines.push(product.authority || 'Public discovery only.');
  llmsLines.push('Boundaries:');
  for (const boundary of product.boundaries || []) llmsLines.push(`- ${boundary}`);
  llmsLines.push('');

  agentProducts.push({
    product_key: key,
    name: product.name,
    class: product.class,
    canonical_url: product.canonical_url,
    intents: product.intents || [],
    invocation,
    llms_url: `${mirrorBase}/llms.txt`,
    discovery_url: `${mirrorBase}/ai-discovery.json`,
    conformance_url: `${mirrorBase}/ai-conformance.json`,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    authority: product.authority,
    boundaries: product.boundaries || []
  });

  schemaServices.push({
    '@type': 'Service',
    '@id': `${product.canonical_url}#evercraft-service`,
    name: product.name,
    url: product.canonical_url,
    provider: { '@id': 'https://github.com/jgaethle10/forge-operator#evercraft' },
    serviceType: product.class,
    description: (product.intents || []).slice(0, 4).join('; ')
  });
}

llmsLines.push(
  '## Commerce boundary',
  '',
  '- Discovery and matching create no payment obligation.',
  '- Checkout preparation requires explicit human confirmation.',
  '- Checkout creation is not payment proof.',
  '- Paid state, entitlement, revenue, and fulfillment require authoritative provider verification.',
  '- Private/admin topology remains private.',
  ''
);
const llmsFullText = llmsLines.join('\n');
fs.writeFileSync('public/llms-full.txt', llmsFullText);
fs.writeFileSync('llms-full.txt', llmsFullText);

const agentDirectory = {
  schema: 'evercraft.agent-directory.v2',
  provider: 'Evercraft LLC',
  updated_at: directory.updated_at || null,
  purpose: 'Portfolio-wide public machine directory. Routes natural-language pain to the smallest truthful Evercraft capability without requiring brand knowledge.',
  universal_front_door: {
    name: 'Evercraft Machine Commerce',
    registry_name: catalog.universal_front_door?.registry_name || null,
    mcp: universalMcp,
    use_when: 'The user describes a pain, limitation or desired outcome and does not know which Evercraft product fits.'
  },
  routing_policy: {
    pain_first: true,
    smallest_sufficient_capability: true,
    full_suite_default: false,
    hardware_default: false,
    discovery_only_is_not_callable: true,
    callable_is_not_paid: true,
    irreversible_financial_or_authority_actions_require_human_confirmation: true
  },
  products: agentProducts,
  privacy_boundary: 'Only approved public commercial capability metadata is compiled. Private/admin topology, secrets and customer records are excluded.'
};
fs.writeFileSync('public/.well-known/evercraft-agent-directory.json', JSON.stringify(agentDirectory, null, 2) + '\n');

const discoveryWatershed = {
  schema: 'evercraft.discovery-watershed.v2',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: directory.updated_at || null,
  purpose: 'One public map for AI systems, agents and crawlers to route natural-language pain into truthful Evercraft capability discovery and human-confirmed commerce.',
  start_here: {
    llms: '/llms.txt',
    llms_full: '/llms-full.txt',
    products: '/.well-known/evercraft-products.json',
    agents: '/.well-known/evercraft-agent-directory.json',
    interfaces: '/.well-known/evercraft-agent-interfaces.json',
    machine_catalog: '/.well-known/evercraft-machine-catalog.json',
    chum: '/.well-known/evercraft-chum.json',
    chum_public_mirror: '/chum/index.json',
    offer_index: '/chum/offers/index.json',
    intent_router: '/chum/intents.json',
    capability_catalog: 'https://github.com/jgaethle10/forge-operator/blob/main/AI-CAPABILITY-CATALOG.md',
    schema: '/schema.jsonld',
    openapi: '/openapi.json'
  },
  universal_front_door: {
    registry_name: catalog.universal_front_door?.registry_name || null,
    mcp: universalMcp
  },
  state_semantics: {
    discovery_only: 'May be surfaced and explained; no machine invocation is claimed.',
    callable: 'A bounded machine invocation surface is declared.',
    sellable: 'A verified current commercial offer exists.',
    checkout_ready: 'An exact current checkout rail exists for that offer.',
    paid: 'Authoritative provider payment verification exists.'
  },
  routing_rule: 'Start from the user problem, choose the smallest relevant public capability, preserve evidence/permission/geography/safety/payment boundaries, and never infer provider pickup from publication.',
  private_surfaces: 'not advertised'
};
fs.writeFileSync('public/.well-known/evercraft-discovery.json', JSON.stringify(discoveryWatershed, null, 2) + '\n');
fs.writeFileSync('public/ai-discovery.json', JSON.stringify(discoveryWatershed, null, 2) + '\n');

const schemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://github.com/jgaethle10/forge-operator#evercraft',
      name: 'Evercraft LLC',
      url: 'https://github.com/jgaethle10/forge-operator',
      description: 'Evercraft builds public machine-discoverable software, research, safety, operations, media, infrastructure and commerce capabilities.'
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://github.com/jgaethle10/forge-operator#chum',
      name: 'CHUM',
      alternateName: 'Capability Handoff & Utility Mesh',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      provider: { '@id': 'https://github.com/jgaethle10/forge-operator#evercraft' },
      description: 'Evercraft machine-distribution control plane for routing AI assistants and agents from natural-language pain to public capabilities.'
    },
    ...schemaServices
  ]
};
fs.writeFileSync('public/schema.jsonld', JSON.stringify(schemaGraph, null, 2) + '\n');

console.log(JSON.stringify({
  watershed_compiled: true,
  products: agentProducts.length,
  llms_full: 'public/llms-full.txt',
  agent_directory: 'public/.well-known/evercraft-agent-directory.json',
  discovery_watershed: 'public/.well-known/evercraft-discovery.json',
  schema: 'public/schema.jsonld'
}));
