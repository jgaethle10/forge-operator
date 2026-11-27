import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {YardOperator} from '../systemia/yard/operator.mjs';

const workload='systemia.remote-capacity-broker.v1';
const hash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');

// Child only: stop at an exact response boundary, before Yard can return
// from deployRelease. The parent kills it while the real fixture lives.
const childSource=`
import {YardOperator} from ${JSON.stringify(new URL('../systemia/yard/operator.mjs',import.meta.url).href)};
const opts=JSON.parse(process.argv[1]);
const boundary=process.argv[2];
const real=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
 const response=await real(url,init);
 const p=new URL(url).pathname;
 if(init.method==='POST' && response.ok &&
    ((boundary==='job' && p==='/v1/jobs') ||
     (boundary==='lease' && p==='/v1/leases'))){
   const value=await response.clone().json();
   process.send({boundary,service:boundary==='job'?value.result:null});
   return await new Promise(()=>{});
 }
 return response;
};
try {await new YardOperator({stateDir:process.argv[3]}).deployRelease(opts);}
catch {process.exitCode=2;process.disconnect();}
`;

async function exercise(boundary){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'broker-crash-proof-'));
 const stateDir=path.join(root,'yard');
 fs.mkdirSync(stateDir,{mode:0o700});
 let seed,child,exited;
 try{
  seed=await startNodeSeed({root:path.join(root,'compute'),nodeId:'crash-fixture',
    host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
    allocatorToken:'synthetic-crash-fixture',announce:false});
  const opts={deploymentId:'crash-fixture',releaseRef:'a'.repeat(40),
    workloadClass:workload,capacityEndpoint:seed.endpoint,
    allocatorToken:'synthetic-crash-fixture',
    input:{state_root:path.join(root,'compute','services','broker'),port:0,authorized_devices:{}},
    rollbackTarget:'fixture:stop',leaseTtlMs:60000,brokerRecoveryGuard:true};
  child=spawn(process.execPath,['--input-type=module','-e',childSource,
    JSON.stringify(opts),boundary,stateDir],{stdio:['ignore','ignore','ignore','ipc']});
  exited=once(child,'exit');
  let timer;
  const message=await Promise.race([
    once(child,'message').then(([m])=>m),
    exited.then(()=>{throw Error('child_exited_before_boundary')}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('boundary_timeout')),8000)})
  ]).finally(()=>clearTimeout(timer));
  assert.equal(message.boundary,boundary);
  if(boundary==='job'){
    assert.equal((await fetch(message.service.local_url+'/v1/remote/health')).ok,true);
  }
  assert.equal(child.kill('SIGKILL'),true);
  const [code,signal]=await exited;
  assert.equal(code,null);assert.equal(signal,'SIGKILL');
  const journalPath=path.join(stateDir,'.broker-recovery-crash-fixture.json');
  const secretPath=path.join(stateDir,'.lease-secrets/crash-fixture.json');
  const journal=JSON.parse(fs.readFileSync(journalPath,'utf8'));
  assert.equal(fs.statSync(journalPath).mode&0o777,0o600);
  assert.equal(journal.state,boundary==='job'?'job_request_pending':'lease_request_pending');
  const restarted=new YardOperator({stateDir});
  assert.equal(restarted.deploymentStatus(opts.deploymentId),null);
  const original=globalThis.fetch;
  let mutationCalls=0;
  try{
   globalThis.fetch=async(url,init={})=>{
    if(init.method==='POST')mutationCalls++;
    return original(url,init);
   };
   await assert.rejects(restarted.deployRelease(opts));
   assert.equal(mutationCalls,0);
  }finally{globalThis.fetch=original;}
  if(boundary==='job'){
   assert.equal(fs.statSync(secretPath).mode&0o777,0o600);
   const saved=JSON.parse(fs.readFileSync(secretPath,'utf8'));
   assert.equal(saved.lease_id,journal.lease_id);
   assert.equal(saved.capacity_endpoint,seed.endpoint);
   assert.equal(saved.allocator_token,null);
   assert.ok(!JSON.stringify(journal).includes(saved.token));
   // Explicit fixture-owner recovery only. No allocator grant, no job replay.
   const reply=await fetch(seed.endpoint+'/v1/leases/'+saved.lease_id+'/release',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({token:saved.token}),signal:AbortSignal.timeout(5000)});
   assert.equal(reply.ok,true);
   const data=await reply.json();
   const {receipt_hash,...body}=data.receipt;
   assert.equal(data.ok,true);
   assert.equal(body.type,'capacity.lease.released');
   assert.equal(body.lease_id,saved.lease_id);
   assert.equal(body.workload_class,workload);
   assert.equal(body.node_id,'crash-fixture');
   assert.equal(receipt_hash,hash(body));
   assert.equal((await fetch(seed.endpoint+message.service.health_path)).status,404);
   await assert.rejects(fetch(message.service.local_url+'/v1/remote/health',
      {signal:AbortSignal.timeout(2000)}));
  }else{
   // The acknowledgement was lost before private custody: no guessed token,
   // no new lease, no claim of release or expiry. Fixture teardown only.
   assert.equal(fs.existsSync(secretPath),false);
   assert.equal(message.service,null);
   assert.equal(journal.lease_id,undefined);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(journalPath,'utf8')),journal);
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited.catch(()=>{});}
  try{if(seed)await seed.close();}finally{fs.rmSync(root,{recursive:true,force:true});}
 }
}
test('SIGKILL after real broker start preserves exact lease and prevents replay; fixture owner releases it',()=>exercise('job'));
test('SIGKILL after lease acknowledgement but before custody holds without guessed authority or replay',()=>exercise('lease'));
