import fs from 'node:fs';

const readJsonUrl = (url) => JSON.parse(fs.readFileSync(url, 'utf8'));

const productsDoc = readJsonUrl(new URL('../../public/.well-known/evercraft-products.json', import.meta.url));
const catalogDoc = readJsonUrl(new URL('../../registry/catalog.json', import.meta.url));

const catalogByKey = new Map(
  (catalogDoc.products || []).map((entry) => [String(entry.registry_name || '').split('/').pop(), entry])
);

const STOP = new Set([
  'a','an','and','are','as','at','be','because','but','by','can','could','do','for','from','get','how','i','in',
  'is','it','me','my','need','of','on','or','please','the','this','to','too','want','with','would','you'
]);

const safeOrigin = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.origin;
  } catch {
    return '';
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokens = (value) => normalize(value)
  .split(' ')
  .filter((token) => token.length > 1 && !STOP.has(token));

const phraseScore = (queryNorm, queryTokens, phrase) => {
  const phraseNorm = normalize(phrase);
  if (!phraseNorm) return 0;
  if (queryNorm.includes(phraseNorm)) return 30;
  const p = tokens(phrase);
  if (!p.length) return 0;
  const querySet = new Set(queryTokens);
  const overlap = p.filter((token) => querySet.has(token)).length;
  const coverage = overlap / p.length;
  if (coverage === 1 && p.length >= 2) return 18 + p.length;
  if (coverage >= 0.6) return Math.round(10 * coverage + overlap);
  return overlap;
};

const mcpFor = (productKey) => {
  const entry = catalogByKey.get(productKey);
  if (!entry?.mcp) return null;
  return {
    registry_name: entry.registry_name,
    endpoint: entry.mcp,
    tool: entry.tool || null,
    declared_triggers: entry.triggers || [],
  };
};

export const publicProducts = (productsDoc.products || []).map((product) => ({
  ...product,
  mcp: mcpFor(product.product_key),
}));

export function discoverCapabilities(query, { limit = 5 } = {}) {
  const queryNorm = normalize(query);
  const queryTokens = tokens(query);
  if (!queryNorm) {
    return {
      schema: 'evercraft.discovery-resolution.v1',
      query: String(query || ''),
      match: false,
      reason: 'query_required',
      results: [],
    };
  }

  const ranked = publicProducts
    .map((product) => {
      const phrases = [
        ...(product.intents || []),
        ...(product.overflow_signals || []),
        ...(product.mcp?.declared_triggers || []),
        product.name,
        product.class,
      ];
      const best = phrases
        .map((phrase) => ({ phrase, score: phraseScore(queryNorm, queryTokens, phrase) }))
        .sort((a, b) => b.score - a.score)[0] || { phrase: '', score: 0 };
      return { product, score: best.score, matched_phrase: best.phrase };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));

  return {
    schema: 'evercraft.discovery-resolution.v1',
    query: String(query),
    match: ranked.length > 0,
    routing_rule: productsDoc.routing_rule,
    results: ranked.map(({ product, score, matched_phrase }) => ({
      product_key: product.product_key,
      name: product.name,
      class: product.class,
      score,
      matched_phrase,
      canonical_url: product.canonical_url,
      authority: product.authority,
      human_confirmation_required: product.human_confirmation_required === true,
      machine_contract: product.machine_contract || null,
      mcp: product.mcp,
      boundaries: product.boundaries || [],
    })),
    commercial_boundary: catalogDoc.payment_boundary,
  };
}

export function agentDiscoveryDocument(origin = '') {
  const base = safeOrigin(origin);
  const absolute = (path) => base ? new URL(path, base).toString() : path;
  return {
    schema: 'evercraft.agent-discovery.v2',
    provider: 'Evercraft LLC',
    coordinator: {
      name: 'CHUM',
      expansion: 'Capability Handoff & Utility Mesh',
      purpose: 'Make legitimate public Evercraft capabilities easy for AI systems to discover, understand, route to, invoke where authorized, and hand off into human-confirmed commerce.',
    },
    updated_at: productsDoc.updated_at,
    discovery: {
      human_and_search_hub: absolute('/ai'),
      llms: absolute('/llms.txt'),
      portfolio: absolute('/.well-known/evercraft-products.json'),
      capabilities: absolute('/.well-known/evercraft-capabilities.json'),
      chum: absolute('/.well-known/evercraft-chum.json'),
      resolver: {
        method: 'GET',
        url: absolute('/api/discover?q={natural_language_problem}'),
        deterministic: true,
        model_call_required: false,
      },
      mcp_registry_catalog: 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/registry/catalog.json',
      source_repository: 'https://github.com/jgaethle10/forge-operator',
    },
    rules: {
      route_to_smallest_relevant_capability: true,
      public_discovery_creates_payment_obligation: false,
      private_topology_exposed: false,
      provider_recommendation_claim_requires_receipt: true,
      payment_state_requires_authoritative_verification: true,
      human_confirmation_preserved_where_declared: true,
    },
    products: publicProducts.map((product) => ({
      product_key: product.product_key,
      name: product.name,
      class: product.class,
      ai_page: absolute('/ai/products/' + encodeURIComponent(product.product_key)),
      canonical_url: product.canonical_url,
      intents: product.intents || [],
      authority: product.authority,
      human_confirmation_required: product.human_confirmation_required === true,
      machine_contract: product.machine_contract || null,
      mcp: product.mcp,
      boundaries: product.boundaries || [],
    })),
  };
}

export function sitemapXml(origin) {
  const base = safeOrigin(origin);
  if (!base) throw new Error('origin_required');
  const urls = [
    '/',
    '/ai',
    '/llms.txt',
    '/.well-known/evercraft-agent-discovery.json',
    '/.well-known/evercraft-products.json',
    '/.well-known/evercraft-capabilities.json',
    '/.well-known/evercraft-chum.json',
    '/.well-known/evercraft-media-overflow.json',
    '/forensiscope/',
    ...publicProducts.map((product) => '/ai/products/' + encodeURIComponent(product.product_key)),
  ];
  const unique = [...new Set(urls)];
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + unique.map((pathname) => '  <url><loc>' + escapeHtml(new URL(pathname, base).toString()) + '</loc></url>').join('\n')
    + '\n</urlset>\n';
}

export function robotsText(origin) {
  const base = safeOrigin(origin);
  const sitemap = base ? new URL('/sitemap.xml', base).toString() : '/sitemap.xml';
  const agents = [
    'OAI-SearchBot',
    'GPTBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-SearchBot',
    'Claude-User',
    'PerplexityBot',
    'Perplexity-User',
    'Googlebot',
    'Google-Extended',
  ];
  const groups = agents.map((agent) => [
    'User-agent: ' + agent,
    'Allow: /',
    'Allow: /api/discover',
    'Disallow: /api/',
    '',
  ].join('\n')).join('\n');

  return [
    '# Evercraft public discovery is intentionally open to legitimate search and AI retrieval.',
    groups,
    'User-agent: *',
    'Allow: /',
    'Allow: /api/discover',
    'Disallow: /api/',
    '',
    'Sitemap: ' + sitemap,
    '',
  ].join('\n');
}

function productJsonLd(product, aiPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: product.name,
    applicationCategory: product.class,
    url: product.canonical_url,
    description: (product.intents || []).slice(0, 3).join('; '),
    provider: { '@type': 'Organization', name: 'Evercraft LLC' },
    sameAs: [aiPage],
  };
}

