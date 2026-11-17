import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createClassroomNodeProbeWorker,CLASSROOM_NODE_WORKLOAD,validateClassroomProbePayload} from '../systemia/classroom/node002-compute-probe.mjs';
import {startEvercraftComputeNode} from '../systemia/compute/runtime-node.mjs';

const NODE='evercraft-node002-nextgen';
const SCHEMA='evercraft.classroom.nextgen-probe-request.v1';
const req=operation=>({schema:SCHEMA,operation});
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-classroom-node002-'))}
function fakeTransport(){
 const calls=[];
 return {calls,fetchImpl:async(url,options={})=>{
  calls.push({url,method:options.method||'GET',headers:options.headers,body:options.body});
  if(url.endsWith('/v1/models'))return {
   ok:true,json:async()=>({data:[{id:'evercraft-private-fixture'}]})
  };
  if(url.endsWith('/v1/chat/completions'))return {
   ok:true,json:async()=>({choices:[{message:{content:'We can imagine three marbles. What changes if we add one more?'}}]})
  };
  throw Error('fixture_forbidden_route');
 }};
}
async function modelServer(){
 const messages=[];
 const server=http.createServer(async(r,w)=>{
  if(r.method==='GET'&&r.url==='/v1/models'){
   w.setHeader('content-type','application/json');
   w.end(JSON.stringify({data:[{id:'owned-loopback-fixture'}]}));return;
  }
  if(r.method==='POST'&&r.url==='/v1/chat/completions'){
   let buffer='';
   for await(const c of r)buffer+=String(c);
   const body=JSON.parse(buffer);messages.push(body);
   w.setHeader('content-type','application/json');
   w.end(JSON.stringify({choices:[{message:{content:'An algebra puzzle starts with three marbles. What is your next step?'}}]}));
   return;
  }
  w.writeHead(404);w.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:server.address().port,messages,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function api(endpoint,route,{data,token=''}={}){
 const response=await fetch(endpoint+route,{
  method:data?'POST':'GET',
  headers:{...(data?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},
  ...(data?{body:JSON.stringify(data)}:{}),
  signal:AbortSignal.timeout(5000),
 });
 return {status:response.status,body:await response.json()};
}
test('No dynamic commands, endpoint, prompt, or source may be submitted',()=>{
 for(const payload of [
  null,{schema:SCHEMA,operation:'exec'},
  {...req('synthetic_turn'),command:'node --eval'},
  {...req('synthetic_turn'),prompt:'real child data'},
  {...req('readiness'),url:'https://external-provider'},
  {...req('readiness'),extra:true}
 ])assert.throws(()=>validateClassroomProbePayload(payload));
 assert.deepEqual(validateClassroomProbePayload(req('readiness')),req('readiness'));
 assert.deepEqual(validateClassroomProbePayload(req('synthetic_turn')),req('synthetic_turn'));
});
test('Node002-only and explicit owner enablement; safe private replay',async()=>{
 const root=temp();
 try{
  assert.throws(()=>createClassroomNodeProbeWorker({nodeId:'penguin',stateDir:root,enabled:true}),/classroom_expected_node002_only/);
  const {calls,fetchImpl}=fakeTransport();
  const worker=createClassroomNodeProbeWorker({nodeId:NODE,stateDir:path.join(root,'work'),enabled:true,port:8181,fetchImpl,now:()=> '2026-11-16T00:00:00.000Z'});
  const key='classroom-test-replay-0001';
  const first=await worker.execute({payload:req('synthetic_turn'),idempotencyKey:key});
  assert.equal(first.result.model_response_observed,true);
  assert.equal(first.result.provider,'llama.cpp');
  assert.equal(first.result.youth_safety_certified,false);
  assert.equal(first.registered_workload_only,true);
  assert.match(first.receipt_hash,/^sha256:[0-9a-f]{64}$/);
  assert.equal(first.result.model_response_sha256.includes('marbles'),false);
  assert.equal(JSON.stringify(first).includes('An algebra puzzle'),false);
  assert.equal(calls.length,2);
  assert(calls.every(c=>c.url.startsWith('http://127.0.0.1:8181/')));
  assert(!JSON.stringify(calls).includes('real child data'));
  const again=await worker.execute({payload:req('synthetic_turn'),idempotencyKey:key});
  assert.equal(again.deduplicated,true);
  assert.equal(again.receipt_hash,first.receipt_hash);
  assert.equal(calls.length,2);
  await assert.rejects(()=>worker.execute({payload:req('readiness'),idempotencyKey:key}),/classroom_idempotency_conflict/);
  const off=createClassroomNodeProbeWorker({nodeId:NODE,stateDir:path.join(root,'held'),enabled:false,port:8181,fetchImpl});
  await assert.rejects(()=>off.execute({payload:req('readiness'),idempotencyKey:'classroom-disabled-01'}),/classroom_workload_disabled/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('Real Compute lease path admits ONLY exact opted-in NextGen, with private sanitized receipts',async()=>{
 const root=temp(),model=await modelServer();
 const token='classroom-node-test-private-allocator';
 let node;
 try{
  node=await startEvercraftComputeNode({
   nodeId:NODE,root:path.join(root,'node'),allocatorToken:token,host:'127.0.0.1',
   classroomProbeEnabled:true,classroomProbePort:model.port
  });
  const capacity=await api(node.endpoint,'/v1/capacity');
  assert.equal(capacity.status,200);
  assert(capacity.body.supported_workloads.includes(CLASSROOM_NODE_WORKLOAD));
  const denied=await api(node.endpoint,'/v1/leases',{data:{workload_class:CLASSROOM_NODE_WORKLOAD}});
  assert.equal(denied.status,401);
  const leased=await api(node.endpoint,'/v1/leases',{
   data:{workload_class:CLASSROOM_NODE_WORKLOAD,requested_ttl_ms:120000},token
  });
  assert.equal(leased.status,201);
  const credentials={lease_id:leased.body.lease_id,token:leased.body.token,workload_class:CLASSROOM_NODE_WORKLOAD};
  const run=async(input,idempotency_key)=>api(node.endpoint,'/v1/jobs',{
   data:{...credentials,idempotency_key,input:{payload:input}}
  });
  const first=await run(req('synthetic_turn'),'node002-classroom-proof-01');
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(first.body.ok,true);
  assert.equal(first.body.node_id,NODE);
  assert.equal(first.body.worker_receipt.registered_workload_only,true);
  assert.equal(first.body.result.child_data_used,false);
  assert.equal(first.body.result.public_endpoint_opened,false);
  assert.equal(first.body.result.model_response_observed,true);
  assert.equal(first.body.result.academic_integrity_certified,false);
  assert.equal(first.body.result.youth_safety_certified,false);
  assert.equal(first.body.receipt.student_data_used,false);
  assert.equal(model.messages.length,1);
  const bodyString=JSON.stringify(first.body);
  assert.equal(bodyString.includes(model.messages[0].messages[0].content),false);
  assert.equal(bodyString.includes('An algebra puzzle'),false);
  const replay=await run(req('synthetic_turn'),'node002-classroom-proof-01');
  assert.equal(replay.status,200);
  assert.equal(replay.body.deduplicated,true);
  assert.equal(model.messages.length,1);
  const conflict=await run(req('readiness'),'node002-classroom-proof-01');
  assert.equal(conflict.status,409);
  const injected=await run({...req('synthetic_turn'),command:'chmod 777 /'},'node002-classroom-injection-01');
  assert.equal(injected.status,422);
  assert.equal(model.messages.length,1);
 }finally{
  if(node)await node.close();
  await model.close();
  fs.rmSync(root,{recursive:true,force:true});
 }
});
test('Other node IDs do not advertise or lease the classroom capability',async()=>{
 const root=temp();
 let node;
 try{
  node=await startEvercraftComputeNode({
   nodeId:'evercraft-node001-penguin',root,host:'127.0.0.1',
   classroomProbeEnabled:true
  });
  const cap=await api(node.endpoint,'/v1/capacity');
  assert.equal(cap.body.supported_workloads.includes(CLASSROOM_NODE_WORKLOAD),false);
  const lease=await api(node.endpoint,'/v1/leases',{data:{workload_class:CLASSROOM_NODE_WORKLOAD}});
  assert.equal(lease.status,422);
 }finally{if(node)await node.close();fs.rmSync(root,{recursive:true,force:true})}
});
