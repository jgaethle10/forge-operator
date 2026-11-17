import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openPrivateOneUseStopLedger}
  from './eo001-one-use-stop-ledger.mjs';

const digest='d'.repeat(64);
function withPrivateDir(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-durable-stop-ci-'));
  try{return fn(dir);}finally{
    fs.chmodSync(dir,0o700);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
function receipt(state='PRESTOP_APPROVAL_AND_SCOPE_METADATA_RECORDED'){
  return {
    schema:'evercraft.eo001.native-stop-prestop.v1',
    state,permit_digest_sha256:digest,scope_unit:
      'eo001-g1-synthetic-'+'a'.repeat(32)+'.scope',
    source_revision:'f'.repeat(40),
    actual_stop_performed:false,physical_proof:false
  };
}
test('exclusive durable reservation is private, persisted and one-use across reopens',()=>{
  withPrivateDir(dir=>{
    const first=openPrivateOneUseStopLedger({directory:dir});
    const simultaneous=openPrivateOneUseStopLedger({directory:dir});
    assert.equal(first.reserve(digest),true);
    assert.equal(simultaneous.reserve(digest),false);
    assert.throws(()=>simultaneous.record(receipt()),/STOP_LEDGER_NOT_RESERVED/);
    first.close();simultaneous.close();
    const reopened=openPrivateOneUseStopLedger({directory:dir});
    assert.equal(reopened.reserve(digest),false);
    reopened.close();
    const filename='eo001-stop-permit-'+digest+'.reserved.json';
    assert.deepEqual(fs.readdirSync(dir),[filename]);
    assert.equal(fs.statSync(path.join(dir,filename)).mode&0o777,0o600);
    const claim=JSON.parse(fs.readFileSync(path.join(dir,filename),'utf8'));
    assert.equal(claim.state,'PERMIT_BURNED_BEFORE_POSSIBLE_STOP');
    assert.equal(claim.authorized_host_run_proven,false);
    assert.equal(claim.source_authenticity_attested,false);
  });
});
test('one-use ledger persists ordered private receipts with hashes and no attestation',()=>{
  withPrivateDir(dir=>{
    const sink=openPrivateOneUseStopLedger({directory:dir});
    assert.equal(sink.reserve(digest),true);
    assert.equal(sink.record(receipt()),true);
    const last={schema:'evercraft.eo001.native-stop-observation.v1',
      state:'STOP_ACK_AND_SUPERVISOR_METADATA_CONSISTENT_REVIEW_REQUIRED',
      permit_digest_sha256:digest,packet_sha256:'a'.repeat(64)};
    assert.equal(sink.record(last),true);
    sink.close();
    const files=fs.readdirSync(dir).sort();
    assert.equal(files.length,3);
    for(let i=0;i<2;i++){
      const file='eo001-stop-'+digest+'-'+String(i).padStart(3,'0')+'.json';
      assert.ok(files.includes(file));
      assert.equal(fs.statSync(path.join(dir,file)).mode&0o777,0o600);
      const data=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
      assert.equal(data.permit_digest_sha256,digest);
      assert.equal(data.ordinal,i);
      assert.equal(data.independent_host_attestation,false);
      assert.equal(data.immutable_owner_proof,false);
      assert.equal(data.receipt_sha256,
        createHash('sha256').update(JSON.stringify(data.receipt)).digest('hex'));
    }
  });
});
test('cannot record without reservation, on closed file descriptor, or reuse instance',()=>{
  withPrivateDir(dir=>{
    const sink=openPrivateOneUseStopLedger({directory:dir});
    assert.throws(()=>sink.record(receipt()),/STOP_LEDGER_NOT_RESERVED/);
    assert.throws(()=>sink.reserve('not-a-digest'),
      /STOP_LEDGER_PERMIT_DIGEST_INVALID/);
    assert.equal(sink.reserve(digest),true);
    assert.throws(()=>sink.reserve('e'.repeat(64)),
      /STOP_LEDGER_ALREADY_RESERVED_BY_THIS_SINK/);
    sink.close();
    assert.throws(()=>sink.record(receipt()),/STOP_LEDGER_CLOSED/);
    assert.throws(()=>sink.reserve('e'.repeat(64)),/STOP_LEDGER_CLOSED/);
  });
});
test('receipt must be typed, source-bound and within strict size budget',()=>{
  withPrivateDir(dir=>{
    const sink=openPrivateOneUseStopLedger({directory:dir});
    assert.equal(sink.reserve(digest),true);
    for(const wrong of [
      {schema:'different.v1',permit_digest_sha256:digest},
      {...receipt(),permit_digest_sha256:'e'.repeat(64)},
      {...receipt(),private_payload:'x'.repeat(256*1024)},
      {...receipt(),data:9n}
    ])assert.throws(()=>sink.record(wrong),
      /STOP_LEDGER_RECEIPT_UNBOUND|STOP_LEDGER_RECORD_OVERSIZED|STOP_LEDGER_RECEIPT_NOT_SERIALIZABLE/);
    assert.equal(fs.readdirSync(dir).length,1);
    assert.equal(sink.record(receipt()),true);
    sink.close();
  });
});
test('receipt file collision fails closed even after reopen with same valid permit',()=>{
  withPrivateDir(dir=>{
    const sink=openPrivateOneUseStopLedger({directory:dir});
    assert.equal(sink.reserve(digest),true);
    const file='eo001-stop-'+digest+'-000.json';
    fs.writeFileSync(path.join(dir,file),'existing-private-record',
      {flag:'wx',mode:0o600});
    assert.throws(()=>sink.record(receipt()),/STOP_LEDGER_RECEIPT_ALREADY_EXISTS/);
    assert.equal(fs.readFileSync(path.join(dir,file),'utf8'),'existing-private-record');
    sink.close();
  });
});
test('symlinked directory and world-readable directory are blocked',()=>{
  withPrivateDir(dir=>{
    const link=dir+'-linked';
    fs.symlinkSync(dir,link,'dir');
    try{assert.throws(()=>openPrivateOneUseStopLedger({directory:link}),
      /STOP_LEDGER_DIRECTORY_UNAVAILABLE|STOP_LEDGER_DIRECTORY_UNTRUSTED/);}
    finally{fs.unlinkSync(link);}
    fs.chmodSync(dir,0o750);
    assert.throws(()=>openPrivateOneUseStopLedger({directory:dir}),
      /STOP_LEDGER_DIRECTORY_UNTRUSTED/);
  });
});
test('does not create missing directory, permit, service or runner',()=>{
  withPrivateDir(dir=>{
    const missing=path.join(dir,'not-created');
    assert.throws(()=>openPrivateOneUseStopLedger({directory:missing}),
      /STOP_LEDGER_DIRECTORY_UNAVAILABLE/);
    assert.throws(()=>openPrivateOneUseStopLedger({directory:'../unsafe'}),
      /STOP_LEDGER_DIRECTORY_INVALID/);
    assert.equal(fs.readdirSync(dir).length,0);
  });
});

test('writer rejects terminal without PRESTOP, duplicate PRESTOP and any third receipt',()=>{
  withPrivateDir(dir=>{
    const sink=openPrivateOneUseStopLedger({directory:dir});
    assert.equal(sink.reserve(digest),true);
    const final={
      schema:'evercraft.eo001.native-stop-observation.v1',
      permit_digest_sha256:digest,
      state:'STOP_ACK_AND_SUPERVISOR_METADATA_CONSISTENT_REVIEW_REQUIRED'
    };
    assert.throws(()=>sink.record(final),
      /STOP_LEDGER_RECEIPT_SEQUENCE_INVALID/);
    assert.equal(sink.record(receipt()),true);
    assert.throws(()=>sink.record(receipt()),
      /STOP_LEDGER_RECEIPT_SEQUENCE_INVALID/);
    assert.equal(sink.record(final),true);
    assert.throws(()=>sink.record(final),
      /STOP_LEDGER_RECORD_LIMIT/);
    sink.close();
    assert.equal(fs.readdirSync(dir).length,3);
  });
});
test('blocked first receipt is terminal and cannot be followed by another record',()=>{
  withPrivateDir(dir=>{
    const sink=openPrivateOneUseStopLedger({directory:dir});
    assert.equal(sink.reserve(digest),true);
    assert.equal(sink.record({
      schema:'evercraft.eo001.gate1.native-stop-blocked.v1',
      state:'NATIVE_EXACT_SCOPE_STOP_HELD',
      permit_digest_sha256:digest,stop_request_issued:false
    }),true);
    assert.throws(()=>sink.record(receipt()),
      /STOP_LEDGER_RECEIPT_SEQUENCE_INVALID/);
    sink.close();
  });
});
