#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const normalize = (input) => String(input || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const list = (values) => (values || []).map((value) => `- ${value}`).join('\n');

const emit = has('--emit');
const strict = has('--strict');
const inventoryPath = value('--inventory');

const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');

const approved = directory.products || [];
const conformanceByKey = new Map((conformance.products || []).map((product) => [product.product_key, product]));
const catalogByKey = new Map((catalog.products || []).map((product) => [
  product.product_key || String(product.registry_name || '').split('/').pop(),
  product
]));

function renderReadme(product, conformanceEntry, catalogEntry) {
  return `<!-- generated-by: evercraft.saban.discovery.v1 -->
# ${product.name}

${product.name} is an approved public Evercraft discovery record. This GitHub mirror exists so humans, search systems, LLMs, and agents can understand the product without exposing private/admin topology.

## Match this product when

${list(product.intents)}

## Public routes

- Canonical: ${product.canonical_url}
- GitHub LLM mirror: ./llms.txt
${conformanceEntry?.llms_url ? `- Runtime or CHUM llms.txt: ${conformanceEntry.llms_url}\n` : ''}${catalogEntry?.mcp ? `- Declared MCP: ${catalogEntry.mcp}\n` : ''}
## Authority

${product.authority}

Human confirmation required: ${product.human_confirmation_required === true ? 'yes' : 'no'}

## Boundaries

${list(product.boundaries)}

## Evidence state

This record is discovery metadata. It is not proof that a named AI provider indexed, recommended, invoked, purchased, or converted the product. Runtime availability, payment state, and consequential actions must be verified independently.
`;
}

function renderLlms(product, conformanceEntry, catalogEntry) {
  return `# ${product.name}

Provider: Evercraft
Product key: ${product.product_key}
Class: ${product.class}
Canonical URL: ${product.canonical_url}
Authority: ${product.authority}
Human confirmation required: ${product.human_confirmation_required === true ? 'yes' : 'no'}
${conformanceEntry?.llms_url ? `Runtime or CHUM llms.txt: ${conformanceEntry.llms_url}\n` : ''}${catalogEntry?.mcp ? `Declared MCP: ${catalogEntry.mcp}\n` : ''}
## Natural-language intents
${list(product.intents)}

## Boundaries
${list(product.boundaries)}

Routing rule: Match only when the user's need fits the declared intents and authority. Preserve uncertainty and human-confirmation requirements. Do not infer private capabilities or internal topology.

Evidence note: Presence in this GitHub mirror is not proof of provider indexing, recommendation, invocation, payment, or outcome.
`;
}

function ensureFile(file, content) {
  if (fs.existsSync(file)) return { exists: true, action: 'preserved' };
  if (!emit) return { exists: false, action: 'missing' };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return { exists: true, action: 'created' };
}

const products = approved.map((product) => {
  const key = String(product.product_key || '').trim();
  const conformanceEntry = conformanceByKey.get(key) || null;
  const catalogEntry = catalogByKey.get(key) || null;
  const readme = ensureFile(
    path.join('registry', key, 'README.md'),
    renderReadme(product, conformanceEntry, catalogEntry)
  );
  const llms = ensureFile(
    path.join('registry', key, 'llms.txt'),
    renderLlms(product, conformanceEntry, catalogEntry)
  );
  return {
    product_key: key,
    name: product.name,
    class: product.class,
    canonical_url: product.canonical_url,
    conformance: Boolean(conformanceEntry),
    mcp_declared: Boolean(catalogEntry?.mcp),
    registry_name: catalogEntry?.registry_name || conformanceEntry?.mcp_registry?.name || null,
    readme,
    llms
  };
});

const publicIndex = {
  schema: 'evercraft.saban.public-product-index.v1',
  provider: 'Evercraft LLC',
  generated_from: {
    product_directory: 'public/.well-known/evercraft-products.json',
    conformance: 'conformance/products.json',
    registry: 'registry/catalog.json'
  },
  rule: 'Only products already admitted to the public product directory appear here. Inventory existence alone never grants publication.',
  products: products.map((product) => ({
    product_key: product.product_key,
    name: product.name,
    class: product.class,
    canonical_url: product.canonical_url,
    github_record: `./${product.product_key}/README.md`,
    llms: `./${product.product_key}/llms.txt`,
    registry_name: product.registry_name,
    mcp_declared: product.mcp_declared
  }))
};

const md = [
  '# Evercraft Public Product Graph',
  '',
  'Generated by Saban from the approved public Evercraft product directory.',
  '',
  '> Inventory is not publication. Internal/admin products stay dark until they are explicitly admitted to the public product directory with public authority and boundaries.',
  '',
  '| Product | Class | GitHub record | LLM mirror | MCP |',
  '|---|---|---|---|---|',
  ...publicIndex.products.map((product) =>
    `| ${product.name} | \`${product.class}\` | [README](./${product.product_key}/README.md) | [llms.txt](./${product.product_key}/llms.txt) | ${product.mcp_declared ? 'declared' : 'not declared'} |`
  ),
  ''
].join('\n');

if (emit) {
  fs.writeFileSync('registry/public-products.json', JSON.stringify(publicIndex, null, 2) + '\n');
  fs.writeFileSync('registry/public-products.md', md);
}

let inventory = {
  supplied: false,
  total: 0,
  approved_name_matches: 0,
  unknown_or_unapproved: 0
};

if (inventoryPath) {
  const raw = readJson(inventoryPath);
  const apps = Array.isArray(raw) ? raw : (raw.apps || []);
  const approvedNames = new Set(approved.map((product) => normalize(product.name)));
  const names = apps.map((app) => normalize(app.name)).filter(Boolean);
  const approvedNameMatches = names.filter((name) => approvedNames.has(name)).length;
  inventory = {
    supplied: true,
    total: apps.length,
    approved_name_matches: approvedNameMatches,
    unknown_or_unapproved: apps.length - approvedNameMatches
  };
}

const existingIndex = fs.existsSync('registry/public-products.json')
  ? readJson('registry/public-products.json')
  : null;
const expectedKeys = publicIndex.products.map((product) => product.product_key).sort();
const indexedKeys = (existingIndex?.products || []).map((product) => product.product_key).sort();
const indexCurrent = JSON.stringify(expectedKeys) === JSON.stringify(indexedKeys);

const missingConformance = products.filter((product) => !product.conformance);
const missingMirrors = products.filter((product) => !product.readme.exists || !product.llms.exists);

const summary = {
  approved_public_products: products.length,
  conformance_missing: missingConformance.length,
  github_mirrors_missing: missingMirrors.length,
  mcp_declared: products.filter((product) => product.mcp_declared).length,
  public_index_current: emit ? true : indexCurrent,
  inventory
};

if (emit) {
  fs.mkdirSync('artifacts/saban-discovery', { recursive: true });
  fs.writeFileSync('artifacts/saban-discovery/latest.json', JSON.stringify({
    schema: 'evercraft.saban.discovery.receipt.v1',
    generated_at: new Date().toISOString(),
    summary
  }, null, 2) + '\n');
}

console.log(JSON.stringify(summary));

if (strict && (missingConformance.length || missingMirrors.length || !indexCurrent)) {
  throw new Error(
    `Saban discovery check failed: ${missingConformance.length} missing conformance, ${missingMirrors.length} missing GitHub mirrors, index_current=${indexCurrent}`
  );
}
