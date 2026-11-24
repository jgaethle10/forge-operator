// Trusted Systemia resident adapter for the existing Yard capacity broker.
// No credentials are returned or persisted by this module. No arbitrary workload.
import {transferCemeterySnapshot} from './snapshot-dispatch.mjs';
const NODE='evercraft-node002-nextgen';
const RESTORE='systemia.evermaps-cemetery-restore.v1';
const INGEST='systemia.evermaps-cemetery-ingest.v1';
const fail=code=>{throw Error(code)};
export async function openCemeteryJobRoute({yard,brokerDeploymentId,brokerOrigin,workload,fetchImpl=globalThis.fetch}={}){
 if(![RESTORE,INGEST].includes(workload)||!brokerDeploymentId||!yard)fail('cemetery_route_scope_denied');
 const u=new URL(brokerOrigin);
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)fail('cemetery_https_origin_required');
 const route=await yard.verifyPublicRoute(brokerDeploymentId,{origin:u.origin,allowLoopbackProof:false});
 if(route.origin!==u.origin||route.scope!=='public_https'||route.verified!==true)fail('cemetery_route_unverified');
 const inventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
 const target=(inventory.nodes||[]).find(n=>n.node_id===NODE);
 if(target?.connected!==true||target.capacity?.authorized!==true||target.capacity?.session_attestation_verified!==true||target.capacity?.zero_cost!==true||!target.device_fingerprint||target.capacity.device_fingerprint!==target.device_fingerprint||!target.capacity.supported_workloads?.includes(workload))fail('cemetery_capacity_not_admitted');
 const grant=await yard.remoteCapacityGrant(brokerDeploymentId,NODE,{allowLoopbackProof:false});
 if(grant.node_id!==NODE||grant.device_fingerprint!==target.device_fingerprint||grant.broker_origin!==u.origin||grant.capacity_endpoint!==u.origin+'/nodes/'+NODE||grant.route_scope!==route.scope||!grant.allocator_token||!grant.control_grant_receipt_hash)fail('cemetery_grant_unverified');
 async function post(suffix,body,bearer){
  const response=await fetchImpl(grant.capacity_endpoint+suffix,{method:'POST',headers:{'content-type':'application/json',...(bearer?{authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(40000)});
  return {status:response.status,body:await response.json()};
 }
 return {async sendJob(job){
  if(job?.node_id!==NODE||job.workload_class!==workload||!/^[A-Za-z0-9._:-]{12,128}$/.test(job.idempotency_key||''))fail('cemetery_job_scope_denied');
  const l=await post('/v1/leases',{workload_class:workload,requested_ttl_ms:120000},grant.allocator_token);
  const lease=l.body;
  if(l.status!==201||lease.workload_class!==workload||!lease.lease_id||!lease.token)fail('cemetery_lease_denied');
  let result;
  try{
   const r=await post('/v1/jobs',{lease_id:lease.lease_id,token:lease.token,workload_class:workload,idempotency_key:job.idempotency_key,input:{idempotency_key:job.idempotency_key,payload:job.payload}});
   if(r.status!==200||r.body.ok!==true||r.body.node_id!==NODE||r.body.workload_class!==workload||r.body.result?.node_id!==NODE||!/^sha256:[a-f0-9]{64}$/.test(r.body.receipt?.receipt_hash||''))fail('cemetery_execution_unverified');
   result=r.body.result;
  }finally{
   const released=await post('/v1/leases/'+encodeURIComponent(lease.lease_id)+'/release',{token:lease.token});
   if(released.status!==200)fail('cemetery_lease_release_unconfirmed');
  }
  return result;
 }};
}
export async function migrateCemeteryThroughYard({snapshot,sourceWriterFrozen=false,confidentialTransportApproved=false,...route}={}){
 // HTTPS route proof alone does not certify the broker-to-worker hop or log custody.
 if(sourceWriterFrozen!==true||confidentialTransportApproved!==true)fail('cemetery_migration_authority_required');
 const {sendJob}=await openCemeteryJobRoute({...route,workload:RESTORE});
 return transferCemeterySnapshot({snapshot,sendJob,authorizedNode:NODE,sourceWriterFrozen,confidentialRouteVerified:true});
}
