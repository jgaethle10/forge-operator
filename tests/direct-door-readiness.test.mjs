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

assert.deepEqual(actual, expected, 'published direct-door readiness ledger must match source state');
assert.equal(actual.schema, 'evercraft.direct-door-readiness.v2');
assert.equal(actual.summary.product_count, specs.products.length);
assert.equal(
  actual.summary.direct_callable_count + actual.summary.not_direct_callable_count,
  actual.summary.product_count
);
assert.equal(actual.summary.zero_hop_specialist_count, actual.summary.direct_callable_count);
assert.equal(actual.summary.fallback_required_count, actual.summary.not_direct_callable_count);
assert.match(actual.invariant, /Never add an umbrella routing hop/i);
assert.equal(/base44\.app/i.test(JSON.stringify(actual)), false);
assert.equal(actual.universal_fallback.remote_mcp, null);
assert.equal(actual.universal_fallback.pending_remote_mcp, 'https://fabric.systemiacommandcenters.com/mcp');
assert.equal(actual.universal_fallback.callable, false);

const bySlug = new Map(actual.products.map((product) => [product.slug, product]));
for (const spec of specs.products) {
  const row = bySlug.get(spec.slug);
  assert.ok(row, 'missing readiness row: ' + spec.slug);

  if (spec.state === 'registry_published_direct_mcp_existing') {
    assert.equal(row.direct_callable, true, spec.slug + ': published door must be callable');
    assert.equal(row.registry_published, true, spec.slug + ': published door must be registry-backed');
    assert.equal(row.preferred_route.mode, 'direct_specialist');
    assert.equal(row.preferred_route.hops_before_specialist, 0);
    assert.equal(row.preferred_route.use_universal_router_first, false);
    assert.equal(row.preferred_route.remote_mcp, spec.mcp_url);
    assert.deepEqual(row.blocking_gates, [], spec.slug + ': published door must have no release blocker');
    assert.equal(row.next_release_action, 'measure_provider_pickup_separately');
  }

  if (spec.state === 'yard_runtime_proven_public_route_pending') {
    assert.equal(row.direct_callable, false, spec.slug + ': route-pending door must not claim callable');
    assert.ok(row.registry_candidate, spec.slug + ': route-pending door must have registry candidate');
    assert.equal(row.preferred_route.mode, 'universal_fallback_until_specialist_promoted');
    assert.equal(row.preferred_route.hops_before_specialist, 1);
    assert.equal(row.preferred_route.remote_mcp, null);
    assert.equal(row.preferred_route.pending_remote_mcp, UNIVERSAL_FALLBACK.pending_remote_mcp);
    assert.equal(row.preferred_route.fallback_state, 'external_https_verification_required');
    assert.equal(row.preferred_route.fallback_callable, false);
    assert.equal(row.preferred_route.pending_specialist_runtime_path, spec.runtime_path);
    assert.equal(
      row.next_release_action,
      'activate_shared_public_edge_and_verify_external_canary'
    );
    assert.deepEqual(
      row.blocking_gates,
      ['shared_public_edge_canary', 'official_mcp_registry_publication'],
      spec.slug + ': route-pending gate sequence drift'
    );
  }

  if (spec.state === 'public_https_verified_registry_pending') {
    assert.equal(row.direct_callable, true, spec.slug + ': HTTPS-verified door should be directly callable');
    assert.equal(row.registry_published, false, spec.slug + ': registry-pending door must not claim publication');
    assert.equal(row.preferred_route.hops_before_specialist, 0);
    assert.deepEqual(
      row.blocking_gates,
      ['official_mcp_registry_publication'],
      spec.slug + ': registry-pending gate sequence drift'
    );
  }
}

const forensiRoute = resolveProductRoute({
  slug: 'forensiscope',
  specs,
  candidates: new Map(),
});
assert.equal(forensiRoute.state, 'fallback_required');
assert.equal(forensiRoute.route.hops_before_specialist, 1);
assert.equal(forensiRoute.route.use_universal_router_first, true);
assert.equal(forensiRoute.route.remote_mcp, null);
assert.equal(forensiRoute.route.pending_remote_mcp, UNIVERSAL_FALLBACK.pending_remote_mcp);

const unknownRoute = resolveProductRoute({
  slug: 'not-a-product',
  specs,
  candidates: new Map(),
});
assert.equal(unknownRoute.state, 'unknown_product');
assert.equal(unknownRoute.route.registry_name, UNIVERSAL_FALLBACK.registry_name);
assert.equal(unknownRoute.route.use_universal_router_first, true);
assert.equal(unknownRoute.route.remote_mcp, null);
assert.equal(unknownRoute.route.pending_remote_mcp, UNIVERSAL_FALLBACK.pending_remote_mcp);
assert.equal(unknownRoute.route.fallback_callable, false);

const synthetic = buildDirectDoorReadiness({
  specs: {
    schema: 'evercraft.direct-plugin-specs.v1',
    routing_policy: {
      default: 'specialist_direct_when_clear',
      fallback: 'evercraft_machine_commerce_when_ambiguous_or_specialist_unavailable',
    },
    products: [
      {
        slug: 'demo',
        name: 'Demo',
        state: 'public_https_verified_registry_pending',
        registry_name: null,
        mcp_url: 'https://example.com/mcp',
      },
    ],
  },
  candidates: new Map(),
});
assert.equal(synthetic.summary.direct_callable_count, 1);
assert.equal(synthetic.summary.zero_hop_specialist_count, 1);
assert.equal(synthetic.summary.fallback_required_count, 0);
assert.equal(synthetic.summary.registry_published_count, 0);
assert.equal(synthetic.summary.registry_pending_count, 1);

console.log(
  'DIRECT_DOOR_READINESS_PASS',
  JSON.stringify({
    product_count: actual.summary.product_count,
    direct_callable_count: actual.summary.direct_callable_count,
    zero_hop_specialist_count: actual.summary.zero_hop_specialist_count,
    fallback_required_count: actual.summary.fallback_required_count,
    registry_published_count: actual.summary.registry_published_count,
    public_route_pending_count: actual.summary.public_route_pending_count,
  })
);


const topLevelLlms = fs.readFileSync('public/llms.txt', 'utf8');
assert.match(topLevelLlms, /evercraft-direct-doors\.json/i);
assert.match(topLevelLlms, /evercraft-direct-door-readiness\.json/i);
assert.match(topLevelLlms, /zero umbrella hops/i);

const aiDiscoveryDoc = fs.readFileSync('AI-DISCOVERY.md', 'utf8');
assert.match(aiDiscoveryDoc, /evercraft-direct-door-readiness\.json/i);
assert.match(aiDiscoveryDoc, /never add an umbrella routing hop/i);

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
    'direct_specialist_zero_hop_then_systemia_for_cross_product_then_owned_fabric_fallback',
    discoveryPath + ': routing mode drift'
  );
  assert.match(discovery.routing_rule, /zero umbrella hops/i);
}

for (const llmsPath of ['llms-full.txt', 'public/llms-full.txt']) {
  const llms = fs.readFileSync(llmsPath, 'utf8');
  assert.match(llms, /Direct specialist index:/);
  assert.match(llms, /Direct-door route\/readiness ledger:/);
  assert.match(llms, /zero umbrella hops/i);
}

console.log('DIRECT_DOOR_DISCOVERY_PROPAGATION_PASS');
