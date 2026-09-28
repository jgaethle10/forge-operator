#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const publicProductsPath = path.join(root, 'registry/public-products.json');
const registryDir = path.join(root, 'mcp-registry');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stable(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function firstRemoteUrl(manifest) {
  return String(manifest?.remotes?.[0]?.url || '').trim();
}

function registrySlug(name) {
  const prefix = 'io.github.jgaethle10/';
  if (!String(name || '').startsWith(prefix)) return null;
  const slug = String(name).slice(prefix.length).trim();
  return /^[a-z0-9][a-z0-9._-]*$/i.test(slug) ? slug : null;
}

function descriptorCandidates(productKey, slug) {
  const out = [
    path.join(root, 'registry', productKey, 'server.json'),
    path.join(root, 'registry', slug, 'server.json'),
  ];
  return [...new Set(out)];
}

if (!fs.existsSync(publicProductsPath)) {
  throw new Error('public_products_missing:registry/public-products.json');
}
fs.mkdirSync(registryDir, { recursive: true });

const publicProducts = readJson(publicProductsPath);
const products = Array.isArray(publicProducts?.products) ? publicProducts.products : [];
const expected = new Map();
const discoveryOnly = [];
const boundedHttp = [];

for (const product of products) {
  const mode = String(product?.invocation?.mode || '').trim();
  if (mode === 'discovery_only') {
    discoveryOnly.push(product.product_key);
    continue;
  }
  if (mode === 'bounded_http') {
    boundedHttp.push(product.product_key);
    continue;
  }
  if (mode !== 'mcp') continue;

  const key = String(product?.product_key || '').trim();
  const name = String(product?.registry_name || '').trim();
  const url = String(product?.invocation?.url || '').trim();
  const slug = registrySlug(name);

  if (!key) throw new Error('mcp_product_key_missing');
  if (!slug) throw new Error('mcp_registry_name_invalid:' + key);
  if (!/^https:\/\//i.test(url)) throw new Error('mcp_remote_url_invalid:' + key);

  const prior = expected.get(name);
  if (prior && prior.url !== url) {
    throw new Error('shared_registry_name_remote_conflict:' + name);
  }
  if (prior) {
    prior.product_keys.push(key);
  } else {
    expected.set(name, { registry_name: name, slug, url, product_keys: [key] });
  }
}

const materialized = [];
const covered = [];
const held = [];
const problems = [];

for (const item of expected.values()) {
  const target = path.join(registryDir, item.slug + '.json');

  if (fs.existsSync(target)) {
    const manifest = readJson(target);
    const manifestName = String(manifest?.name || '').trim();
    const remote = firstRemoteUrl(manifest);
    if (manifestName !== item.registry_name) {
      problems.push({
        registry_name: item.registry_name,
        reason: 'manifest_name_mismatch',
        path: path.relative(root, target),
        observed: manifestName,
      });
      continue;
    }
    if (remote !== item.url) {
      problems.push({
        registry_name: item.registry_name,
        reason: 'manifest_remote_mismatch',
        path: path.relative(root, target),
        expected: item.url,
        observed: remote,
      });
      continue;
    }
    covered.push({
      registry_name: item.registry_name,
      product_keys: item.product_keys,
      path: path.relative(root, target),
      state: 'covered',
    });
    continue;
  }

  let source = null;
  let manifest = null;
  for (const candidate of descriptorCandidates(item.product_keys[0], item.slug)) {
    if (!fs.existsSync(candidate)) continue;
    const parsed = readJson(candidate);
    if (String(parsed?.name || '').trim() !== item.registry_name) continue;
    if (firstRemoteUrl(parsed) !== item.url) continue;
    source = candidate;
    manifest = parsed;
    break;
  }

  if (!manifest) {
    held.push({
      registry_name: item.registry_name,
      product_keys: item.product_keys,
      reason: 'missing_compatible_server_descriptor',
      expected_path: path.relative(root, target),
    });
    problems.push(held[held.length - 1]);
    continue;
  }

  if (checkOnly) {
    problems.push({
      registry_name: item.registry_name,
      product_keys: item.product_keys,
      reason: 'manifest_missing',
      expected_path: path.relative(root, target),
      source: path.relative(root, source),
    });
    continue;
  }

  fs.writeFileSync(target, stable(manifest));
  materialized.push({
    registry_name: item.registry_name,
    product_keys: item.product_keys,
    path: path.relative(root, target),
    source: path.relative(root, source),
    state: 'materialized_from_verified_descriptor',
  });
}

const receipt = {
  schema: 'evercraft.public-mcp-registry-reconciliation.v1',
  mode: checkOnly ? 'check' : 'reconcile',
  public_products: products.length,
  expected_unique_mcp_connectors: expected.size,
  covered: covered.length,
  materialized: materialized.length,
  discovery_only_products: discoveryOnly.length,
  bounded_http_products: boundedHttp.length,
  held: held.length,
  problems,
  materialized_items: materialized,
  held_items: held,
  rule: 'Only products explicitly marked invocation.mode=mcp with an io.github.jgaethle10 registry name and HTTPS remote are eligible. Missing manifests may be materialized only from a compatible checked-in registry/*/server.json descriptor. Discovery-only products are never silently promoted.',
};

console.log(JSON.stringify(receipt, null, 2));

if (problems.length) {
  if (checkOnly || held.length) process.exit(1);
}
