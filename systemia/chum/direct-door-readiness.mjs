#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRECT_CALLABLE_STATES = new Set([
  'registry_published_direct_mcp_existing',
  'public_https_verified_registry_pending',
]);

export const UNIVERSAL_FALLBACK = {
  state: 'verification_required',
  verified: false,
  registry_name: null,
  remote_mcp: null,
  candidate_origin: 'https://fabric.systemiacommandcenters.com',
  candidate_remote_mcp: 'https://fabric.systemiacommandcenters.com/mcp',
  verification_source: '.github/workflows/chromebook-operator-edge-canary.yml',
  truth_boundary:
    'Evercraft Fabric is the owned universal fallback candidate. It is not callable from this ledger until a current external edge canary verifies DNS, trusted TLS, runtime health, MCP initialize/tools, catalog safety, and signed NodeSeed binding.',
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

function legacyProviderUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    return host === 'base44.app' || host.endsWith('.base44.app');
  } catch {
    return false;
  }
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
  if (state === 'owned_runtime_route_pending') {
    return 'verify_owned_specialist_runtime_and_public_route';
  }
  return 'repair_direct_runtime_or_public_route';
}

export function classifyDirectDoor(product, candidate = null) {
  const state = String(product?.state || '');
  const directCallable =
    DIRECT_CALLABLE_STATES.has(state) &&
    typeof product?.mcp_url === 'string' &&
    product.mcp_url.startsWith('https://') &&
    !legacyProviderUrl(product.mcp_url);
  const registryPublished =
    directCallable &&
    state === 'registry_published_direct_mcp_existing' &&
    typeof product?.registry_name === 'string' &&
    product.registry_name.length > 0;

  const blockingGates = [];
  if (state === 'yard_runtime_proven_public_route_pending') {
    blockingGates.push('shared_public_edge_canary');
    blockingGates.push('official_mcp_registry_publication');
  } else if (state === 'owned_runtime_route_pending') {
    blockingGates.push('owned_specialist_public_route');
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
        fallback_state: UNIVERSAL_FALLBACK.state,
        fallback_registry_name: UNIVERSAL_FALLBACK.registry_name,
        fallback_remote_mcp: UNIVERSAL_FALLBACK.remote_mcp,
        fallback_candidate_remote_mcp: UNIVERSAL_FALLBACK.candidate_remote_mcp,
      }
    : {
        mode: 'hold_until_verified_owned_route',
        hops_before_specialist: null,
        use_universal_router_first: false,
        registry_name: null,
        remote_mcp: null,
        fallback_state: UNIVERSAL_FALLBACK.state,
        fallback_candidate_origin: UNIVERSAL_FALLBACK.candidate_origin,
        fallback_candidate_remote_mcp: UNIVERSAL_FALLBACK.candidate_remote_mcp,
        fallback_verification_source: UNIVERSAL_FALLBACK.verification_source,
        desired_specialist_registry_name: candidate?.desired_registry_name || product?.retired_registry_name || null,
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
        mode: UNIVERSAL_FALLBACK.remote_mcp
          ? 'universal_fallback_for_unknown_product'
          : 'hold_until_verified_owned_fallback',
        hops_before_specialist: UNIVERSAL_FALLBACK.remote_mcp ? 1 : null,
        use_universal_router_first: Boolean(UNIVERSAL_FALLBACK.remote_mcp),
        registry_name: UNIVERSAL_FALLBACK.registry_name,
        remote_mcp: UNIVERSAL_FALLBACK.remote_mcp,
        fallback_state: UNIVERSAL_FALLBACK.state,
        fallback_candidate_origin: UNIVERSAL_FALLBACK.candidate_origin,
        fallback_candidate_remote_mcp: UNIVERSAL_FALLBACK.candidate_remote_mcp,
      },
    };
  }

  const classified = classifyDirectDoor(product, candidates.get(product.slug) || null);
  return {
    schema: 'evercraft.direct-door-route-resolution.v1',
    state: classified.direct_callable
      ? 'specialist_direct'
      : (classified.preferred_route?.remote_mcp ? 'fallback_required' : 'route_held'),
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
    fallback_required_count: products.filter((p) => !p.direct_callable).length,
    fallback_callable_count: UNIVERSAL_FALLBACK.verified === true ? products.filter((p) => !p.direct_callable).length : 0,
    held_route_count: products.filter(
      (p) => p.preferred_route.mode === 'hold_until_verified_owned_route'
    ).length,
    registry_published_count: products.filter((p) => p.registry_published).length,
    registry_pending_count: products.filter(
      (p) => p.direct_callable && !p.registry_published
    ).length,
    public_route_pending_count: products.filter(
      (p) => p.state === 'yard_runtime_proven_public_route_pending' ||
        p.state === 'owned_runtime_route_pending'
    ).length,
    yard_runtime_public_route_pending_count: products.filter(
      (p) => p.state === 'yard_runtime_proven_public_route_pending'
    ).length,
    owned_runtime_route_pending_count: products.filter(
      (p) => p.state === 'owned_runtime_route_pending'
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
      'Use a verified specialist directly. Otherwise use only a currently verified Evercraft-owned fallback. If neither route is verified, hold rather than routing through a retired or unverified provider.',
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
      'This ledger reports Evercraft-controlled doorway state and route choice only. Legacy provider publication is historical evidence, not active route authority. A specialist or fallback is callable only when its current owned route is verified. Provider pickup is measured separately.',
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
