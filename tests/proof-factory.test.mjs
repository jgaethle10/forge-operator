import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProofFactory } from '../systemia/proof-factory/proof-factory.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-proof-factory-'));

function write(relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

write('artifacts/forensiscope-proof/latest.json', {
  schema: 'evercraft.forensiscope.distributed-execution-proof.v1',
  status: 'pass',
  shards: 4,
  logical_agents: 24,
  physical_workers: 4,
  nodeseed_count: 2,
  completed_assignments: 24,
  timeline_entries: 4,
  transcript_segments: 5,
  near_repeated_pairs: 2,
  evidence_graph_nodes: 12,
  evidence_graph_edges: 14,
  llm_evidence_atoms: 5,
  source_unchanged: true,
  public_machine_intake_enabled: false
});

write('artifacts/forensiscope-proof/artifact-return/latest.json', {
  schema: 'evercraft.forensiscope.artifact-return-proof.v1',
  status: 'pass',
  restart_replay_deduplicated: true,
  coordinator_path_rehydrated: true,
  durable_nodeseed_store_survived_restart: true,
  artifact_download_reverified_sha256: true,
  adapter_reexecution_required_on_replay: false
});

write('artifacts/rivet-proof/report-runtime-latest.json', {
  ok: true,
  schema: 'evercraft.rivet.yard-report-proof.v1',
  status: 'pass',
  address_to_ready_report: true,
  beast_football_source_snapshot: true,
  team_auth_fail_closed: true,
  exact_source_hash_verified: true
});

write('artifacts/rivet-proof/session-sprawl-latest.json', {
  ok: true,
  schema: 'evercraft.rivet.session-sprawl-proof.v1',
  status: 'pass',
  jurisdictions: 56,
  jurisdiction_lane_work_units: 280,
  national_partner_lanes: 3,
  total_work_units: 283,
  canonical_entity: 'EVObservedUsageAggregate',
  modeled_promotion_forbidden: true
});

const receipt = buildProofFactory({
  root,
  generatedAt: '2026-09-27T15:00:00.000Z'
});

assert.equal(receipt.schema, 'evercraft.proof-factory.run.v1');
assert.equal(receipt.product_count, 2);
assert.equal(receipt.fully_proved_products, 2);
assert.equal(receipt.pending_products, 0);
assert.equal(receipt.media_briefs, 4);

const publicIndex = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/proof/index.json'), 'utf8'));
assert.equal(publicIndex.schema, 'evercraft.proof-factory.public-index.v1');
assert.equal(publicIndex.products.length, 2);
assert.deepEqual(publicIndex.products.find((row) => row.product_key === 'forensiscope').covered_product_keys, ['forensiscope']);
assert.deepEqual(publicIndex.products.find((row) => row.product_key === 'rivet').covered_product_keys, ['rivet', 'aliev']);
assert.equal(publicIndex.doctrine.receipt_before_claim, true);
assert.equal(publicIndex.doctrine.media_brief_is_not_rendered_media, true);

const forensiscope = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/proof/forensiscope.json'), 'utf8'));
assert.equal(forensiscope.evidence_state, 'execution_proofs_passed');
assert.deepEqual(forensiscope.covered_product_keys, ['forensiscope']);
assert.equal(forensiscope.proof_summary.passed, 2);
assert.equal(forensiscope.proofs[0].metrics.public_machine_intake_enabled, false);
assert.equal(forensiscope.visual_production.state, 'briefs_ready_not_rendered');

const rivet = JSON.parse(fs.readFileSync(path.join(root, 'public/chum/proof/rivet.json'), 'utf8'));
assert.equal(rivet.evidence_state, 'execution_proofs_passed');
assert.deepEqual(rivet.covered_product_keys, ['rivet', 'aliev']);
assert.equal(rivet.proofs[0].metrics.address_to_ready_report, true);
assert.equal(rivet.proofs[1].metrics.jurisdictions, 56);
assert.equal(rivet.truth_boundary.no_unverified_benchmark_claims, true);

const llms = fs.readFileSync(path.join(root, 'public/chum/proof/llms.txt'), 'utf8');
assert.match(llms, /source-stage proof is narrower than a customer production claim/i);
assert.match(llms, /RIVET \/ AliEV/);

const mediaJob = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/proof-factory/media-jobs/rivet-address-to-report.json'), 'utf8'));
assert.equal(mediaJob.schema, 'evercraft.fallen.proof-brief.v1');
assert.equal(mediaJob.production_state, 'brief_ready_not_rendered');
assert.equal(mediaJob.routing.auto_publish, false);
assert.ok(mediaJob.factual_boundaries.some((row) => /modeled economics/i.test(row)));

fs.rmSync(path.join(root, 'artifacts/rivet-proof/report-runtime-latest.json'));
const partial = buildProofFactory({
  root,
  generatedAt: '2026-09-27T15:01:00.000Z'
});
const partialRivet = partial.products.find((row) => row.product_key === 'rivet');
assert.equal(partialRivet.evidence_state, 'partial_execution_proof');
assert.equal(partialRivet.passed_proofs, 1);

console.log('EVERCRAFT PROOF FACTORY PASS');
