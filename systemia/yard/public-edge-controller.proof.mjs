import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';
import { PublicEdgeController } from './public-edge-controller.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-controller-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const controllerState=path.join(root,'controller');
fs.mkdirSync(computeRoot,{recursive:true});

const allocatorToken='controller-proof-allocator-secret';
const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'public-edge-controller-proof-node',
  allocatorToken,
});
const yard=new YardOperator({stateDir:yardState});
const controller=new PublicEdgeController({
  yard,
  stateDir:controllerState,
  leaseTtlMs:120000,
  renewEveryMs:60000,
  intervalMs:30000,
  allowLoopbackProof:true,
});

try{
  const provisioned=await controller.provision({
    releaseRef:'4aab9ba1a2e394643d43e3dccb249050494c7c06',
    capacityEndpoint:node.endpoint,
    allocatorToken,
    edge:{
      mode:'proof_loopback',
      public_host:'127.0.0.1',
      public_port:443,
    },
    specialist:{
      gateway_url:'https://example.invalid/machine-commerce',
    },
    requestedHostname:'specialist-proof',
    edgeRollbackTarget:'proof:edge-previous',
    specialistRollbackTarget:'proof:specialist-previous',
  });

  assert.equal(provisioned.action,'provisioned');
  assert.equal(provisioned.runtime_fabric,'Evercraft Compute');
  assert.equal(provisioned.edge_node_id,'public-edge-controller-proof-node');
  assert.equal(provisioned.specialist_node_id,'public-edge-controller-proof-node');
  assert.equal(provisioned.route_scope,'loopback_proof');
  assert.equal(provisioned.route_verified,false);
  assert.equal(provisioned.provider_transport,'compute_lease');
  assert.equal(provisioned.founder_login_required,false);

  const edgeRecord=yard.deploymentStatus('evercraft-public-edge');
  const specialistRecord=yard.deploymentStatus('evercraft-specialist-handoff');
  assert.equal(edgeRecord.state,'ready');
  assert.equal(specialistRecord.state,'ready');

  const tick=await controller.tick();
  assert.equal(tick.action,'healthy');
  assert.equal(tick.edge_health_state,'healthy');
  assert.equal(tick.specialist_health_state,'loopback_proof_healthy');
  assert.ok(tick.edge_lease_renewal_receipt);
  assert.ok(tick.specialist_lease_renewal_receipt);

  const stateFile=path.join(controllerState,'public-edge-controller.json');
  const persisted=fs.readFileSync(stateFile,'utf8');
  assert.equal(persisted.includes(allocatorToken),false);
  const state=JSON.parse(persisted);
  assert.equal(state.schema,'evercraft.yard.public-edge-controller-state.v1');
  assert.equal(state.binding.provider_transport,'compute_lease');
  assert.equal(state.binding.route_scope,'loopback_proof');

  controller.stop();
  yard.stopLeaseKeeper('evercraft-public-edge');
  yard.stopLeaseKeeper('evercraft-specialist-handoff');

  const restartedYard=new YardOperator({stateDir:yardState});
  const restartedController=new PublicEdgeController({
    yard:restartedYard,
    stateDir:controllerState,
    leaseTtlMs:120000,
    renewEveryMs:60000,
    intervalMs:30000,
    allowLoopbackProof:true,
  });

  assert.ok(restartedController.binding);
  const resumed=await restartedController.resume();
  assert.equal(resumed.action,'resumed');
  assert.equal(resumed.edge_health_state,'healthy');
  assert.equal(resumed.specialist_health_state,'loopback_proof_healthy');
  assert.equal(resumed.route_scope,'loopback_proof');
  assert.equal(resumed.founder_login_required,false);

  const resumedTick=await restartedController.tick();
  assert.equal(resumedTick.action,'healthy');
  assert.ok(resumedTick.edge_lease_renewal_receipt);
  assert.ok(resumedTick.specialist_lease_renewal_receipt);

  const stopped=await restartedController.close({reason:'proof_complete'});
  assert.equal(stopped.action,'stopped');
  assert.ok(stopped.route_release_receipt);

  const edgeAfter=restartedYard.deploymentStatus('evercraft-public-edge');
  const specialistAfter=restartedYard.deploymentStatus('evercraft-specialist-handoff');
  assert.equal(edgeAfter.state,'stopped');
  assert.equal(specialistAfter.state,'stopped');

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.public-edge-controller-proof.v1',
    runtime_fabric:'Evercraft Compute',
    provision_two_resident_workloads:true,
    route_binding_via_compute_lease:true,
    lease_renewal_proven:true,
    safe_state_persistence:true,
    allocator_secret_persisted:false,
    route_release_proven:true,
    controller_restart_resume_proven:true,
    resumed_without_reentering_allocator_secret:true,
    clean_teardown_proven:true,
    founder_login_required:false,
    public_https_verified:false,
    proof_scope:'loopback_only',
    provision_receipt:provisioned.receipt_hash,
    healthy_receipt:tick.receipt_hash,
    resume_receipt:resumed.receipt_hash,
    resumed_healthy_receipt:resumedTick.receipt_hash,
    stop_receipt:stopped.receipt_hash,
  },null,2));
} finally {
  controller.stop();
  try{ await node.close(); }catch{}
  fs.rmSync(root,{recursive:true,force:true});
}
