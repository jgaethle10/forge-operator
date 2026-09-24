import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');
const machineCatalog = readJson('public/.well-known/evercraft-machine-catalog.json');

const catalogByKey = new Map((catalog.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p]));
const conformanceByKey = new Map((conformance.products || []).map((p) => [p.product_key, p]));
const providers = conformance.baseline_providers || [];
const root = 'public/chum/products';
const READ_ONLY_DISCOVERY_REGISTRY =
  catalog.universal_front_door?.read_only_registry_name ||
  'io.github.jgaethle10/evercraft-capability-discovery';
const MACHINE_COMMERCE_GATEWAY =
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const BLOCKED_PUBLIC_HOSTS = new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

function safePublicUrl(value, fallback = null) {
  if (!value) return fallback;
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    if (BLOCKED_PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[ch]));
}

function pageDescription(product) {
  const intents = Array.isArray(product.intents) ? product.intents.filter(Boolean) : [];
  const lead = intents.slice(0, 3).join('; ');
  return lead
    ? `${product.name} is an Evercraft public capability for: ${lead}.`
    : `${product.name} is an Evercraft public capability in ${product.class || 'software'}.`;
}

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const index = {
  schema: 'evercraft.chum.public-mirror.v1',
  provider: 'Evercraft LLC',
  updated_at: directory.updated_at || null,
  purpose: 'Product-specific machine discovery mirrors generated from Evercraft public contracts. Mirrors preserve public discovery when a product host cannot reliably serve machine files.',
  read_only_registry_name: READ_ONLY_DISCOVERY_REGISTRY,
  pain_index: '/.well-known/evercraft-pain-index.json',
  answer_graph: '/chum/answers/index.json',
  universal_mcp: safePublicUrl(catalog.universal_front_door?.mcp, null),
  products: []
};

