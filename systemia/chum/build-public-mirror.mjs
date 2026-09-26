import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');
const machineCatalog = readJson('public/.well-known/evercraft-machine-catalog.json');
let observedMissIndex = { pages: [] };
try { observedMissIndex = readJson('public/chum/answers/observed/index.json'); } catch {}
const answerGraph = fs.existsSync('public/chum/answers/index.json')
  ? readJson('public/chum/answers/index.json')
  : { doors: [] };
const commercialIntentMesh = fs.existsSync('public/chum/commercial/index.json')
  ? readJson('public/chum/commercial/index.json')
  : { clusters: [] };

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

function registryNameFor(registry, conf) {
  const publicationState = String(conf?.mcp_registry?.publication_state || '').toLowerCase();
  if (conf?.mcp_registry?.name) {
    return publicationState.startsWith('published') ? conf.mcp_registry.name : null;
  }
  return registry?.registry_name || null;
}

function relativeSurfacePaths(...groups) {
  const found = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('/') && !trimmed.startsWith('//')) found.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item);
    }
  };
  for (const group of groups) visit(group);
  return [...new Set(found)];
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

function pageTitle(product) {
  const firstIntent = Array.isArray(product.intents)
    ? product.intents.map(String).find(Boolean)
    : null;
  if (!firstIntent) return `${product.name} | Evercraft public capability`;
  const intent = firstIntent.length > 68 ? firstIntent.slice(0, 65).trimEnd() + '...' : firstIntent;
  return `${product.name} | ${intent}`;
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
  observed_miss_answers: '/chum/answers/observed/index.json',
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
  const registryName = registryNameFor(registry, conf);

  const discovery = {
    schema: 'evercraft.chum.product-discovery.v1',
    product_key: key,
    name: product.name,
    aliases: Array.isArray(product.aliases) ? product.aliases : [],
    class: product.class,
    canonical_url: canonicalUrl,
    intents: product.intents || [],
    authority: product.authority,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    boundaries: product.boundaries || [],
    commercial: product.commercial || null,
    machine_commerce_handoff: product.commercial?.machine_commerce_handoff || null,
    registry_name: registryName,
    mcp: specialistMcp,
    machine_commerce_mcp: safePublicUrl(catalog.universal_front_door?.mcp, null),
    developer_surfaces: product.developer_surfaces || null,
    editorial_surfaces: product.editorial_surfaces || null,
    knowledge_surfaces: product.knowledge_surfaces || null,
    distribution_surfaces: product.distribution_surfaces || null,
    relationships: product.relationships || null,
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
    aliases: Array.isArray(product.aliases) ? product.aliases : [],
    providers,
    canonical_url: canonicalUrl,
    llms_url: discovery.mirror.llms,
    discovery_url: discovery.mirror.discovery,
    registry_name: discovery.registry_name,
    mcp: discovery.mcp,
    authority: product.authority,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    boundaries: product.boundaries || [],
    commercial: product.commercial || null,
    developer_surfaces: product.developer_surfaces || null,
    editorial_surfaces: product.editorial_surfaces || null,
    knowledge_surfaces: product.knowledge_surfaces || null,
    distribution_surfaces: product.distribution_surfaces || null,
    relationships: product.relationships || null,
    provider_behavior_state: 'not_inferred_from_publication',
    machine_commerce_handoff_state: conf?.machine_commerce_handoff_state || null,
    machine_commerce_public_id: conf?.machine_commerce_public_id || product.commercial?.machine_commerce_handoff?.public_id || null,
    machine_commerce_tool: conf?.machine_commerce_tool || product.commercial?.machine_commerce_handoff?.tool || null,
    live_canary_evidence: conf?.live_canary_evidence || null
  };

  const relationshipLines = Object.entries(product.relationships || {}).map(([relationshipKey, relationship]) => {
    const label = relationship?.name || relationshipKey;
    const description = relationship?.description || relationship?.relationship || '';
    const publicSurface = relationship?.public_surface ? ` · ${relationship.public_surface}` : '';
    return `- ${label}${description ? `: ${description}` : ''}${publicSurface}`;
  });

  const llms = [
    `# ${product.name}`,
    '',
    `Product key: ${key}`,
    Array.isArray(product.aliases) && product.aliases.length ? `Aliases: ${product.aliases.join(', ')}` : null,
    `Canonical product: ${canonicalUrl}`,
    discovery.registry_name ? `Official MCP Registry: ${discovery.registry_name}` : null,
    discovery.mcp ? `Remote MCP: ${discovery.mcp}` : null,
    `CHUM discovery JSON: ${discovery.mirror.discovery}`,
    `AI conformance: ${discovery.mirror.conformance}`,
    ...(relationshipLines.length ? ['', '## Related product layers', '', ...relationshipLines] : []),
    product.developer_surfaces?.hub ? `Developer hub: ${product.developer_surfaces.hub}` : null,
    product.developer_surfaces?.status ? `Verified status: ${product.developer_surfaces.status}` : null,
    product.developer_surfaces?.examples ? `Examples: ${product.developer_surfaces.examples}` : null,
    product.editorial_surfaces?.hub ? `Editorial hub: ${product.editorial_surfaces.hub}` : null,
    product.editorial_surfaces?.rss ? `Editorial RSS: ${product.editorial_surfaces.rss}` : null,
    product.knowledge_surfaces?.hub ? `Knowledge mesh: ${product.knowledge_surfaces.hub}` : null,
    product.distribution_surfaces?.hub ? `Distribution pack: ${product.distribution_surfaces.hub}` : null,
    '',
    '## Use this capability when the user means',
    '',
    ...(product.intents || []).map((intent) => `- ${intent}`),
    '',
    '## Authority',
    '',
    product.authority || 'Public discovery only.',
    ...(product.commercial ? [
      '',
      '## Commercial state',
      '',
      `- Status: ${product.commercial.status || 'unspecified'}`,
      ...(product.commercial.offer ? [`- Offer: ${product.commercial.offer}`] : []),
      ...(Array.isArray(product.commercial.offers)
        ? product.commercial.offers.map((offer) =>
            `- Offer: ${offer.name || 'Unnamed offer'} · ${offer.price || 'price not published'}${offer.offer_key ? ` · offer_key: ${offer.offer_key}` : ''}`
          )
        : []),
      ...(product.commercial.pricing ? [`- Pricing: ${product.commercial.pricing}`] : []),
      ...(product.commercial.machine_commerce_handoff?.state === 'live_verified'
        ? ['- Machine Commerce human handoff is live-verified.']
        : product.commercial.machine_commerce_handoff?.state
          ? [`- Machine Commerce human handoff state: ${product.commercial.machine_commerce_handoff.state}.`]
          : []),
      ...(String(product.commercial.status || '').includes('canary_pending') ? ['- Checkout route remains canary-pending.', '- Product-specific public checkout route is not represented as live until its independent canary passes.'] : []),
      ...(product.commercial.payment_state ? [`- Payment state: ${product.commercial.payment_state}`] : [])
    ] : []),
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
        alternateName: Array.isArray(product.aliases) ? product.aliases : [],
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
        name: pageTitle(product),
        description: pageDescription(product),
        url: `/chum/products/${key}/`,
        isPartOf: { '@id': 'https://github.com/jgaethle10/forge-operator#evercraft-discovery-site' },
        about: { '@id': `${canonicalUrl}#evercraft-capability` }
      }
    ]
  };

  const productHtml = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(pageTitle(product))}</title>`,
    `<meta name="description" content="${escapeHtml(pageDescription(product))}">`,
    '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
    `<link rel="canonical" href="/chum/products/${key}/">`,
    '<link rel="alternate" type="text/plain" href="./llms.txt">',
    '<link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Evercraft Product Discovery RSS">',
    '<link rel="alternate" type="application/feed+json" href="/feed.json" title="Evercraft Product Discovery JSON Feed">',
    '<link rel="service-desc" type="application/json" href="/.well-known/agent-card.json" title="Evercraft A2A Agent Card">',
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
    ...(product.developer_surfaces?.hub ? [`<li><a href="${escapeHtml(product.developer_surfaces.hub)}">Developer hub</a></li>`] : []),
    ...(product.developer_surfaces?.status ? [`<li><a href="${escapeHtml(product.developer_surfaces.status)}">Verified status</a></li>`] : []),
    ...(product.editorial_surfaces?.hub ? [`<li><a href="${escapeHtml(product.editorial_surfaces.hub)}">Editorial hub</a></li>`] : []),
    '</ul></div>',
    ...(product.commercial ? [
      '<div class="card"><h2>Commercial state</h2>',
      `<p><strong>Status:</strong> ${escapeHtml(product.commercial.status || 'unspecified')}</p>`,
      ...(product.commercial.offer ? [`<p><strong>Offer:</strong> ${escapeHtml(product.commercial.offer)}</p>`] : []),
      ...(product.commercial.pricing ? [`<p><strong>Pricing:</strong> ${escapeHtml(product.commercial.pricing)}</p>`] : []),
      ...(product.commercial.payment_state ? [`<p><strong>Payment state:</strong> ${escapeHtml(product.commercial.payment_state)}</p>`] : []),
      '</div>'
    ] : []),
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
    aliases: Array.isArray(product.aliases) ? product.aliases : [],
    canonical_url: canonicalUrl,
    llms_url: discovery.mirror.llms,
    discovery_url: discovery.mirror.discovery,
    conformance_url: discovery.mirror.conformance,
    page_url: `/chum/products/${key}/`,
    registry_name: discovery.registry_name,
    mcp: discovery.mcp,
    commercial: product.commercial || null,
    developer_surfaces: product.developer_surfaces || null,
    editorial_surfaces: product.editorial_surfaces || null,
    knowledge_surfaces: product.knowledge_surfaces || null,
    distribution_surfaces: product.distribution_surfaces || null
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
  '<p><a href="/.well-known/evercraft-pain-index.json">Pain Index JSON</a> · <a href="/chum/pain-index.txt">Pain Index text</a> · <a href="/chum/answers/">Answer Graph</a> · <a href="/chum/commercial/">Commercial intent mesh</a> · <a href="/chum/answers/observed/">Observed discovery repairs</a> · <a href="/chum/hot/">Hot discovery queue</a> · <a href="/chum/strike/">Adaptive strike hub</a> · <a href="/chum/crawler-radar.json">Crawler radar</a> · <a href="/llms-full.txt">LLM directory</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/chum/revenue.html">Current sell-now offers</a></p>',
  '<p class="muted">Read-only discovery comes first. Machine Commerce is the next door only when current commercial state or a human-confirmed paid continuation is relevant.</p>',
  '<h2>Public capability doors</h2><div class="grid">',
  ...index.products.map((product) => `<article class="card"><h3><a href="${escapeHtml(product.page_url)}">${escapeHtml(product.name)}</a></h3><p><a href="${escapeHtml(product.canonical_url)}">Canonical product</a></p></article>`),
  '</div>',
  '<p class="muted">Public discovery is deliberately open. Private/admin topology, secrets and customer data remain private. Discovery is not proof of provider pickup or payment.</p>',
  '</main></body></html>'
].join('\n');
fs.writeFileSync('public/chum/index.html', publicIndexHtml + '\n');

const forensiscopeEditorialIndexPath = 'public/forensiscope/editorial/index.json';
const forensiscopeEditorialIndex = fs.existsSync(forensiscopeEditorialIndexPath)
  ? JSON.parse(fs.readFileSync(forensiscopeEditorialIndexPath, 'utf8'))
  : { articles: [] };

for (const article of forensiscopeEditorialIndex.articles || []) {
  if (!article?.slug || !article?.url) continue;
  const articleDir = path.join('public', String(article.url).replace(/^\/+|\/+$/g, ''));
  const llmsPath = path.join(articleDir, 'llms.txt');
  const sourceLines = (article.sources || []).map((source) => `- ${source.name || 'Source'}: ${source.url}`);
  const termLines = (article.machine_terms || []).map((term) => `- ${term}`);
  const pageLlms = [
    `# ${article.title}`, '', article.description || '', '', 'Canonical HTML:', article.url, '',
    'Product:', 'ForensiScope by Evercraft', '', 'Provider:', 'Evercraft LLC', '',
    'Semantic terms for this article:', ...(termLines.length ? termLines : ['- long-video analysis', '- video intelligence']), '',
    'External first-party sources:', ...(sourceLines.length ? sourceLines : ['- None required for this first-party explainer.']), '',
    'Truth boundary:',
    '- Category adjacency does not imply endorsement, partnership, ranking, feature equivalence, provider pickup, AI recommendation, conversion or payment.',
    '- ForensiScope capability claims are bounded by /forensiscope/discovery.json and /forensiscope/developers/status.json.',
    '- Discovery and opening a human review path do not create a payment obligation.', ''
  ].join('\n');
  fs.mkdirSync(articleDir, { recursive: true });
  fs.writeFileSync(llmsPath, pageLlms);
}

