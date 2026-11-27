import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {YardOperator} from '../systemia/yard/operator.mjs';

const workload='systemia.remote-capacity-broker.v1';
const releaseRef='a'.repeat(40);
const realFetch=globalThis.fetch;
async function exercise(mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'broker-cleanup-proof-'));
 const stateDir=path.join(root,'yard');
 fs.mkdirSync(stateDir,{mode:0o700});
 let seed,lease,service,jobCalls=0,releaseCalls=0;
 const unknown=['lost_release','wrong_lease','bad_digest'].includes(mode);
 try {
  seed=await startNodeSeed({root:path.join(root,'compute'),nodeId:'cleanup-fixture',
   host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
   allocatorToken:'synthetic-allocator-fixture',announce:false});
  const yard=new YardOperator({stateDir});
  const options={deploymentId:'fresh-fixture',releaseRef,workloadClass:workload,
   capacityEndpoint:seed.endpoint,allocatorToken:'synthetic-allocator-fixture',
   input:{state_root:path.join(root,'compute','services','broker'),port:0,authorized_devices:{}},
   rollbackTarget:'fixture:stop',leaseTtlMs:60000,brokerRecoveryGuard:true};
  const journal=path.join(stateDir,'.broker-recovery-fresh-fixture.json');
  globalThis.fetch=async(url,opts={})=>{
   const u=new URL(url);
   if(u.origin!==new URL(seed.endpoint).origin) return realFetch(url,opts);
   if(u.pathname==='/v1/leases' && opts.method==='POST'){
    const reply=await realFetch(url,opts);lease=await reply.clone().json();return reply;
   }
   if(u.pathname==='/v1/jobs' && opts.method==='POST'){
    jobCalls++;
    assert.equal(JSON.parse(fs.readFileSync(journal,'utf8')).state,'job_request_pending');
    const secret=path.join(stateDir,'.lease-secrets/fresh-fixture.json');
    assert.equal(fs.statSync(secret).mode&0o777,0o600);
    assert.equal(JSON.parse(fs.readFileSync(secret,'utf8')).token,lease.token);
    const reply=await realFetch(url,opts);
    assert.equal(reply.ok,true);
    service=(await reply.clone().json()).result;
    if(mode==='lost_job_reply')throw Error('fixture lost job response after real service start');
    return reply;
   }
   if(u.pathname===service?.health_path && opts.method!=='POST')
    throw Error('fixture management health transport failure');
   if(u.pathname===('/v1/leases/'+lease?.lease_id+'/release')){
    releaseCalls++;
    if(mode==='lost_release')throw Error('fixture release transport failure');
    if(['wrong_lease','bad_digest'].includes(mode)){
      const reply=await realFetch(url,opts);
      assert.equal(reply.ok,true);
      const value=await reply.json();
      if(mode==='wrong_lease'){
        const {receipt_hash,...body}=value.receipt;
        body.lease_id='different-fixture-lease';
        value.receipt={...body,receipt_hash:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
      }else value.receipt.receipt_hash='0'.repeat(64);
      return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
    }
   }
   return realFetch(url,opts);
  };
  await assert.rejects(yard.deployRelease(options),unknown
    ? /broker_deployment_held_outcome_unknown_manual_reconciliation_required/
    : /broker_deployment_lease_release_acknowledged_manual_reconciliation_required/);
  assert.equal(jobCalls,1);
  assert.equal(releaseCalls,1);
  assert.ok(service?.local_url);
  const saved=JSON.parse(fs.readFileSync(journal,'utf8'));
  assert.equal(saved.state,unknown?'held_outcome_unknown':'lease_release_acknowledged');
  assert.equal(saved.manual_reconciliation_required,true);
  assert.equal(fs.statSync(journal).mode&0o777,0o600);
  assert.ok(!JSON.stringify(saved).includes(lease.token));
  assert.equal(yard.deploymentStatus(options.deploymentId),null);
  await assert.rejects(yard.deployRelease(options));
  assert.equal(jobCalls,1);
  globalThis.fetch=realFetch;
  if(mode==='lost_release'){
    const health=await realFetch(service.local_url+'/v1/remote/health');
    assert.equal(health.ok,true);
    const cleanup=await realFetch(seed.endpoint+'/v1/leases/'+lease.lease_id+'/release',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({token:lease.token})});
    assert.equal(cleanup.ok,true);
  }
  const after=await realFetch(seed.endpoint+service.health_path);
  assert.equal(after.status,404);
  await assert.rejects(realFetch(service.local_url+'/v1/remote/health',{signal:AbortSignal.timeout(2000)}));
 }finally{
  globalThis.fetch=realFetch;
  try{if(seed)await seed.close();}finally{fs.rmSync(root,{recursive:true,force:true});}
 }
}
test('actual broker service is closed when Yard loses management health response',()=>exercise('lost_health'));
test('actual broker service is closed when Yard loses successful job response',()=>exercise('lost_job_reply'));
test('release transport loss holds private journal and blocks replay; fixture owner cleans up',()=>exercise('lost_release'));
test('a self-consistent release receipt for a different lease cannot acknowledge cleanup',()=>exercise('wrong_lease'));
test('a corrupted release receipt cannot acknowledge cleanup',()=>exercise('bad_digest'));
