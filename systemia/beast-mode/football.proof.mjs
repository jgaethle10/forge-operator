#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCargoManifest } from './manifest.mjs';
import { sealFootball, openFootball, splitFootball, joinFootball } from './football.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');

const first = Buffer.from(JSON.stringify({ kind: 'report', evidence_state: 'source_backed' }), 'utf8');
const second = Buffer.from('site-plan-contract-canary\n'.repeat(4096), 'utf8');

const manifest = createCargoManifest({
  source: { system: 'proof-source' },
  destination: { system: 'proof-destination', workspace: 'internal' },
  authority: {
    scope: 'internal',
    payment_state: 'not_required',
    customer_delivery_authorized: false,
    authorization_ref: 'football-proof'
  },
  artifacts: [
    {
      artifact_id: 'report',
      artifact_type: 'report_snapshot',
      filename: 'report.json',
      mime_type: 'application/json',
      sha256: sha(first),
      byte_count: first.byteLength,
      evidence_state: 'source_backed',
      provenance: { source_asset_key: 'proof-report' },
      permissions: { customer_visible: false, external_delivery_authorized: false, mutation_authorized: false }
    },
    {
      artifact_id: 'plan',
      artifact_type: 'site_plan_review',
      filename: 'plan.bin',
      mime_type: 'application/octet-stream',
      sha256: sha(second),
      byte_count: second.byteLength,
      evidence_state: 'source_backed',
      provenance: { source_asset_key: 'proof-plan' },
      permissions: { customer_visible: false, external_delivery_authorized: false, mutation_authorized: false }
    }
  ]
}, { now: '2026-09-25T19:30:00.000Z' });

const sealed = sealFootball(manifest, { report: first, plan: second });
const opened = openFootball(sealed.buffer);

assert.equal(opened.football_id, sealed.football_id);
assert.equal(opened.cargo_id, manifest.cargo_id);
assert.ok(opened.artifacts.get('report').equals(first));
assert.ok(opened.artifacts.get('plan').equals(second));

const parts = splitFootball(sealed.buffer, 2048);
assert.ok(parts.length > 1);
const joined = joinFootball([...parts].reverse());
assert.ok(joined.equals(sealed.buffer));

const reopened = openFootball(joined);
assert.ok(reopened.artifacts.get('report').equals(first));
assert.ok(reopened.artifacts.get('plan').equals(second));

console.log(JSON.stringify({
  schema: 'evercraft.beast-mode.football-proof.v1',
  status: 'PASS',
  football_id: sealed.football_id,
  cargo_id: sealed.cargo_id,
  artifact_count: manifest.artifacts.length,
  source_byte_count: first.byteLength + second.byteLength,
  football_byte_count: sealed.buffer.byteLength,
  part_count: parts.length,
  exact_round_trip: true,
  reverse_order_reassembly: true
}, null, 2));
console.log('BEAST_FOOTBALL_PROOF_PASS');
