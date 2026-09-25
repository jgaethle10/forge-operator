#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCargoManifest } from './manifest.mjs';
import { shipFootballCargo } from './football-engine.mjs';
import { createMemorySource, createMemoryDestination } from './adapters/memory-adapter.mjs';
import { createMemoryFootballCarrier } from './adapters/memory-football-carrier.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');

const report = Buffer.from(JSON.stringify({
  site: 'football-engine-canary',
  evidence_state: 'source_backed',
  package: 'rivet-report'
}), 'utf8');

const plan = Buffer.from('review-plan-line\n'.repeat(8192), 'utf8');

const manifest = createCargoManifest({
  source: { system: 'aliev-proof' },
  destination: { system: 'rivet-proof', workspace: 'internal_team' },
  authority: {
    scope: 'internal',
    payment_state: 'not_required',
    customer_delivery_authorized: false,
    authorization_ref: 'football-engine-proof'
  },
  artifacts: [
    {
      artifact_id: 'report',
      artifact_type: 'report_snapshot',
      filename: 'report.json',
      mime_type: 'application/json',
      sha256: sha(report),
      byte_count: report.byteLength,
      evidence_state: 'source_backed',
      provenance: { source_asset_key: 'report-source' },
      permissions: { customer_visible: false, external_delivery_authorized: false, mutation_authorized: false }
    },
    {
      artifact_id: 'plan',
      artifact_type: 'site_plan_review',
      filename: 'plan.bin',
      mime_type: 'application/octet-stream',
      sha256: sha(plan),
      byte_count: plan.byteLength,
      evidence_state: 'source_backed',
      provenance: { source_asset_key: 'plan-source' },
      permissions: { customer_visible: false, external_delivery_authorized: false, mutation_authorized: false }
    }
  ]
}, { now: '2026-09-25T20:00:00.000Z' });

let tick = 0;
const now = () => new Date(Date.parse('2026-09-25T20:00:00.000Z') + (++tick * 1000)).toISOString();

const source = createMemorySource({ report, plan });
const carrier = createMemoryFootballCarrier();
const destination = createMemoryDestination();

const result = await shipFootballCargo({
  manifest,
  sourceAdapter: source,
  carrierAdapter: carrier,
  destinationAdapter: destination,
  now
});

assert.equal(result.status, 'delivered');
assert.equal(result.manifest.state, 'DELIVERED');
assert.equal(result.receipt.cargo_id, manifest.cargo_id);
assert.match(result.football_id, /^football:[a-f0-9]{64}$/);
assert.equal(result.objects.length, 2);
assert.ok(destination.inspect('memory://report'));
assert.ok(destination.inspect('memory://plan'));
assert.equal(sha(destination.inspect('memory://report')), manifest.artifacts[0].sha256);
assert.equal(sha(destination.inspect('memory://plan')), manifest.artifacts[1].sha256);
assert.deepEqual(result.events.map((event) => event.state), [
  'PACKING',
  'IN_TRANSIT',
  'RECEIVED',
  'VERIFIED',
  'DELIVERED'
]);

console.log(JSON.stringify({
  schema: 'evercraft.beast-mode.football-engine-proof.v1',
  status: 'PASS',
  cargo_id: manifest.cargo_id,
  football_id: result.football_id,
  receipt_id: result.receipt.receipt_id,
  artifacts_delivered: result.objects.length,
  final_state: result.manifest.state,
  exact_destination_hashes: true,
  full_state_path: result.events.map((event) => event.state)
}, null, 2));
console.log('BEAST_FOOTBALL_ENGINE_PROOF_PASS');
