#!/usr/bin/env node
// Explicit opt-in, disposable Yard -> NodeSeed -> broker deployment proof.
// No production state, remote devices, existing grants, public routes, or systemd actions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startNodeSeed} from '../compute/node-seed.mjs';
import {YardOperator} from './operator.mjs';
import {assessResidentBrokerRecovery} from './broker-recovery-admission.mjs';

const DEPLOYMENT_ID='isolated-broker-supervisor-proof';
const RELEASE_REF='b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8';

export async function proveIsolatedYardBrokerDeployment(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-isolated-yard-broker-'));
  let seed=null;
  let yard=null;
  let deployed=false;
  try{
    const allocatorToken='lab-'+randomBytes(24).toString('hex');
    seed=await startNodeSeed({
      root:path.join(root,'compute'),
      nodeId:'isolated-broker-proof-host',
      host:'127.0.0.1',
      port:0,
      advertiseHost:'127.0.0.1',
      allocatorToken,
      announce:false,
    });
    yard=new YardOperator({stateDir:path.join(root,'yard')});
    const record=await yard.deployRelease({
      deploymentId:DEPLOYMENT_ID,
      releaseRef:RELEASE_REF,
      workloadClass:'systemia.remote-capacity-broker.v1',
      capacityEndpoint:seed.endpoint,
      allocatorToken,
      input:{
        state_root:path.join(root,'compute','services','remote-broker'),
        authorized_devices:{},
        poll_wait_ms:100,
        command_timeout_ms:2500,
        capacity_fresh_ms:1000,
      },
      rollbackTarget:'proof:isolated-broker-rollback',
      leaseTtlMs:60000,
    });
    deployed=true;
    assert.equal(record.state,'ready');
    assert.equal(record.receipt.workload_class,'systemia.remote-capacity-broker.v1');
    assert.equal(record.receipt.health_verification,'healthy');
    assert.equal(record.receipt.route_verification,'local_broker_health_verified_public_route_unbound');
    assert.equal(record.result.public_route_required,true);
    const localOrigin=new URL(record.result.local_url);
    assert.equal(localOrigin.protocol,'http:');
    assert.equal(localOrigin.hostname,'127.0.0.1');
    assert.ok(Number(localOrigin.port)>0);

    const response=await fetch(localOrigin.origin+'/v1/remote/health',{
      signal:AbortSignal.timeout(5000),
    });
    assert.equal(response.status,200);
    const health=await response.json();
    assert.equal(health.ok,true);
    assert.equal(health.instance_id,record.result.instance_id);
    assert.equal(health.deployment_receipt_bound,true);
    assert.equal(health.deployment_receipt_ref,record.receipt.receipt_hash);
    assert.equal(health.authorized_devices,0);
    assert.equal(health.registered_nodes,0);

    const beforeRoute=await yard.verifyRoute(DEPLOYMENT_ID);
    assert.equal(beforeRoute.ok,false);
    assert.equal(beforeRoute.state,'public_route_unbound');
    await assert.rejects(
      yard.verifyPublicRoute(DEPLOYMENT_ID,{origin:localOrigin.origin}),
      /loopback is not a public route/,
    );
    const loopback=await yard.verifyPublicRoute(DEPLOYMENT_ID,{
      origin:localOrigin.origin,allowLoopbackProof:true,
    });
    assert.equal(loopback.scope,'loopback_proof');
    assert.equal(loopback.verified,false);
    assert.throws(()=>yard.remoteCapacityBrokerReceipt(DEPLOYMENT_ID),
      /verified public HTTPS route is required/);

    // Locally receipt-bound health cannot alone authorize a cold restart.
    // The admission gate may report additional field mismatches; neither
    // a match nor a mismatch is independent route or trust authorization.
    const admission=assessResidentBrokerRecovery({
      yardDeployment:record,brokerHealth:health,
    });
    assert.equal(admission.verified_existing_identity,false);
    assert.equal(admission.restart_authorized,false);
    assert.equal(admission.new_broker_auto_admission_authorized,false);
    assert.equal(admission.may_preserve_existing_yard_deployment,false);

    return Object.freeze({
      schema:'evercraft.yard.isolated-resident-broker-deployment-proof.v1',
      state:'passed',
      scope:'ephemeral_localhost_only',
      broker_deployed_through_yard:true,
      local_receipt_bound:true,
      authorized_devices:0,
      registered_nodes:0,
      loopback_route_only:true,
      public_https_verified:false,
      cold_restart_authorized:false,
      legacy_yard_deployment_reuse_authorized:false,
      physical_node_contacted:false,
      live_service_changed:false,
    });
  }finally{
    try{
      if(deployed&&yard)await yard.stopDeployment(DEPLOYMENT_ID,{
        reason:'isolated_broker_proof_complete',
      });
    }finally{
      try{if(seed)await seed.close();}finally{
        fs.rmSync(root,{recursive:true,force:true});
      }
    }
  }
}

const invoked=Boolean(process.argv[1])&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  if(process.argv.length!==3||process.argv[2]!=='--lab'){
    console.error('HOLD: explicit --lab required; never install as a service');
    process.exitCode=2;
  }else{
    try{
      console.log(JSON.stringify(await proveIsolatedYardBrokerDeployment()));
    }catch(error){
      console.error(JSON.stringify({
        schema:'evercraft.yard.isolated-resident-broker-deployment-proof.v1',
        state:'held',
        reason:String(error?.message||'proof_failed').replace(/[^a-zA-Z0-9_:. -]/g,'_').slice(0,120),
        live_service_changed:false,
        cold_restart_authorized:false,
      }));
      process.exitCode=1;
    }
  }
}
