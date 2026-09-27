import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDirectDoorReadiness,
  renderDirectDoorReadiness,
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
assert.equal(actual.summary.product_count, specs.products.length);
assert.equal(
  actual.summary.direct_callable_count + actual.summary.not_direct_callable_count,
  actual.summary.product_count
);

const bySlug = new Map(actual.products.map((product) => [product.slug, product]));
for (const spec of specs.products) {
  const row = bySlug.get(spec.slug);
  assert.ok(row, 'missing readiness row: ' + spec.slug);

  if (spec.state === 'registry_published_direct_mcp_existing') {
    assert.equal(row.direct_callable, true, spec.slug + ': published door must be callable');
    assert.equal(row.registry_published, true, spec.slug + ': published door must be registry-backed');
    assert.deepEqual(row.blocking_gates, [], spec.slug + ': published door must have no release blocker');
  }

  if (spec.state === 'yard_runtime_proven_public_route_pending') {
    assert.equal(row.direct_callable, false, spec.slug + ': route-pending door must not claim callable');
    assert.ok(row.registry_candidate, spec.slug + ': route-pending door must have registry candidate');
    assert.deepEqual(
      row.blocking_gates,
      ['shared_public_edge_canary', 'official_mcp_registry_publication'],
      spec.slug + ': route-pending gate sequence drift'
    );
  }

  if (spec.state === 'public_https_verified_registry_pending') {
    assert.equal(row.direct_callable, true, spec.slug + ': HTTPS-verified door should be directly callable');
    assert.equal(row.registry_published, false, spec.slug + ': registry-pending door must not claim publication');
    assert.deepEqual(
      row.blocking_gates,
      ['official_mcp_registry_publication'],
      spec.slug + ': registry-pending gate sequence drift'
    );
  }
}

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
assert.equal(synthetic.summary.registry_published_count, 0);
assert.equal(synthetic.summary.registry_pending_count, 1);

console.log(
  'DIRECT_DOOR_READINESS_PASS',
  JSON.stringify({
    product_count: actual.summary.product_count,
    direct_callable_count: actual.summary.direct_callable_count,
    registry_published_count: actual.summary.registry_published_count,
    public_route_pending_count: actual.summary.public_route_pending_count,
  })
);


const readinessPath='/.well-known/evercraft-direct-door-readiness.json';
for(const [file,needle] of [
  ['public/llms.txt',readinessPath],
  ['AI-DISCOVERY.md','evercraft-direct-door-readiness.json'],
  ['llms.txt','evercraft-direct-door-readiness.json'],
]){
  const content=fs.readFileSync(path.join(root,file),'utf8');
  assert.ok(
    content.includes(needle),
    file+': primary discovery surfaces must link direct-door readiness'
  );
}
const capabilities=JSON.parse(
  fs.readFileSync(
    path.join(root,'public/.well-known/evercraft-capabilities.json'),
    'utf8'
  )
);
assert.equal(
  capabilities.discovery?.directDoorReadiness,
  readinessPath,
  'capability manifest must advertise direct-door readiness'
);


const painIndex=JSON.parse(
  fs.readFileSync(
    path.join(root,'public/.well-known/evercraft-pain-index.json'),
    'utf8'
  )
);
const heldSpecs=specs.products.filter(
  (product)=>product.state==='yard_runtime_proven_public_route_pending'
);
for(const product of heldSpecs){
  const entry=(painIndex.entries||[]).find(
    (row)=>row.product_key===product.slug
  );
  if(!entry) continue;
  assert.equal(
    entry.mcp,
    null,
    product.slug+': held direct doors must not leak specialist MCPs into CHUM pain routing'
  );
  assert.equal(
    entry.routing?.preferred,
    'universal_machine_commerce',
    product.slug+': held direct doors must use universal fallback in CHUM pain routing'
  );
}
