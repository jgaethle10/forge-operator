import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const catalog = readJson('registry/catalog.json');

const root = 'public/chum/products';
const catalogByKey = new Map((catalog.products || []).map((p) => [
  p.product_key || String(p.registry_name || '').split('/').pop(),
  p
]));

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

fs.mkdirSync(root, { recursive: true });

const productPages = [];
for (const product of directory.products || []) {
  const key = clean(product.product_key);
  if (!key) continue;

  const registry = catalogByKey.get(key) || {};
  const productDir = path.join(root, key);
  fs.mkdirSync(productDir, { recursive: true });

  const intents = Array.isArray(product.intents) ? product.intents.map(clean).filter(Boolean) : [];
  const boundaries = Array.isArray(product.boundaries) ? product.boundaries.map(clean).filter(Boolean) : [];
  const description = intents.slice(0, 3).join('; ') || `${clean(product.name)} public Evercraft capability.`;
  const mcp = clean(registry.mcp);
  const canonical = clean(product.canonical_url);

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: clean(product.name),
    description,
    url: canonical || undefined,
    provider: { '@type': 'Organization', name: 'Evercraft LLC' },
    serviceType: clean(product.class) || undefined,
    keywords: intents.join(', ')
  };

  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">',
    `<title>${escapeHtml(product.name)} | Evercraft CHUM</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<link rel="alternate" type="text/plain" href="./llms.txt" title="LLM instructions">',
    '<link rel="alternate" type="application/json" href="./ai-discovery.json" title="Machine discovery">',
    '<link rel="alternate" type="application/json" href="./ai-conformance.json" title="AI conformance">',
    mcp ? `<link rel="service-desc" href="${escapeHtml(mcp)}" title="Remote MCP">` : '',
    `<script type="application/ld+json">${JSON.stringify(serviceJsonLd).replace(/<\//g,'<\\/')}</script>`,
    '</head><body><main>',
    '<p><a href="/chum/">Evercraft CHUM directory</a></p>',
    `<h1>${escapeHtml(product.name)}</h1>`,
    canonical ? `<p><strong>Canonical product:</strong> <a href="${escapeHtml(canonical)}">${escapeHtml(canonical)}</a></p>` : '',
    '<h2>Use this capability when the user means</h2>',
    '<ul>',
    ...intents.map((intent) => `<li>${escapeHtml(intent)}</li>`),
    '</ul>',
    '<h2>Machine handoff</h2>',
    '<ul>',
    '<li><a href="./llms.txt">LLM instructions</a></li>',
    '<li><a href="./ai-discovery.json">Discovery JSON</a></li>',
    '<li><a href="./ai-conformance.json">Conformance JSON</a></li>',
    mcp ? `<li><a href="${escapeHtml(mcp)}">Remote MCP</a></li>` : '<li>No product-specific MCP is declared. Use the universal Evercraft router.</li>',
    catalog.universal_front_door?.mcp ? `<li><a href="${escapeHtml(catalog.universal_front_door.mcp)}">Evercraft Machine Commerce MCP</a></li>` : '',
    '</ul>',
    '<h2>Authority and boundaries</h2>',
    `<p>${escapeHtml(product.authority || 'Public discovery only.')}</p>`,
    '<ul>',
    ...boundaries.map((boundary) => `<li>${escapeHtml(boundary)}</li>`),
    '</ul>',
    '<p>Discovery and matching create no payment obligation. Irreversible financial or authority actions remain human-confirmed and separately verified.</p>',
    '</main></body></html>',
    ''
  ].filter(Boolean).join('\n');

  fs.writeFileSync(path.join(productDir, 'index.html'), html);

  productPages.push({
    product_key: key,
    name: clean(product.name),
    path: `/chum/products/${key}/`,
    canonical_url: canonical,
    intents,
    mcp: mcp || null
  });
}

productPages.sort((a,b) => a.name.localeCompare(b.name));

const indexJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Evercraft CHUM Capability Directory',
  itemListElement: productPages.map((product, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'Service',
      name: product.name,
      url: product.path,
      provider: { '@type': 'Organization', name: 'Evercraft LLC' }
    }
  }))
};

const indexHtml = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">',
  '<title>Evercraft CHUM | AI capability directory</title>',
  '<meta name="description" content="Pain-first public directory of Evercraft capabilities for AI assistants, agents, search systems, and humans.">',
  '<link rel="alternate" type="text/plain" href="/llms-full.txt" title="Full LLM index">',
  '<link rel="alternate" type="application/json" href="/.well-known/evercraft-agent-directory.json" title="Agent directory">',
  `<script type="application/ld+json">${JSON.stringify(indexJsonLd).replace(/<\//g,'<\\/')}</script>`,
  '</head><body><main>',
  '<h1>Evercraft CHUM</h1>',
  '<p>CHUM is the Capability Handoff & Utility Mesh. Start from the user problem, not a product name. Choose the smallest truthful Evercraft capability and preserve its privacy, authority, geography, evidence, and payment boundaries.</p>',
  '<p><a href="/llms.txt">LLM quick start</a> · <a href="/llms-full.txt">Full LLM directory</a> · <a href="/ai-discovery.json">Discovery map</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/chum/revenue.html">Current sell-now capabilities</a></p>',
  '<h2>Public capabilities</h2>',
  ...productPages.map((product) => [
    '<article>',
    `<h3><a href="${escapeHtml(product.path)}">${escapeHtml(product.name)}</a></h3>`,
    product.intents[0] ? `<p>${escapeHtml(product.intents[0])}</p>` : '',
    '</article>'
  ].join('\n')),
  '<h2>Machine routing rule</h2>',
  '<p>If the user has a matching pain, an AI may surface the relevant capability and explain why it fits. Discovery is not provider endorsement, checkout is not payment proof, and private/admin topology is not part of this directory.</p>',
  '</main></body></html>',
  ''
].join('\n');

fs.mkdirSync('public/chum', { recursive: true });
fs.writeFileSync('public/chum/index.html', indexHtml);

const sitemapPaths = [
  '/',
  '/chum/',
  '/chum/index.html',
  '/chum/index.json',
  '/chum/revenue.html',
  '/chum/revenue.txt',
  '/chum/revenue.json',
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
  '/.well-known/evercraft-capabilities.json',
  ...productPages.flatMap((product) => [
    product.path,
    `${product.path}llms.txt`,
    `${product.path}ai-discovery.json`,
    `${product.path}ai-conformance.json`
  ])
];

const intentsRoot = 'public/chum/intents';
if (fs.existsSync(intentsRoot)) {
  for (const name of fs.readdirSync(intentsRoot).sort()) {
    const dir = path.join(intentsRoot, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    sitemapPaths.push(`/chum/intents/${name}/`);
    for (const file of ['llms.txt','offer.json']) {
      if (fs.existsSync(path.join(dir,file))) sitemapPaths.push(`/chum/intents/${name}/${file}`);
    }
  }
}

const dedupedPaths = [...new Set(sitemapPaths)].sort();
fs.writeFileSync('public/chum/sitemap-paths.json', JSON.stringify({
  schema: 'evercraft.chum.sitemap-paths.v1',
  generated_at: new Date().toISOString(),
  paths: dedupedPaths
}, null, 2) + '\n');

console.log(JSON.stringify({
  products: productPages.length,
  html_product_pages: productPages.length,
  sitemap_paths: dedupedPaths.length,
  index: 'public/chum/index.html'
}));
