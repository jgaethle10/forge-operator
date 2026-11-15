#!/usr/bin/env node
// PASSAGE-QA-001: genuine registered Saban assignments on an ephemeral local NodeSeed.
// No remote device, user identity, paid capacity, arbitrary shell task, or public deployment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startNodeSeed} from '../compute/node-seed.mjs';
import {PASSAGE_QA_SUITES} from './saban-qa-adapter.mjs';

const roles=Object.keys(PASSAGE_QA_SUITES);
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const outArg=process.argv.find(x=>x.startsWith('--out='));
const out=path.resolve(outArg?outArg.slice('--out='.length):path.join(os.tmpdir(),'passage-saban-qa-output'));
const runRoot=fs.mkdtempSync(path.join(os.tmpdir(),'passage-saban-nodeseed-'));
const token=randomBytes(32).toString('hex');
const startedAt=new Date().toISOString();
let seed=null;
async function request(route,{method='GET',body=null,tokenHeader=''}={}){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),155000);
 try{
  const response=await fetch(seed.endpoint+route,{
   method,signal:controller.signal,
   headers:{'content-type':'application/json',...(tokenHeader?{authorization:'Bearer '+tokenHeader}:{})},
   body:body===null?undefined:JSON.stringify(body),
  });
  const data=await response.json();
  if(!response.ok)throw Error('nodeseed_http_'+response.status+':'+String(data.error||'unknown'));
  return data;
 }finally{clearTimeout(timeout)}
}
const lease=async workload=>request('/v1/leases',{
 method:'POST',tokenHeader:token,
 body:{workload_class:workload,requested_ttl_ms:300000},
});
function assignment(role){
 return {
  agent_id:'passage-'+role,
  idempotency_key:'passage-'+role+'-'+String(process.env.GITHUB_SHA||'local').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,64),
  role,
  work:{kind:'qa_suite',key:role,source_file:null},
  item:{kind:'qa_suite',key:role,raw:{}},
 };
}
function report({rows=[],state,review=[],error=null}){
 const base={
  schema:'evercraft.passage.saban-qa-mission.v1',
  mission_key:'PASSAGE-QA-001',
  started_at:startedAt,completed_at:new Date().toISOString(),
  status:state,
  source_ref:process.env.GITHUB_SHA||null,
  executor:'saban.registered-worker.v1',
  node_execution:'ephemeral-loopback-nodeseed-on-github-runner',
  actual_remote_node001_or_node002:false,
  physical_device_tests:0,
  public_release_authorized:false,
  paid_capacity_used:false,
  scopes:roles,
  workers:rows,integrity_review:review,error,
 };
 return {...base,mission_sha256:sha(JSON.stringify(base))};
}
async function runWorker(role){
 const grant=await lease('saban.multiplier-assignment.v1');
 const body={
  lease_id:grant.lease_id,token:grant.token,
  workload_class:'saban.multiplier-assignment.v1',
  agent_id:'passage-'+role,checkpoint:{step:0,state:null},
  input:{software:'passage-qa',assignment:assignment(role)},
 };
 const response=await request('/v1/jobs',{method:'POST',body});
 const worker=response.result;
 if(worker?.schema!=='evercraft.saban.registered-worker-receipt.v1'||
    worker.software_id!=='passage-qa'||
    worker.result?.schema!=='evercraft.passage.saban-qa-worker.v1'||
    worker.result?.role!==role){
  throw Error('passage_saban_worker_contract_mismatch:'+role);
 }
 // Idempotent execution receipts are an enforced Saban runtime boundary.
 if(role==='signature_auditor'){
  const replay=await request('/v1/jobs',{method:'POST',body});
  if(replay.deduplicated!==true||
     replay.result?.result?.stdout_sha256!==worker.result.stdout_sha256){
   throw Error('passage_saban_idempotency_replay_failed');
  }
 }
 return {
  role,status:worker.result.status,
  suite_files:worker.result.suite_files,
  test_count:worker.result.test_count,
  passed_count:worker.result.passed_count,
  failed_count:worker.result.failed_count,
  stdout_sha256:worker.result.stdout_sha256,
  stderr_sha256:worker.result.stderr_sha256,
  node_execution_receipt_hash:response.receipt?.receipt_hash||null,
  worker_test_result_hash:sha(JSON.stringify(worker.result)),
  failure_excerpt:worker.result.failure_excerpt,
  idempotency_proven:role==='signature_auditor',
 };
}
async function reviewReceipt(row,grant){
 const raw=JSON.stringify(row);
 const response=await request('/v1/jobs',{
  method:'POST',
  body:{lease_id:grant.lease_id,token:grant.token,
   workload_class:'systemia.content-hash.v1',
   idempotency_key:'passage-evidence-'+row.role,
   input:{payload:{bytes_base64:Buffer.from(raw).toString('base64')}}
  },
 });
 const expected=sha(raw);
 if(response.result?.digest!==expected||
    response.worker_receipt?.registered_workload_only!==true){
  throw Error('passage_saban_evidence_hash_mismatch:'+row.role);
 }
 return {role:row.role,hash:expected,registered_nodeseed_worker:true,receipt_hash:response.worker_receipt.receipt_hash};
}
async function main(){
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 let rows=[],review=[];
 try{
  seed=await startNodeSeed({
   root:runRoot,nodeId:'passage-qa-ci-nodeseed',host:'127.0.0.1',port:0,
   allocatorToken:token,announce:false,zeroCost:true,
   placementLabels:['authorized-passage-qa'],failureDomain:'ci-sandbox',
  });
  const capacity=await request('/v1/capacity');
  for(const name of ['saban.multiplier-assignment.v1','systemia.content-hash.v1']){
   if(!capacity.supported_workloads?.includes(name))throw Error('nodeseed_required_workload_missing:'+name);
  }
  rows=await Promise.all(roles.map(runWorker));
  const evidenceLease=await lease('systemia.content-hash.v1');
  review=await Promise.all(rows.map(row=>reviewReceipt(row,evidenceLease)));
  const success=rows.length===roles.length&&review.length===roles.length&&
   rows.every(x=>x.status==='passed'&&x.test_count>0&&x.test_count===x.passed_count&&x.failed_count===0);
  const record=report({rows,review,state:success?'passed':'failed'});
  fs.writeFileSync(path.join(out,'mission.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({
   mission:record.mission_key,status:record.status,workers:rows.map(x=>({role:x.role,status:x.status,tests:x.test_count})),
   review_count:review.length,physical_device_tests:0,manifest:path.join(out,'mission.json'),
  }));
  if(!success)process.exitCode=1;
 }catch(e){
  const error=String(e?.message||e).slice(0,500);
  fs.writeFileSync(path.join(out,'mission.json'),JSON.stringify(report({rows,review,state:'failed',error}),null,2)+'\n',{mode:0o600});
  console.error('PASSAGE_SABAN_QA_FAILED:',error);
  process.exitCode=1;
 }finally{
  if(seed)await seed.close();
  fs.rmSync(runRoot,{recursive:true,force:true});
 }
}
await main();