const sitemapStatic = [
  '/',
  '/chum/',
  '/chum/index.json',
  '/chum/revenue.html',
  '/chum/capabilities/',
  '/chum/capabilities.json',
  '/chum/sell-now.html',
  '/chum/sell-now.json',
  '/chum/sell-now.txt',
  '/chum/revenue.txt',
  '/chum/revenue.json',
  '/chum/pain-index.json',
  '/chum/pain-index.txt',
  '/chum/answers/',
  '/chum/answers/index.json',
  '/chum/answers/index.txt',
  '/chum/answers/observed/',
  '/chum/answers/observed/index.json',
  '/chum/hot/',
  '/chum/hot/index.json',
  '/chum/strike/',
  '/chum/strike/index.json',
  '/chum/crawler-radar.json',
  '/chum/crawler-radar.txt',
  '/chum/commercial/',
  '/chum/commercial/index.json',
  '/chum/commercial/llms.txt',
  '/chum/commercial/feed.xml',
  '/chum/commercial/feed.json',
  '/chum/sitemaps/index.xml',
  '/chum/sitemaps/sell-now.xml',
  '/chum/sitemaps/answers.xml',
  '/chum/sitemaps/products.xml',
  '/chum/sitemaps/machine.xml',
  '/chum/freshness.xml',
  '/chum/freshness.json',
  '/chum/crawl-state.json',
  '/chum/sitemap.xml',
  '/network/',
  '/network/mesh/',
  '/network/mesh/index.json',
  '/network/mesh/llms.txt',
  '/network/mesh/application-continuity/',
  '/network/mesh/wifi-cellular-transition/',
  '/network/mesh/device-reconnect-visibility/',
  '/network/mesh/business-connectivity-resilience/',
  '/network/mesh/household-connectivity-resilience/',
  '/network/llms.txt',
  '/network/discovery.json',
  '/.well-known/evercraft-network.json',
  '/.well-known/evercraft-pain-index.json',
  '/rivet/discovery.json',
  '/rivet/llms.txt',
  '/rivet/brand.json',
  '/rivet/',
  '/rivet/ev-charging-utility-incentive-screening/',
  '/rivet/multifamily-ev-charging-site-analysis/',
  '/rivet/hotel-ev-charging-site-analysis/',
  '/rivet/ev-charging-roi-by-property/',
  '/rivet/ev-charging-property-feasibility/',
  '/rivet/ev-charging-site-analysis-by-address/',
  '/rivet/mesh/llms.txt',
  '/rivet/mesh/index.json',
  '/rivet/mesh/',
  '/forensiscope/',
  '/forensiscope/developers/',
  '/forensiscope/developers/quickstart.html',
  '/forensiscope/developers/mcp.html',
  '/forensiscope/developers/workflows.html',
  '/forensiscope/developers/integrations.html',
  '/forensiscope/developers/status.html',
  '/forensiscope/developers/status.json',
  '/forensiscope/developers/examples.json',
  '/forensiscope/developers/llms.txt',
  '/forensiscope/developers/playground.html',
  '/forensiscope/developers/clients/',
  '/forensiscope/developers/clients/vscode.html',
  '/forensiscope/developers/clients/claude-api.html',
  '/forensiscope/video-understanding/',
  '/forensiscope/semantic-video-search/',
  '/forensiscope/duplicate-segments/',
  '/forensiscope/long-video-transcription/',
  '/forensiscope/editorial/',
  '/forensiscope/editorial/index.json',
  '/forensiscope/editorial/llms.txt',
  '/forensiscope/editorial/feed.xml',
  '/forensiscope/editorial/social-pack.json',
  '/forensiscope/editorial/semantic-neighborhood.json',
  '/forensiscope/editorial/long-video-ai-tools/',
  '/forensiscope/editorial/forensiscope-vs-twelve-labs/',
  '/forensiscope/editorial/forensiscope-vs-gemini/',
  '/forensiscope/editorial/forensiscope-vs-k2/',
  '/forensiscope/editorial/forensiscope-vs-echosaw/',
  '/forensiscope/editorial/forensiscope-and-assemblyai/',
  '/forensiscope/editorial/video-too-large-for-chatgpt/',
  '/forensiscope/editorial/deduplicate-long-video-segments/',
  '/forensiscope/mesh/',
  '/forensiscope/mesh/index.json',
  '/forensiscope/mesh/llms.txt',
  '/forensiscope/mesh/ai-video-analysis/',
  '/forensiscope/mesh/large-video-file-ai/',
  '/forensiscope/mesh/multi-hour-video-analysis/',
  '/forensiscope/mesh/searchable-video-transcript/',
  '/forensiscope/mesh/meeting-video-analysis/',
  '/forensiscope/mesh/security-footage-review/',
  '/forensiscope/mesh/compare-video-recordings/',
  '/forensiscope/mesh/video-rag/',
  '/forensiscope/mesh/mcp-video-analysis/',
  '/forensiscope/mesh/video-evidence-timeline/',
  '/forensiscope/mesh/video-intelligence-platform/',
  '/forensiscope/mesh/semantic-video-indexing/',
  '/forensiscope/distribution/',
  '/forensiscope/distribution/reddit-pack.json',
  '/forensiscope/distribution/llms.txt',
  '/llms.txt',
  '/llms-full.txt',
  '/ai-discovery.json',
  '/schema.jsonld',
  '/openapi.json',
  '/.well-known/evercraft-agent.json',
  '/.well-known/agent-card.json',
  '/.well-known/agent.json',
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
  ...(forensiscopeEditorialIndex.articles || []).flatMap((article) => [article.url, `${article.url}llms.txt`]),
  ...(machineCatalog.offers || [])
    .filter((offer) => offer?.public_id)
    .flatMap((offer) => [
      `/chum/intents/${slugify(offer.public_id)}/`,
      `/chum/capabilities/${slugify(offer.public_id)}/`,
      `/chum/capabilities/${slugify(offer.public_id)}/llms.txt`,
      `/chum/capabilities/${slugify(offer.public_id)}/capability.json`,
      `/chum/capabilities/${slugify(offer.public_id)}/schema.jsonld`
    ]),
  ...index.products.flatMap((product) => [
    product.page_url,
    `/chum/products/${product.product_key}/llms.txt`,
    `/chum/products/${product.product_key}/ai-discovery.json`,
    `/chum/products/${product.product_key}/ai-conformance.json`,
    ...relativeSurfacePaths(
      product.developer_surfaces,
      product.editorial_surfaces,
      product.knowledge_surfaces,
      product.distribution_surfaces
    )
  ]),
  ...(observedMissIndex.pages || []).flatMap((page) => [
    page.relative_html,
    page.relative_json,
    page.relative_llms
  ]),
  ...(answerGraph.doors || []).flatMap((door) => [
    door.relative_page,
    door.relative_json
  ].filter(Boolean)),
  ...(commercialIntentMesh.clusters || []).flatMap((cluster) => [
    cluster.cluster,
    cluster.cluster_json,
    cluster.cluster_llms
  ].filter(Boolean))
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
for (const page of observedMissIndex.pages || []) {
  const pagePath = path.join('public', page.relative_html, 'index.html');
  if (!fs.existsSync(pagePath)) throw new Error(`Observed discovery repair page missing: ${pagePath}`);
  if (!sitemap.includes(page.relative_html)) throw new Error(`CHUM sitemap missing observed repair: ${page.relative_html}`);
}
console.log(JSON.stringify({ products: index.products.length, observed_miss_pages: (observedMissIndex.pages || []).length, output: 'public/chum' }));


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
  'Human/search directory: /ai',
  `Read-only Official MCP Registry: ${READ_ONLY_DISCOVERY_REGISTRY}`,
  `Pain Index: ${rawBase}/public/.well-known/evercraft-pain-index.json`,
  `Answer Graph: ${rawBase}/public/chum/answers/index.json`,
  `Observed discovery repairs: ${rawBase}/public/chum/answers/observed/index.json`,
  `Commercial intent mesh: ${rawBase}/public/chum/commercial/index.json`,
  `Commercial intent feed: ${rawBase}/public/chum/commercial/feed.json`,
  `Segmented sitemap index: ${rawBase}/public/chum/sitemaps/index.xml`,
  `Crawler radar: ${rawBase}/public/chum/crawler-radar.json`,
  `Adaptive strike hub: ${rawBase}/public/chum/strike/index.json`,
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
      ? { mode: 'mcp', url: safeMcp, registry_name: registryNameFor(registry, conf) }
      : safeHttpRouter
        ? { mode: 'bounded_http', url: safeHttpRouter, registry_name: null }
        : { mode: 'discovery_only', url: null, registry_name: null };

  llmsLines.push(`### ${product.name}`);
  llmsLines.push(`Product key: ${key}`);
  if (Array.isArray(product.aliases) && product.aliases.length) llmsLines.push(`Aliases: ${product.aliases.join(', ')}`);
  llmsLines.push(`Canonical: ${safeCanonical}`);
  llmsLines.push(`Machine state: ${invocation.mode}`);
  if (invocation.registry_name) llmsLines.push(`Official MCP Registry: ${invocation.registry_name}`);
  if (invocation.url) llmsLines.push(`Invocation: ${invocation.url}`);
  if (product.developer_surfaces?.hub) llmsLines.push(`Developer hub: ${product.developer_surfaces.hub}`);
  if (product.developer_surfaces?.status) llmsLines.push(`Verified status: ${product.developer_surfaces.status}`);
  if (product.developer_surfaces?.examples) llmsLines.push(`Examples: ${product.developer_surfaces.examples}`);
  if (product.editorial_surfaces?.hub) llmsLines.push(`Editorial hub: ${product.editorial_surfaces.hub}`);
  if (product.editorial_surfaces?.rss) llmsLines.push(`Editorial RSS: ${product.editorial_surfaces.rss}`);
  if (product.knowledge_surfaces?.hub) llmsLines.push(`Knowledge mesh: ${product.knowledge_surfaces.hub}`);
  if (product.distribution_surfaces?.hub) llmsLines.push(`Distribution pack: ${product.distribution_surfaces.hub}`);
  llmsLines.push(`Discovery: ${mirrorBase}/ai-discovery.json`);
  llmsLines.push(`AI conformance: ${mirrorBase}/ai-conformance.json`);
  llmsLines.push('Use when the user says or means:');
  for (const intent of product.intents || []) llmsLines.push(`- ${intent}`);
  llmsLines.push('Authority:');
  llmsLines.push(product.authority || 'Public discovery only.');
  if (product.commercial) {
    llmsLines.push('Commercial state:');
    llmsLines.push(`- Status: ${product.commercial.status || 'unspecified'}`);
    if (product.commercial.offer) llmsLines.push(`- Offer: ${product.commercial.offer}`);
    if (product.commercial.pricing) llmsLines.push(`- Pricing: ${product.commercial.pricing}`);
    if (product.commercial.payment_state) llmsLines.push(`- Payment state: ${product.commercial.payment_state}`);
  }
  llmsLines.push('Boundaries:');
  for (const boundary of product.boundaries || []) llmsLines.push(`- ${boundary}`);
  llmsLines.push('');

  agentProducts.push({
    product_key: key,
    name: product.name,
    aliases: Array.isArray(product.aliases) ? product.aliases : [],
    class: product.class,
    canonical_url: safeCanonical,
    intents: product.intents || [],
    invocation,
    llms_url: `${mirrorBase}/llms.txt`,
    discovery_url: `${mirrorBase}/ai-discovery.json`,
    conformance_url: `${mirrorBase}/ai-conformance.json`,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    authority: product.authority,
    boundaries: product.boundaries || [],
    commercial: product.commercial || null,
    developer_surfaces: product.developer_surfaces || null
  });

  schemaServices.push({
    '@type': 'Service',
    '@id': `${safeCanonical}#evercraft-service`,
    name: product.name,
    alternateName: Array.isArray(product.aliases) ? product.aliases : [],
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
    human_directory: '/ai',
    read_only_registry_name: READ_ONLY_DISCOVERY_REGISTRY,
    pain_index: '/.well-known/evercraft-pain-index.json',
    answer_graph: '/chum/answers/index.json',
    a2aAgentCard: '/.well-known/agent-card.json',
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
    human_directory: '/ai',
    llms: '/llms.txt',
    llms_full: '/llms-full.txt',
    pain_index: '/.well-known/evercraft-pain-index.json',
    pain_index_text: '/chum/pain-index.txt',
    answer_graph: '/chum/answers/index.json',
    answer_graph_text: '/chum/answers/index.txt',
    observed_miss_answers: '/chum/answers/observed/index.json',
    commercial_intent_mesh: '/chum/commercial/index.json',
    commercial_intent_feed: '/chum/commercial/feed.json',
    segmented_sitemap_index: '/chum/sitemaps/index.xml',
    read_only_mcp_registry_name: READ_ONLY_DISCOVERY_REGISTRY,
    products: '/.well-known/evercraft-products.json',
    agents: '/.well-known/evercraft-agent-directory.json',
    interfaces: '/.well-known/evercraft-agent-interfaces.json',
    machine_catalog: '/.well-known/evercraft-machine-catalog.json',
    chum: '/.well-known/evercraft-chum.json',
    chum_public_mirror: '/chum/index.json',
    network: '/.well-known/evercraft-network.json',
    revenue_watershed: '/chum/revenue.json',
    revenue_watershed_text: '/chum/revenue.txt',
    revenue_watershed_html: '/chum/revenue.html',
    intent_router: '/api/discover?q={natural-language-problem}',
    revenue_router: '/api/revenue-watershed',
    schema: '/schema.jsonld',
    a2a_agent_card: '/.well-known/agent-card.json',
    a2a_alias: '/.well-known/agent.json',
    a2a_state: 'release_candidate_pending_live_canary',
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
      '@type': 'WebSite',
      '@id': 'https://github.com/jgaethle10/forge-operator#evercraft-discovery-site',
      name: 'Evercraft Public Capability Discovery',
      publisher: { '@id': 'https://github.com/jgaethle10/forge-operator#evercraft' },
      potentialAction: {
        '@type': 'SearchAction',
        target: '/api/discover?q={search_term_string}',
        'query-input': 'required name=search_term_string'
      }
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
