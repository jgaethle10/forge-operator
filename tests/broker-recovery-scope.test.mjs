import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {YardOperator} from '../systemia/yard/operator.mjs';

const workload='systemia.remote-capacity-broker.v1';
async function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'broker-scope-'));
 const stateDir=path.join(root,'yard');
 fs.mkdirSync(stateDir,{mode:0o700});
 let seed;
 const original=globalThis.fetch;
 try {
   seed=await startNodeSeed({root:path.join(root,'compute'),nodeId:'scope-fixture',
    host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
    allocatorToken:'fixture-only-allocator-token',announce:false});
   const yard=new YardOperator({stateDir});
   const opts={deploymentId:'scope-fixture',releaseRef:'a'.repeat(40),
     workloadClass:workload,capacityEndpoint:seed.endpoint,
     allocatorToken:'fixture-only-allocator-token',rollbackTarget:'fixture:stop',
     leaseTtlMs:60000,brokerRecoveryGuard:true,
     input:{state_root:path.join(root,'compute','broker-fresh'),port:0,authorized_devices:{}}};
   await run({root,stateDir,seed,yard,opts,original});
 }finally{
   globalThis.fetch=original;
   try{if(seed)await seed.close();}finally{fs.rmSync(root,{recursive:true,force:true});}
 }
}
test('guarded successful deployment keeps only exact lease authority, then stops',()=>fixture(async({stateDir,seed,yard,opts})=>{
 const record=await yard.deployRelease(opts);
 assert.equal(record.state,'ready');
 const secret=JSON.parse(fs.readFileSync(path.join(stateDir,'.lease-secrets/scope-fixture.json'),'utf8'));
 assert.equal(secret.allocator_token,null);
 assert.equal(secret.lease_id,record.lease.lease_id);
 assert.ok(secret.token);
 const local=new URL(record.result.local_url);
 assert.equal(local.hostname,'127.0.0.1');
 const health=await (await fetch(local.origin+'/v1/remote/health')).json();
 assert.equal(health.authorized_devices,0);
 assert.equal(health.registered_nodes,0);
 assert.equal(health.pending_enrollment_requests,0);
 const stop=await yard.stopDeployment(opts.deploymentId);
 assert.equal(stop.ok,true);
 assert.equal(stop.state,'stopped');
 assert.equal((await fetch(seed.endpoint+record.result.health_path)).status,404);
 await assert.rejects(fetch(local.origin+'/v1/remote/health',{signal:AbortSignal.timeout(2000)}));
}));
test('guard refuses old or fixed port, device authority, long leases, extra options and reused roots before any POST',()=>fixture(async({root,stateDir,yard,opts,original})=>{
 let posts=0;
 globalThis.fetch=async(url,init={})=>{
   if(init.method==='POST')posts++;
   return original(url,init);
 };
 const existing=path.join(root,'compute','existing');
 fs.mkdirSync(existing);
 const link=path.join(root,'compute','link');
 fs.symlinkSync(existing,link);
 const input=opts.input;
 const variants=[
  {input:{...input,port:8797}},
  {input:{...input,port:18797}},
  {input:{...input,authorized_devices:{['sha256:'+'b'.repeat(64)]:'other-node'}}},
  {input:{...input,extra:true}},
  {leaseTtlMs:60001},
  {leaseTtlMs:29999},
  {input:{...input,state_root:existing}},
  {input:{...input,state_root:path.join(existing,'..','remote-broker-resident','broker')}},
  {input:{...input,state_root:path.join(link,'new')}},
 ];
 for(const delta of variants)await assert.rejects(yard.deployRelease({...opts,...delta}),/broker_recovery_guard_(scope_invalid|state_not_fresh)/);
 assert.equal(posts,0);
 assert.equal(fs.existsSync(path.join(stateDir,'.broker-recovery-scope-fixture.json')),false);
 assert.equal(yard.deploymentStatus(opts.deploymentId),null);
}));
