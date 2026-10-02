import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDirectDoorReadiness,
  renderDirectDoorReadiness,
  resolveProductRoute,
  UNIVERSAL_FALLBACK,
} from '../systemia/chum/direct-door-readiness.mjs';

const root = process.cwd();
const specs = JSON.parse(
  fs.readFileSync(path.join(root, 'distribution', 'direct-plugin-specs.json'), 'utf8')
);
const actual = JSON.parse(
  fs.readFileSync(
    path.join(root, 'public', '.well-known', 'evercraft-direct-door-readiness.json'),
    'utf8'
  )
);
const expected = renderDirectDoorReadiness(root);

assert.deepEqual(actual, expected, 'published Direct Door readiness must match current source truth');
assert.equal(actual.schema, 'evercraft.direct-door-readiness.v2');
assert.equal(actual.summary.product_count, specs.products.length);
assert.equal(actual.summary.direct_callable_count, 0);
assert.equal(actual.summary.zero_hop_specialist_count, 0);
assert.equal(actual.summary.fallback_required_count, specs.products.length);
assert.equal(actual.summary.fallback_callable_count, 0);
assert.equal(actual.summary.held_route_count, specs.products.length);
assert.equal(actual.summary.registry_published_count, 0);
assert.equal(actual.summary.public_route_pending_count, specs.products.length);
assert.equal(actual.summary.yard_runtime_public_route_pending_count, 4);
assert.equal(actual.summary.owned_runtime_route_pending_count, 13);
assert.equal(actual.summary.not_direct_callable_count, specs.products.length);
assert.match(actual.invariant, /verified specialist/i);
assert.match(actual.invariant, /hold/i);

assert.equal(actual.universal_fallback.verified, false);
assert.equal(actual.universal_fallback.registry_name, null);
assert.equal(actual.universal_fallback.remote_mcp, null);
assert.equal(
  actual.universal_fallback.candidate_remote_mcp,
  'https://fabric.systemiacommandcenters.com/mcp'
);
assert.match(actual.universal_fallback.verification_source, /chromebook-operator-edge-canary/);

const serialized = JSON.stringify(actual);
assert.equal(/base44\.app/i.test(serialized), false, 'readiness ledger may not expose retired Base44 routes');

const bySlug = new Map(actual.products.map((product) => [product.slug, product]));
for (const spec of specs.products) {
  const row = bySlug.get(spec.slug);
  assert.ok(row, 'missing readiness row: ' + spec.slug);
  assert.equal(row.direct_callable, false, spec.slug + ': unverified owned route must be held');
  assert.equal(row.registry_published, false, spec.slug + ': retired publication is not current route authority');
  assert.equal(row.registry_name, null, spec.slug + ': active registry identity must not be inferred');
  assert.equal(row.mcp_url, null, spec.slug + ': active remote MCP must not be inferred');
  assert.equal(row.preferred_route.mode, 'hold_until_verified_owned_route');
  assert.equal(row.preferred_route.hops_before_specialist, null);
  assert.equal(row.preferred_route.use_universal_router_first, false);
  assert.equal(row.preferred_route.registry_name, null);
  assert.equal(row.preferred_route.remote_mcp, null);
  assert.equal(
    row.preferred_route.fallback_candidate_remote_mcp,
    'https://fabric.systemiacommandcenters.com/mcp'
  );

  if (spec.state === 'owned_runtime_route_pending') {
    assert.deepEqual(
      row.blocking_gates,
      ['owned_specialist_public_route', 'official_mcp_registry_publication'],
      spec.slug + ': owned-runtime blocker sequence drift'
    );
    assert.equal(row.next_release_action, 'verify_owned_specialist_runtime_and_public_route');
  }

  if (spec.state === 'yard_runtime_proven_public_route_pending') {
    assert.deepEqual(
      row.blocking_gates,
      ['shared_public_edge_canary', 'official_mcp_registry_publication'],
      spec.slug + ': Yard-runtime blocker sequence drift'
    );
    assert.equal(
      row.next_release_action,
      'activate_shared_public_edge_and_verify_external_canary'
    );
    assert.equal(row.preferred_route.pending_specialist_runtime_path, spec.runtime_path);
  }
}

