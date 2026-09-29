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
  });

  assert.equal(fixture.specialist_only.length, 1);
  assert.equal(fixture.specialist_only[0].public_product_state, 'not_in_public_product_index');
  assert.equal(
    fixture.specialist_only[0].action,
    'review_before_publication_or_contract_binding'
  );
});
