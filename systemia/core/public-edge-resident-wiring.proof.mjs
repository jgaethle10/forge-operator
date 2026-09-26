import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
assert.equal(config.schema,'evercraft.systemia.resident-supervisor-config.v1');

const byKey=new Map((config.services||[]).map((service)=>[service.service_key,service]));
const activation=byKey.get('public-edge-activation-watch');
const controller=byKey.get('public-edge-controller');

assert.ok(activation,'public edge activation watch must be resident-supervised');
assert.equal(activation.mode,'cycle');
assert.equal(activation.cadence_seconds,300);
assert.equal(
  activation.manifest,
  'systemia/organism/public-edge-activation-watch.workflow.json'
);
assert.equal(
  activation.executable,
  'systemia/organism/public-edge-activation-watch-runner.mjs'
);

assert.ok(controller,'public edge controller must be resident-supervised');
assert.equal(controller.mode,'resident');
assert.equal(
  controller.manifest,
  'systemia/organism/public-edge-controller.workflow.json'
);
assert.equal(
  controller.executable,
  'systemia/organism/public-edge-controller-runner.mjs'
);
assert.notEqual(controller.optional_when_unconfigured,true);

const serializedController=JSON.stringify(controller);
for(const forbidden of [
  '--capacity-endpoint',
  '--release-ref',
  '--base-domain',
  '--tls-key-path',
  '--tls-cert-path',
  '--allocator-token-file',
  'EVERCRAFT_PUBLIC_EDGE_CAPACITY_ENDPOINT',
  'EVERCRAFT_PUBLIC_EDGE_ALLOCATOR_TOKEN_FILE',
]){
  assert.equal(
    serializedController.includes(forbidden),
    false,
    'resident service config must not restore manual provision input '+forbidden
  );
}

const activationManifest=JSON.parse(
  fs.readFileSync('systemia/organism/public-edge-activation-watch.workflow.json','utf8')
);
assert.equal(activationManifest.schema,'evercraft.systemia.workflow-manifest.v1');
assert.equal(activationManifest.cadence_seconds,300);
assert.equal(activationManifest.issue_ref,'github:issue:403');
assert.equal(activationManifest.dependency_issue_ref,'github:issue:175');
assert.equal(activationManifest.activation_owner,'public-edge-activation-watch');
assert.equal(activationManifest.maintenance_owner,'public-edge-controller');

const controllerManifest=JSON.parse(
  fs.readFileSync('systemia/organism/public-edge-controller.workflow.json','utf8')
);
assert.equal(controllerManifest.role,'maintenance_only_after_activation');
assert.equal(controllerManifest.activation_owner,'public-edge-activation-watch');
assert.equal(controllerManifest.maintenance_owner,'public-edge-controller');
assert.equal(controllerManifest.authority?.provision_new_capacity,false);
assert.equal(controllerManifest.authority?.discover_capacity,false);

const activationRunner=fs.readFileSync(
  'systemia/organism/public-edge-activation-watch-runner.mjs',
  'utf8'
);
assert.ok(activationRunner.includes('PublicEdgeActivationWatcher'));
assert.ok(activationRunner.includes('field-mission.json'));
assert.ok(activationRunner.includes('EVERCRAFT_PUBLIC_EDGE_STATE_DIR'));

const controllerRunner=fs.readFileSync(
  'systemia/organism/public-edge-controller-runner.mjs',
  'utf8'
);
assert.ok(controllerRunner.includes('held_waiting_for_activation_watch'));
assert.ok(controllerRunner.includes('.resume({rebindIfNeeded:true})'));
assert.ok(controllerRunner.includes('EVERCRAFT_PUBLIC_EDGE_STATE_DIR'));
assert.ok(controllerRunner.includes('resident_process_alive:true'));
assert.equal(controllerRunner.includes('.provision({'),false);

const missionSources=JSON.parse(
  fs.readFileSync('systemia/collider/mission-sources.json','utf8')
);
const edgeMission=(missionSources.sources||[]).find(
  (source)=>source.source_key==='evercraft-public-specialist-edge'
);
assert.ok(edgeMission);
assert.equal(
  edgeMission.path,
  '../../artifacts/public-edge-activation-watch/field-mission-snapshot.json'
);
assert.equal(edgeMission.stale_after_seconds,900);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.systemia.public-edge-resident-wiring-proof.v1',
  activation_cycle_seconds:300,
  activation_owner:'public-edge-activation-watch',
  maintenance_owner:'public-edge-controller',
  resident_controller_waits_for_activation:true,
  manual_provision_arguments_absent:true,
  shared_state_root:true,
  issue_403_bound:true,
  dependency_issue_175_bound:true,
  kaidance_mission_source_bound:true,
  founder_login_required:false,
},null,2));