for (const product of directory.products || []) {
  const key = String(product.product_key || '').trim();
  if (!key) continue;
  const registry = catalogByKey.get(key) || null;
  const conf = conformanceByKey.get(key) || null;
  const base = `https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/products/${key}`;
  const dir = path.join(root, key);
  fs.mkdirSync(dir, { recursive: true });
  const canonicalUrl = safePublicUrl(product.canonical_url, base + '/index.html');
  const specialistMcp = safePublicUrl(registry?.mcp, null);

  const discovery = {
    schema: 'evercraft.chum.product-discovery.v1',
    product_key: key,
    name: product.name,
    class: product.class,
    canonical_url: canonicalUrl,
    intents: product.intents || [],
    authority: product.authority,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    boundaries: product.boundaries || [],
    registry_name: registry?.registry_name || conf?.mcp_registry?.name || null,
    mcp: specialistMcp,
    machine_commerce_mcp: safePublicUrl(catalog.universal_front_door?.mcp, null),
    source: 'CHUM public mirror',
    mirror: {
      llms: `${base}/llms.txt`,
      discovery: `${base}/ai-discovery.json`,
      conformance: `${base}/ai-conformance.json`
,
      page: `/chum/products/${key}/`
    }
  };

  const productConformance = {
    schema: 'evercraft.cross-llm-product.v1',
    product: product.name,
    product_key: key,
    providers,
    canonical_url: canonicalUrl,
    llms_url: discovery.mirror.llms,
    discovery_url: discovery.mirror.discovery,
    registry_name: discovery.registry_name,
    mcp: discovery.mcp,
    authority: product.authority,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    boundaries: product.boundaries || [],
    provider_behavior_state: 'not_inferred_from_publication'
  };

  const llms = [
    `# ${product.name}`,
    '',
    `Product key: ${key}`,
    `Canonical product: ${canonicalUrl}`,
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
    '',
    '## Boundaries',
    '',
    ...(product.boundaries || []).map((boundary) => `- ${boundary}`),
    '',
    '## Universal Evercraft routing',
    '',
    safePublicUrl(catalog.universal_front_door?.mcp, null) || 'Not declared.',
    '',
    'Discovery or matching creates no payment obligation. Any supported checkout preparation requires explicit human confirmation, and checkout creation is not proof of payment.',
    ''
  ].filter((v) => v !== null).join('\n');

  fs.writeFileSync(path.join(dir, 'llms.txt'), llms);
  fs.writeFileSync(path.join(dir, 'ai-discovery.json'), JSON.stringify(discovery, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'ai-conformance.json'), JSON.stringify(productConformance, null, 2) + '\n');


  const productPageJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${canonicalUrl}#evercraft-capability`,
        name: product.name,
        serviceType: product.class,
        url: canonicalUrl,
        provider: {
          '@type': 'Organization',
          name: 'Evercraft LLC',
          url: 'https://github.com/jgaethle10/forge-operator'
        },
        description: pageDescription(product),
        identifier: discovery.registry_name || key
      },
      {
        '@type': 'WebPage',
        name: `${product.name} | Evercraft public capability`,
        description: pageDescription(product),
        about: { '@id': `${canonicalUrl}#evercraft-capability` }
      }
    ]
  };

  const productHtml = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(product.name)} | Evercraft public capability</title>`,
    `<meta name="description" content="${escapeHtml(pageDescription(product))}">`,
    '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
    '<link rel="alternate" type="text/plain" href="./llms.txt">',
    '<link rel="alternate" type="application/json" href="./ai-discovery.json">',
    `<script type="application/ld+json">${JSON.stringify(productPageJsonLd).replace(/</g, '\\u003c')}</script>`,
    '<style>body{font-family:system-ui,sans-serif;max-width:920px;margin:56px auto;padding:0 24px;line-height:1.6;background:#09090b;color:#fafafa}a{color:#93c5fd}.card{border:1px solid #27272a;border-radius:16px;padding:20px;margin:18px 0}.muted{color:#a1a1aa}code{background:#18181b;padding:.15rem .35rem;border-radius:.3rem}</style>',
    '</head><body><main>',
    '<p class="muted">EVERCRAFT · PUBLIC CAPABILITY</p>',
    `<h1>${escapeHtml(product.name)}</h1>`,
    `<p>${escapeHtml(pageDescription(product))}</p>`,
    '<div class="card"><h2>Use this when</h2><ul>',
    ...(product.intents || []).map((intent) => `<li>${escapeHtml(intent)}</li>`),
    '</ul></div>',
    '<div class="card"><h2>Open capability</h2>',
    `<p><a href="${escapeHtml(canonicalUrl)}">Open ${escapeHtml(product.name)}</a></p>`,
    discovery.registry_name ? `<p>Official MCP Registry name: <code>${escapeHtml(discovery.registry_name)}</code></p>` : '',
    discovery.mcp ? `<p>Remote MCP: <code>${escapeHtml(discovery.mcp)}</code></p>` : '',
    '<p>Universal pain-first routing: <a href="/chum/">CHUM</a></p>',
    '</div>',
    '<div class="card"><h2>Machine-readable doors</h2><ul>',
    '<li><a href="./llms.txt">LLM guidance</a></li>',
    '<li><a href="./ai-discovery.json">Discovery JSON</a></li>',
    '<li><a href="./ai-conformance.json">AI conformance</a></li>',
    '</ul></div>',
    '<div class="card"><h2>Authority and boundaries</h2>',
    `<p>${escapeHtml(product.authority || 'Public discovery only.')}</p>`,
    '<ul>',
    ...(product.boundaries || []).map((boundary) => `<li>${escapeHtml(boundary)}</li>`),
    '</ul></div>',
    '<p class="muted">Discovery and matching create no payment obligation. Human confirmation remains required where the product declares it, and checkout creation is not proof of payment.</p>',
    '</main></body></html>'
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'index.html'), productHtml + '\n');

  index.products.push({
    product_key: key,
    name: product.name,
    canonical_url: canonicalUrl,
    llms_url: discovery.mirror.llms,
    discovery_url: discovery.mirror.discovery,
    conformance_url: discovery.mirror.conformance,
    page_url: `/chum/products/${key}/`,
    registry_name: discovery.registry_name,
    mcp: discovery.mcp
  });
}

index.products.sort((a, b) => a.product_key.localeCompare(b.product_key));
fs.mkdirSync('public/chum', { recursive: true });
fs.writeFileSync('public/chum/index.json', JSON.stringify(index, null, 2) + '\n');


const publicIndexHtml = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>CHUM | Evercraft AI Discovery Watershed</title>',
  '<meta name="description" content="Pain-first public directory of Evercraft capabilities for AI assistants, search engines, agents and people.">',
  '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
  '<link rel="alternate" type="text/plain" href="/llms-full.txt">',
  '<link rel="alternate" type="application/json" href="/chum/index.json">',
  '<style>body{font-family:system-ui,sans-serif;max-width:980px;margin:56px auto;padding:0 24px;line-height:1.6;background:#09090b;color:#fafafa}a{color:#93c5fd}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{border:1px solid #27272a;border-radius:16px;padding:18px}.muted{color:#a1a1aa}</style>',
  '</head><body><main>',
  '<p class="muted">EVERCRAFT · MACHINE DISTRIBUTION</p>',
  '<h1>CHUM</h1>',
  '<p><strong>Capability Handoff & Utility Mesh.</strong> Start with the problem. CHUM exposes the smallest relevant public Evercraft capability without requiring the product name first.</p>',
  '<form action="/api/discover" method="get" class="card"><label for="q"><strong>Describe the problem</strong></label><br><input id="q" name="q" required style="width:min(100%,700px);padding:10px;margin:10px 0" placeholder="Example: I cannot find a discontinued machine part"><button type="submit" style="padding:10px 16px">Find the smallest matching capability</button></form>',
  `<p><strong>Read-only AI discovery:</strong> <code>${escapeHtml(READ_ONLY_DISCOVERY_REGISTRY)}</code></p>`,
  '<p><a href="/.well-known/evercraft-pain-index.json">Pain Index JSON</a> · <a href="/chum/pain-index.txt">Pain Index text</a> · <a href="/chum/answers/">Answer Graph</a> · <a href="/llms-full.txt">LLM directory</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/chum/revenue.html">Current sell-now offers</a></p>',
  '<p class="muted">Read-only discovery comes first. Machine Commerce is the next door only when current commercial state or a human-confirmed paid continuation is relevant.</p>',
  '<h2>Public capability doors</h2><div class="grid">',
  ...index.products.map((product) => `<article class="card"><h3><a href="${escapeHtml(product.page_url)}">${escapeHtml(product.name)}</a></h3><p><a href="${escapeHtml(product.canonical_url)}">Canonical product</a></p></article>`),
  '</div>',
  '<p class="muted">Public discovery is deliberately open. Private/admin topology, secrets and customer data remain private. Discovery is not proof of provider pickup or payment.</p>',
  '</main></body></html>'
].join('\n');
fs.writeFileSync('public/chum/index.html', publicIndexHtml + '\n');

const sitemapStatic = [
  '/',
  '/chum/',
  '/chum/index.json',
  '/chum/revenue.html',
  '/chum/revenue.txt',
  '/chum/revenue.json',
  '/chum/pain-index.json',
  '/chum/pain-index.txt',
  '/chum/answers/',
  '/chum/answers/index.json',
  '/chum/answers/index.txt',
  '/chum/sitemap.xml',
  '/.well-known/evercraft-pain-index.json',
  '/forensiscope/',
  '/llms.txt',
  '/llms-full.txt',
  '/ai-discovery.json',
  '/schema.jsonld',
  '/openapi.json',
  '/.well-known/evercraft-agent.json',
  '/.well-known/evercraft-agent-directory.json',
  '/.well-known/evercraft-agent-interfaces.json',
  '/.well-known/evercraft-discovery.json',
  '/.well-known/evercraft-products.json',
  '/.well-known/evercraft-machine-catalog.json',
  '/.well-known/evercraft-chum.json',
  '/.well-known/evercraft-media-overflow.json',
  '/.well-known/evercraft-capabilities.json'
];
const sitemapUrls = Array.from(new Set([
  ...sitemapStatic,
  ...(machineCatalog.offers || [])
    .filter((offer) => offer?.public_id)
    .map((offer) => `/chum/intents/${slugify(offer.public_id)}/`),
  ...index.products.flatMap((product) => [
    product.page_url,
    `/chum/products/${product.product_key}/llms.txt`,
    `/chum/products/${product.product_key}/ai-discovery.json`,
    `/chum/products/${product.product_key}/ai-conformance.json`
  ])
]));
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapUrls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
  '</urlset>',
  ''
].join('\n');
fs.writeFileSync('public/sitemap.xml', sitemap);

for (const product of index.products) {
  const pagePath = path.join('public/chum/products', product.product_key, 'index.html');
  if (!fs.existsSync(pagePath)) throw new Error(`CHUM public page missing: ${pagePath}`);
  if (!sitemap.includes(product.page_url)) throw new Error(`CHUM sitemap missing: ${product.page_url}`);
}
console.log(JSON.stringify({ products: index.products.length, output: 'public/chum' }));


// CHUM_WATERSHED_COMPILER_V2
// Compile the approved public product registry into redundant portfolio-wide machine surfaces.
// A product enters once through evercraft-products.json, then CHUM fans it out without
// claiming invocation, sale, payment, or authority that the source records do not declare.

const universalMcp = safePublicUrl(catalog.universal_front_door?.mcp, null);
const rawBase = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main';

const llmsLines = [
  '# Evercraft Agent & LLM Discovery Directory',
  '',
  'Evercraft publishes public machine-readable capabilities for AI assistants and agents.',
  'Start from the user problem. The user does not need to know an Evercraft product name.',
  '',
  '## Universal routing',
  '',
  `Read-only Official MCP Registry: ${READ_ONLY_DISCOVERY_REGISTRY}`,
  `Pain Index: ${rawBase}/public/.well-known/evercraft-pain-index.json`,
  `Answer Graph: ${rawBase}/public/chum/answers/index.json`,
  `Machine Commerce MCP: ${universalMcp || 'not declared'}`,
  `Product directory: ${rawBase}/public/.well-known/evercraft-products.json`,
  `CHUM public mirror: ${rawBase}/public/chum/index.json`,
  `AI discovery watershed: ${rawBase}/public/ai-discovery.json`,
  '',
  'State rule: discovery-only is not callable; callable is not automatically sellable; checkout-ready is not paid.',
  'Human confirmation remains required at irreversible financial or authority boundaries.',
  '',
  '## Current machine-commerce offer graph',
  '',
  `Catalog version: ${machineCatalog.source_schema_version || ''}`,
  `Gateway version: ${machineCatalog.gateway_version || ''}`,
  `Current public offers: ${(machineCatalog.offers || []).length}`,
  `Current sell-now offers: ${(machineCatalog.offers || []).filter((offer) => offer.commercial_state === 'sell_now').length}`,
  ''
];

const commercialStateOrder = ['sell_now', 'verify', 'verification_required', 'discovery_only'];
for (const state of commercialStateOrder) {
  const offers = (machineCatalog.offers || [])
    .filter((offer) => offer.commercial_state === state)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  if (!offers.length) continue;

  llmsLines.push(`### Commercial state: ${state}`, '');
  for (const offer of offers) {
    llmsLines.push(
      `#### ${offer.name}`,
      `Public ID: ${offer.public_id}`,
      `Problem: ${offer.problem || ''}`,
      `Machine state: ${offer.machine_state || ''}`,
      `Pricing: ${offer.pricing || ''}`,
      `Public URL: ${safePublicUrl(offer.public_url, MACHINE_COMMERCE_GATEWAY + '?view=service&public_id=' + encodeURIComponent(String(offer.public_id || ''))) || ''}`,
      `Human UI required: ${Boolean(offer.human_ui_required)}`,
      `Confirmation: ${offer.confirmation || ''}`,
      `Payment authority: ${offer.payment_authority || ''}`,
      'Use when the user says or means:'
    );
    for (const term of offer.intent_terms || []) llmsLines.push(`- ${term}`);
    llmsLines.push('');
  }
}

