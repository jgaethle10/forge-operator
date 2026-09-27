#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRECT_CALLABLE_STATES = new Set([
  'registry_published_direct_mcp_existing',
  'public_https_verified_registry_pending',
]);

export const UNIVERSAL_FALLBACK = {
  registry_name: 'io.github.jgaethle10/evercraft-machine-commerce',
  remote_mcp:
    'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp',
};

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function candidateMap(root) {
  const dir = path.join(root, 'distribution', 'mcp-registry-candidates');
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const value = readJson(path.join(dir, name));
    if (value?.slug) map.set(value.slug, value);
  }
  return map;
}

function nextReleaseAction({ state, directCallable, registryPublished, candidate }) {
  if (registryPublished) return 'measure_provider_pickup_separately';
  if (directCallable) {
    return candidate
      ? 'publish_official_mcp_registry_candidate'
      : 'prepare_official_mcp_registry_candidate';
  }
  if (state === 'yard_runtime_proven_public_route_pending') {
    return 'activate_shared_public_edge_and_verify_external_canary';
  }
  return 'repair_direct_runtime_or_public_route';
}

export function classifyDirectDoor(product, candidate = null) {
  const state = String(product?.state || '');
  const registryPublished =
    state === 'registry_published_direct_mcp_existing' &&
    typeof product?.registry_name === 'string' &&
    product.registry_name.length > 0;
  const directCallable =
    DIRECT_CALLABLE_STATES.has(state) &&
    typeof product?.mcp_url === 'string' &&
    product.mcp_url.startsWith('https://');

  const blockingGates = [];
  if (state === 'yard_runtime_proven_public_route_pending') {
    blockingGates.push('shared_public_edge_canary');
    blockingGates.push('official_mcp_registry_publication');
  } else if (state === 'public_https_verified_registry_pending') {
    blockingGates.push('official_mcp_registry_publication');
  } else if (!directCallable) {
    blockingGates.push('direct_runtime_or_public_route');
  } else if (!registryPublished) {
    blockingGates.push('official_mcp_registry_publication');
  }

  const route = directCallable
    ? {
        mode: 'direct_specialist',
        hops_before_specialist: 0,
        use_universal_router_first: false,
        registry_name: registryPublished ? product.registry_name : null,
        remote_mcp: product.mcp_url,
        fallback_registry_name: UNIVERSAL_FALLBACK.registry_name,
        fallback_remote_mcp: UNIVERSAL_FALLBACK.remote_mcp,
      }
    : {
        mode: 'universal_fallback_until_specialist_promoted',
        hops_before_specialist: 1,
        use_universal_router_first: true,
        registry_name: UNIVERSAL_FALLBACK.registry_name,
        remote_mcp: UNIVERSAL_FALLBACK.remote_mcp,
        desired_specialist_registry_name: candidate?.desired_registry_name || null,
        pending_specialist_runtime_path: product.runtime_path || null,
      };

  return {
    slug: product.slug,
    name: product.name,
    state,
    direct_callable: directCallable,
    registry_published: registryPublished,
    registry_name: product.registry_name || null,
    mcp_url: product.mcp_url || null,
    public_origin_state: product.public_origin_state || null,
    runtime_path: product.runtime_path || null,
    blocking_gates: blockingGates,
    preferred_route: route,
    next_release_action: nextReleaseAction({
      state,
      directCallable,
      registryPublished,
      candidate,
    }),
    registry_candidate: candidate
      ? {
          publication_state: candidate.publication_state || null,
          desired_registry_name: candidate.desired_registry_name || null,
          public_execution_verified: candidate.public_execution_verified === true,
          registry_publication_proven: candidate.registry_publication_proven === true,
        }
      : null,
  };
}

