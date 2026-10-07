import assert from 'node:assert/strict';
import fs from 'node:fs';

const services=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
const byKey=new Map((services.services||[]).map(x=>[x.service_key,x]));
const staging=byKey.get('forensic-record-public-staging');
assert.ok(staging,'Files Companion public staging route must be resident-supervised');
assert.equal(staging.mode,'resident');
assert.equal(staging.manifest,'systemia/organism/forensic-record-public-staging.workflow.json');
assert.equal(staging.executable,'systemia/organism/forensic-record-public-edge-runner.mjs');
assert.notEqual(staging.optional_when_unconfigured,true);
assert.equal(staging.max_restarts_per_hour,12);

const manifest=JSON.parse(fs.readFileSync(staging.manifest,'utf8'));
assert.equal(manifest.workflow_key,'forensic-record-public-staging');
assert.equal(manifest.authority?.bind_staging_public_https_route,'autonomous');
assert.equal(manifest.authority?.bind_canonical_filescompanion_domain,false);
assert.equal(manifest.authority?.retire_legacy_runtime,false);
assert.equal(manifest.authority?.write_to_forensic_corpus,false);
assert.equal(manifest.authority?.provision_new_external_capacity,false);
assert.equal(manifest.authority?.founder_login_required,false);

const runner=fs.readFileSync(staging.executable,'utf8');
assert.ok(runner.includes("FORENSIC_RECORD_STAGING_HOSTNAME||'files-companion-staging'"));
assert.ok(runner.includes('canonical_domain_cutover:false'));
assert.ok(runner.includes('legacy_retirement_authorized:false'));
assert.ok(runner.includes('ForensicRecordPublicEdgeController'));

const controller=fs.readFileSync('systemia/yard/forensic-record-public-edge-controller.mjs','utf8');
assert.ok(controller.includes("'systemia.forensic-record-public-runtime.v1'"));
assert.ok(controller.includes('canonical_filescompanion_domain_cutover_forbidden_in_staging_controller'));
assert.ok(controller.includes('forensic_private_runtime_seed_not_verified'));
assert.ok(controller.includes('public_read_only:true'));
assert.ok(controller.includes('canonical_domain_cutover:false'));

const supervisor=JSON.parse(fs.readFileSync('systemia/core/supervisor.evercraft.compute.json','utf8'));
assert.ok(supervisor.supervised_workflows.includes('forensic-record-public-staging'));
assert.ok(supervisor.acceptance.includes('forensic_record_public_staging_resident_supervised'));
assert.ok(supervisor.acceptance.includes('forensic_record_canonical_domain_cutover_remains_separate_gate'));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.systemia.forensic-record-public-staging-wiring-proof.v1',
  resident_supervision:true,
  staging_route_autonomous:true,
  canonical_domain_cutover:false,
  legacy_retirement_authorized:false,
  write_routes_exposed:false,
  founder_login_required:false
},null,2));
