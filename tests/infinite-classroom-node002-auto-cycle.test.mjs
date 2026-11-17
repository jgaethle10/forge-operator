import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runClassroomAutoProbeCycle} from '../systemia/classroom/node002-auto-probe-cycle.mjs';

const now=new Date('2026-11-16T22:00:00.000Z');
const base={
 enabled:true,operation:'readiness',
 yard:{},brokerDeploymentId:'evercraft-remote-broker-resident',
 verifiedBrokerRoute:{origin:'http://127.0.0.1:8797'},
 allowLoopbackProof:true,now,
};
function tmp(){return fs.mkdtempSync(path.join(os.tmpdir(),'classroom-autoprobe-'))}
function fake(result,store){
 return async args=>{store.push(args);return result};
}
const proof={status:'SCOPED_NODE002_MODEL_PROBE_OBSERVED',operation:'readiness',
 no_child_data:true,receipt_hash:'sha256:'+('a'.repeat(64)),
 model_response_observed:false,compute_receipt_hash:'sha256:'+('b'.repeat(64)),
 worker_receipt_hash:'sha256:'+('c'.repeat(64)),
 control_grant_receipt_hash:'sha256:'+('d'.repeat(64)),lease_release:'confirmed'};
test('Disabled resident lane does absolutely no remote work',async()=>{
 let count=0;
 const result=await runClassroomAutoProbeCycle({enabled:false,dispatch:()=>{count++}});
 assert.equal(result.state,'disabled');
 assert.equal(count,0);
});
test('An explicitly enabled resident performs one scoped proof and stores a private receipt',async()=>{
 const root=tmp(),calls=[];
 try{
  const params={...base,stateDir:root,dispatch:fake(proof,calls)};
  const result=await runClassroomAutoProbeCycle(params);
  assert.equal(result.state,'passed');
  assert.equal(result.dispatch_attempted,true);
  assert.equal(result.child_safety_certified,false);
  assert.equal(result.lease_release,'confirmed');
  assert.equal(calls.length,1);
  assert.equal(calls[0].operation,'readiness');
  assert.equal(calls[0].allowLoopbackProof,true);
  assert.equal(calls[0].brokerOrigin,'http://127.0.0.1:8797');
  const receipt=path.join(root,'classroom-node002-autoprobe-readiness.json');
  assert.equal(fs.statSync(receipt).mode&0o077,0);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(receipt,'utf8'))).includes('student name'),false);
  const second=await runClassroomAutoProbeCycle(params);
  assert.equal(second.state,'already_fresh');
  assert.equal(second.dispatch_attempted,false);
  assert.equal(calls.length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('Held admission gets a cooldown; no endless failed remote attempts',async()=>{
 const root=tmp(),calls=[];
 try{
  const dispatch=async args=>{calls.push(args);throw Error('classroom_node002_capacity_not_authorized')};
  const first=await runClassroomAutoProbeCycle({...base,stateDir:root,dispatch});
  assert.equal(first.state,'held');
  assert.equal(first.reason,'classroom_node002_capacity_not_authorized');
  const second=await runClassroomAutoProbeCycle({...base,stateDir:root,dispatch});
  assert.equal(second.state,'held_cooldown');
  assert.equal(calls.length,1);
  const next=await runClassroomAutoProbeCycle({...base,stateDir:root,dispatch,
    now:new Date(now.getTime()+16*60000)});
  assert.equal(next.state,'held');
  assert.equal(calls.length,2);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('Missing verified broker route and invalid operations never dispatch',async()=>{
 const root=tmp(),calls=[];
 try{
  const opts={...base,stateDir:root,dispatch:fake(proof,calls)};
  const a=await runClassroomAutoProbeCycle({...opts,verifiedBrokerRoute:null});
  assert.equal(a.state,'held');assert.equal(a.dispatch_attempted,false);
  const b=await runClassroomAutoProbeCycle({...opts,operation:'shell'});
  assert.equal(b.state,'held');assert.equal(b.reason,'classroom_operation_not_allowed');
  assert.equal(calls.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('Autoprobe never claims public classroom safety or completion',async()=>{
 const root=tmp();
 try{
  const result=await runClassroomAutoProbeCycle({...base,stateDir:root,dispatch:async()=>proof});
  assert.equal(result.public_classroom_ready,false);
  assert.equal(result.child_safety_certified,false);
  const stored=JSON.parse(fs.readFileSync(path.join(root,'classroom-node002-autoprobe-readiness.json'),'utf8'));
  assert.equal(stored.remote_worker_release_attested,false);
  assert.equal(stored.public_classroom_ready,false);
  assert.equal(stored.child_safety_certified,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
