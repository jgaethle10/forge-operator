#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

import {YardOperator} from './operator.mjs';
import {readSplitIdentityRequests,publishSplitIdentityOutcome} from '../saban/split-identity-handoff.mjs';
import {verifyNodeSeedWorkerCompletion} from '../saban/nodeseed-worker-completion-verifier.mjs';
import {publishSplitIdentityCapacity} from '../saban/split-identity-capacity.mjs';

// Yard-only execution consumer. No Saban state root is opened by this process.
// Claiming is durable BEFORE a remote job can be sent. A restart after a claim
// but before a verified outcome must HOLD the job; it must never redispatch.
const MODULE_FILE=fileURLToPath(import.meta.url);
const WORKLOAD='systemia.content-hash.v1';
const ID=/^nsi-[a-f0-9]{32}$/;

const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
function requireOk(value,code){if(!value)throw new Error('yard_split_'+code);}
function boundedPortOrigin(origin){
  const raw=String(origin||'');
  const u=new URL(raw);
  requireOk(u.origin===raw&&u.protocol==='http:'&&
    u.hostname==='127.0.0.1'&&Number(u.port)>=1&&
    u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password,
    'explicit_loopback_origin_required');
  return raw;
}
function claimDir(journalRoot){
  requireOk(journalRoot,'journal_root_required');
  const root=path.resolve(journalRoot);
  if(!fs.existsSync(root))fs.mkdirSync(root,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(root);
  requireOk(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,
    'journal_directory_must_be_private');
  return root;
}
function fsyncDirectory(directory){
  const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
  try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
// Atomic inter-process exclusion. If the process is killed, the directory
// remains and activation is BLOCKED until an operator reconciles journaled
// requests and explicitly clears the stale lock. Never steal a stale lock.
function lockCycle(journal){
  const lock=path.join(journal,'.split-consumer-active');
  try{
    fs.mkdirSync(lock,{mode:0o700});
  }catch(error){
    if(error.code==='EEXIST')throw new Error('yard_split_cycle_active_or_crashed_requires_review');
    throw error;
  }
  try{fsyncDirectory(journal);}
  catch(error){fs.rmdirSync(lock);throw error;}
  return ()=>{
    fs.rmdirSync(lock);
    fsyncDirectory(journal);
  };
}
function claimRequest(root,request){
  requireOk(ID.test(request.intent_id),'intent_id_invalid');
  const target=path.join(claimDir(root),request.intent_id+'.json');
  const body={
    schema:'evercraft.yard.split-identity-claim.v1',
    intent_id:request.intent_id,
    request_hash:request.message_hash,
    claimed_at:new Date().toISOString(),
    job_dispatch_may_have_occurred:true,
    no_auto_retry:true,
  };
  let fd;
  try{
    fd=fs.openSync(target,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);
  }catch(error){
    if(error.code!=='EEXIST')throw error;
    // A pre-existing claim means this request may have been sent before a
    // crash or timeout. Treat it as uncertain even if the prior run never
    // reached the worker. No broker call on this path.
    const existing=fs.lstatSync(target);
    requireOk(existing.isFile()&&!existing.isSymbolicLink(),
      'existing_claim_invalid');
    return false;
  }
  try{
    fs.writeFileSync(fd,JSON.stringify(body)+'\n');
    fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  // fsyncing only the file is insufficient after power loss: the directory
  // entry must also be durable before any remote job can be submitted.
  fsyncDirectory(root);
  return true;
}
async function post(url,body,token='',timeoutMs=10000){
  const response=await fetch(url,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      ...(token?{authorization:'Bearer '+token}:{}),
    },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(timeoutMs),
  });
  const data=await response.json().catch(()=>({}));
  requireOk(response.ok,'remote_http_'+response.status);
  return data;
}
function selectedNode(inventory,request){
  const selected=(inventory?.nodes||[]).find(x=>x.node_id===request.node_id);
  const cap=selected?.capacity;
  requireOk(selected?.connected===true&&
    cap?.authorized===true&&
    cap?.session_attestation_verified===true&&
    cap?.zero_cost===true&&
    selected.device_fingerprint&&
    cap.device_fingerprint===selected.device_fingerprint&&
    Array.isArray(cap.supported_workloads)&&
    cap.supported_workloads.includes(WORKLOAD),
    'selected_node_ineligible');
  return selected;
}
async function executeRequest({request,yard,brokerDeploymentId,brokerOrigin,route,
  timeoutMs}){
  const inventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
  const node=selectedNode(inventory,request);
  const grant=await yard.remoteCapacityGrant(brokerDeploymentId,request.node_id,{
    allowLoopbackProof:true,
  });
  requireOk(grant.node_id===request.node_id&&
    grant.device_fingerprint===node.device_fingerprint&&
    grant.broker_origin===brokerOrigin&&
    grant.capacity_endpoint===brokerOrigin+'/nodes/'+encodeURIComponent(request.node_id)&&
    grant.route_scope==='loopback_proof'&&
    grant.public_route_receipt_hash===route.receipt_hash&&
    grant.allocator_token,
    'control_grant_identity_mismatch');
  let lease;
  try{
    lease=await post(grant.capacity_endpoint+'/v1/leases',{
      workload_class:WORKLOAD,requested_ttl_ms:120000,
    },grant.allocator_token,timeoutMs);
    requireOk(lease.lease_id&&lease.token&&lease.workload_class===WORKLOAD,
      'invalid_lease_response');
    const response=await post(grant.capacity_endpoint+'/v1/jobs',{
      lease_id:lease.lease_id,
      token:lease.token,
      workload_class:WORKLOAD,
      idempotency_key:request.idempotency_key,
      input:{payload:request.payload},
    },'',timeoutMs);
    verifyNodeSeedWorkerCompletion({
      response,nodeId:request.node_id,
      workloadClass:WORKLOAD,
      idempotencyKey:request.idempotency_key,
      payload:request.payload,
    });
    return response;
  }finally{
    if(lease?.lease_id&&lease?.token){
      await post(grant.capacity_endpoint+'/v1/leases/'+encodeURIComponent(lease.lease_id)+'/release',
        {token:lease.token},'',timeoutMs).catch(()=>null);
    }
  }
}

export async function runYardSplitIdentityConsumeOnce({
  yardStateDir,mailboxRoot,journalRoot,brokerDeploymentId,
  brokerLoopbackOrigin,maxRequests=4,timeoutMs=10000,
  publishCapacity=false,yardOperator=null,
}={}){
  requireOk(yardStateDir,'yard_state_dir_required');
  requireOk(mailboxRoot,'mailbox_root_required');
  requireOk(brokerDeploymentId,'broker_deployment_id_required');
  const origin=boundedPortOrigin(brokerLoopbackOrigin);
  const journal=claimDir(journalRoot);
  const releaseLock=lockCycle(journal);
  try{
  const yard=yardOperator||new YardOperator({stateDir:path.resolve(yardStateDir)});

  // Every cycle verifies the existing deployment identity, not just a
  // loopback HTTP 200 or an assumed host/port.
  const route=await yard.verifyPublicRoute(brokerDeploymentId,{
    origin,allowLoopbackProof:true,
  });
  requireOk(route.scope==='loopback_proof'&&route.origin===origin&&
    route.verification==='instance_and_deployment_receipt_match'&&
    /^sha256:[a-f0-9]{64}$/.test(String(route.receipt_hash||'')),
    'broker_identity_invalid');

  // This publication is a fresh authorized/attested capacity *snapshot*
  // without grants or tokens. It is never written into Saban private state.
  const capacity=publishCapacity===true
    ? publishSplitIdentityCapacity({
        mailboxRoot,inventory:await yard.listRemoteCapacityNodes(brokerDeploymentId),
      })
    : null;

  const rows=[];
  const pending=readSplitIdentityRequests({
    mailboxRoot,maxRequests:Math.min(4,Math.max(1,Math.floor(Number(maxRequests)||4))),
  });
  for(const request of pending){
    const claimed=claimRequest(journal,request);
    if(!claimed){
      const outcome=publishSplitIdentityOutcome({
        mailboxRoot,request,holdReason:'manual_reconciliation_required',
      });
      rows.push({intent_id:request.intent_id,status:outcome.status,
        reason:'previous_claim_requires_review'});
      continue;
    }
    try{
      const response=await executeRequest({
        request,yard,brokerDeploymentId,brokerOrigin:origin,route,timeoutMs,
      });
      const outcome=publishSplitIdentityOutcome({mailboxRoot,request,response});
      rows.push({intent_id:request.intent_id,status:outcome.status});
    }catch(_error){
      // A grant/lease/worker error after a durable claim is conservatively
      // treated as ambiguous. Never record secrets or exception bodies.
      const outcome=publishSplitIdentityOutcome({
        mailboxRoot,request,holdReason:'remote_job_outcome_unknown',
      });
      rows.push({intent_id:request.intent_id,status:outcome.status,
        reason:'unknown_remote_outcome'});
    }
  }
  return {
    schema:'evercraft.yard.split-identity-consumer-cycle.v1',
    considered:pending.length,
    completed:rows.filter(x=>x.status==='completed').length,
    verification_hold:rows.filter(x=>x.status==='verification_hold').length,
    rows,
    broker_route_receipt_hash:route.receipt_hash,
    safe_capacity_published:capacity!==null,
    safe_capacity_receipt_hash:capacity?.inventory_receipt_hash||null,
    authority_material_persisted:false,
    saban_private_state_read:false,
    commercial_spend_usd:0,
    generated_at:new Date().toISOString(),
  };
  }finally{
    releaseLock();
  }
}
async function main(){
  const result=await runYardSplitIdentityConsumeOnce({
    yardStateDir:arg('--yard-state-dir',process.env.EVERCRAFT_YARD_STATE_DIR||''),
    mailboxRoot:arg('--mailbox-root',''),
    journalRoot:arg('--journal-root',''),
    brokerDeploymentId:arg('--broker-deployment-id',''),
    brokerLoopbackOrigin:arg('--broker-loopback-origin',''),
    maxRequests:Number(arg('--max-requests','4')),
    timeoutMs:Number(arg('--timeout-ms','10000')),
    publishCapacity:process.argv.includes('--publish-safe-capacity'),
  });
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(()=>{
    process.stderr.write(JSON.stringify({
      ok:false,schema:'evercraft.yard.split-identity-consumer-error.v1',
      error:'identity_or_mailbox_preflight_failed',authority_material_persisted:false,
    })+'\n');
    process.exitCode=1;
  });
}
