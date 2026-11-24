import test from 'node:test';
import assert from 'node:assert/strict';
import {openCemeteryJobRoute,migrateCemeteryThroughYard} from './yard-dispatch.mjs';
const NODE='evercraft-node002-nextgen',WORK='systemia.evermaps-cemetery-restore.v1',origin='https://broker.example.invalid';
function fixture(){
 const calls=[];
 const yard={
  verifyPublicRoute:async()=>({origin,scope:'public_https',verified:true}),
  listRemoteCapacityNodes:async()=>({nodes:[{node_id:NODE,connected:true,device_fingerprint:'fixture',capacity:{authorized:true,session_attestation_verified:true,zero_cost:true,device_fingerprint:'fixture',supported_workloads:[WORK]}}]}),
  remoteCapacityGrant:async()=>({node_id:NODE,device_fingerprint:'fixture',broker_origin:origin,capacity_endpoint:origin+'/nodes/'+NODE,route_scope:'public_https',allocator_token:'fixture-allocator',control_grant_receipt_hash:'fixture-grant'})
 };
 const fetchImpl=async(url,opts)=>{
  calls.push({url,body:JSON.parse(opts.body)});
  const result=url.endsWith('/v1/leases')?[201,{workload_class:WORK,lease_id:'fixture-lease',token:'fixture-token'}]:url.endsWith('/release')?[200,{}]:[200,{ok:true,node_id:NODE,workload_class:WORK,result:{node_id:NODE,stored:true},receipt:{receipt_hash:'sha256:'+'a'.repeat(64)}}];
  return {status:result[0],json:async()=>result[1]};
 };
 return {yard,calls,args:{yard,brokerDeploymentId:'fixture',brokerOrigin:origin,workload:WORK,fetchImpl}};
}
const job={node_id:NODE,workload_class:WORK,idempotency_key:'fixture-job-001',payload:{operation:'stage_chunk'}};
test('exact route, lease and release; no credentials in returned result',async()=>{
 const f=fixture(),r=await openCemeteryJobRoute(f.args);
 assert.deepEqual(await r.sendJob(job),{node_id:NODE,stored:true});
 assert.equal(f.calls.length,3);assert.ok(f.calls[2].url.endsWith('/release'));
});
test('unattested or unregistered node is held before network dispatch',async()=>{
 const f=fixture();f.yard.listRemoteCapacityNodes=async()=>({nodes:[]});
 await assert.rejects(openCemeteryJobRoute(f.args),/capacity_not_admitted/);
 assert.equal(f.calls.length,0);
});
test('wrong node or workload cannot obtain lease',async()=>{
 const f=fixture(),r=await openCemeteryJobRoute(f.args);
 await assert.rejects(r.sendJob({...job,node_id:'other'}),/scope_denied/);
 await assert.rejects(r.sendJob({...job,workload_class:'shell'}),/scope_denied/);
 assert.equal(f.calls.length,0);
});
test('migration cannot infer source freeze or confidential transport from HTTPS',async()=>{
 const f=fixture();
 await assert.rejects(migrateCemeteryThroughYard({...f.args,sourceWriterFrozen:true}),/authority_required/);
 assert.equal(f.calls.length,0);
});
test('failed job still releases lease',async()=>{
 const f=fixture(),original=f.args.fetchImpl;
 f.args.fetchImpl=async(url,opts)=>url.endsWith('/v1/jobs')?{status:503,json:async()=>({})}:original(url,opts);
 const r=await openCemeteryJobRoute(f.args);
 await assert.rejects(r.sendJob(job),/execution_unverified/);
 assert.ok(f.calls.at(-1).url.endsWith('/release'));
});
