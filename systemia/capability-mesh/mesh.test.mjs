import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildCapabilityMesh, renderCapabilityMesh } from './mesh.mjs';

test('production capability mesh is deterministic and every public product is represented', () => {
  const root = process.cwd();
  const actual = JSON.parse(
    fs.readFileSync(path.join(root, 'systemia', 'capability-mesh', 'adoption-coverage.json'), 'utf8')
  );
  const expected = renderCapabilityMesh(root);
  assert.deepEqual(actual, expected);

  const publicProducts = JSON.parse(
    fs.readFileSync(path.join(root, 'registry', 'public-products.json'), 'utf8')
  );
  assert.equal(actual.summary.public_product_count, publicProducts.products.length);
  assert.equal(actual.products.length, publicProducts.products.length);
  assert.equal(
    actual.summary.complete_contract_declaration_count +
      actual.summary.incomplete_contract_declaration_count +
      actual.summary.missing_contract_count,
    actual.summary.public_product_count
  );
});

test('AliEV canary contract binds the shared trust-chain primitives without claiming runtime proof', () => {
  const mesh = renderCapabilityMesh(process.cwd());
  const aliev = mesh.products.find((row) => row.product_key === 'aliev');

  assert.ok(aliev);
  assert.equal(aliev.contract_state, 'complete_declaration');
  assert.equal(aliev.specialist_slug, 'aliev');
  assert.equal(aliev.direct_door.direct_callable, true);
  assert.equal(aliev.lane_states.authority, 'declared');
  assert.equal(aliev.lane_states.context, 'declared');
  assert.equal(aliev.lane_states.meter, 'declared');
  assert.equal(aliev.lane_states.execution, 'declared');
  assert.equal(aliev.lane_states.intake, 'not_required');
  assert.equal(aliev.lane_states.relationship, 'not_required');
  assert.equal(aliev.runtime_verified, false);
  assert.match(aliev.truth_boundary, /do not prove live runtime integration/i);
});

test('Evercraft Clip public specialist has a complete but deliberately non-publishing contract', () => {
  const mesh = renderCapabilityMesh(process.cwd());
  const clip = mesh.products.find((row) => row.product_key === 'evercraft-clip');

  assert.ok(clip);
  assert.equal(clip.contract_state, 'complete_declaration');
  assert.equal(clip.direct_door.direct_callable, true);
  assert.equal(clip.lane_states.meter, 'not_required');
  assert.equal(clip.lane_states.intake, 'not_required');
  assert.equal(clip.lane_states.relationship, 'not_required');
  assert.equal(clip.runtime_verified, false);
});

test('missing product contracts fail visible instead of being inferred', () => {
  const mesh = renderCapabilityMesh(process.cwd());
  const missing = mesh.products.find((row) => row.product_key === 'findmypart');

  assert.ok(missing);
  assert.equal(missing.contract_state, 'missing');
  assert.ok(missing.gaps.includes('product_contract_missing'));
  assert.ok(missing.next_contract_actions.includes('declare_authority_contract'));
  assert.equal(missing.runtime_verified, false);
});

test('compiler detects invalid not-required lanes and missing evidence', () => {
  const fixture = buildCapabilityMesh({
    root: process.cwd(),
    publicProducts: {
      schema: 'evercraft.saban.public-product-index.v1',
      products: [
        {
          product_key: 'demo',
          name: 'Demo',
          class: 'demo_class',
          invocation: { mode: 'discovery_only' },
          registry_name: null,
        },
      ],
    },
    directDoors: {
      schema: 'evercraft.direct-door-readiness.v2',
      products: [],
    },
    contracts: {
      schema: 'evercraft.capability-mesh.contracts.v1',
      truth_boundary: {},
      contracts: [
        {
          product_key: 'demo',
          contract_version: '1.0.0',
          owner: 'systemia',
          adoption_stage: 'shared_runtime',
          authority: {
            state: 'declared',
            passport_product: 'demo',
            scopes: ['demo.run'],
            evidence_refs: ['does/not/exist.mjs'],
          },
          context: {
            state: 'declared',
            namespace: 'demo',
            read_scope: 'context.read.demo',
            write_scope: 'context.write.demo',
            evidence_refs: [],
          },
          meter: { state: 'not_required' },
          intake: { state: 'not_required', reason: 'No universal intake required.' },
          execution: {
            state: 'declared',
            gate_required: true,
            evidence_refs: [],
          },
          relationship: { state: 'not_required', reason: 'No outbound contact.' },
          receipt_reconciliation: {
            state: 'declared',
            namespace: 'demo',
            evidence_refs: [],
          },
          rollback: { state: 'declared', policy: 'Disable demo contract.' },
          compatibility: { intended_product_classes: ['demo_class'] },
        },
      ],
    },
    ratchetBaseline: {
      schema: 'evercraft.capability-mesh.ratchet-baseline.v1',
      captured_at: '2026-09-28',
      public_product_keys: ['demo'],
      direct_door_public_product_keys: [],
      specialist_only_slugs: [],
    },
  });

  const demo = fixture.products[0];
  assert.equal(demo.contract_state, 'incomplete_declaration');
  assert.ok(demo.gaps.includes('meter_not_required_reason_missing'));
  assert.ok(demo.gaps.some((gap) => gap.startsWith('authority_evidence_missing:')));
});

