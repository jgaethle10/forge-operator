import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
assert.equal(config.schema,'evercraft.systemia.resident-supervisor-config.v1');

const byKey=new Map((config.services||[]).map(service=>[service.service_key,service]));
const service=byKey.get('forensic-record-owned-source');
assert.ok(service,'Forensic Record owned source must be resident-supervised');
assert.equal(service.mode,'resident');
assert.equal(service.manifest,'systemia/organism/forensic-record-source.workflow.json');
assert.equal(service.executable,'systemia/organism/forensic-record-source-runner.mjs');
assert.notEqual(service.optional_when_unconfigured,true);
assert.equal(service.max_restarts_per_hour,12);

const manifest=JSON.parse(fs.readFileSync(service.manifest,'utf8'));
assert.equal(manifest.workflow_key,'forensic-record-owned-source');
assert.equal(manifest.runtime,'systemia-core-resident');
assert.equal(manifest.authority?.use_base44_as_runtime,false);
assert.equal(manifest.authority?.expose_forensic_runtime_publicly,false);
assert.equal(manifest.authority?.migrate_legacy_data_automatically,false);
assert.equal(manifest.authority?.retire_legacy_runtime,false);
assert.equal(manifest.authority?.provision_new_external_capacity,false);
assert.equal(manifest.authority?.founder_login_required,false);

const runner=fs.readFileSync(service.executable,'utf8');
assert.ok(runner.includes("workloadClass:'systemia.forensic-record-runtime.v1'"));
assert.ok(runner.includes("deploymentId='forensic-record-runtime'"));
assert.ok(runner.includes('held_waiting_for_forensic_ingest_token'));
assert.ok(runner.includes('held_waiting_for_systemia_machine_key'));
assert.ok(runner.includes('forensic_runtime_must_remain_private_loopback_before_public_cutover'));
assert.ok(runner.includes('public_cutover_authorized:false'));
assert.ok(runner.includes('legacy_retirement_authorized:false'));

const compute=fs.readFileSync('systemia/compute/runtime-node.mjs','utf8');
assert.ok(compute.includes("'systemia.forensic-record-runtime.v1'"));
assert.ok(compute.includes('FORENSIC_RECORD_INGEST_TOKEN'));
assert.ok(compute.includes('startForensicRecordRuntime'));
assert.equal(compute.includes('6991f0d23322216766bbe515'),false,'Forensic runtime wiring must not embed the legacy app id');
assert.equal(compute.includes('filescompanion.base44.app'),false,'Forensic runtime wiring must not embed a legacy Base44 origin');

const supervisor=JSON.parse(fs.readFileSync('systemia/core/supervisor.evercraft.compute.json','utf8'));
assert.ok(supervisor.supervised_workflows.includes('forensic-record-owned-source'));

const migration=JSON.parse(fs.readFileSync('systemia/migrations/base44-exit/slices/forensic-record-runtime.json','utf8'));
assert.equal(migration.target.runtime,'yard_evercraft_compute');
assert.equal(migration.acceptance.yard_deployment_receipt_required,true);
assert.equal(migration.acceptance.public_route_verification_required,true);
assert.equal(migration.destructive_cutover_allowed,false);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.systemia.forensic-record-resident-wiring-proof.v1',
  resident_supervision:true,
  shared_owned_capacity_reused:true,
  private_runtime_before_cutover:true,
  automatic_legacy_migration:false,
  automatic_legacy_retirement:false,
  base44_runtime_required:false,
  founder_login_required:false
},null,2));
