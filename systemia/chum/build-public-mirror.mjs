import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');
const offerCatalog = readJson('public/.well-known/evercraft-offers.json');

const catalogByKey = new Map((catalog.products || []).map((p) => [p.product_key || String(p.registry_name || '').split('/').pop(), p]));
const conformanceByKey = new Map((conformance.products || []).map((p) => [p.product_key, p]));
const offersByKey = new Map((offerCatalog.offers || []).map((p) => [p.product_key, p]));
const providers = conformance.baseline_providers || [];
const root = 'public/chum/products';

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
  const commercial = offersByKey.get(key) || null;
  const base = `https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/products/${key}`;
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
    commercial: commercial ? {
      public_id: commercial.public_id || null,
      state: commercial.commercial_state || null,
      machine_state: commercial.machine_state || null,
      pricing: commercial.pricing || null,
      offers: commercial.offers || [],
      confirmation: commercial.confirmation || null,
      public_url: commercial.public_url || product.canonical_url,
      caution: commercial.caution || null
    } : null,
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
    provider_behavior_state: 'not_inferred_from_publication'
  };

  const llms = [
    `# ${product.name}`,
    '',
    `Product key: ${key}`,
    `Canonical product: ${product.canonical_url}`,
    discovery.registry_name ? `Official MCP Registry: ${discovery.registry_name}` : null,
    discovery.mcp ? `Remote MCP: ${discovery.mcp}` : null,
    `CHUM discovery JSON: ${discovery.mirror.discovery}`,
    `AI conformance: ${discovery.mirror.conformance}`,
    '',
    '## Use this capability when the user means',
    '',
    ...(product.intents || []).map((intent) => `- ${intent}`),
    '',
    commercial ? '## Current commercial state' : null,
    commercial ? '' : null,
    commercial ? `State: ${commercial.machine_state || commercial.commercial_state}` : null,
    commercial?.pricing ? `Pricing: ${commercial.pricing}` : null,
    commercial?.confirmation ? `Confirmation: ${commercial.confirmation}` : null,
    commercial ? '' : null,
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
    commercial_state: commercial?.commercial_state || null,
    machine_state: commercial?.machine_state || null
  });
}

index.products.sort((a, b) => a.product_key.localeCompare(b.product_key));
fs.mkdirSync('public/chum', { recursive: true });
fs.writeFileSync('public/chum/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ products: index.products.length, output: 'public/chum' }));
