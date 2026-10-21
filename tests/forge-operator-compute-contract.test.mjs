import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const compute=JSON.parse(fs.readFileSync('evercraft.compute.json','utf8'));
const runtimeNode=fs.readFileSync('systemia/compute/runtime-node.mjs','utf8');
const yard=fs.readFileSync('systemia/yard/operator.mjs','utf8');

test('canonical Compute contract admits only immutable full Forge runtime',()=>{
  const forge=compute.capacity.forge_operator;
  assert.ok(compute.capacity.workload_classes.includes('systemia.forge-operator-runtime.v1'));
  assert.equal(forge.workload_class,'systemia.forge-operator-runtime.v1');
  assert.equal(forge.immutable_release_sha_required,true);
  assert.equal(forge.image_digest_required,true);
  assert.equal(forge.release_execution_receipt_required,true);
  assert.equal(forge.arbitrary_image_execution,false);
  assert.equal(forge.benchmark_remote_persistence,false);
  assert.equal(forge.benchmark_public_write_allowed,false);
  assert.deepEqual(
    forge.deploy_state_distinctions,
    ['source_merged','release_artifact_published','compute_deployed','public_route_verified']
  );
});

test('University benchmark routes are part of Forge public discovery contract',()=>{
  for(const route of [
    '/api/systemia-university/benchmarks',
    '/api/systemia-university/benchmarks/{missionKey}',
    '/api/systemia-university/evaluate',
  ]){
    assert.ok(compute.service.public_discovery.includes(route),route);
  }
});

test('Compute and Yard both enforce Forge identity rather than generic HTTP health',()=>{
  for(const literal of [
    "'systemia.forge-operator-runtime.v1'",
    'forge_operator_image_digest_required',
    'forge_operator_release_execution_receipt_required',
    'arbitrary_image_execution: false',
    'university_benchmark_ingress_ready',
    'university_public_write_allowed',
  ]){
    assert.ok(runtimeNode.includes(literal),`Compute missing ${literal}`);
  }
  for(const literal of [
    "'systemia.forge-operator-runtime.v1'",
    'Forge Operator runtime failed immutable health verification',
    'local_forge_operator_health_verified_public_route_unbound',
    'health.image_digest === record.result?.image_digest',
    'health.deployment_receipt_ref === record.receipt?.receipt_hash',
  ]){
    assert.ok(yard.includes(literal),`Yard missing ${literal}`);
  }
});
