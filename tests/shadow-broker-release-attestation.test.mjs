import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  createShadowLeaseJournal,
  recordShadowLease,
  recordShadowSubmissionIntent,
  releaseShadowLease,
  inspectShadowLeaseReleaseEvidence,
} from '../systemia/yard/shadow-broker-lease-journal.mjs';

const NODE='synthetic-attestation-node';
const LEASE='lease_releaseproof_12345';
const TOKEN='c'.repeat(48);
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-release-attestation-'));
  fs.chmodSync(root,0o700);
  const dir=createShadowLeaseJournal({
    parent:root,
    origin:'http://127.0.0.1:43217',
    expectedNodeId:NODE,
  });
  recordShadowLease({
    dir,
    lease:{
      lease_id:LEASE,token:TOKEN,
      expires_at:new Date(Date.now()+60_000).toISOString(),
    },
  });
  recordShadowSubmissionIntent({dir});
  return {root,dir};
}
function response(overrides={},forgedHash=null){
  const body={
    schema:'evercraft.compute.receipt.v1',
    node_id:NODE,seq:2,
    type:'capacity.lease.released',
    at:'2026-11-19T00:00:00.000Z',
    previous_hash:'f'.repeat(64),
    lease_id:LEASE,
    workload_class:'systemia.remote-capacity-broker.v1',
    ...overrides,
  };
  return {
    ok:true,
    json:async()=>({
      ok:true,
      receipt:{
        ...body,
        receipt_hash:forgedHash||
          createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      },
    }),
  };
}
test('successful release saves token-free bound receipt and attests it without a network probe',async()=>{
  const {root,dir}=fixture();
  try{
    const release=await releaseShadowLease({dir,request:async()=>response()});
    assert.equal(release.ok,true);
    const proof=inspectShadowLeaseReleaseEvidence({dir,expectedNodeId:NODE});
    assert.equal(proof.ok,true,JSON.stringify(proof));
    assert.equal(proof.release_receipt_verified,true);
    assert.equal(proof.secret_token_erased,true);
    assert.equal(proof.journal_phase,'released');
    assert.equal(proof.receipt_integrity_only_not_signed,true);
    assert.equal(proof.broker_activation_authorized,false);
    assert.equal(proof.automatic_job_retry_allowed,false);
    const raw=fs.readFileSync(path.join(dir,'lease-journal.json'),'utf8');
    assert.equal(raw.includes(TOKEN),false);
    assert.equal(raw.includes('receipt_hash'),true);
    assert.equal(JSON.stringify(proof).includes(LEASE),false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('fake node binding and altered stored receipt hash fail closed',async()=>{
  const {root,dir}=fixture();
  try{
    await releaseShadowLease({dir,request:async()=>response()});
    assert.equal(inspectShadowLeaseReleaseEvidence({
      dir,expectedNodeId:'foreign-node',
    }).ok,false);
    const file=path.join(dir,'lease-journal.json');
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    data.release_receipt.receipt_hash='0'.repeat(64);
    fs.writeFileSync(file,JSON.stringify(data),{mode:0o600});
    const proof=inspectShadowLeaseReleaseEvidence({dir,expectedNodeId:NODE});
    assert.equal(proof.ok,false);
    assert.equal(proof.manual_reconciliation_required,true);
    assert.equal(proof.automatic_job_retry_allowed,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unconfirmed release remains a hold and retains private recoverable token',async()=>{
  const {root,dir}=fixture();
  try{
    const release=await releaseShadowLease({
      dir,request:async()=>{throw Error('lost_network_ack')},
    });
    assert.equal(release.ok,false);
    const proof=inspectShadowLeaseReleaseEvidence({dir,expectedNodeId:NODE});
    assert.equal(proof.ok,false);
    assert.equal(proof.journal_phase,'manual_hold');
    assert.equal(proof.secret_token_erased,false);
    assert.equal(proof.manual_reconciliation_required,true);
    const raw=fs.readFileSync(path.join(dir,'lease-journal.json'),'utf8');
    assert.equal(raw.includes(TOKEN),true);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('forged 200 response and extra proof field fail before storing release',async()=>{
  const scenarios=[
    ()=>response({},'0'.repeat(64)),
    ()=>response({authorization:'do-not-include-extra-field'}),
    ()=>response({node_id:'foreign-node'}),
  ];
  for(const make of scenarios){
    const {root,dir}=fixture();
    try{
      const result=await releaseShadowLease({dir,request:async()=>make()});
      assert.equal(result.ok,false);
      const proof=inspectShadowLeaseReleaseEvidence({dir,expectedNodeId:NODE});
      assert.equal(proof.ok,false);
      assert.equal(proof.journal_phase,'manual_hold');
      assert.equal(proof.manual_reconciliation_required,true);
      const data=JSON.parse(fs.readFileSync(
        path.join(dir,'lease-journal.json'),'utf8'
      ));
      assert.equal('release_receipt' in data,false);
    }finally{fs.rmSync(root,{recursive:true,force:true})}
  }
});