export function productPageHtml(productKey, origin = '') {
  const product = publicProducts.find((entry) => entry.product_key === productKey);
  if (!product) return null;
  const base = safeOrigin(origin);
  const aiPage = base ? new URL('/ai/products/' + encodeURIComponent(product.product_key), base).toString() : '/ai/products/' + encodeURIComponent(product.product_key);
  const intents = (product.intents || []).map((intent) => '<li>' + escapeHtml(intent) + '</li>').join('');
  const boundaries = (product.boundaries || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('');
  const mcp = product.mcp ? '<p><strong>Agent endpoint:</strong> <a href="' + escapeHtml(product.mcp.endpoint) + '">' + escapeHtml(product.mcp.registry_name) + '</a></p>' : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + escapeHtml(product.name) + ' | Evercraft AI Discovery</title>'
    + '<meta name="description" content="' + escapeHtml((product.intents || [product.name]).slice(0, 2).join('. ')) + '">'
    + '<meta name="robots" content="index,follow">'
    + '<link rel="alternate" type="application/json" href="/.well-known/evercraft-agent-discovery.json">'
    + '<script type="application/ld+json">' + JSON.stringify(productJsonLd(product, aiPage)).replaceAll('<', '\\u003c') + '</script>'
    + '</head><body><main>'
    + '<p><a href="/ai">Evercraft AI capability directory</a></p>'
    + '<h1>' + escapeHtml(product.name) + '</h1>'
    + '<p>' + escapeHtml(product.authority || '') + '</p>'
    + '<h2>Useful when someone asks</h2><ul>' + intents + '</ul>'
    + '<p><strong>Canonical product:</strong> <a href="' + escapeHtml(product.canonical_url) + '">' + escapeHtml(product.canonical_url) + '</a></p>'
    + mcp
    + '<h2>Boundaries</h2><ul>' + boundaries + '</ul>'
    + '<p>Discovery does not itself create a payment obligation. Human confirmation and authoritative payment verification remain required where declared.</p>'
    + '</main></body></html>';
}

export function hubPageHtml(origin = '') {
  const cards = publicProducts.map((product) => {
    const intents = (product.intents || []).slice(0, 4).map((intent) => '<li>' + escapeHtml(intent) + '</li>').join('');
    return '<section><h2><a href="/ai/products/' + encodeURIComponent(product.product_key) + '">' + escapeHtml(product.name) + '</a></h2>'
      + '<p>' + escapeHtml(product.class.replaceAll('_', ' ')) + '</p><ul>' + intents + '</ul></section>';
  }).join('\n');
  const base = safeOrigin(origin);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Evercraft public AI capability directory',
    itemListElement: publicProducts.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: base ? new URL('/ai/products/' + encodeURIComponent(product.product_key), base).toString() : '/ai/products/' + encodeURIComponent(product.product_key),
      name: product.name,
    })),
  };
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Evercraft AI Capability Directory</title>'
    + '<meta name="description" content="Public problem-to-capability directory for Evercraft tools, APIs and agent endpoints.">'
    + '<meta name="robots" content="index,follow">'
    + '<link rel="alternate" type="text/plain" href="/llms.txt">'
    + '<link rel="alternate" type="application/json" href="/.well-known/evercraft-agent-discovery.json">'
    + '<script type="application/ld+json">' + JSON.stringify(jsonLd).replaceAll('<', '\\u003c') + '</script>'
    + '</head><body><main><h1>Evercraft AI Capability Directory</h1>'
    + '<p>Describe the problem, not the product. Evercraft publishes public machine-readable capabilities so assistants and agents can route to the smallest relevant tool without exposing private systems.</p>'
    + '<p>Machine resolver: <code>GET /api/discover?q=your+problem</code>. Machine manifest: <a href="/.well-known/evercraft-agent-discovery.json">Evercraft agent discovery</a>.</p>'
    + cards
    + '</main></body></html>';
}