const forensiRoute = resolveProductRoute({
  slug: 'forensiscope',
  specs,
  candidates: new Map(),
});
assert.equal(forensiRoute.state, 'route_held');
assert.equal(forensiRoute.route.remote_mcp, null);
assert.equal(forensiRoute.route.use_universal_router_first, false);
assert.equal(
  forensiRoute.route.fallback_candidate_remote_mcp,
  'https://fabric.systemiacommandcenters.com/mcp'
);

const unknownRoute = resolveProductRoute({
  slug: 'not-a-product',
  specs,
  candidates: new Map(),
});
assert.equal(unknownRoute.state, 'unknown_product');
assert.equal(unknownRoute.route.mode, 'hold_until_verified_owned_fallback');
assert.equal(unknownRoute.route.remote_mcp, null);
assert.equal(unknownRoute.route.use_universal_router_first, false);
assert.equal(
  unknownRoute.route.fallback_candidate_remote_mcp,
  UNIVERSAL_FALLBACK.candidate_remote_mcp
);

const syntheticDirect = buildDirectDoorReadiness({
  specs: {
    schema: 'evercraft.direct-plugin-specs.v1',
    routing_policy: specs.routing_policy,
    products: [{
      slug: 'demo',
      name: 'Demo',
      state: 'public_https_verified_registry_pending',
      registry_name: null,
      mcp_url: 'https://example.com/mcp',
    }],
  },
  candidates: new Map(),
});
assert.equal(syntheticDirect.summary.direct_callable_count, 1);
assert.equal(syntheticDirect.summary.zero_hop_specialist_count, 1);
assert.equal(syntheticDirect.summary.held_route_count, 0);
assert.equal(syntheticDirect.products[0].preferred_route.mode, 'direct_specialist');

const syntheticLegacy = buildDirectDoorReadiness({
  specs: {
    schema: 'evercraft.direct-plugin-specs.v1',
    routing_policy: specs.routing_policy,
    products: [{
      slug: 'legacy',
      name: 'Legacy',
      state: 'registry_published_direct_mcp_existing',
      registry_name: 'io.github.jgaethle10/legacy',
      mcp_url: 'https://legacy.base44.app/functions/mcp',
    }],
  },
  candidates: new Map(),
});
assert.equal(syntheticLegacy.summary.direct_callable_count, 0);
assert.equal(syntheticLegacy.products[0].registry_published, false);
assert.equal(syntheticLegacy.products[0].preferred_route.remote_mcp, null);
assert.equal(syntheticLegacy.products[0].preferred_route.mode, 'hold_until_verified_owned_route');

console.log('DIRECT_DOOR_READINESS_PASS', JSON.stringify(actual.summary));

const topLevelLlms = fs.readFileSync('public/llms.txt', 'utf8');
assert.match(topLevelLlms, /evercraft-direct-doors\.json/i);
assert.match(topLevelLlms, /evercraft-direct-door-readiness\.json/i);

const aiDiscoveryDoc = fs.readFileSync('AI-DISCOVERY.md', 'utf8');
assert.match(aiDiscoveryDoc, /evercraft-direct-door-readiness\.json/i);

for (const discoveryPath of [
  'public/.well-known/evercraft-discovery.json',
  'public/ai-discovery.json',
]) {
  const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
  assert.equal(
    discovery.start_here.direct_doors,
    '/.well-known/evercraft-direct-doors.json',
    discoveryPath + ': missing direct door index'
  );
  assert.equal(
    discovery.start_here.direct_door_readiness,
    '/.well-known/evercraft-direct-door-readiness.json',
    discoveryPath + ': missing readiness ledger'
  );
  assert.equal(
    discovery.routing_mode,
    'verified_specialist_then_verified_evercraft_fabric_else_hold',
    discoveryPath + ': routing mode drift'
  );
  assert.match(discovery.routing_rule, /hold/i);
  assert.match(discovery.routing_rule, /verified Evercraft Fabric/i);
}

console.log('DIRECT_DOOR_DISCOVERY_PROPAGATION_PASS');
