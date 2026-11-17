import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {
  createShadowLeaseJournal,
  recordShadowLease,
  recordShadowSubmissionIntent,
  inspectShadowLeaseJournal,
  releaseShadowLease,
} from '../systemia/yard/shadow-broker-lease-journal.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-shadow-lease-'));
  fs.chmodSync(root,0o700);
  return root;
}
function response(ok=true){
  return {
    ok,
    json:async()=>({ok:true,receipt:{receipt_hash:'sha256:'+'b'.repeat(64)}}),
  };
}
const token='b'.repeat(48);
const lease=()=>({
  lease_id:'lease_shadowproof_12345678',
  token,
  expires_at:new Date(Date.now()+60_000).toISOString(),
});

test('submission cannot occur without a durably recorded lease',()=>{
  const root=fixture();
  try{
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218'});
    assert.throws(()=>recordShadowSubmissionIntent({dir}),/submission_requires_recorded_lease/);
    assert.deepEqual(inspectShadowLeaseJournal({dir}).lease_recorded,false);
    recordShadowLease({dir,lease:lease()});
    assert.equal(inspectShadowLeaseJournal({dir}).phase,'lease_recorded');
    assert.equal(recordShadowSubmissionIntent({dir}).phase,'submission_uncertain');
    assert.equal(inspectShadowLeaseJournal({dir}).submission_attempted,true);
    assert.equal(fs.statSync(path.join(dir,'lease-journal.json')).mode&0o077,0);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('persisted lease journal releases after losing service response',async()=>{
  const root=fixture();
  try{
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218'});
    recordShadowLease({dir,lease:lease()});
    recordShadowSubmissionIntent({dir});
    const calls=[];
    const result=await releaseShadowLease({dir,request:async(url,opts)=>{
      calls.push({url,method:opts.method,body:JSON.parse(opts.body)});
      return response();
    }});
    assert.equal(result.ok,true);
    assert.equal(result.stopped_via_lease_release,true);
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'http://127.0.0.1:43218/v1/leases/lease_shadowproof_12345678/release');
    assert.equal(calls[0].body.token,token);
    assert.equal(inspectShadowLeaseJournal({dir}).phase,'released');
    const again=await releaseShadowLease({dir,request:async()=>{throw Error('should not re-release')}});
    assert.equal(again.already_released,true);
    assert.equal(JSON.stringify(inspectShadowLeaseJournal({dir})).includes(token),false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('uncertain network release is retained as manual hold rather than success',async()=>{
  const root=fixture();
  try{
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218'});
    recordShadowLease({dir,lease:lease()});
    recordShadowSubmissionIntent({dir});
    const lost=await releaseShadowLease({dir,request:async()=>{throw Error('lost_response')}});
    assert.equal(lost.ok,false);
    assert.equal(lost.manual_reconciliation_required,true);
    assert.equal(inspectShadowLeaseJournal({dir}).phase,'manual_hold');
    const recover=await releaseShadowLease({dir,request:async()=>response()});
    assert.equal(recover.ok,true);
    assert.equal(inspectShadowLeaseJournal({dir}).phase,'released');
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('untrusted external origin, unsafe lease and symlink journal are denied',()=>{
  const root=fixture();
  try{
    assert.throws(()=>createShadowLeaseJournal({
      parent:root,origin:'https://external.example.invalid'
    }),/origin_must_be_exact_loopback/);
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218'});
    assert.throws(()=>recordShadowLease({
      dir,lease:{...lease(),token:'not-a-token'}
    }),/invalid_lease_identity/);
    const file=path.join(dir,'lease-journal.json');
    fs.renameSync(file,file+'.original');
    fs.symlinkSync(file+'.original',file);
    assert.throws(()=>inspectShadowLeaseJournal({dir}));
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('real disposable NodeSeed release stops a broker even if service response is lost',async()=>{
  const root=fixture();
  let seed;
  try{
    const seedRoot=path.join(root,'compute');
    const journalParent=path.join(root,'private-journals');
    fs.mkdirSync(journalParent,{mode:0o700});
    seed=await startNodeSeed({
      root:seedRoot,nodeId:'shadow-lease-integration-node',
      host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
      allocatorToken:'synthetic-allocator-token-only',
      announce:false,
    });
    const origin=seed.endpoint;
    const jr=createShadowLeaseJournal({parent:journalParent,origin});

    const newLease=await fetch(origin+'/v1/leases',{
      method:'POST',
      headers:{
        authorization:'Bearer synthetic-allocator-token-only',
        'content-type':'application/json',
      },
      body:JSON.stringify({
        workload_class:'systemia.remote-capacity-broker.v1',
        requested_ttl_ms:60_000,
      }),
    });
    assert.equal(newLease.status,201);
    const granted=await newLease.json();
    recordShadowLease({dir:jr,lease:granted});
    recordShadowSubmissionIntent({dir:jr});

    // NodeSeed starts the loopback broker. Simulate losing all of the job's
    // returned service information before cleanup can use it.
    const jobResponse=await fetch(origin+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        lease_id:granted.lease_id,
        token:granted.token,
        workload_class:'systemia.remote-capacity-broker.v1',
        release_ref:'32656150e433db42d00e0725507601dfa1b5641e',
        input:{
          state_root:path.join(seedRoot,'shadow-broker'),
          port:0,authorized_devices:{},
        },
      }),
    });
    assert.equal(jobResponse.status,200);
    const job=await jobResponse.json();
    const serviceId=job.result.service_id;
    assert.ok(serviceId);
    const before=await fetch(origin+'/v1/services/'+serviceId+'/health');
    assert.equal(before.status,200);
    // Now deliberately ignore the job result and release by persisted lease.
    const released=await releaseShadowLease({dir:jr});
    assert.equal(released.ok,true);
    const after=await fetch(origin+'/v1/services/'+serviceId+'/health');
    assert.equal(after.status,404);
    assert.equal(inspectShadowLeaseJournal({dir:jr}).phase,'released');
  }finally{
    if(seed)await seed.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
