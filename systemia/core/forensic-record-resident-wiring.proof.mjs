import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
assert.equal(config.schema,'evercraft.systemia.resident-supervisor-config.v1');
const byKey=new Map((config.services||[]).map(service=>[service.service_key,service]));

const forensic=byKey.get('forensic-record-owned-runtime');
assert.ok(forensic,'Files Companion owned runtime must be resident-supervised');
assert.equal(forensic.mode,'resident');
assert.equal(forensic.manifest,'systemia/organism/forensic-record.workflow.json');
assert.equal(forensic.executable,'systemia/organism/forensic-record-runner.mjs');
assert.notEqual(forensic.optional_when_unconfigured,true);
assert.equal(forensic.max_restarts_per_hour,12);

const manifest=JSON.parse(fs.readFileSync(forensic.manifest,'utf8'));
assert.equal(manifest.workflow_key,'forensic-record-owned-runtime');
assert.equal(manifest.runtime,'systemia-core-resident');
assert.equal(manifest.authority?.use_base44_as_runtime,false);
assert.equal(manifest.authority?.expose_forensic_runtime_publicly,false);
assert.equal(manifest.authority?.provision_new_external_capacity,false);
assert.equal(manifest.authority?.founder_login_required,false);

const runner=fs.readFileSync(forensic.executable,'utf8');
assert.ok(runner.includes("deploymentId='forensic-record-runtime'"));
assert.ok(runner.includes("workloadClass:'systemia.forensic-record-runtime.v1'"));
assert.ok(runner.includes("sourceDeploymentId:edgeDeploymentId"));
assert.ok(runner.includes('forensic_record_and_public_edge_node_drift'));
assert.ok(runner.includes('forensic_record_runtime_must_remain_private_loopback_before_route_cutover'));
assert.ok(runner.includes('founder_login_required:false'));

const supervisor=JSON.parse(fs.readFileSync('systemia/core/supervisor.evercraft.compute.json','utf8'));
assert.ok(supervisor.supervised_workflows.includes('forensic-record-owned-runtime'));
assert.ok(supervisor.acceptance.includes('forensic_record_resident_supervised'));

const compute=fs.readFileSync('systemia/compute/runtime-node.mjs','utf8');
assert.ok(compute.includes("'systemia.forensic-record-runtime.v1'"));
assert.ok(compute.includes('startForensicRecordRuntime'));
assert.ok(compute.includes('FORENSIC_RECORD_INGEST_TOKEN'));

const migration=JSON.parse(fs.readFileSync('systemia/migrations/base44-exit/slices/forensic-record-runtime.json','utf8'));
assert.equal(migration.target.runtime,'yard_evercraft_compute');
assert.equal(migration.destructive_cutover_allowed,false);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.systemia.forensic-record-resident-wiring-proof.v1',
  resident_supervision:true,
  existing_owned_capacity_reused:true,
  private_loopback_before_public_cutover:true,
  base44_runtime_required:false,
  founder_login_required:false,
  separate_public_route_gate_preserved:true
},null,2));
