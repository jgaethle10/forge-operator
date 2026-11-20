import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
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
function response(
  ok=true,nodeId='synthetic-shadow-node',
  leaseId='lease_shadowproof_12345678',overrides={},forgedHash=null
){
  const body={
    schema:'evercraft.compute.receipt.v1',node_id:nodeId,seq:1,
    type:'capacity.lease.released',at:'2026-11-16T00:00:00.000Z',
    previous_hash:'GENESIS',lease_id:leaseId,
    workload_class:'systemia.remote-capacity-broker.v1',...overrides,
  };
  return {
    ok,
    json:async()=>({ok:true,receipt:{
      ...body,receipt_hash:forgedHash||
        createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    }}),
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
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218',expectedNodeId:'synthetic-shadow-node'});
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
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218',expectedNodeId:'synthetic-shadow-node'});
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
    assert.equal(fs.readFileSync(path.join(dir,'lease-journal.json'),'utf8').includes(token),false);
    const again=await releaseShadowLease({dir,request:async()=>{throw Error('should not re-release')}});
    assert.equal(again.already_released,true);
    assert.equal(JSON.stringify(inspectShadowLeaseJournal({dir})).includes(token),false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('uncertain network release is retained as manual hold rather than success',async()=>{
  const root=fixture();
  try{
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218',expectedNodeId:'synthetic-shadow-node'});
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
      parent:root,origin:'https://external.example.invalid',expectedNodeId:'synthetic-shadow-node'
    }),/origin_must_be_exact_loopback/);
    const dir=createShadowLeaseJournal({parent:root,origin:'http://127.0.0.1:43218',expectedNodeId:'synthetic-shadow-node'});
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
    const jr=createShadowLeaseJournal({parent:journalParent,origin,expectedNodeId:seed.node_id});

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


test('SIGKILL after broker launch leaves a recoverable lease and no orphan after release',
  {timeout:20_000},async()=>{
  const {spawn}=await import('node:child_process');
  const root=fixture();
  let seed;
  try{
    const seedRoot=path.join(root,'compute');
    const journalParent=path.join(root,'private-journals');
    fs.mkdirSync(journalParent,{mode:0o700});
    seed=await startNodeSeed({
      root:seedRoot,nodeId:'shadow-crash-recovery-node',
      host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
      allocatorToken:'synthetic-crash-test-allocator',
      announce:false,
    });

    const origin=seed.endpoint;
    const jr=createShadowLeaseJournal({parent:journalParent,origin,expectedNodeId:seed.node_id});
    const leaseResponse=await fetch(origin+'/v1/leases',{
      method:'POST',
      headers:{
        authorization:'Bearer synthetic-crash-test-allocator',
        'content-type':'application/json',
      },
      body:JSON.stringify({
        workload_class:'systemia.remote-capacity-broker.v1',
        requested_ttl_ms:60_000,
      }),
    });
    assert.equal(leaseResponse.status,201);
    const granted=await leaseResponse.json();

    // Parent persists the lease. A separate child will submit the job and die.
    recordShadowLease({dir:jr,lease:granted});

    const journalUrl=new URL(
      '../systemia/yard/shadow-broker-lease-journal.mjs',import.meta.url
    ).href;
    const childSource=[
      'import {recordShadowSubmissionIntent} from '+JSON.stringify(journalUrl)+';',
      'recordShadowSubmissionIntent({dir:process.env.SHADOW_JOURNAL});',
      'const response=await fetch(process.env.SHADOW_ORIGIN+"/v1/jobs",{',
      'method:"POST",headers:{"content-type":"application/json"},',
      'body:JSON.stringify({',
      'lease_id:process.env.SHADOW_LEASE_ID,',
      'token:process.env.SHADOW_LEASE_TOKEN,',
      'workload_class:"systemia.remote-capacity-broker.v1",',
      'release_ref:"32656150e433db42d00e0725507601dfa1b5641e",',
      'input:{state_root:process.env.SHADOW_BROKER_ROOT,port:0,authorized_devices:{}}',
      '})});',
      'if(response.status!==200)process.exit(41);',
      // The Compute server has started the service and sent response headers.
      // The submitting process is killed BEFORE reading the service receipt.
      'process.kill(process.pid,"SIGKILL");',
    ].join('\n');

    const childExit=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[
        '--input-type=module','-e',childSource,
      ],{
        timeout:10_000,
        killSignal:'SIGTERM',
        env:{
          PATH:process.env.PATH||'/usr/bin:/bin',
          SHADOW_JOURNAL:jr,
          SHADOW_ORIGIN:origin,
          SHADOW_LEASE_ID:granted.lease_id,
          SHADOW_LEASE_TOKEN:granted.token,
          SHADOW_BROKER_ROOT:path.join(seedRoot,'shadow-broker'),
        },
        stdio:['ignore','ignore','pipe'],
      });
      let stderr='';
      child.stderr.on('data',chunk=>{
        stderr=(stderr+chunk.toString('utf8')).slice(-1200);
      });
      child.on('error',reject);
      child.on('exit',(code,signal)=>resolve({code,signal,stderr}));
    });

    assert.equal(childExit.signal,'SIGKILL',
      'submitting child did not reach the deliberate crash point');
    assert.equal(inspectShadowLeaseJournal({dir:jr}).phase,'submission_uncertain');

    const before=await (await fetch(origin+'/v1/health')).json();
    assert.equal(before.resident_services,1);

    // Recovery happens in the still-live parent without the job receipt,
    // broker instance identity, or service ID from the dead child.
    const cleanup=await releaseShadowLease({dir:jr});
    assert.equal(cleanup.ok,true);
    assert.equal(cleanup.stopped_via_lease_release,true);
    assert.equal(inspectShadowLeaseJournal({dir:jr}).phase,'released');

    const after=await (await fetch(origin+'/v1/health')).json();
    assert.equal(after.resident_services,0);
    const journal=fs.readFileSync(path.join(jr,'lease-journal.json'),'utf8');
    assert.equal(journal.includes(granted.token),false);
  }finally{
    if(seed)await seed.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('forged or misbound release receipts never clear an unreleased lease',async()=>{
  const cases=[
    ()=>response(true,'foreign-shadow-node'),
    ()=>response(true,'synthetic-shadow-node','lease_foreign_123456'),
    ()=>response(true,'synthetic-shadow-node','lease_shadowproof_12345678',{},'f'.repeat(64)),
    ()=>response(true,'synthetic-shadow-node','lease_shadowproof_12345678',
      {type:'capacity.lease.granted'}),
  ];
  for(const fake of cases){
    const root=fixture();
    try{
      const dir=createShadowLeaseJournal({
        parent:root,origin:'http://127.0.0.1:43218',
        expectedNodeId:'synthetic-shadow-node',
      });
      recordShadowLease({dir,lease:lease()});
      recordShadowSubmissionIntent({dir});
      const result=await releaseShadowLease({dir,request:async()=>fake()});
      assert.equal(result.ok,false);
      assert.equal(result.manual_reconciliation_required,true);
      assert.equal(inspectShadowLeaseJournal({dir}).phase,'manual_hold');
      assert.equal(fs.readFileSync(path.join(dir,'lease-journal.json'),'utf8').includes(token),true);
    }finally{fs.rmSync(root,{recursive:true,force:true})}
  }
});
