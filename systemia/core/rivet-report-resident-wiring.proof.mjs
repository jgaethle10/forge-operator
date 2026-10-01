import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
assert.equal(config.schema,'evercraft.systemia.resident-supervisor-config.v1');

const byKey=new Map((config.services||[]).map((service)=>[service.service_key,service]));
const aliev=byKey.get('aliev-owned-source');
assert.ok(aliev,'AliEV owned source must be resident-supervised');
assert.equal(aliev.mode,'resident');
assert.equal(aliev.manifest,'systemia/organism/aliev-source.workflow.json');
assert.equal(aliev.executable,'systemia/organism/aliev-source-runner.mjs');
assert.notEqual(aliev.optional_when_unconfigured,true);
assert.equal(aliev.max_restarts_per_hour,12);

const alievManifest=JSON.parse(fs.readFileSync(aliev.manifest,'utf8'));
assert.equal(alievManifest.workflow_key,'aliev-owned-source');
assert.equal(alievManifest.authority?.use_base44_as_runtime,false);
assert.equal(alievManifest.authority?.expose_aliev_source_publicly,false);
assert.equal(alievManifest.authority?.founder_login_required,false);

const rivet=byKey.get('rivet-report-edge');
assert.ok(rivet,'RIVET report edge must be resident-supervised');
assert.equal(rivet.mode,'resident');
assert.equal(rivet.manifest,'systemia/organism/rivet-report-edge.workflow.json');
assert.equal(rivet.executable,'systemia/organism/rivet-report-edge-runner.mjs');
assert.notEqual(rivet.optional_when_unconfigured,true);
assert.equal(rivet.max_restarts_per_hour,12);

const manifest=JSON.parse(fs.readFileSync(rivet.manifest,'utf8'));
assert.equal(manifest.workflow_key,'rivet-report-edge');
assert.equal(manifest.runtime,'systemia-core-resident');
assert.equal(manifest.authority?.use_base44_as_source_runtime,false);
assert.equal(manifest.authority?.founder_login_required,false);
assert.equal(manifest.authority?.provision_new_external_capacity,false);

const runner=fs.readFileSync(rivet.executable,'utf8');
assert.ok(runner.includes('held_waiting_for_owned_aliev_source'));
assert.ok(runner.includes('owned_aliev_source_must_not_use_base44'));
assert.ok(runner.includes("yard.deploymentStatus('aliev-source-runtime')"));
assert.ok(runner.includes("sourceDiscovery='yard_resident'"));
assert.ok(runner.includes('founder_login_required:false'));
assert.ok(runner.includes('allocator_reentry_required:false'));

const compute=fs.readFileSync('systemia/compute/runtime-node.mjs','utf8');
assert.ok(compute.includes('aliev_owned_source_url_required'));
assert.ok(compute.includes('aliev_owned_source_must_not_use_base44'));
assert.equal(
  compute.includes("'https://base44.app/api/apps/69b9b64d86a732029ce0db81/functions/energySiteLookup'"),
  false,
  'Evercraft Compute must not silently fall back to Base44 for RIVET source intelligence'
);

const migration=JSON.parse(fs.readFileSync('systemia/migrations/base44-exit/slices/rivet-reporting-runtime.json','utf8'));
assert.equal(migration.target.runtime,'yard_evercraft_compute');
assert.equal(migration.acceptance.live_yard_route_required,true);
assert.equal(migration.acceptance.required_generation_state,'ready');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.systemia.rivet-report-resident-wiring-proof.v1',
  resident_supervision:true,
  aliev_resident_supervision:true,
  rivet_auto_discovers_owned_aliev:true,
  owned_runtime_required:true,
  silent_base44_source_fallback:false,
  public_edge_capacity_reused:true,
  founder_login_required:false,
  fresh_report_canary_still_required:true
},null,2));
