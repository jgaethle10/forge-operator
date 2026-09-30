import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('systemia/organism/clip-social-continuity.workflow.json','utf8'));
assert.equal(manifest.schema, 'evercraft.systemia.workflow-manifest.v1');
assert.equal(manifest.workflow_key, 'clip-social-continuity');
assert.equal(manifest.cadence_seconds, 1800);
assert.equal(manifest.authority.provider_visible_verification_required, true);
assert.deepEqual(manifest.authority.hard_excluded_pages, ['R&B Chicken & Soul']);
assert.equal(manifest.authority.havenly_autonomous_publishing_authorized, true);

const organism = fs.readFileSync('systemia/organism/clip-social-continuity.mjs','utf8');
assert.match(organism, /const HAVENLY_PAGE_ID = '924929507380565'/);
assert.match(organism, /const RNB_PAGE_ID = '116675248108887'/);
assert.match(organism, /havenly_stale_hard_exclusion/);
assert.match(organism, /active_publishing_continuity_incident/);
assert.match(organism, /stale_story_runtime_build/);
assert.match(organism, /receipt_sha256/);

const resident = JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
const service = resident.services.find((row) => row.service_key === 'clip-social-continuity');
assert.ok(service);
assert.equal(service.cadence_seconds, 1800);
assert.equal(service.executable, 'systemia/compute/clip-social-continuity-canary.mjs');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.systemia.clip-social-continuity-proof.v1',
  cadence_seconds: 1800,
  fail_closed_on_stale_runtime: true,
  fail_closed_on_active_incident: true,
  havenly_allowed: true,
  rnb_hard_excluded: true,
  provider_verification_required: true
}, null, 2));
