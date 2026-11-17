import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openPrivateOneUseStopLedger,auditPrivateOneUseStopLedger}
  from './eo001-one-use-stop-ledger.mjs';

const D='d'.repeat(64);
const R='e'.repeat(64);
const fn=i=>'eo001-stop-'+D+'-'+String(i).padStart(3,'0')+'.json';
const hash=x=>createHash('sha256').update(x).digest('hex');
const pre=()=>({
  schema:'evercraft.eo001.native-stop-prestop.v1',
  state:'PRESTOP_APPROVAL_AND_SCOPE_METADATA_RECORDED',
  permit_digest_sha256:D,scope_unit:'eo001-g1-synthetic-'+'a'.repeat(32)+'.scope',
  source_revision:'f'.repeat(40),actual_stop_performed:false,
  physical_proof:false
});
const outcome=()=>({
  schema:'evercraft.eo001.native-stop-observation.v1',
  state:'STOP_ACK_AND_SUPERVISOR_METADATA_CONSISTENT_REVIEW_REQUIRED',
  permit_digest_sha256:D,packet_sha256:'b'.repeat(64),
  independently_attested:false,full_scope_cleanup_independently_proven:false
});
const blocked=()=>({
  schema:'evercraft.eo001.gate1.native-stop-blocked.v1',
  state:'NATIVE_EXACT_SCOPE_STOP_HELD',permit_digest_sha256:D,
  stop_request_issued:true,exact_scope_cleanup_verified:false
});
function withDirectory(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-stop-audit-ci-'));
  try{return fn(dir);}finally{
    fs.chmodSync(dir,0o700);
    fs.rmSync(dir,{force:true,recursive:true});
  }
}
function save(dir,receipts=[]){
  const sink=openPrivateOneUseStopLedger({directory:dir});
  try{
    assert.equal(sink.reserve(D),true);
    for(const r of receipts)assert.equal(sink.record(r),true);
  }finally{sink.close();}
}
function audit(dir){return auditPrivateOneUseStopLedger({
  directory:dir,permitDigest:D
});}
test('a burned permit with no receipt is INCOMPLETE, not safe-to-run or proof',()=>{
  withDirectory(dir=>{
    save(dir);
    const r=audit(dir);
    assert.equal(r.state,'PERMIT_BURNED_NO_PRESTOP_RECORD');
    assert.equal(r.files_checked,1);
    assert.equal(r.records_count,0);
    for(const key of ['disk_fsync_history_independently_attested',
      'source_authenticity_attested','independent_host_attestation',
      'systemd_stop_independently_observed',
      'recursively_empty_cgroup_independently_proven',
      'physical_scope_cleanup_verified','lab_gate1_authorized',
      'model_execution_authorized','provider_effects_authorized'])
      assert.equal(r[key],false);
    assert.equal(r.permit_rearmed,false);
  });
});
test('PRESTOP record alone never becomes a successful stop',()=>{
  withDirectory(dir=>{
    save(dir,[pre()]);
    const r=audit(dir);
    assert.equal(r.state,'PRESTOP_RECORD_NO_TERMINAL_OUTCOME');
    assert.equal(r.records_count,1);
    assert.equal(r.physical_scope_cleanup_verified,false);
  });
});
test('valid two-record chain is local review-only, not host attestation',()=>{
  withDirectory(dir=>{
    save(dir,[pre(),outcome()]);
    const first=fs.readFileSync(path.join(dir,fn(0)));
    const second=JSON.parse(fs.readFileSync(path.join(dir,fn(1)),'utf8'));
    assert.equal(second.previous_record_sha256,hash(first));
    const r=audit(dir);
    assert.equal(r.state,'LOCAL_STOP_ACK_METADATA_REVIEW_REQUIRED');
    assert.equal(r.records_count,2);
    assert.equal(r.local_record_chain_consistent,true);
    assert.equal(r.systemd_stop_independently_observed,false);
    assert.equal(r.physical_scope_cleanup_verified,false);
    assert.doesNotMatch(JSON.stringify(r),/31001|PRIVATE_HOST_PROCFS|raw/);
  });
});
test('a negative terminal record is never upgraded to a cleanup claim',()=>{
  withDirectory(dir=>{
    save(dir,[pre(),blocked()]);
    const r=audit(dir);
    assert.equal(r.state,'LOCAL_STOP_BLOCKED_OR_UNKNOWN');
    assert.equal(r.physical_scope_cleanup_verified,false);
  });
});
test('blocked before PRESTOP is recognized as a held attempt',()=>{
  withDirectory(dir=>{
    save(dir,[blocked()]);
    assert.equal(audit(dir).state,'BLOCKED_WITHOUT_PRESTOP_RECORD');
  });
});
test('deleting the first record makes remaining ordinal 001 invalid',()=>{
  withDirectory(dir=>{
    save(dir,[pre(),outcome()]);
    fs.unlinkSync(path.join(dir,fn(0)));
    assert.throws(()=>audit(dir),/STOP_LEDGER_AUDIT_GAPPED_SEQUENCE/);
  });
});
test('receipt tampering and inconsistent receipt digests refuse audit',()=>{
  withDirectory(dir=>{
    save(dir,[pre()]);
    const p=path.join(dir,fn(0));
    const row=JSON.parse(fs.readFileSync(p,'utf8'));
    row.receipt.state='FORGED_PHYSICAL_SUCCESS';
    fs.writeFileSync(p,JSON.stringify(row));
    assert.throws(()=>audit(dir),/STOP_LEDGER_AUDIT_RECORD_INTEGRITY_INVALID/);
  });
});
test('even recomputing a first record digest breaks the next chain link',()=>{
  withDirectory(dir=>{
    save(dir,[pre(),outcome()]);
    const p=path.join(dir,fn(0));
    const row=JSON.parse(fs.readFileSync(p,'utf8'));
    row.receipt.state='MODIFIED_AFTER_CAPTURE';
    row.receipt_sha256=hash(Buffer.from(JSON.stringify(row.receipt)));
    fs.writeFileSync(p,JSON.stringify(row));
    assert.throws(()=>audit(dir),/STOP_LEDGER_AUDIT_RECORD_INTEGRITY_INVALID/);
  });
});
test('a missing or altered reservation is a hard failure, not a new permit',()=>{
  withDirectory(dir=>{
    save(dir,[pre()]);
    const p=path.join(dir,'eo001-stop-permit-'+D+'.reserved.json');
    fs.unlinkSync(p);
    assert.throws(()=>audit(dir),/STOP_LEDGER_AUDIT_UNAVAILABLE/);
  });
  withDirectory(dir=>{
    save(dir);
    const p=path.join(dir,'eo001-stop-permit-'+D+'.reserved.json');
    const row=JSON.parse(fs.readFileSync(p,'utf8'));
    row.authorized_host_run_proven=true;
    fs.writeFileSync(p,JSON.stringify(row));
    assert.throws(()=>audit(dir),/STOP_LEDGER_AUDIT_RESERVATION_INVALID/);
  });
});
test('symlinked, group-readable and multiply linked records refuse audit',()=>{
  for(const mode of ['symlink','group','hardlink']){
    withDirectory(dir=>{
      save(dir,[pre()]);
      const p=path.join(dir,fn(0));
      if(mode==='symlink'){
        fs.renameSync(p,p+'.orig');
        fs.symlinkSync(p+'.orig',p);
      }else if(mode==='group')fs.chmodSync(p,0o640);
      else fs.linkSync(p,p+'.hardlink');
      assert.throws(()=>audit(dir),
        /STOP_LEDGER_AUDIT_UNAVAILABLE|STOP_LEDGER_AUDIT_UNTRUSTED_FILE|STOP_LEDGER_AUDIT_RECORD_NAMES_INVALID/);
    });
  }
});
test('extra spoofed filenames and noncontiguous numbering block readback',()=>{
  withDirectory(dir=>{
    save(dir,[pre()]);
    fs.writeFileSync(path.join(dir,fn(1)+'.extra'),'x',{mode:0o600});
    assert.throws(()=>audit(dir),/STOP_LEDGER_AUDIT_RECORD_NAMES_INVALID/);
  });
});
test('maliciously planted observation without PRESTOP or third record refuses audit',()=>{
  // The writer itself now rejects these invalid sequences. Plant exact
  // locally hash-consistent bytes to exercise independent auditor refusals.
  const plant=(dir,i,receipt,previous)=>{
    const row={
      schema:'evercraft.eo001.one-use-stop-record.v1',
      permit_digest_sha256:D,ordinal:i,previous_record_sha256:previous,
      receipt_sha256:hash(Buffer.from(JSON.stringify(receipt))),receipt,
      independent_host_attestation:false,immutable_owner_proof:false
    };
    fs.writeFileSync(path.join(dir,fn(i)),JSON.stringify(row),
      {flag:'wx',mode:0o600});
  };
  withDirectory(dir=>{
    save(dir);
    plant(dir,0,outcome(),null);
    assert.throws(()=>audit(dir),/STOP_LEDGER_AUDIT_RECORD_SEQUENCE_INVALID/);
  });
  withDirectory(dir=>{
    save(dir,[pre(),outcome()]);
    plant(dir,2,blocked(),hash(fs.readFileSync(path.join(dir,fn(1)))));
    assert.throws(()=>audit(dir),
      /STOP_LEDGER_AUDIT_RECORD_SEQUENCE_INVALID|STOP_LEDGER_AUDIT_RECORD_NAMES_INVALID/);
  });
});
test('an unrelated permit cannot substitute for the requested digest',()=>{
  withDirectory(dir=>{
    save(dir,[pre()]);
    assert.throws(()=>auditPrivateOneUseStopLedger({
      directory:dir,permitDigest:R
    }),/STOP_LEDGER_AUDIT_UNAVAILABLE/);
  });
});
