#!/usr/bin/env node
/**
 * Explicit one-shot, zero-authority broker canary against an existing NodeSeed.
 * --check is read-only. Live --run is HARD-DISABLED pending partial-deploy
 * cleanup/lease reconciliation verification. A future run would require an
 * operator-provided allocator credential. Never adopts the legacy deployment,
 * imports grants, enables timers, or authorizes remote devices.
 *
 * This is NOT a resident supervisor. No public route, device enrollment, or
 * unattended work is permitted by this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {YardOperator} from './operator.mjs';
import {
  loopbackFromReceipt,
  verifyCapacity,
  verifyBrokerHealth,
} from './remote-broker-resident.mjs';

const ROOT='/var/lib/evercraft/nodeseed';
const WORKLOAD='systemia.remote-capacity-broker.v1';
const RELEASE='32656150e433db42d00e0725507601dfa1b5641e';
const LEGACY='evercraft-remote-broker-resident.service';

export function assessCanaryGate({receipt,capacity,nodeActive,legacyActive,legacyEnabled}={}){
  const reasons=[];
  let origin=null;
  try{origin=loopbackFromReceipt(receipt)}catch{reasons.push('receipt_invalid')}
  try{verifyCapacity(receipt,capacity)}catch{reasons.push('capacity_not_compatible')}
  if(nodeActive!=='active')reasons.push('nodeseed_not_active');
  if(legacyActive!=='inactive')reasons.push('legacy_broker_not_inactive');
  if(legacyEnabled!=='disabled')reasons.push('legacy_broker_not_disabled');
  return {
    ok:reasons.length===0,
    reasons,
    local_capacity_origin:origin,
    new_deployment_required:true,
    authority_reuse_allowed:false,
    external_route_allowed:false,
    device_enrollment_allowed:false,
  };
}

function regularJson(file){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512*1024)
    throw Error('nodeseed_receipt_file_invalid');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function unitField(unit,field){
  return execFileSync('systemctl',['show',unit,'--value','-p',field],{
    encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']
  }).trim();
}
async function getJson(url){
  const response=await fetch(url,{
    headers:{accept:'application/json'},
    signal:AbortSignal.timeout(4000),
  });
  if(!response.ok)throw Error('local_health_unavailable');
  return await response.json();
}
async function probe(){
  const receipt=regularJson(path.join(ROOT,'nodeseed-receipt.json'));
  const origin=loopbackFromReceipt(receipt);
  const capacity=await getJson(origin+'/v1/capacity');
  const gate=assessCanaryGate({
    receipt,capacity,
    nodeActive:unitField('evercraft-nodeseed.service','ActiveState'),
    legacyActive:unitField(LEGACY,'ActiveState'),
    legacyEnabled:unitField(LEGACY,'UnitFileState'),
  });
  return {gate,origin,receipt};
}
function exactServiceUser(){
  if(typeof process.getuid!=='function')throw Error('unix_user_required');
  const id=Number(execFileSync('id',['-u','evercraft'],{
    encoding:'utf8',timeout:5000,
  }).trim());
  if(!Number.isInteger(id)||process.getuid()!==id)
    throw Error('must_run_as_evercraft_account');
}
function localBrokerUrl(value){
  const u=new URL(String(value||''));
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||
     !Number.isInteger(Number(u.port))||Number(u.port)<1||
     u.username||u.password||u.pathname!=='/'||u.search||u.hash)
    throw Error('broker_endpoint_not_loopback');
  return u.origin;
}
export function verifyCanaryOutcome({health,record,route}={}){
  verifyBrokerHealth(health,record);
  if(health.authorized_devices!==0||health.registered_nodes!==0||
     health.pending_enrollment_requests!==0)
    throw Error('unexpected_remote_authority_or_capacity');
  if(route?.ok!==false||route.state!=='public_route_unbound'||
     route.local_health_ok!==true)
    throw Error('route_boundary_unverified');
  return {
    deployment_receipt_bound:true,
    zero_authorized_devices:true,
    zero_remote_connections:true,
    no_public_route:true,
    instance_id_matches:true,
  };
}
async function canary(){
  // SAFETY HOLD: YardOperator.deployRelease may create a live resident service
  // before returning its deployment record. If it fails during late health
  // verification, this caller cannot reliably stop/release that service.
  // Until partial-deploy cleanup is journaled and proven fail-safe, no actual
  // physical broker mutation is allowed, even with approval and a token.
  throw Error('live_canary_blocked_pending_partial_deployment_cleanup_proof');
  exactServiceUser();
  if(process.env.EVERCRAFT_SHADOW_CANARY_APPROVED!=='YES')
    throw Error('explicit_canary_approval_required');
  const token=String(process.env.EVERCRAFT_ALLOCATOR_TOKEN||'');
  if(!token)throw Error('allocator_credential_required');

  const {gate,origin}=await probe();
  if(!gate.ok)throw Error('physical_canary_gate_blocked:'+gate.reasons.join(','));

  // No reuse of /remote-broker-resident, its Yard state, or any authority.
  const state=fs.mkdtempSync(path.join(ROOT,'.shadow-broker-canary-'));
  fs.chmodSync(state,0o700);
  const deployment='shadow-broker-canary-'+randomBytes(10).toString('hex');
  const yard=new YardOperator({stateDir:path.join(state,'yard')});
  let record=null;
  let observed=null;
  let stop=null;
  let failure=null;
  try{
    record=await yard.deployRelease({
      deploymentId:deployment,
      releaseRef:RELEASE,
      workloadClass:WORKLOAD,
      capacityEndpoint:origin,
      allocatorToken:token,
      input:{
        state_root:path.join(state,'broker'),
        port:0,
        authorized_devices:{},
      },
      rollbackTarget:'stop_loopback_canary_without_external_route',
      leaseTtlMs:60_000,
    });
    const endpoint=localBrokerUrl(record?.result?.local_url);
    const health=await getJson(endpoint+'/v1/remote/health');
    const route=await yard.verifyRoute(deployment);
    observed=verifyCanaryOutcome({health,record,route});
  }catch(error){
    failure=String(error?.message||'canary_failed').slice(0,160);
  }finally{
    if(record){
      try{
        stop=await yard.stopDeployment(deployment,{
          reason:'one_shot_shadow_canary_complete'
        });
      }catch{
        stop={ok:false,state:'manual_reconciliation_required'};
      }
    }
  }

  const ok=Boolean(observed&&!failure&&stop?.ok===true&&stop.state==='stopped');
  return {
    schema:'evercraft.yard.physical-shadow-broker-one-shot.v1',
    ok,
    evidence_root:state,
    deployment_id:deployment,
    checks:observed,
    stopped:stop?.ok===true&&stop.state==='stopped',
    cleanup_state:stop?.state||'no_deployment_record',
    reason:failure||(ok?null:'stop_or_deployment_outcome_requires_review'),
    physical_remote_device_executed:false,
    devices_authorized:0,
    legacy_authority_imported:false,
    old_deployment_mutated:false,
    public_edge_changed:false,
    timers_changed:false,
    manual_review_required:!ok,
  };
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  (async()=>{
    if(process.argv.length===3&&process.argv[2]==='--check'){
      const {gate}=await probe();
      console.log(JSON.stringify({
        schema:'evercraft.yard.physical-shadow-broker-preflight.v1',
        ...gate,
        local_capacity_origin:gate.local_capacity_origin?'<loopback>':null,
        source_release:RELEASE,
        read_only:true,
        services_changed:false,
        secrets_printed:false,
      },null,2));
      if(!gate.ok)process.exitCode=3;
    }else if(process.argv.length===4&&
             process.argv[2]==='--run'&&
             process.argv[3]==='--ack-one-shot-canary'){
      const result=await canary();
      console.log(JSON.stringify(result,null,2));
      if(!result.ok)process.exitCode=3;
    }else{
      throw Error('usage: shadow-broker-one-shot.mjs --check | --run --ack-one-shot-canary');
    }
  })().catch(error=>{
    console.error(JSON.stringify({
      schema:'evercraft.yard.physical-shadow-broker-error.v1',
      ok:false,
      reason:String(error?.message||'blocked').slice(0,160),
      manual_review_required:true,
      no_automatic_retry:true
    }));
    process.exitCode=3;
  });
}