llmsLines.push('## Public product contracts', '');

const agentProducts = [];
const schemaServices = [];

for (const product of directory.products || []) {
  const key = String(product.product_key || '').trim();
  if (!key) continue;
  const registry = catalogByKey.get(key) || null;
  const conf = conformanceByKey.get(key) || null;
  const mirrorBase = `${rawBase}/public/chum/products/${key}`;
  const safeMcp = safePublicUrl(registry?.mcp, null);
  const safeHttpRouter = safePublicUrl(registry?.http_router, null);
  const safeCanonical = safePublicUrl(product.canonical_url, `${mirrorBase}/index.html`);
  const invocation =
    safeMcp
      ? { mode: 'mcp', url: safeMcp, registry_name: registry.registry_name || conf?.mcp_registry?.name || null }
      : safeHttpRouter
        ? { mode: 'bounded_http', url: safeHttpRouter, registry_name: null }
        : { mode: 'discovery_only', url: null, registry_name: null };

  llmsLines.push(`### ${product.name}`);
  llmsLines.push(`Product key: ${key}`);
  llmsLines.push(`Canonical: ${safeCanonical}`);
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
    canonical_url: safeCanonical,
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
    '@id': `${safeCanonical}#evercraft-service`,
    name: product.name,
    url: safeCanonical,
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
    name: 'Evercraft discovery watershed',
    read_only_registry_name: READ_ONLY_DISCOVERY_REGISTRY,
    pain_index: '/.well-known/evercraft-pain-index.json',
    answer_graph: '/chum/answers/index.json',
    machine_commerce_registry_name: catalog.universal_front_door?.registry_name || null,
    machine_commerce_mcp: universalMcp,
    use_when: 'Start with the user problem. Use read-only discovery first; enter Machine Commerce only when commercial state or a human-confirmed paid continuation is relevant.'
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
  schema: 'evercraft.discovery-watershed.v3',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: directory.updated_at || null,
  purpose: 'One public map for AI systems, agents and crawlers to route natural-language pain into truthful Evercraft capability discovery and human-confirmed commerce.',
  start_here: {
    llms: '/llms.txt',
    llms_full: '/llms-full.txt',
    pain_index: '/.well-known/evercraft-pain-index.json',
    pain_index_text: '/chum/pain-index.txt',
    answer_graph: '/chum/answers/index.json',
    answer_graph_text: '/chum/answers/index.txt',
    read_only_mcp_registry_name: READ_ONLY_DISCOVERY_REGISTRY,
    products: '/.well-known/evercraft-products.json',
    agents: '/.well-known/evercraft-agent-directory.json',
    interfaces: '/.well-known/evercraft-agent-interfaces.json',
    machine_catalog: '/.well-known/evercraft-machine-catalog.json',
    chum: '/.well-known/evercraft-chum.json',
    chum_public_mirror: '/chum/index.json',
    revenue_watershed: '/chum/revenue.json',
    revenue_watershed_text: '/chum/revenue.txt',
    revenue_watershed_html: '/chum/revenue.html',
    intent_router: '/api/discover?q={natural-language-problem}',
    revenue_router: '/api/revenue-watershed',
    schema: '/schema.jsonld',
    openapi: '/openapi.json'
  },
  universal_front_door: {
    read_only_registry_name: READ_ONLY_DISCOVERY_REGISTRY,
    machine_commerce_registry_name: catalog.universal_front_door?.registry_name || null,
    machine_commerce_mcp: universalMcp
  },
  state_semantics: {
    discovery_only: 'May be surfaced and explained; no machine invocation is claimed.',
    callable: 'A bounded machine invocation surface is declared.',
    sellable: 'A verified current commercial offer exists.',
    checkout_ready: 'An exact current checkout rail exists for that offer.',
    paid: 'Authoritative provider payment verification exists.'
  },
  routing_rule: 'Start from the user problem, choose the smallest truthful public capability, prefer a current sell-now offer only when it is a genuine fit, preserve evidence/permission/geography/safety/payment boundaries, and never infer provider pickup from publication.',
  private_surfaces: 'not advertised',
  freshness_broadcast: {
    coordinator: 'CHUM',
    mechanism: 'IndexNow',
    semantics: 'Healthy public capability pages are announced for freshness. Submission is not proof of indexing, recommendation, citation or conversion.'
  }
};
fs.writeFileSync('public/.well-known/evercraft-discovery.json', JSON.stringify(discoveryWatershed, null, 2) + '\n');
fs.writeFileSync('public/ai-discovery.json', JSON.stringify(discoveryWatershed, null, 2) + '\n');

