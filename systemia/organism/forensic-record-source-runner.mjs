#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function releaseRef(){
  const explicit=String(process.env.EVERCRAFT_RELEASE_REF||'').trim();
  if(/^[a-f0-9]{40}$/i.test(explicit)) return explicit;
  try{
    const value=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if(/^[a-f0-9]{40}$/i.test(value)) return value;
  }catch{}
  throw new Error('immutable_release_ref_unavailable');
}

const sharedStateRoot=path.resolve(
  process.env.EVERCRAFT_PUBLIC_EDGE_STATE_DIR||
  'artifacts/public-edge-activation-watch/runtime'
);
const yardState=path.resolve(arg('--yard-state',path.join(sharedStateRoot,'yard')));
const intervalMs=Math.max(5000,Number(arg('--interval-ms','60000')));
const leaseTtlMs=Math.max(60000,Number(arg('--lease-ttl-ms','3600000')));
const renewEveryMs=Math.max(30000,Number(arg('--renew-every-ms','1800000')));
const release=releaseRef();
const deploymentId='forensic-record-runtime';
const edgeDeploymentId='evercraft-public-edge';
let inFlight=false;
let closing=false;
let lastState='';
let timer=null;

function emit(payload){
  console.log(JSON.stringify({
    schema:'evercraft.forensic-record.source-runner.v1',
    owner:'systemia',
    runtime:'Evercraft Compute',
    private_source_runtime:true,
    public_route_bound:false,
    base44_runtime_required:false,
    founder_login_required:false,
    allocator_reentry_required:false,
    ...payload,
  }));
}

function secretsReady(){
  const machine=String(process.env.SYSTEMIA_MACHINE_KEY||'').trim();
  const ingest=String(process.env.FORENSIC_RECORD_INGEST_TOKEN||'').trim();
  if(!machine) return {ok:false,reason:'held_waiting_for_systemia_machine_key'};
  if(!ingest) return {ok:false,reason:'held_waiting_for_forensic_ingest_token'};
  return {ok:true,reason:null};
}

async function reconcile(){
  if(closing||inFlight) return;
  inFlight=true;
  try{
    const secretGate=secretsReady();
    if(!secretGate.ok){
      if(lastState!==secretGate.reason){
        lastState=secretGate.reason;
        emit({ok:true,state:lastState,retrying:true});
      }
      return;
    }

    const yard=new YardOperator({stateDir:yardState});
    const edge=yard.deploymentStatus(edgeDeploymentId);
    if(!edge||edge.state!=='ready'){
      if(lastState!=='held_waiting_for_public_edge_capacity'){
        lastState='held_waiting_for_public_edge_capacity';
        emit({ok:true,state:lastState,retrying:true});
      }
      return;
    }

    let record=yard.deploymentStatus(deploymentId);
    let result=null;
    if(record?.state==='ready'){
      if(record.receipt?.capacity_node_id!==edge.receipt?.capacity_node_id){
        throw new Error('forensic_runtime_and_public_edge_node_drift');
      }
      const renewal=await yard.renewDeploymentLease(deploymentId,{ttlMs:leaseTtlMs});
      yard.startLeaseKeeper(deploymentId,{ttlMs:leaseTtlMs,renewEveryMs});
      result={
        action:'healthy',
        deployment_receipt:record.receipt?.receipt_hash||null,
        local_url:record.result?.local_url||null,
        instance_id:record.result?.instance_id||null,
        lease_renewal_receipt:renewal.receipt_hash||null,
      };
    }else{
      record=await yard.deploySiblingRelease({
        sourceDeploymentId:edgeDeploymentId,
        deploymentId,
        releaseRef:release,
        workloadClass:'systemia.forensic-record-runtime.v1',
        input:{},
        rollbackTarget:'systemia:forensic-record-runtime-previous',
        leaseTtlMs,
      });
      yard.startLeaseKeeper(deploymentId,{ttlMs:leaseTtlMs,renewEveryMs});
      result={
        action:'provisioned',
        deployment_receipt:record.receipt?.receipt_hash||null,
        local_url:record.result?.local_url||null,
        instance_id:record.result?.instance_id||null,
      };
    }

    if(!String(result.local_url||'').startsWith('http://127.0.0.1:')){
      throw new Error('forensic_runtime_must_remain_private_loopback_before_public_cutover');
    }
    lastState=result.action;
    emit({
      ok:true,
      state:result.action,
      local_runtime_state:'private_loopback_ready',
      deployment_receipt:result.deployment_receipt,
      instance_id:result.instance_id,
      lease_renewal_receipt:result.lease_renewal_receipt||null,
      public_cutover_authorized:false,
      legacy_retirement_authorized:false,
      retrying:false,
    });
  }catch(error){
    const state='held_reconcile_failed';
    if(lastState!==state){
      lastState=state;
      emit({
        ok:false,
        state,
        error:error instanceof Error?error.message:String(error),
        public_cutover_authorized:false,
        legacy_retirement_authorized:false,
        retrying:true,
      });
    }
  }finally{
    inFlight=false;
  }
}

await reconcile();
timer=setInterval(()=>reconcile().catch(()=>{}),intervalMs);
timer.unref?.();
const keepAlive=setInterval(()=>{},60000);

function shutdown(){
  if(closing) return;
  closing=true;
  if(timer) clearInterval(timer);
  clearInterval(keepAlive);
  emit({ok:true,state:'stopped',managed_runtime_left_running:true,retrying:false});
  process.exit(0);
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
