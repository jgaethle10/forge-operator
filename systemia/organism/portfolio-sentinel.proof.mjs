#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildPortfolioDelta,
  buildPortfolioMissionSnapshot,
  buildPortfolioRepairQueue,
  buildSentinelState,
  inspectLocalPortfolio
} from './portfolio-sentinel.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-sentinel-proof-'));
const write = (relative, content) => {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

write('README.md', '# test\n');
write('AI-DISCOVERY.md', '# test\n');
write('public/.well-known/evercraft-capabilities.json', '{"schema":"test"}\n');
write('public/chum/index.json', '{"schema":"test"}\n');
write('public/.well-known/evercraft-products.json', JSON.stringify({
  schema: 'evercraft.product-directory.v1',
  products: [
    { product_key: 'alpha', name: 'Alpha', canonical_url: 'https://example.com/' },
    { product_key: 'alpha', name: 'Alpha Duplicate', canonical_url: 'not-a-url' }
  ]
}, null, 2));
write('systemia/capability-mesh/adoption-coverage.json', JSON.stringify({
  schema: 'evercraft.capability-mesh.coverage.v1',
  summary: {
    public_product_count: 4,
    explicit_contract_count: 1,
    missing_contract_count: 3
  },
  priority_queues: {
    direct_door_without_contract: ['alpha'],
    incomplete_contracts: [],
    all_missing_contracts: ['alpha', 'beta', 'gamma'],
    contracted_not_shared_runtime: ['private-product']
  },
  ratchet: {
    schema: 'evercraft.capability-mesh.ratchet-state.v1',
    state: 'blocked',
    blocking_regressions: [
      { code: 'new_public_product_without_contract', product_key: 'beta' },
      { code: 'new_direct_door_without_contract', product_key: 'alpha' },
      { code: 'new_specialist_only_door_requires_review', specialist_slug: 'new-held' }
    ]
  },
  specialist_only: [{
    specialist_slug: 'held-specialist',
    direct_door_state: 'yard_runtime_proven_public_route_pending'
  }],
  products: [
    { product_key: 'alpha', contract_state: 'missing', adoption_stage: 'missing', gaps: ['product_contract_missing'] },
    { product_key: 'beta', contract_state: 'missing', adoption_stage: 'missing', gaps: ['product_contract_missing'] },
    { product_key: 'gamma', contract_state: 'missing', adoption_stage: 'missing', gaps: ['product_contract_missing'] },
    { product_key: 'private-product', contract_state: 'complete_declaration', adoption_stage: 'private_runtime', gaps: [] }
  ]
}, null, 2));

write('package.json', JSON.stringify({
  scripts: {
    ok: 'node scripts/ok.mjs',
    broken: 'node scripts/missing.mjs'
  }
}, null, 2));
write('scripts/ok.mjs', 'console.log("ok")\n');
write('.github/workflows/test.yml', 'name: test\nsteps:\n  - run: npm run absent\n  - run: node scripts/also-missing.mjs\n');
write('nested/server.mjs', 'console.log("nested")\n');
write('.github/workflows/working-directory.yml', [
  'name: working-directory',
  'jobs:',
  '  test:',
  '    steps:',
  '      - name: nested server',
  '        working-directory: nested',
  '        run: node server.mjs',
  ''
].join('\n'));
write('systemia/core/resident-services.json', JSON.stringify({
  schema: 'evercraft.systemia.resident-supervisor-config.v1',
  services: [{
    service_key: 'test-watch',
    mode: 'cycle',
    manifest: 'systemia/organism/test.workflow.json',
    executable: 'systemia/organism/test-runner.mjs'
  }]
}, null, 2));
write('systemia/organism/test.workflow.json', '{"schema":"test"}\n');
fs.mkdirSync(path.join(root, 'registry', 'alpha'), { recursive: true });
fs.mkdirSync(path.join(root, 'public', 'chum', 'products', 'alpha'), { recursive: true });

const scan = inspectLocalPortfolio({ rootDir: root });
const codes = new Set(scan.findings.map((row) => row.code));
assert.ok(codes.has('machine_surface_missing'));
assert.ok(codes.has('duplicate_product_key'));
assert.ok(codes.has('canonical_url_invalid'));
assert.ok(codes.has('package_script_target_missing'));
assert.ok(codes.has('workflow_script_missing'));
assert.ok(codes.has('workflow_target_missing'));
assert.equal(
  scan.findings.some((row) => row.code === 'workflow_target_missing' && row.subject.includes('working-directory.yml -> server.mjs')),
  false,
  'workflow file targets must resolve against their step working-directory'
);
assert.ok(codes.has('resident_service_executable_not_found'));
assert.ok(codes.has('direct_door_contract_missing'));
assert.ok(codes.has('product_trust_chain_contract_missing'));
assert.ok(codes.has('product_contracted_not_shared_runtime'));
assert.ok(codes.has('specialist_door_not_in_public_product_index'));
assert.ok(codes.has('new_public_product_without_contract'));
assert.ok(codes.has('new_direct_door_without_contract'));
assert.ok(codes.has('new_specialist_only_door_requires_review'));
assert.equal(scan.inventory.capability_mesh.missing_contract_count, 3);
assert.equal(scan.inventory.capability_mesh_ratchet.state, 'blocked');

const newProductRegression = scan.findings.find(
  (row) => row.code === 'new_public_product_without_contract'
);
assert.equal(newProductRegression.severity, 'high');

const newSpecialistRegression = scan.findings.find(
  (row) => row.code === 'new_specialist_only_door_requires_review'
);
assert.equal(newSpecialistRegression.severity, 'high');
assert.equal(newSpecialistRegression.human_gate_required, true);

const nonShared = scan.findings.find(
  (row) => row.code === 'product_contracted_not_shared_runtime'
);
assert.equal(nonShared.severity, 'medium');
assert.equal(nonShared.metadata.adoption_stage, 'private_runtime');

const first = buildPortfolioDelta({ active_findings: [] }, scan.findings);
assert.equal(first.added.length, scan.findings.length);
const state = buildSentinelState({ findings: scan.findings, observedAt: new Date('2026-09-25T00:00:00Z') });
const second = buildPortfolioDelta(state, scan.findings);
assert.equal(second.added.length, 0);
assert.equal(second.changed.length, 0);
assert.equal(second.persistent.length, scan.findings.length);
const cleared = buildPortfolioDelta(state, []);
assert.equal(cleared.resolved.length, scan.findings.length);

const queue = buildPortfolioRepairQueue(scan.findings, first);
assert.ok(queue.length > 0);
const snapshot = buildPortfolioMissionSnapshot({
  scanned: scan.scanned,
  delta: first,
  observedAt: new Date('2026-09-25T00:00:00Z'),
  evidenceRefs: ['proof:portfolio-sentinel']
});
assert.equal(snapshot.schema, 'evercraft.kaidance.mission-snapshot.v1');
assert.ok(snapshot.counts.changed <= snapshot.counts.scanned);
assert.ok(snapshot.counts.admitted <= snapshot.counts.changed);

fs.rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({
  schema: 'evercraft.portfolio-sentinel.proof.v1',
  status: 'pass',
  findings: scan.findings.length,
  repair_queue: queue.length,
  scanned: scan.scanned
}));
