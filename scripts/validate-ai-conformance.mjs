import fs from 'node:fs';
import path from 'node:path';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fail = (message) => {
  console.error('FAIL:', message);
  process.exitCode = 1;
};
const pass = (message) => console.log('PASS:', message);

const findServerManifests = (root) => {
  const results = [];
  if (!fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...findServerManifests(fullPath));
    else if (entry.isFile() && entry.name === 'server.json') results.push(fullPath);
  }
  return results.sort();
};

const registry = readJson('conformance/products.json');
const binding = readJson('registry/evercraft-machine-commerce/conformance.json');
const publicDirectory = readJson('public/.well-known/evercraft-products.json');

const requiredProviders = ['chatgpt','claude','gemini','copilot','perplexity','grok','generic_agent'];

if (registry.standard !== 'evercraft.cross-llm-conformance.v1') fail('unexpected conformance standard');
else pass('canonical conformance standard');

for (const provider of requiredProviders) {
  if (!registry.baseline_providers.includes(provider)) fail(`missing baseline provider: ${provider}`);
  else pass(`baseline provider present: ${provider}`);
}

const keys = new Set();
for (const product of registry.products || []) {
  if (!product.product_key || !product.name) fail('product missing identity');
  if (keys.has(product.product_key)) fail(`duplicate product key: ${product.product_key}`);
  keys.add(product.product_key);

  for (const field of ['canonical_url','llms_url']) {
    if (!String(product[field] || '').startsWith('https://')) {
      fail(`${product.product_key} has invalid ${field}`);
    }
  }

  if (product.provider_behavior_state !== 'not_run') {
    fail(`${product.product_key} claims provider behavior without a receipt-backed state model`);
  }

  if (product.conformance_state === 'reference_implementation') {
    if (!String(product.conformance_url || '').startsWith('https://')) {
      fail(`${product.product_key} reference implementation missing conformance_url`);
    } else {
      pass(`${product.product_key} reference implementation has conformance URL`);
    }
  }

  pass(`${product.product_key} registry shape`);
}

if (binding.name !== registry.standard) fail('machine-commerce binding does not match registry standard');
else pass('machine-commerce binding matches standard');

for (const rule of [
  'llms_txt_alone_is_not_conformance',
  'provider_behavior_requires_receipt',
  'checkout_is_not_payment',
  'machine_surface_must_match_real_authority',
  'private_topology_remains_dark'
]) {
  if (binding.rules?.[rule] !== true) fail(`missing machine-commerce rule: ${rule}`);
  else pass(`machine-commerce rule present: ${rule}`);
}

const publicKeys = new Set((publicDirectory.products || []).map(p => p.product_key));
for (const key of keys) {
  if (!publicKeys.has(key)) fail(`public product directory missing: ${key}`);
  else pass(`public product directory includes: ${key}`);
}

for (const product of publicDirectory.products || []) {
  if (!keys.has(product.product_key)) pass(`public discovery entry pending conformance registration: ${product.product_key}`);
  if (!Array.isArray(product.intents) || product.intents.length === 0) fail(`${product.product_key} has no natural-language intents`);
  if (!String(product.canonical_url || '').startsWith('https://')) fail(`${product.product_key} public canonical URL is invalid`);
  if (!product.authority) fail(`${product.product_key} missing machine authority statement`);
  if (!Array.isArray(product.boundaries) || product.boundaries.length === 0) fail(`${product.product_key} missing machine boundaries`);
}

for (const manifestPath of findServerManifests('registry')) {
  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    fail(`${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  const description = String(manifest.description || '');
  if (!description) fail(`${manifestPath} is missing description`);
  else if (description.length > 100) fail(`${manifestPath} description exceeds MCP Registry 100-character limit (${description.length})`);
  else pass(`${manifestPath} description length ${description.length}/100`);

  if (!String(manifest.name || '').startsWith('io.github.')) fail(`${manifestPath} has invalid MCP Registry name`);
  if (!String(manifest.version || '').trim()) fail(`${manifestPath} is missing version`);
}


const masterIntentIndex = readJson('public/chum/intents/index.json');
if (masterIntentIndex.schema !== 'evercraft.chum.intent-index.v1') fail('unexpected CHUM master intent index schema');
if (masterIntentIndex.routing?.live_router !== '/api/discover?q={natural-language-problem}') fail('master intent index missing canonical live router');
if ((masterIntentIndex.products || []).length !== (publicDirectory.products || []).length) fail('master intent index product count drift');
for (const product of masterIntentIndex.products || []) {
  if (!product.product_key || !String(product.canonical_url || '').startsWith('https://')) {
    fail(`master intent product identity invalid: ${product.product_key || 'unknown'}`);
  }
  if (!Array.isArray(product.intents) || product.intents.length === 0) {
    fail(`master intent product has no buyer-language intents: ${product.product_key || 'unknown'}`);
  }
}

if (process.exitCode) throw new Error('AI conformance registry validation failed');

console.log(`AI CONFORMANCE REGISTRY PASS: ${registry.products.length} products indexed and publicly routable`);
