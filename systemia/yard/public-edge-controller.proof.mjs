import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';
import { PublicEdgeController } from './public-edge-controller.mjs';
import { startBrowserPublicAdapter } from '../evercraft-web/browser-worker/public-adapter.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-controller-proof-'));
const computeRoot=path.join(root,'compute');
const yardState=path.join(root,'yard');
const controllerState=path.join(root,'controller');
fs.mkdirSync(computeRoot,{recursive:true});

const allocatorToken='controller-proof-allocator-secret';
let browserClosed=false;
let browserReceipt='';
const browserRuntimeFactory=async()=>{
  const runtime={
    instanceId:'control-room-controller-proof',
    async health(){
      return {
        ok:!browserClosed,
        service:'evercraft-owned-browser-worker',
        engine:'evercraft-owned-browser-worker-v1',
        mode:'public_read_only',
        runtime:'Evercraft Compute',
        instance_id:this.instanceId,
        deployment_receipt_ref:browserReceipt||null,
      };
    },
    async browse(job){
      return {
        ok:true,
        mode:'public_read_only',
        requested_url:String(job?.url||''),
        final_url:String(job?.url||''),
        title:'Control Room controller proof',
        evidence_receipt_sha256:'a'.repeat(64),
      };
    },
    async createAuthSession(){
      return {
        session_id:'controller-proof-auth',
        handoff_path:'/handoff/controller-proof-auth#claim=proof',
        expires_at:new Date(Date.now()+60000).toISOString(),
        mode:'human_authorized_ephemeral',
        persisted_profile:false,
        secret_text_returned:false,
      };
    },
    setDeploymentReceipt(value){
      browserReceipt=String(value||'');
      return {ok:true,deployment_receipt_ref:browserReceipt};
    },
    async close(){}
  };
  const adapter=await startBrowserPublicAdapter({
    runtime,
    host:'127.0.0.1',
    port:0,
    maxRequestsPerMinute:30,
  });
  runtime.localPublicUrl=adapter.url;
  runtime.close=async()=>{
    if(browserClosed) return;
    browserClosed=true;
    await adapter.close();
  };
  return runtime;
};
const node=await startEvercraftComputeNode({
  root:computeRoot,
  nodeId:'public-edge-controller-proof-node',
  allocatorToken,
  browserRuntimeFactory,
});
const yard=new YardOperator({stateDir:yardState});
const controller=new PublicEdgeController({
  yard,
  stateDir:controllerState,
  leaseTtlMs:120000,
  renewEveryMs:60000,
  intervalMs:30000,
  allowLoopbackProof:true,
  browserEnabled:true,
  browserRequestedHostname:'control-room-proof',
  browserStableHostname:true,
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
    browser:{
      enabled:true,
      max_concurrency:1,
      requested_hostname:'control-room-proof',
      stable_hostname:true,
    },
    requestedHostname:'specialist-proof',
    edgeRollbackTarget:'proof:edge-previous',
    specialistRollbackTarget:'proof:specialist-previous',
  });

  assert.equal(provisioned.action,'provisioned');
  assert.equal(provisioned.runtime_fabric,'Evercraft Compute');
  assert.equal(provisioned.edge_node_id,'public-edge-controller-proof-node');
  assert.equal(provisioned.specialist_node_id,'public-edge-controller-proof-node');
  assert.equal(provisioned.browser_node_id,'public-edge-controller-proof-node');
  assert.equal(provisioned.browser_enabled,true);
  assert.equal(provisioned.browser_route_scope,'loopback_proof');
  assert.equal(provisioned.browser_route_verified,false);
  assert.match(provisioned.browser_origin,/^http:\/\/127\.0\.0\.1:/);
  assert.notEqual(provisioned.browser_origin,provisioned.origin);
  assert.ok(provisioned.browser_route_binding_receipt);
  assert.notEqual(provisioned.browser_route_binding_receipt,provisioned.route_binding_receipt);
  assert.equal(provisioned.route_scope,'loopback_proof');
  assert.equal(provisioned.route_verified,false);
  assert.equal(provisioned.provider_transport,'compute_lease');
  assert.equal(provisioned.founder_login_required,false);

  const edgeRecord=yard.deploymentStatus('evercraft-public-edge');
  const specialistRecord=yard.deploymentStatus('evercraft-specialist-handoff');
  const browserRecord=yard.deploymentStatus('evercraft-control-room');
  assert.equal(edgeRecord.state,'ready');
  assert.equal(specialistRecord.state,'ready');
  assert.equal(browserRecord.state,'ready');
  assert.equal(browserRecord.result.auth_handoff_supported,true);

  const tick=await controller.tick();
  assert.equal(tick.action,'healthy');
  assert.equal(tick.edge_health_state,'healthy');
  assert.equal(tick.specialist_health_state,'loopback_proof_healthy');
  assert.equal(tick.browser_health_state,'loopback_proof_healthy');
  assert.ok(tick.edge_lease_renewal_receipt);
  assert.ok(tick.specialist_lease_renewal_receipt);
  assert.ok(tick.browser_lease_renewal_receipt);

  const stateFile=path.join(controllerState,'public-edge-controller.json');
  const persisted=fs.readFileSync(stateFile,'utf8');
  assert.equal(persisted.includes(allocatorToken),false);
  const state=JSON.parse(persisted);
  assert.equal(state.schema,'evercraft.yard.public-edge-controller-state.v1');
  assert.equal(state.binding.provider_transport,'compute_lease');
  assert.equal(state.binding.route_scope,'loopback_proof');
  assert.equal(state.browser_enabled,true);
  assert.equal(state.browser_binding.route_scope,'loopback_proof');

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
    browserEnabled:true,
    browserRequestedHostname:'control-room-proof',
    browserStableHostname:true,
  });

  assert.ok(restartedController.binding);
  const resumed=await restartedController.resume();
  assert.equal(resumed.action,'resumed');
  assert.equal(resumed.edge_health_state,'healthy');
  assert.equal(resumed.specialist_health_state,'loopback_proof_healthy');
  assert.equal(resumed.browser_health_state,'loopback_proof_healthy');
  assert.equal(resumed.browser_route_scope,'loopback_proof');
  assert.equal(resumed.route_scope,'loopback_proof');
  assert.equal(resumed.founder_login_required,false);

  const resumedTick=await restartedController.tick();
  assert.equal(resumedTick.action,'healthy');
  assert.ok(resumedTick.edge_lease_renewal_receipt);
  assert.ok(resumedTick.specialist_lease_renewal_receipt);
  assert.ok(resumedTick.browser_lease_renewal_receipt);

  const stopped=await restartedController.close({reason:'proof_complete'});
  assert.equal(stopped.action,'stopped');
  assert.ok(stopped.route_release_receipt);
  assert.ok(stopped.browser_route_release_receipt);

  const edgeAfter=restartedYard.deploymentStatus('evercraft-public-edge');
  const specialistAfter=restartedYard.deploymentStatus('evercraft-specialist-handoff');
  const browserAfter=restartedYard.deploymentStatus('evercraft-control-room');
  assert.equal(edgeAfter.state,'stopped');
  assert.equal(specialistAfter.state,'stopped');
  assert.equal(browserAfter.state,'stopped');
  assert.equal(browserClosed,true);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.yard.public-edge-controller-proof.v1',
    runtime_fabric:'Evercraft Compute',
    provision_three_resident_workloads:true,
    control_room_browser_enabled:true,
    control_room_authenticated_handoff_required:true,
    control_room_route_isolated_from_fabric_route:true,
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
