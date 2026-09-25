#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const has = flag => argv.includes(flag);
const value = flag => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const normalize = input => String(input || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, stable(v)]));
  }
  return value;
};
const bullet = values => (values || []).map(value => `- ${value}`).join('\n');

const emit = has('--emit');
const strict = has('--strict');
const inventoryPath = value('--inventory');

const directory = readJson('public/.well-known/evercraft-products.json');
const conformance = readJson('conformance/products.json');
const catalog = readJson('registry/catalog.json');
const approved = directory.products || [];
const conformanceByKey = new Map((conformance.products || []).map(p => [p.product_key, p]));
const catalogByKey = new Map((catalog.products || []).map(p => [
  p.product_key || String(p.registry_name || '').split('/').pop(), p
]));

function renderReadme(p) {
  const c = conformanceByKey.get(p.product_key);
  const r = catalogByKey.get(p.product_key);
  return `<!-- generated-by: evercraft.saban.discovery.v1 -->
# ${p.name}

${p.name} is an approved public Evercraft discovery record. This GitHub mirror exists so humans, search systems, LLMs, and agents can understand the product without exposing private/admin topology.

## Match this product when

${bullet(p.intents)}

## Public routes

- Canonical: ${p.canonical_url}
- GitHub LLM mirror: ./llms.txt
${c?.llms_url ? `- Runtime or CHUM llms.txt: ${c.llms_url}\n` : ''}${r?.mcp ? `- Declared MCP: ${r.mcp}\n` : ''}${r?.http_router ? `- Bounded HTTP router: ${r.http_router}\n` : ''}
## Authority

${p.authority}

Human confirmation required: ${p.human_confirmation_required === true ? 'yes' : 'no'}

## Boundaries

${bullet(p.boundaries)}

## Evidence state

This record is discovery metadata. It is not proof that a named AI provider indexed, recommended, invoked, purchased, or converted the product. Runtime availability, payment state, and consequential actions must be verified independently.
`;
}

function renderLlms(p) {
  const c = conformanceByKey.get(p.product_key);
  const r = catalogByKey.get(p.product_key);
  return `# ${p.name}

Provider: Evercraft
Product key: ${p.product_key}
Class: ${p.class}
Canonical URL: ${p.canonical_url}
Authority: ${p.authority}
Human confirmation required: ${p.human_confirmation_required === true ? 'yes' : 'no'}
${c?.llms_url ? `Runtime or CHUM llms.txt: ${c.llms_url}\n` : ''}${r?.mcp ? `Declared MCP: ${r.mcp}\n` : ''}${r?.http_router ? `Bounded HTTP router: ${r.http_router}\n` : ''}
## Natural-language intents
${bullet(p.intents)}

## Boundaries
${bullet(p.boundaries)}

Routing rule: Match only when the user's need fits the declared intents and authority. Preserve uncertainty and human-confirmation requirements. Do not infer private capabilities or internal topology.

Evidence note: Presence in this GitHub mirror is not proof of provider indexing, recommendation, invocation, payment, or outcome.
`;
}

const invalidContracts = approved.filter(p =>
  !p.product_key ||
  !p.name ||
  !String(p.canonical_url || '').startsWith('https://') ||
  !Array.isArray(p.intents) || p.intents.length === 0 ||
  !p.authority ||
  !Array.isArray(p.boundaries) || p.boundaries.length === 0
);

const products = approved.map(p => {
  const key = p.product_key;
  const readme = path.join('registry', key, 'README.md');
  const llms = path.join('registry', key, 'llms.txt');
  if (emit) {
    fs.mkdirSync(path.dirname(readme), {recursive:true});
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, renderReadme(p));
    if (!fs.existsSync(llms)) fs.writeFileSync(llms, renderLlms(p));
  }
  const r = catalogByKey.get(key);
  const c = conformanceByKey.get(key);
  return {
    product_key: key,
    name: p.name,
    class: p.class,
    canonical_url: p.canonical_url,
    conformance: Boolean(c),
    mcp_declared: Boolean(r?.mcp),
    registry_name: r?.registry_name || c?.mcp_registry?.name || null,
    invocation: r?.mcp ? {mode:'mcp',url:r.mcp} : r?.http_router ? {mode:'bounded_http',url:r.http_router} : {mode:'discovery_only',url:null},
    readme_exists: fs.existsSync(readme),
    llms_exists: fs.existsSync(llms)
  };
});