export function resolveProductRoute({ slug, specs, candidates = new Map() }) {
  const product = (specs?.products || []).find((entry) => entry.slug === slug);
  if (!product) {
    return {
      schema: 'evercraft.direct-door-route-resolution.v1',
      state: 'unknown_product',
      slug,
      route: {
        mode: 'universal_fallback_for_unknown_product',
        hops_before_specialist: 1,
        use_universal_router_first: true,
        registry_name: UNIVERSAL_FALLBACK.registry_name,
        remote_mcp: UNIVERSAL_FALLBACK.remote_mcp,
      },
    };
  }

  const classified = classifyDirectDoor(product, candidates.get(product.slug) || null);
  return {
    schema: 'evercraft.direct-door-route-resolution.v1',
    state: classified.direct_callable ? 'specialist_direct' : 'fallback_required',
    slug,
    product: classified.name,
    route: classified.preferred_route,
    next_release_action: classified.next_release_action,
    blocking_gates: classified.blocking_gates,
  };
}

export function buildDirectDoorReadiness({ specs, candidates = new Map() }) {
  if (!specs || specs.schema !== 'evercraft.direct-plugin-specs.v1') {
    throw new Error('direct_plugin_specs_schema_invalid');
  }

  const products = (specs.products || []).map((product) =>
    classifyDirectDoor(product, candidates.get(product.slug) || null)
  );

  const summary = {
    product_count: products.length,
    direct_callable_count: products.filter((p) => p.direct_callable).length,
    zero_hop_specialist_count: products.filter(
      (p) => p.preferred_route.hops_before_specialist === 0
    ).length,
    fallback_required_count: products.filter(
      (p) => p.preferred_route.use_universal_router_first
    ).length,
    registry_published_count: products.filter((p) => p.registry_published).length,
    registry_pending_count: products.filter(
      (p) => p.direct_callable && !p.registry_published
    ).length,
    public_route_pending_count: products.filter(
      (p) => p.state === 'yard_runtime_proven_public_route_pending'
    ).length,
  };
  summary.not_direct_callable_count =
    summary.product_count - summary.direct_callable_count;

  const sharedBlockers = {};
  const releaseQueue = {};
  for (const product of products) {
    for (const gate of product.blocking_gates) {
      (sharedBlockers[gate] ||= []).push(product.slug);
    }
    (releaseQueue[product.next_release_action] ||= []).push(product.slug);
  }

  return {
    schema: 'evercraft.direct-door-readiness.v2',
    generated_from: 'distribution/direct-plugin-specs.json',
    routing_policy: specs.routing_policy,
    invariant:
      'Never add an umbrella routing hop when a verified specialist can be invoked directly.',
    universal_fallback: UNIVERSAL_FALLBACK,
    promotion_order: [
      'prove_product_runtime',
      'verify_public_https_and_mcp_canary',
      'publish_official_mcp_registry_entry',
      'observe_provider_pickup_separately',
    ],
    summary,
    shared_blockers: sharedBlockers,
    release_queue: releaseQueue,
    products,
    truth_boundary:
      'This ledger reports Evercraft-controlled doorway state and route choice only. A callable MCP or registry publication does not prove that any external AI provider has discovered, ranked, recommended, or invoked the product. Provider pickup is measured separately.',
  };
}

export function renderDirectDoorReadiness(root = process.cwd()) {
  const specs = readJson(path.join(root, 'distribution', 'direct-plugin-specs.json'));
  return buildDirectDoorReadiness({
    specs,
    candidates: candidateMap(root),
  });
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const root = path.resolve(arg('--root', process.cwd()));
  const out = path.resolve(
    arg('--out', path.join(root, 'public', '.well-known', 'evercraft-direct-door-readiness.json'))
  );
  const rendered = JSON.stringify(renderDirectDoorReadiness(root), null, 2) + '\n';

  if (process.argv.includes('--check')) {
    if (!fs.existsSync(out)) throw new Error('direct_door_readiness_output_missing');
    const current = fs.readFileSync(out, 'utf8');
    if (current !== rendered) throw new Error('direct_door_readiness_output_stale');
    console.log('DIRECT_DOOR_READINESS_CURRENT');
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, rendered);
    console.log(out);
  }
}
