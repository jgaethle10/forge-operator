#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {YardOperator} from './operator.mjs';
import {writeSafeNodeSeedInventory} from '../saban/nodeseed-inventory-ingest.mjs';
import {dispatchAmbientJobsOnce} from '../saban/ambient-job-dispatcher.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

export async function runYardSabanIntentDrain({
  yardStateDir,
  sabanStateDir,
  brokerDeploymentId,
  maxIntents=16,
  maxJobs=4,
  timeoutMs=10000,
  dispatchQueued=false,
  allowLoopbackProof=false,
  brokerLoopbackOrigin='',
  yardOperator=null,
  dispatchCycle=dispatchAmbientJobsOnce,
  now=new Date(),
}={}){
  if(!yardStateDir)throw new Error('yard_state_dir_required');
  if(!sabanStateDir)throw new Error('saban_state_dir_required');
  if(!brokerDeploymentId)throw new Error('broker_deployment_id_required');
  const yardRoot=path.resolve(yardStateDir);
  const sabanRoot=path.resolve(sabanStateDir);
  const yard=yardOperator||new YardOperator({stateDir:yardRoot});

  // The physical Penguin broker is local-only. Only an explicitly opted-in,
  // strictly loopback origin may be used as a proof route. Re-verify the broker
  // identity before consuming the current remote inventory or dispatching.
  let verifiedRoute=null;
  if(allowLoopbackProof===true){
    const origin=new URL(String(brokerLoopbackOrigin||''));
    if(
      origin.protocol!=='http:' ||
      origin.hostname!=='127.0.0.1' ||
      !origin.port ||
      origin.pathname!=='/' ||
      origin.search || origin.hash || origin.username || origin.password
    ){
      throw new Error('unified_dispatch_requires_explicit_127_0_0_1_broker_origin');
    }
    verifiedRoute=await yard.verifyPublicRoute(brokerDeploymentId,{
      origin:origin.origin,
      allowLoopbackProof:true,
    });
    if(
      verifiedRoute.scope!=='loopback_proof' ||
      verifiedRoute.origin!==origin.origin ||
      verifiedRoute.verification!=='instance_and_deployment_receipt_match'
    ) throw new Error('unified_dispatch_loopback_route_identity_mismatch');
  }else if(dispatchQueued===true){
    const route=yard.deploymentStatus(brokerDeploymentId)?.public_route;
    if(route?.scope!=='public_https'||route.verified!==true){
      throw new Error('unified_dispatch_requires_verified_broker_route');
    }
    verifiedRoute=await yard.verifyPublicRoute(brokerDeploymentId,{origin:route.origin});
    if(verifiedRoute.verified!==true||verifiedRoute.scope!=='public_https'){
      throw new Error('unified_dispatch_public_route_verification_failed');
    }
  }

  const remoteInventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
  const safeInventory=writeSafeNodeSeedInventory({
    inventory:remoteInventory,
    file:path.join(sabanRoot,'nodeseed-capacity-inventory.json'),
  });

  // Opt-in unified mode is the one bounded Saban→Yard control cycle:
  // live broker identity → sanitized inventory → NodeSeed-only planning →
  // immutable intents → Yard grants → verified completion/hold.
  const dispatched=dispatchQueued===true
    ? await dispatchCycle({
        root:sabanRoot,
        maxJobs:Math.min(4,Math.max(1,Math.floor(Number(maxJobs)||4))),
        nodeSeedOnly:true,
        now,
      })
    : null;

  const drained=await yard.drainSabanNodeSeedIntents({
    sabanRoot,
    brokerDeploymentId,
    maxIntents:dispatchQueued===true?Math.min(4,Math.max(1,Math.floor(Number(maxIntents)||4))):maxIntents,
    timeoutMs,
    allowLoopbackProof:allowLoopbackProof===true,
    now,
  });
  const receipt={
    ...drained,
    schema:'evercraft.yard.saban-intent-drain.v1',
    broker_deployment_id:brokerDeploymentId,
    refreshed_safe_inventory_count:safeInventory.count,
    safe_inventory_receipt_hash:safeInventory.receipt_hash,
    unified_dispatch_enabled:dispatchQueued===true,
    content_hash_only:dispatchQueued===true,
    dispatch_cycle:dispatched?{
      considered_jobs:dispatched.considered_jobs,
      handoff_wait:dispatched.handoff_wait,
      held:dispatched.held,
      nodeseed_compute_offer_count:dispatched.nodeseed_compute_offer_count,
      unattended_nodeseed_only:dispatched.unattended_nodeseed_only,
    }:null,
    broker_route_receipt_hash:verifiedRoute?.receipt_hash||null,
    broker_route_scope:verifiedRoute?.scope||null,
    authority_boundary:'yard_operator',
    allocator_authority_exposed_to_saban:false,
    control_authority_exposed_to_saban:false,
    commercial_spend_usd:0,
  };
  fs.mkdirSync(sabanRoot,{recursive:true,mode:0o700});
  const tmp=path.join(sabanRoot,'yard-saban-intent-drain.json.tmp');
  fs.writeFileSync(tmp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,path.join(sabanRoot,'yard-saban-intent-drain.json'));
  return receipt;
}

async function main(){
  const receipt=await runYardSabanIntentDrain({
    yardStateDir:arg('--yard-state-dir',process.env.EVERCRAFT_YARD_STATE_DIR||''),
    sabanStateDir:arg('--saban-state-dir',process.env.SABAN_AMBIENT_STATE_DIR||''),
    brokerDeploymentId:arg('--broker-deployment-id',process.env.EVERCRAFT_REMOTE_BROKER_DEPLOYMENT_ID||''),
    maxIntents:Number(arg('--max-intents','16')),
    maxJobs:Number(arg('--max-jobs','4')),
    timeoutMs:Number(arg('--timeout-ms','10000')),
    dispatchQueued:process.argv.includes('--dispatch-content-hash-only'),
    allowLoopbackProof:process.argv.includes('--allow-loopback-proof'),
    brokerLoopbackOrigin:arg('--broker-loopback-origin',''),
    now:new Date(),
  });
  process.stdout.write(JSON.stringify(receipt)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.yard.saban-intent-drain-error.v1',
      error:error instanceof Error?error.message:String(error),
      allocator_authority_exposed_to_saban:false,
      commercial_spend_usd:0,
    })+'\n');
    process.exitCode=1;
  });
}
