import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');

const catalogByKey = new Map((catalog.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p]));
const conformanceByKey = new Map((conformance.products || []).map((p) => [p.product_key, p]));
const providers = conformance.baseline_providers || [];
const root = 'public/chum/products';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const index = {
  schema: 'evercraft.chum.public-mirror.v1',
  provider: 'Evercraft LLC',
  updated_at: directory.updated_at || null,
  purpose: 'Product-specific machine discovery mirrors generated from Evercraft public contracts. Mirrors preserve public discovery when a product host cannot reliably serve machine files.',
  universal_mcp: catalog.universal_front_door?.mcp || null,
  products: []
};

for (const product of directory.products || []) {
  const key = String(product.product_key || '').trim();
  if (!key) continue;
  const registry = catalogByKey.get(key) || null;
  const conf = conformanceByKey.get(key) || null;
  const base = `https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/products/${key}`;
  const servedBase = `/chum/products/${key}`;
  const dir = path.join(root, key);
  fs.mkdirSync(dir, { recursive: true });

  const discovery = {
    schema: 'evercraft.chum.product-discovery.v1',
    product_key: key,
    name: product.name,
    class: product.class,
    canonical_url: product.canonical_url,
    intents: product.intents || [],
    authority: product.authority,
    human_confirmation_required: Boolean(product.human_confirmation_required),
    boundaries: product.boundaries || [],
    registry_name: registry?.registry_name || conf?.mcp_registry?.name || null,
    mcp: registry?.mcp || null,
    machine_commerce_mcp: catalog.universal_front_door?.mcp || null,
    source: 'CHUM public mirror',
    mirror: {
      page_path: `${servedBase}/`,
      llms_path: `${servedBase}/llms.txt`,
      discovery_path: `${servedBase}/ai-discovery.json`,
      conformance_path: `${servedBase}/ai-conformance.json`,
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
    provider_behavior_state: 'not_inferred_from_publication'
  };

  const llms = [
    `# ${product.name}`,
    '',
    `Product key: ${key}`,
    `Canonical product: ${product.canonical_url}`,
    discovery.registry_name ? `Official MCP Registry: ${discovery.registry_name}` : null,
    discovery.mcp ? `Remote MCP: ${discovery.mcp}` : null,
    `CHUM public page: ${discovery.mirror.page_path}`,
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
    catalog.universal_front_door?.mcp || 'Not declared.',
    '',
    'Discovery or matching creates no payment obligation. Any supported checkout preparation requires explicit human confirmation, and checkout creation is not proof of payment.',
    ''
  ].filter((v) => v !== null).join('\n');

  const description = `Evercraft capability for ${(product.intents || []).slice(0, 3).join('; ') || product.class || product.name}.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: product.name,
    description,
    provider: { '@type': 'Organization', name: 'Evercraft LLC' },
    url: product.canonical_url,
    category: product.class || undefined,
    termsOfService: discovery.mirror.discovery
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(product.name)} | Evercraft capability</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<link rel="canonical" href="${escapeHtml(product.canonical_url)}">
<link rel="alternate" type="text/plain" href="./llms.txt">
<link rel="alternate" type="application/json" href="./ai-discovery.json">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>body{font-family:system-ui,sans-serif;max-width:920px;margin:64px auto;padding:0 24px;line-height:1.6;background:#09090b;color:#fafafa}a{color:#a5b4fc}.card{border:1px solid #27272a;border-radius:16px;padding:22px;margin:20px 0}.muted{color:#a1a1aa}li{margin:.45rem 0}</style>
</head>
<body>
<p class="muted">EVERCRAFT · CHUM CAPABILITY MIRROR</p>
<h1>${escapeHtml(product.name)}</h1>
<p>${escapeHtml(description)}</p>
<div class="card"><h2>Use this when</h2><ul>${(product.intents || []).map((intent) => `<li>${escapeHtml(intent)}</li>`).join('')}</ul></div>
<div class="card"><h2>Authority</h2><p>${escapeHtml(product.authority || 'Public discovery only.')}</p><p><strong>Human confirmation required:</strong> ${Boolean(product.human_confirmation_required) ? 'yes' : 'no'}</p></div>
<div class="card"><h2>Boundaries</h2><ul>${(product.boundaries || []).map((boundary) => `<li>${escapeHtml(boundary)}</li>`).join('')}</ul></div>
<div class="card"><h2>Machine doors</h2>
<p><a href="./llms.txt">llms.txt</a><br><a href="./ai-discovery.json">AI discovery JSON</a><br><a href="./ai-conformance.json">AI conformance JSON</a>${discovery.mcp ? `<br><a href="${escapeHtml(discovery.mcp)}">Remote MCP</a>` : ''}</p>
</div>
<p><a href="${escapeHtml(product.canonical_url)}">Open the canonical product</a></p>
<p class="muted">Discovery creates no payment obligation. Commercial continuation remains bounded by the product's published authority and confirmation rules.</p>
</body>
</html>
`;

  fs.writeFileSync(path.join(dir, 'index.html'), html);
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
    public_page_path: discovery.mirror.page_path,
    served_llms_path: discovery.mirror.llms_path,
    served_discovery_path: discovery.mirror.discovery_path,
    served_conformance_path: discovery.mirror.conformance_path
  });
}

index.products.sort((a, b) => a.product_key.localeCompare(b.product_key));
fs.mkdirSync('public/chum', { recursive: true });
fs.writeFileSync('public/chum/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ products: index.products.length, output: 'public/chum' }));
