// Systemia/Yard -> existing authorized Penguin broker -> Node002
// An explicit registered workload ONLY. No arbitrary shell or URLs in the payload.
// Never exports allocator token, lease token, raw learner/model text or personal data.
import {createHash,randomUUID} from 'node:crypto';
import {CLASSROOM_NODE_WORKLOAD} from './node002-compute-probe.mjs';

const NODE='evercraft-node002-nextgen';
const SCHEMA='evercraft.classroom.nextgen-probe-request.v1';
const digest=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fail(reason){throw Error(reason)}
function validOrigin(value,allowLoopback){
 const u=new URL(value);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('classroom_broker_origin_invalid');
 if(allowLoopback===true){
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port)
   fail('classroom_proof_requires_local_broker');
 }else if(u.protocol!=='https:')fail('classroom_verified_https_required');
 return u.origin;
}
async function post(fetchImpl,url,body,bearer=''){
 const response=await fetchImpl(url,{
  method:'POST',
  headers:{'content-type':'application/json',...(bearer?{authorization:'Bearer '+bearer}:{})},
  body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(40000)
 });
 return {status:response.status,body:await response.json().catch(()=>({}))};
}
export async function dispatchClassroomNode002Probe({
 yard,brokerDeploymentId,brokerOrigin,
 operation='readiness',allowLoopbackProof=false,
 fetchImpl=globalThis.fetch,newId=()=>randomUUID(),
}={}){
 if(!yard||typeof yard.verifyPublicRoute!=='function'||
  typeof yard.listRemoteCapacityNodes!=='function'||
  typeof yard.remoteCapacityGrant!=='function')fail('classroom_canonical_yard_required');
 if(typeof brokerDeploymentId!=='string'||!brokerDeploymentId.trim())fail('classroom_broker_deployment_required');
 if(!['readiness','synthetic_turn'].includes(operation))fail('classroom_operation_not_allowed');
 const origin=validOrigin(brokerOrigin,allowLoopbackProof);
 const route=await yard.verifyPublicRoute(brokerDeploymentId,{
  origin,allowLoopbackProof:allowLoopbackProof===true
 });
 if(route.origin!==origin || (allowLoopbackProof===true
  ?route.scope!=='loopback_proof'||route.verification!=='instance_and_deployment_receipt_match'
  :route.scope!=='public_https'||route.verified!==true))
  fail('classroom_broker_route_unverified');
 const inventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
 const target=(inventory.nodes||[]).find(n=>n.node_id===NODE);
 if(target?.connected!==true || target.capacity?.authorized!==true||
  target.capacity?.session_attestation_verified!==true||
  target.capacity?.zero_cost!==true||
  !target.capacity?.supported_workloads?.includes(CLASSROOM_NODE_WORKLOAD))
  fail('classroom_node002_capacity_not_authorized');
 const grant=await yard.remoteCapacityGrant(brokerDeploymentId,NODE,{
  allowLoopbackProof:allowLoopbackProof===true
 });
 if(grant.node_id!==NODE||grant.broker_origin!==origin||
   grant.capacity_endpoint!==origin+'/nodes/'+NODE||
   !grant.allocator_token||!grant.control_grant_receipt_hash||
   grant.route_scope!==route.scope)
  fail('classroom_control_grant_unverified');

 let lease=null;
 let leaseReleaseStatus='not_acquired';
 let result=null,error=null;
 try{
  const l=await post(fetchImpl,grant.capacity_endpoint+'/v1/leases',{
   workload_class:CLASSROOM_NODE_WORKLOAD,requested_ttl_ms:120000
  },grant.allocator_token);
  if(l.status!==201||l.body.workload_class!==CLASSROOM_NODE_WORKLOAD||
    !l.body.lease_id||!l.body.token)fail('classroom_exact_lease_denied');
  lease=l.body;
  const key='classroom-node002-'+newId();
  if(!/^classroom-node002-[0-9a-f-]{20,64}$/i.test(key))fail('classroom_job_identity_invalid');
  const req={schema:SCHEMA,operation};
  const executed=await post(fetchImpl,grant.capacity_endpoint+'/v1/jobs',{
   lease_id:lease.lease_id,token:lease.token,
   workload_class:CLASSROOM_NODE_WORKLOAD,idempotency_key:key,
   input:{idempotency_key:key,payload:req}
  });
  if(executed.status!==200||
     executed.body.ok!==true||executed.body.node_id!==NODE||
     executed.body.workload_class!==CLASSROOM_NODE_WORKLOAD||
     executed.body.worker_receipt?.registered_workload_only!==true||
     executed.body.worker_receipt?.node_id!==NODE||
     executed.body.worker_receipt?.idempotency_key!==key||
     !/^sha256:[a-f0-9]{64}$/.test(executed.body.worker_receipt?.receipt_hash||'')||
     !/^sha256:[a-f0-9]{64}$/.test(executed.body.receipt?.receipt_hash||'')||
     executed.body.result?.node_id!==NODE||
     executed.body.result?.provider!=='llama.cpp'||
     executed.body.result?.child_data_used!==false||
     executed.body.result?.youth_safety_certified!==false)
    fail('classroom_execution_receipt_unverified');
  const evidence=executed.body.result;
  result={
   schema:'evercraft.classroom.remote-dispatch-receipt.v1',
   status:'SCOPED_NODE002_MODEL_PROBE_OBSERVED',
   broker_scope:route.scope,broker_deployment_id:brokerDeploymentId,
   node_id:NODE,workload_class:CLASSROOM_NODE_WORKLOAD,
   operation,worker_receipt_hash:executed.body.worker_receipt.receipt_hash,
   compute_receipt_hash:executed.body.receipt.receipt_hash,
   control_grant_receipt_hash:grant.control_grant_receipt_hash,
   model_response_observed:evidence.model_response_observed===true,
   model_id_sha256:evidence.model_id_sha256||null,
   model_response_sha256:evidence.model_response_sha256||null,
   no_arbitrary_execution:true,no_child_data:true,
   model_process_independently_attested:false,
   youth_safety_certified:false,public_tutor_live:false,
   observation_only:true
  };
 }catch(e){error=e}
 finally{
  if(lease){
   try{
    const release=await post(fetchImpl,grant.capacity_endpoint+
     '/v1/leases/'+encodeURIComponent(lease.lease_id)+'/release',{
      token:lease.token
     });
    leaseReleaseStatus=release.status===200?'confirmed':'unconfirmed';
   }catch{leaseReleaseStatus='unconfirmed'}
  }
 }
 if(error)throw error;
 if(!result)fail('classroom_no_execution_receipt');
 return {...result,lease_release:leaseReleaseStatus,
  receipt_hash:digest({...result,lease_release:leaseReleaseStatus})};
}
