import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dispatchClassroomNode002Probe} from '../systemia/classroom/dispatch-node002-probe.mjs';
import {CLASSROOM_NODE_WORKLOAD} from '../systemia/classroom/node002-compute-probe.mjs';

const NODE='evercraft-node002-nextgen';
const DEPLOYMENT='evercraft-remote-broker-resident';
const ORIGIN='http://127.0.0.1:8797';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'
 ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>'sha256:'+createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

function fixture({connected=true,authorized=true,supported=true,verified=true}={}){
 const steps=[],calls=[];
 const yard={
  verifyPublicRoute:async(id,arg)=>{steps.push('route');
   assert.equal(id,DEPLOYMENT);
   assert.equal(arg.origin,ORIGIN);
   assert.equal(arg.allowLoopbackProof,true);
   return verified?{origin:ORIGIN,scope:'loopback_proof',verification:'instance_and_deployment_receipt_match'}:
    {origin:ORIGIN,scope:'loopback_proof',verification:'unverified'};
  },
  listRemoteCapacityNodes:async()=>{steps.push('inventory');return {nodes:[{
    node_id:NODE,connected,capacity:{
      authorized,session_attestation_verified:true,zero_cost:true,
      supported_workloads:supported?[CLASSROOM_NODE_WORKLOAD]:['systemia.content-hash.v1']
    }
   }]};},
  remoteCapacityGrant:async()=>{steps.push('grant');return {
   node_id:NODE,broker_origin:ORIGIN,route_scope:'loopback_proof',
   capacity_endpoint:ORIGIN+'/nodes/'+NODE,
   allocator_token:'synthetic-grant-not-real',control_grant_receipt_hash:'sha256:'+('d'.repeat(64))
  }}
 };
 const fetchImpl=async(url,options)=>{
  const input=JSON.parse(options.body);
  calls.push({url,options,input});
  if(url.endsWith('/v1/leases')){
   return {status:201,json:async()=>({workload_class:CLASSROOM_NODE_WORKLOAD,
    lease_id:'lease_123',token:'synthetic-worker-lease'})};
  }
  if(url.endsWith('/v1/jobs')){
   const operation=input.input.payload.operation;
   const result={node_id:NODE,operation,provider:'llama.cpp',child_data_used:false,
    youth_safety_certified:false,model_response_observed:operation==='synthetic_turn',
    state:operation==='synthetic_turn'?'SYNTHETIC_LOCAL_API_RESPONSE_OBSERVED':'LOCAL_MODEL_METADATA_OBSERVED',
    source_ref_is_deployment_proof:false,public_endpoint_opened:false,
    model_id_sha256:'sha256:'+('c'.repeat(64))};
   const key=input.idempotency_key;
   const worker={schema:'evercraft.classroom.node002-worker-receipt.v1',
    node_id:NODE,workload_class:CLASSROOM_NODE_WORKLOAD,
    idempotency_key:key,
    request_hash:digest({nodeId:NODE,key,request:input.input.payload}),
    result,deduplicated:false,registered_workload_only:true,
    completed_at:'2026-11-16T22:00:00.000Z'};
   return {status:200,json:async()=>({
    ok:true,node_id:NODE,workload_class:CLASSROOM_NODE_WORKLOAD,
    worker_receipt:{...worker,receipt_hash:digest(worker)},
    receipt:{receipt_hash:'sha256:'+('b'.repeat(64))},
    result
   })};
  }
  if(url.endsWith('/leases/lease_123/release')){
   return {status:200,json:async()=>({ok:true})};
  }
  throw Error('unexpected_transport');
 };
 return {yard,fetchImpl,calls,steps};
}
test('Scoped approved Yard route -> exact authorized node -> lease -> fixed probe -> release',async()=>{
 const f=fixture();
 const result=await dispatchClassroomNode002Probe({
  yard:f.yard,brokerDeploymentId:DEPLOYMENT,brokerOrigin:ORIGIN,
  operation:'synthetic_turn',allowLoopbackProof:true,
  fetchImpl:f.fetchImpl,newId:()=> '11111111-1111-4111-8111-111111111111'
 });
 assert.deepEqual(f.steps,['route','inventory','grant']);
 assert.equal(result.status,'SCOPED_NODE002_MODEL_PROBE_OBSERVED');
 assert.equal(result.model_response_observed,true);
 assert.equal(result.node_id,NODE);
 assert.equal(result.lease_release,'confirmed');
 assert.equal(result.no_child_data,true);
 assert.equal(result.public_tutor_live,false);
 assert.equal(result.youth_safety_certified,false);
 assert.match(result.receipt_hash,/^sha256:[a-f0-9]{64}$/);
 assert.equal(f.calls.length,3);
 assert(f.calls.every(c=>c.url.startsWith(ORIGIN+'/nodes/'+NODE+'/v1/')));
 assert.equal(f.calls[0].input.workload_class,CLASSROOM_NODE_WORKLOAD);
 assert.equal(f.calls[1].input.input.payload.operation,'synthetic_turn');
 assert.equal(Object.keys(f.calls[1].input.input.payload).sort().join(','),'operation,schema');
 assert.equal(f.calls[1].input.idempotency_key,'classroom-node002-11111111-1111-4111-8111-111111111111');
 assert.equal(JSON.stringify(result).includes('synthetic-grant-not-real'),false);
 assert.equal(JSON.stringify(result).includes('synthetic-worker-lease'),false);
 assert.equal(f.calls[2].input.token,'synthetic-worker-lease');
});
test('Unverified broker, absent Node002, non-enabled scope fail before leases',async()=>{
 for(const changes of [{verified:false},{connected:false},{authorized:false},{supported:false}]){
  const f=fixture(changes);
  await assert.rejects(()=>dispatchClassroomNode002Probe({
   yard:f.yard,brokerDeploymentId:DEPLOYMENT,brokerOrigin:ORIGIN,
   allowLoopbackProof:true,fetchImpl:f.fetchImpl
  }));
  assert.equal(f.calls.length,0);
 }
});
test('Cannot supply alternative workload, operation, URL, or test prompt',async()=>{
 const f=fixture();
 for(const operation of ['exec','publish','arbitrary shell','https://unknown']){
  await assert.rejects(()=>dispatchClassroomNode002Probe({
   yard:f.yard,brokerDeploymentId:DEPLOYMENT,
   brokerOrigin:ORIGIN,operation,allowLoopbackProof:true
  }),/classroom_operation_not_allowed/);
 }
 await assert.rejects(()=>dispatchClassroomNode002Probe({
  yard:f.yard,brokerDeploymentId:DEPLOYMENT,
  brokerOrigin:'http://example.com',allowLoopbackProof:true,
 }),/classroom_proof_requires_local_broker/);
 await assert.rejects(()=>dispatchClassroomNode002Probe({
  yard:f.yard,brokerDeploymentId:DEPLOYMENT,brokerOrigin:ORIGIN,
  allowLoopbackProof:false
 }),/classroom_verified_https_required/);
 assert.equal(f.calls.length,0);
});
test('Failed job still releases lease without fabricated completion receipt',async()=>{
 const f=fixture();
 const original=f.fetchImpl;
 f.fetchImpl=async(url,options)=>{
  if(url.endsWith('/v1/jobs'))return {status:503,json:async()=>({error:'not_connected'})};
  return original(url,options);
 };
 await assert.rejects(()=>dispatchClassroomNode002Probe({
  yard:f.yard,brokerDeploymentId:DEPLOYMENT,brokerOrigin:ORIGIN,
  allowLoopbackProof:true,fetchImpl:f.fetchImpl
 }),/classroom_execution_receipt_unverified/);
 assert.equal(f.calls.some(c=>c.url.endsWith('/leases/lease_123/release')),true);
});

test('Tampered worker identity/hash cannot be called verified execution',async()=>{
 const f=fixture(),original=f.fetchImpl;
 const transport=async(url,options)=>{
  const response=await original(url,options);
  if(url.endsWith('/v1/jobs')){
   const data=await response.json();
   data.worker_receipt.receipt_hash='sha256:'+('0'.repeat(64));
   return {status:200,json:async()=>data};
  }
  return response;
 };
 await assert.rejects(()=>dispatchClassroomNode002Probe({
  yard:f.yard,brokerDeploymentId:DEPLOYMENT,brokerOrigin:ORIGIN,
  operation:'synthetic_turn',allowLoopbackProof:true,
  fetchImpl:transport
 }),/classroom_execution_receipt_unverified/);
 assert.equal(f.calls.some(c=>c.url.endsWith('/leases/lease_123/release')),true);
});
