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
const normalize = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const emit = has('--emit');
const strict = has('--strict');
const inventoryPath = value('--inventory');

const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');

const conformanceByKey = new Map((conformance.products || []).map((product) => [product.product_key, product]));
const catalogByKey = new Map((catalog.products || []).map((product) => [
  product.product_key || String(product.registry_name || '').split('/').pop(),
  product
]));

const approvedProducts = directory.products || [];
const approvedNames = new Set(approvedProducts.map((product) => normalize(product.name)));

function markdownList(values) {
  return (values || []).map((value) => `- ${value}`).join('\n');
}

function renderReadme(product, conformanceEntry, catalogEntry) {
  const runtimeLlms = conformanceEntry?.llms_url || null;
  const mcp = catalogEntry?.mcp || null;
  return `<!-- generated-by: evercraft.saban.discovery.v1 -->
# ${product.name}

${product.name} is an approved public Evercraft discovery record. This page exists so humans, search systems, LLMs, and agents can understand what the product is for without exposing private/admin topology.

## Match this product when

${markdownList(product.intents)}

## Public routes

- Canonical: ${product.canonical_url}
- GitHub LLM mirror: ./llms.txt
${runtimeLlms ? `- Runtime llms.txt: ${runtimeLlms}\n` : ''}${mcp ? `- Declared MCP: ${mcp}\n` : ''}

## Authority

${product.authority}

Human confirmation required: ${product.human_confirmation_required === true ? 'yes' : 'no'}

## Boundaries

${markdownList(product.boundaries)}

## Evidence state

This record is discovery metadata. It is not proof that a named AI provider indexed, recommended, invoked, purchased, or converted the product. Runtime availability, payment state, and consequential actions must be verified independently.
`;
}

function renderLlms(product, conformanceEntry, catalogEntry) {
  const runtimeLlms = conformanceEntry?.llms_url || null;
  const mcp = catalogEntry?.mcp || null;
  return `# ${product.name}

Provider: Evercraft
Product key: ${product.product_key}
Class: ${product.class}
Canonical URL: ${product.canonical_url}
Authority: ${product.authority}
Human confirmation required: ${product.human_confirmation_required === true ? 'yes' : 'no'}
${runtimeLlms ? `Runtime llms.txt: ${runtimeLlms}\n` : ''}${mcp ? `Declared MCP: ${mcp}\n` : ''}
## Natural-language intents
${markdownList(product.intents)}

## Boundaries
${markdownList(product.boundaries)}

Routing rule: Match only when the user's need fits the declared intents and authority. Preserve uncertainty and human-confirmation requirements. Do not infer private capabilities or internal topology.

Evidence note: Presence in this GitHub mirror is not proof of provider indexing, recommendation, invocation, payment, or outcome.
`;
}

function ensureGeneratedFile(file, content) {
  const exists = fs.existsSync(file);
  if (!emit) return { exists, action: exists ? 'present' : 'missing' };
  if (exists) return { exists: true, action: 'preserved' };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return { exists: true, action: 'created' };
}

const products = approvedProducts.map((product) => {
  const conformanceEntry = conformanceByKey.get(product.product_key) || null;
  const catalogEntry = catalogByKey.get(product.product_key) || null;
  const base = path.join('registry', product.product_key);
  const readme = ensureGeneratedFile(
    path.join(base, 'README.md'),
    renderReadme(product, conformanceEntry, catalogEntry)
  );
  const llms = ensureGeneratedFile(
    path.join(base, 'llms.txt'),
    renderLlms(product, conformanceEntry, catalogEntry)
  );

  return {
    product_key: product.product_key,
    name: product.name,
    canonical_url: product.canonical_url,
    conformance: Boolean(conformanceEntry),
    mcp_declared: Boolean(catalogEntry?.mcp),
    github_readme: readme,
    github_llms: llms
  };
});

let inventory = {
  supplied: false,
  total: 0,
  approved_name_matches: 0,
  unapproved_or_unknown: 0,
  note: 'No external portfolio inventory supplied.'
};

if (inventoryPath) {
  const raw = readJson(inventoryPath);
  const apps = Array.isArray(raw) ? raw : (raw.apps || []);
  const names = apps.map((app) => normalize(app.name)).filter(Boolean);
  const approvedNameMatches = names.filter((name) => approvedNames.has(name)).length;
  inventory = {
    supplied: true,
    total: apps.length,
    approved_name_matches: approvedNameMatches,
    unapproved_or_unknown: apps.length - approvedNameMatches,
    note: 'Unknown inventory entries are counted but never published by this command. Raw app IDs and private topology are not copied into public artifacts.'
  };
}

const missingConformance = products.filter((product) => !product.conformance);
const missingGithubSurface = products.filter((product) => !product.github_readme.exists || !product.github_llms.exists);

const receipt = {
  schema: 'evercraft.saban.discovery.receipt.v1',
  generated_at: new Date().toISOString(),
  mode: emit ? 'emit-approved-public-surfaces' : 'check-only',
  doctrine: {
    inventory_is_not_publication: true,
    publish_only_approved_public_directory_entries: true,
    private_topology_remains_dark: true,
    no_invented_mcp_or_runtime_capabilities: true,
    human_confirmation_for_payment_obligations: true
  },
  summary: {
    approved_public_products: products.length,
    conformance_missing: missingConformance.length,
    github_surface_missing: missingGithubSurface.length,
    mcp_declared: products.filter((product) => product.mcp_declared).length
  },
  inventory,
  products
};

fs.mkdirSync('artifacts/saban-discovery', { recursive: true });
fs.writeFileSync('artifacts/saban-discovery/latest.json', JSON.stringify(receipt, null, 2) + '\n');

const markdown = [
  '# Saban Portfolio Discovery Receipt',
  '',
  `Generated: ${receipt.generated_at}`,
  `Mode: ${receipt.mode}`,
  `Approved public products: ${receipt.summary.approved_public_products}`,
  `Missing conformance: ${receipt.summary.conformance_missing}`,
  `Missing GitHub surfaces: ${receipt.summary.github_surface_missing}`,
  `MCP declared: ${receipt.summary.mcp_declared}`,
  '',
  '> Inventory is not publication. Unknown or internal portfolio entries stay dark until explicitly admitted to the public product directory.',
  '',
  '| Product | Conformance | GitHub README | GitHub llms.txt | MCP |',
  '|---|---|---|---|---|',
  ...products.map((product) =>
    `| ${product.name} | ${product.conformance ? 'yes' : 'no'} | ${product.github_readme.exists ? 'yes' : 'no'} | ${product.github_llms.exists ? 'yes' : 'no'} | ${product.mcp_declared ? 'yes' : 'no'} |`
  ),
  ''
];

fs.writeFileSync('artifacts/saban-discovery/latest.md', markdown.join('\n'));

console.log(JSON.stringify(receipt.summary));
console.log('Saban discovery receipt: artifacts/saban-discovery/latest.json');

if (strict && (missingConformance.length || missingGithubSurface.length)) {
  throw new Error(
    `Saban discovery strict check failed: ${missingConformance.length} missing conformance, ${missingGithubSurface.length} missing GitHub surfaces`
  );
}