const expectedIndex = {
  schema: 'evercraft.saban.public-product-index.v1',
  provider: 'Evercraft LLC',
  generated_from: {
    product_directory: 'public/.well-known/evercraft-products.json',
    conformance: 'conformance/products.json',
    registry: 'registry/catalog.json'
  },
  rule: 'Only products already admitted to the public product directory appear here. Inventory existence alone never grants publication.',
  products: products.map(p => ({
    product_key:p.product_key,
    name:p.name,
    class:p.class,
    canonical_url:p.canonical_url,
    github_record:`./${p.product_key}/README.md`,
    llms:`./${p.product_key}/llms.txt`,
    registry_name:p.registry_name,
    invocation:p.invocation
  })).sort((a,b) => a.product_key.localeCompare(b.product_key))
};

if (emit) {
  fs.writeFileSync('registry/public-products.json', JSON.stringify(expectedIndex, null, 2) + '\n');
  const md = [
    '# Evercraft Public Product Graph',
    '',
    'Generated by Saban from the approved public Evercraft product directory.',
    '',
    '> Inventory is not publication. Internal/admin products stay dark until explicitly admitted to the public directory.',
    '',
    '| Product | Class | GitHub record | LLM mirror | Invocation |',
    '|---|---|---|---|---|',
    ...expectedIndex.products.map(p => `| ${p.name} | \`${p.class}\` | [README](./${p.product_key}/README.md) | [llms.txt](./${p.product_key}/llms.txt) | ${p.invocation.mode} |`),
    ''
  ].join('\n');
  fs.writeFileSync('registry/public-products.md', md);
}

let currentIndex = null;
try { currentIndex = readJson('registry/public-products.json'); } catch {}
const indexCurrent = JSON.stringify(stable(currentIndex)) === JSON.stringify(stable(expectedIndex));
const missingConformance = products.filter(p => !p.conformance);
const requiredConformanceMissing = missingConformance.filter(
  p => p.invocation?.mode !== 'discovery_only'
);
const pendingDiscoveryConformance = missingConformance.filter(
  p => p.invocation?.mode === 'discovery_only'
);
const missingMirrors = products.filter(p => !p.readme_exists || !p.llms_exists);

let inventory = {supplied:false,total:0,approved_name_matches:0,unknown_or_unapproved:0};
if (inventoryPath) {
  const raw = readJson(inventoryPath);
  const apps = Array.isArray(raw) ? raw : (raw.apps || []);
  const approvedNames = new Set(approved.map(p => normalize(p.name)));
  const names = apps.map(app => normalize(app.name)).filter(Boolean);
  const approvedNameMatches = names.filter(name => approvedNames.has(name)).length;
  inventory = {
    supplied:true,
    total:apps.length,
    approved_name_matches:approvedNameMatches,
    unknown_or_unapproved:apps.length - approvedNameMatches
  };
}

const summary = {
  approved_public_products: products.length,
  invalid_public_contracts: invalidContracts.length,
  conformance_missing: missingConformance.length,
  required_conformance_missing: requiredConformanceMissing.length,
  discovery_only_conformance_pending: pendingDiscoveryConformance.length,
  github_mirrors_missing: missingMirrors.length,
  mcp_declared: products.filter(p => p.mcp_declared).length,
  public_index_current: indexCurrent,
  inventory
};
console.log(JSON.stringify(summary));

if (emit) {
  fs.mkdirSync('artifacts/saban-discovery', {recursive:true});
  fs.writeFileSync('artifacts/saban-discovery/latest.json', JSON.stringify({
    schema:'evercraft.saban.discovery.receipt.v1',
    generated_at:new Date().toISOString(),
    summary
  }, null, 2) + '\n');
}

if (strict && (
  invalidContracts.length ||
  requiredConformanceMissing.length ||
  missingMirrors.length ||
  !indexCurrent
)) {
  throw new Error(
    `Saban discovery check failed: invalid_contracts=${invalidContracts.length}, required_conformance_missing=${requiredConformanceMissing.length}, discovery_only_conformance_pending=${pendingDiscoveryConformance.length}, missing_mirrors=${missingMirrors.length}, index_current=${indexCurrent}`
  );
}
