// Explicit operator-local NodeSeed QA only. No external networks, hidden pairing, or physical attestations.
import {randomBytes,createHash} from 'node:crypto';
import {assessPortfolioQaDeviceCapacity} from './qa-device-admission.mjs';
import {fingerprintPublicKey,verifyNodeAttestation} from '../compute/device-identity.mjs';
import {PORTFOLIO_QA_SUITES} from './product-qa-adapter.mjs';

const ALLOWED=new Set(Object.keys(PORTFOLIO_QA_SUITES));
const SHA=/^(?:sha256:)?[a-f0-9]{64}$/i;
const hash=x=>'sha256:'+createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');

export function normalizeLocalQaEndpoint(value){
 let url;
 try{url=new URL(String(value||''))}catch{throw Error('qa_endpoint_invalid')}
 const hosts=new Set(['127.0.0.1','localhost','[::1]']);
 if(url.protocol!=='http:'||!hosts.has(url.hostname)||url.username||url.password||
    !url.port||url.pathname!=='/'||url.search||url.hash){
  throw Error('qa_endpoint_must_be_explicit_http_loopback');
 }
 return url.origin;
}
function nonSensitiveSummary({code,details=[]}={}){
 return {schema:'evercraft.saban.qa-local-probe.v1',state:'held',release_attested:false,
   physical_hardware_independently_verified:false,reason:code||'unknown',details};
}
async function jsonRequest(fetchImpl,endpoint,route,{body,authorization,method='GET',timeoutMs=155000}={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(endpoint+route,{
   method,signal:controller.signal,redirect:'error',
   headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),
     ...(authorization?{authorization:'Bearer '+authorization}:{})},
   body:body===undefined?undefined:JSON.stringify(body),
  });
  if(!response.ok)throw Error('qa_node_http_'+response.status);
  const raw=await response.text();
  if(Buffer.byteLength(raw)>1024*1024)throw Error('qa_node_response_too_large');
  return JSON.parse(raw);
 }finally{clearTimeout(timer)}
}
function sortedJson(values){
 return JSON.stringify([...values].map(String).sort());
}
export async function probeOperatorQaNode({
 endpoint,expectedNodeId,expectedFingerprint,operatorApproved=false,allocatorToken='',
 now=new Date(),fetchImpl=fetch,nonce=randomBytes(24).toString('hex'),
}={}){
 const origin=normalizeLocalQaEndpoint(endpoint);
 if(!operatorApproved)return {ok:false,origin,report:nonSensitiveSummary({code:'operator_approval_required'})};
 if(!SHA.test(String(expectedFingerprint||''))||!allocatorToken||!expectedNodeId){
  return {ok:false,origin,report:nonSensitiveSummary({code:'trusted_pin_token_and_node_required'})};
 }
 let capacity;
 try{capacity=await jsonRequest(fetchImpl,origin,'/v1/capacity',{timeoutMs:10000})}
 catch{return {ok:false,origin,report:nonSensitiveSummary({code:'capacity_request_failed'})}}
 const base=assessPortfolioQaDeviceCapacity({
  capacity,expectedNodeId,expectedFingerprint,operatorApproved,now,
 });
 if(base.state!=='candidate_for_private_pairing'){
  return {ok:false,origin,report:nonSensitiveSummary({code:'device_capacity_held',details:base.reasons})};
 }
 let response;
 try{
  response=await jsonRequest(fetchImpl,origin,'/v1/attest',{
   method:'POST',authorization:allocatorToken,body:{nonce},timeoutMs:10000
  });
 }catch{return {ok:false,origin,report:nonSensitiveSummary({code:'attestation_request_failed'})}}
 let verified;
 try{
  verified=verifyNodeAttestation({
   attestation:response.attestation,expectedNonce:nonce,expectedNodeId,now,maxAgeMs:60000,
  });
 }catch{return {ok:false,origin,report:nonSensitiveSummary({code:'attestation_invalid'})}}
 if(verified?.ok!==true){
  return {ok:false,origin,report:nonSensitiveSummary({code:'attestation_invalid',details:[verified?.reason||'unknown']})};
 }
 const attestation=response.attestation;
 const expectedPin='sha256:'+String(expectedFingerprint).toLowerCase().replace(/^sha256:/,'');
 if(fingerprintPublicKey(attestation.public_key_pem)!==expectedPin||
    verified.device_fingerprint!==expectedPin||
    verified.device_fingerprint!==capacity.device_fingerprint){
  return {ok:false,origin,report:nonSensitiveSummary({code:'attested_key_not_pinned'})};
 }
 const actualWorkloads=Array.isArray(capacity.supported_workloads)?capacity.supported_workloads:[];
 const expectedWorkloadsHash=hash(sortedJson(actualWorkloads));
 if(attestation.statement?.supported_workloads_hash!==expectedWorkloadsHash){
  return {ok:false,origin,report:nonSensitiveSummary({code:'attested_workload_inventory_mismatch'})};
 }
 const capLabels=[...new Set(capacity.placement_labels||[])].map(String).sort();
 if(sortedJson(capLabels)!==sortedJson(verified.placement_labels||[])){
  return {ok:false,origin,report:nonSensitiveSummary({code:'attested_placement_mismatch'})};
 }
 const record={
  schema:'evercraft.saban.qa-local-probe.v1',
  state:'signed_loopback_candidate',
  node_id:expectedNodeId,
  signed_nonce_checked:true,
  pinned_key_verified:true,
  workload_inventory_verified:true,
  registered_worker_capability:true,
  zero_cost_advertised:true,
  release_attested:false,
  physical_hardware_independently_verified:false,
  authentication_scope:'loopback_with_operator_supplied_allocator_token',
  attestation_observed_at:verified.observed_at,
  // A software identity key can be copied, so this is NOT a hardware-backed attestation.
  limitations:'Software-key attestation, operator-local process only; release SHA and physical machine identity not independently attested',
 };
 return {ok:true,origin,capacity,report:{...record,receipt_hash:hash(record)}};
}
export async function executeOperatorLocalQa({
 endpoint,expectedNodeId,expectedFingerprint,operatorApproved=false,allocatorToken='',
 roles=['work_saban_checker'],execute=false,now=new Date(),fetchImpl=fetch
}={}){
 const probe=await probeOperatorQaNode({
  endpoint,expectedNodeId,expectedFingerprint,operatorApproved,allocatorToken,now,fetchImpl
 });
 if(!probe.ok)return probe.report;
 if(execute!==true)return probe.report;
 if(!Array.isArray(roles)||roles.length===0||roles.length>Object.keys(PORTFOLIO_QA_SUITES).length||
    roles.some(role=>!ALLOWED.has(role))||new Set(roles).size!==roles.length){
  throw Error('qa_roles_not_allowlisted');
 }
 const origin=probe.origin;
 const request=(route,params={})=>jsonRequest(fetchImpl,origin,route,params);
 const runId=randomBytes(12).toString('hex');
 const rows=[],reviews=[];
 for(const role of roles){
  let lease;
  try{
   lease=await request('/v1/leases',{
    method:'POST',authorization:allocatorToken,body:{
     workload_class:'saban.multiplier-assignment.v1',requested_ttl_ms:300000,
    },timeoutMs:10000,
   });
   const input={
    lease_id:lease.lease_id,token:lease.token,
    workload_class:'saban.multiplier-assignment.v1',
    agent_id:'portfolio-'+role,checkpoint:{step:0,state:null},
    input:{software:'portfolio-qa',assignment:{
     agent_id:'portfolio-'+role,idempotency_key:'operator-local-'+runId+'-'+role,
     role,work:{kind:'qa_suite',key:role,source_file:null},
     item:{kind:'qa_suite',key:role,raw:{}},
    }},
   };
   const result=await request('/v1/jobs',{method:'POST',body:input});
   const worker=result.result;
   const execution=worker?.result;
   const valid=worker?.schema==='evercraft.saban.registered-worker-receipt.v1'&&
    worker.software_id==='portfolio-qa'&&worker.role===role&&
    execution?.schema==='evercraft.saban.portfolio-qa-worker.v1'&&
    execution.role===role&&execution.status==='passed'&&
    execution.test_count>0&&execution.passed_count===execution.test_count&&
    execution.failed_count===0&&execution.exit_code===0&&
    JSON.stringify(execution.suite_files)===JSON.stringify(PORTFOLIO_QA_SUITES[role])&&
    result.node_id===expectedNodeId&&!!result.receipt?.receipt_hash;
   if(!valid)throw Error('qa_worker_result_failed_or_mismatched');
   rows.push({
    role,status:'passed',test_count:execution.test_count,
    suite_files:execution.suite_files,
    output_sha256:execution.stdout_sha256,
    node_receipt_hash:result.receipt.receipt_hash,
    worker_result_sha256:hash(JSON.stringify(execution)),
   });
  }catch(e){
   return {schema:'evercraft.saban.qa-local-execution.v1',state:'failed',
    cause:String(e?.message||e).slice(0,120),probe:probe.report,workers:rows,
    physical_hardware_independently_verified:false};
  }
 }
 // A separate registered content-hash operation checks every worker receipt on the SAME local NodeSeed.
 try{
  const lease=await request('/v1/leases',{
   method:'POST',authorization:allocatorToken,body:{
    workload_class:'systemia.content-hash.v1',requested_ttl_ms:300000,
   },timeoutMs:10000,
  });
  for(const row of rows){
   const raw=JSON.stringify(row);
   const checked=await request('/v1/jobs',{method:'POST',body:{
    lease_id:lease.lease_id,token:lease.token,workload_class:'systemia.content-hash.v1',
    idempotency_key:'operator-local-evidence-'+runId+'-'+row.role,
    input:{payload:{bytes_base64:Buffer.from(raw).toString('base64')}},
   }});
   if(checked.result?.digest!==hash(raw)||checked.worker_receipt?.registered_workload_only!==true||
      checked.node_id!==expectedNodeId)throw Error('qa_local_receipt_integrity_failure');
   reviews.push({role:row.role,registered_worker_hash_checked:true,digest:checked.result.digest});
  }
 }catch(e){
  return {schema:'evercraft.saban.qa-local-execution.v1',state:'failed',
   cause:String(e?.message||e).slice(0,120),probe:probe.report,workers:rows,
   physical_hardware_independently_verified:false};
 }
 const summary={
  schema:'evercraft.saban.qa-local-execution.v1',
  state:'passed_local_qa_not_hardware_certified',
  execution:'operator_local_loopback_existing_nodeseed',
  node_id:expectedNodeId,
  worker_count:rows.length,
  tests_passed:rows.reduce((a,x)=>a+x.test_count,0),
  workers:rows,integrity_reviews:reviews,
  probe:probe.report,
  physical_hardware_independently_verified:false,
  node_release_sha_independently_attested:false,
  publicly_deployed:false,
 };
 return {...summary,receipt_hash:hash(summary)};
}