test('specialist doors outside the public product index are preserved as a separate review queue', () => {
  const fixture = buildCapabilityMesh({
    root: process.cwd(),
    publicProducts: {
      schema: 'evercraft.saban.public-product-index.v1',
      products: [],
    },
    directDoors: {
      schema: 'evercraft.direct-door-readiness.v2',
      products: [
        {
          slug: 'held-specialist',
          name: 'Held Specialist',
          state: 'yard_runtime_proven_public_route_pending',
          direct_callable: false,
        },
      ],
    },
    contracts: {
      schema: 'evercraft.capability-mesh.contracts.v1',
      truth_boundary: {},
      contracts: [],
    },
    ratchetBaseline: {
      schema: 'evercraft.capability-mesh.ratchet-baseline.v1',
      captured_at: '2026-09-28',
      public_product_keys: [],
      direct_door_public_product_keys: [],
      specialist_only_slugs: ['held-specialist'],
    },
  });

  assert.equal(fixture.specialist_only.length, 1);
  assert.equal(fixture.specialist_only[0].public_product_state, 'not_in_public_product_index');
  assert.equal(
    fixture.specialist_only[0].action,
    'review_before_publication_or_contract_binding'
  );
});


test('production ratchet passes while grandfathered debt remains visible', () => {
  const mesh = renderCapabilityMesh(process.cwd());
  assert.equal(mesh.ratchet.state, 'pass');
  assert.deepEqual(mesh.ratchet.new_public_products_without_contract, []);
  assert.deepEqual(mesh.ratchet.new_direct_door_without_contract, []);
  assert.deepEqual(mesh.ratchet.new_specialist_only_doors, []);
  assert.ok(mesh.summary.missing_contract_count > 0);
  assert.equal(mesh.summary.shared_runtime_contract_count, 5);
  assert.equal(mesh.summary.private_runtime_contract_count, 1);
  assert.equal(mesh.summary.discovery_only_contract_count, 2);
  assert.deepEqual(
    mesh.priority_queues.contracted_not_shared_runtime,
    ['evernest-atlas', 'opportunity-fabric', 'systemia-university']
  );
});

test('new public product without a contract becomes a blocking ratchet regression', () => {
  const fixture = buildCapabilityMesh({
    root: process.cwd(),
    publicProducts: {
      schema: 'evercraft.saban.public-product-index.v1',
      products: [
        {
          product_key: 'legacy',
          name: 'Legacy',
          class: 'demo',
          invocation: { mode: 'discovery_only' },
          registry_name: null,
        },
        {
          product_key: 'new-product',
          name: 'New Product',
          class: 'demo',
          invocation: { mode: 'discovery_only' },
          registry_name: null,
        },
      ],
    },
    directDoors: {
      schema: 'evercraft.direct-door-readiness.v2',
      products: [],
    },
    contracts: {
      schema: 'evercraft.capability-mesh.contracts.v1',
      truth_boundary: {},
      contracts: [],
    },
    ratchetBaseline: {
      schema: 'evercraft.capability-mesh.ratchet-baseline.v1',
      captured_at: '2026-09-28',
      public_product_keys: ['legacy'],
      direct_door_public_product_keys: [],
      specialist_only_slugs: [],
    },
  });

  assert.equal(fixture.ratchet.state, 'blocked');
  assert.deepEqual(fixture.ratchet.new_public_products, ['new-product']);
  assert.deepEqual(fixture.ratchet.new_public_products_without_contract, ['new-product']);
  assert.ok(
    fixture.ratchet.blocking_regressions.some(
      (row) =>
        row.code === 'new_public_product_without_contract' &&
        row.product_key === 'new-product'
    )
  );
});