const sellNowSchemaServices = (machineCatalog.offers || [])
  .filter((offer) => offer.commercial_state === 'sell_now')
  .map((offer) => ({
    '@type': 'Service',
    '@id': `https://github.com/jgaethle10/forge-operator#offer-${offer.public_id}`,
    name: offer.name,
    description: offer.problem || '',
    url: safePublicUrl(offer.public_url, MACHINE_COMMERCE_GATEWAY + '?view=service&public_id=' + encodeURIComponent(String(offer.public_id || ''))) || '',
    provider: { '@id': 'https://github.com/jgaethle10/forge-operator#evercraft' },
    serviceType: 'Evercraft machine-commerce offer'
  }));

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
    ...schemaServices,
    ...sellNowSchemaServices
  ]
};
fs.writeFileSync('public/schema.jsonld', JSON.stringify(schemaGraph, null, 2) + '\n');

console.log(JSON.stringify({
  watershed_compiled: true,
  products: agentProducts.length,
  machine_offers: (machineCatalog.offers || []).length,
  sell_now_offers: (machineCatalog.offers || []).filter((offer) => offer.commercial_state === 'sell_now').length,
  llms_full: 'public/llms-full.txt',
  agent_directory: 'public/.well-known/evercraft-agent-directory.json',
  discovery_watershed: 'public/.well-known/evercraft-discovery.json',
  schema: 'public/schema.jsonld'
}));