test('new direct door without a complete contract is blocked even for a grandfathered public product', () => {
  const fixture = buildCapabilityMesh({
    root: process.cwd(),
    publicProducts: {
      schema: 'evercraft.saban.public-product-index.v1',
      products: [
        {
          product_key: 'legacy',
          name: 'Legacy',
          class: 'demo',
          invocation: { mode: 'mcp' },
          registry_name: 'io.github.jgaethle10/legacy',
        },
      ],
    },
    directDoors: {
      schema: 'evercraft.direct-door-readiness.v2',
      products: [
        {
          slug: 'legacy',
          name: 'Legacy',
          state: 'registry_published_direct_mcp_existing',
          direct_callable: true,
          registry_published: true,
        },
      ],
    },
    contracts: {
      schema: 'evercraft.capability-mesh.contracts.v1',
      truth_boundary: {},
      contracts: [],
    },
    ratchetBaseline: {
      schema: 'evercraft.capability-mesh.ratchet-baseline.v1',
      captured_at: '2026-09-28',
      public_product_keys: ['legacy'],
      direct_door_public_product_keys: [],
      specialist_only_slugs: [],
    },
  });

  assert.equal(fixture.ratchet.state, 'blocked');
  assert.deepEqual(fixture.ratchet.new_direct_door_public_products, ['legacy']);
  assert.deepEqual(fixture.ratchet.new_direct_door_without_contract, ['legacy']);
  assert.ok(
    fixture.ratchet.blocking_regressions.some(
      (row) =>
        row.code === 'new_direct_door_without_contract' &&
        row.product_key === 'legacy'
    )
  );
});

test('new specialist-only door is blocked for explicit review rather than auto-publication', () => {
  const fixture = buildCapabilityMesh({
    root: process.cwd(),
    publicProducts: {
      schema: 'evercraft.saban.public-product-index.v1',
      products: [],
    },
    directDoors: {
      schema: 'evercraft.direct-door-readiness.v2',
      products: [
        {
          slug: 'new-held',
          name: 'New Held Specialist',
          state: 'yard_runtime_proven_public_route_pending',
          direct_callable: false,
        },
      ],
    },
    contracts: {
      schema: 'evercraft.capability-mesh.contracts.v1',
      truth_boundary: {},
      contracts: [],
    },
    ratchetBaseline: {
      schema: 'evercraft.capability-mesh.ratchet-baseline.v1',
      captured_at: '2026-09-28',
      public_product_keys: [],
      direct_door_public_product_keys: [],
      specialist_only_slugs: [],
    },
  });

  assert.equal(fixture.ratchet.state, 'blocked');
  assert.deepEqual(fixture.ratchet.new_specialist_only_doors, ['new-held']);
  assert.ok(
    fixture.ratchet.blocking_regressions.some(
      (row) =>
        row.code === 'new_specialist_only_door_requires_review' &&
        row.specialist_slug === 'new-held'
    )
  );
});


test('new current-trunk products are explicitly contracted without overclaiming shared runtime', () => {
  const mesh = renderCapabilityMesh(process.cwd());
  const evernest = mesh.products.find((row) => row.product_key === 'evernest-atlas');
  const opportunity = mesh.products.find((row) => row.product_key === 'opportunity-fabric');
  const university = mesh.products.find((row) => row.product_key === 'systemia-university');

  assert.equal(evernest.contract_state, 'complete_declaration');
  assert.equal(evernest.adoption_stage, 'discovery_only');
  assert.equal(opportunity.contract_state, 'complete_declaration');
  assert.equal(opportunity.adoption_stage, 'private_runtime');
  assert.equal(university.contract_state, 'complete_declaration');
  assert.equal(university.adoption_stage, 'discovery_only');
  assert.equal(mesh.ratchet.state, 'pass');
  assert.deepEqual(mesh.ratchet.new_public_products.sort(), [
    'evernest-atlas',
    'opportunity-fabric',
    'systemia-university',
  ]);
  assert.deepEqual(mesh.ratchet.new_public_products_without_contract, []);
});


test('FindMyPart direct door is no longer contract debt after free-triage adoption', () => {
  const mesh = renderCapabilityMesh(process.cwd());
  const part = mesh.products.find((row) => row.product_key === 'findmypart');
  assert.equal(part.contract_state, 'complete_declaration');
  assert.equal(part.adoption_stage, 'shared_runtime');
  assert.equal(part.direct_door.direct_callable, true);
  assert.equal(mesh.priority_queues.direct_door_without_contract.includes('findmypart'), false);
});


test('EventWave leaves direct-door contract debt through bounded search contract', () => {
  const mesh = renderCapabilityMesh(process.cwd());
  const eventwave = mesh.products.find((row) => row.product_key === 'eventwave');
  assert.equal(eventwave.contract_state, 'complete_declaration');
  assert.equal(eventwave.adoption_stage, 'shared_runtime');
  assert.equal(eventwave.direct_door.direct_callable, true);
  assert.equal(mesh.priority_queues.direct_door_without_contract.includes('eventwave'), false);
});
