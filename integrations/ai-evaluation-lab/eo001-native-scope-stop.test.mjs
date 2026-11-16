import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openPrivateOneUseStopLedger} from './eo001-one-use-stop-ledger.mjs';
import {proposeExactScopeStopForReview}
  from './eo001-exact-scope-stop-review.mjs';
import {attemptApprovedExactSyntheticScopeStop}
  from './eo001-native-scope-stop.mjs';

const UNIT='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const CG='/user.slice/user-1000.slice/user@1000.service/app.slice/'+UNIT;
const BOOT='12345678-1234-4123-8123-123456789abc';
const SHA='b'.repeat(40);
const DOMAIN='evercraft.eo001.synthetic-scope-stop-permit.v1\n';
const stat=(id,ppid,group,session,start='9007199254740993')=>
  id+' (synthetic ) child) '+['S',ppid,group,session,
    ...Array(15).fill('0'),start].join(' ')+'\n';
function input(overrides={}){
  const pre={
    boot_id:BOOT,cgroup:{
      path:CG,device:'31',inode:'987654321',
      events:'populated 1\nfrozen 0\n',
      process_ids:[31001,31002],
      swap:{requested_policy:'swap-disabled',
        requested_value:'0',control_supported:true,observed_value:'0'}
    },
    worker:{pid:31001,cgroup:'0::'+CG+'\n',
      stat:stat(31001,1,31001,31001)},
    detached:{pid:31002,cgroup:'0::'+CG+'\n',
      stat:stat(31002,31001,31002,31002)}
  };
  const proposal=proposeExactScopeStopForReview({
    scopeId:UNIT,reviewedSourceRevision:SHA,
    systemdProperties:'LoadState=loaded\nActiveState=active\nControlGroup='+CG+'\n',
    supervisorProcCgroup:'0::/user.slice/private-supervisor.service\n',
    cleanupBudgetMs:3000,pre
  });
  const permit={
    schema:'evercraft.eo001.synthetic-stop-permit.v1',
    action:'EXACT_USER_SCOPE_STOP_ONLY',scope_unit:UNIT,
    source_revision:SHA,cgroup_path:CG,boot_id:BOOT,
    device:'31',inode:'987654321',
    nonce:'1'.repeat(32),valid_from_ms:100000,
    valid_until_ms:150000,stop_budget_ms:3000
  };
  const owner=generateKeyPairSync('ed25519');
  const reviewer=generateKeyPairSync('ed25519');
  const trust={
    owner:owner.publicKey.export({format:'pem',type:'spki'}),
    reviewer:reviewer.publicKey.export({format:'pem',type:'spki'})
  };
  const signature=(p,privateKey)=>sign(null,
    Buffer.from(DOMAIN+JSON.stringify(p)),privateKey).toString('base64');
  const signatures={
    owner:signature(permit,owner.privateKey),
    reviewer:signature(permit,reviewer.privateKey)
  };
  const calls={stop:[],show:0,reserve:[],receipts:[],
    finish:[],close:0,verify:0};
  let ticks=1000;
  const io={
    executionMode:'OFFLINE_SYNTHETIC_IO',
    now:()=>120000,
    monotonic:()=>ticks+=10,
    show:()=>{
      calls.show++;
      if(overrides.changedUnit)
        return 'LoadState=loaded\nActiveState=active\nControlGroup=/user.slice/other.scope\n';
      return 'LoadState=loaded\nActiveState=active\nControlGroup='+CG+'\n';
    },
    boot:()=>overrides.wrongBoot?'ffffffff-ffff-4fff-8fff-ffffffffffff':BOOT,
    identity:()=>overrides.replacedDir?
      {device:'31',inode:'987654322'}:
      {device:'31',inode:'987654321'},
    selfCgroup:()=>overrides.observerInside?'0::'+CG+'\n':
      '0::/user.slice/private-supervisor.service\n',
    procStat:id=>overrides.pidReused&&id===31002?
      stat(31002,31001,31002,31002,'9007199254740994'):
      pre[id===31001?'worker':'detached'].stat,
    procCgroup:()=>overrides.wrongProcessScope?'0::/bad.scope\n':'0::'+CG+'\n',
    cleanCommit:pin=>{calls.verify++;return !overrides.dirty&&pin===SHA;},
    stopExact:(unit,timeout)=>{
      calls.stop.push({unit,timeout});
      if(overrides.throwStop)throw Error('synthetic-stop-failed');
      return overrides.timedOut?
        {status:null,timedOut:true}:{status:0,timedOut:false};
    }
  };
  const witness={
    before:()=>structuredClone(pre),
    finish:stop=>{
      calls.finish.push(stop);
      if(overrides.missingPost){
        const err=new Error('POSTSTOP_KERNEL_EVIDENCE_MISSING');
        err.code='POSTSTOP_KERNEL_EVIDENCE_MISSING';
        err.private_negative_receipt={
          schema:'evercraft.eo001.gate1.private-negative-observation.v1',
          state:'SCOPE_LIFECYCLE_OBSERVATION_BLOCKED',
          reason:'POSTSTOP_KERNEL_EVIDENCE_MISSING'
        };
        throw err;
      }
      return {
        state:'READ_ONLY_LIFECYCLE_CONSISTENCY_REVIEW_REQUIRED',
        raw_capture_sha256:'c'.repeat(64),
        verdict:{execution_authorized:false,
          actual_process_death_independently_proven:false}
      };
    },
    close:()=>{calls.close++;}
  };
  const used=new Set();
  const sink={
    reserve:digest=>{
      calls.reserve.push(digest);
      if(overrides.reservationDenied||used.has(digest))return false;
      used.add(digest);return true;
    },
    record:receipt=>{
      calls.receipts.push(receipt);
      if(overrides.auditFails&&!calls.stop.length)return false;
      return true;
    }
  };
  return {proposal,permit,trust,signatures,io,witness,sink,calls,
    owner,reviewer,signature,
    execute:args=>attemptApprovedExactSyntheticScopeStop({
      proposal,permit,signatures,trust,io,witness,sink,...args
    })
  };
}
test('valid signed synthetic approvals only issue exact unit stop and keep physical claims false',()=>{
  const f=input();
  const result=f.execute();
  assert.equal(result.state,'SYNTHETIC_STOP_ACK_METADATA_REVIEW_REQUIRED');
  assert.equal(result.stop_request_issued,true);
  assert.equal(result.stop_request_acknowledged,true);
  assert.equal(result.local_supervisor_metadata_consistent,true);
  assert.equal(result.exact_scope_cleanup_verified,false);
  assert.equal(result.independent_host_attestation,false);
  assert.equal(result.model_execution_authorized,false);
  assert.equal(result.provider_effects_authorized,false);
  assert.deepEqual(f.calls.stop,[{unit:UNIT,timeout:3000}]);
  assert.equal(f.calls.show,2);
  assert.equal(f.calls.finish.length,1);
  assert.equal(f.calls.finish[0].outcome,'stop-request-acknowledged');
  assert.equal(f.calls.reserve.length,1);
  assert.equal(f.calls.receipts.length,2);
  assert.equal(f.calls.close,1);
  assert.equal(f.calls.receipts[0].state,
    'PRESTOP_APPROVAL_AND_SCOPE_METADATA_RECORDED');
  assert.equal(f.calls.receipts[1].state,
    'STOP_ACK_AND_SUPERVISOR_METADATA_CONSISTENT_REVIEW_REQUIRED');
});
test('no private evidence sink or witness always refuses before any real IO',()=>{
  const f=input();
  assert.throws(()=>f.execute({sink:null}),
    /NATIVE_STOP_PERSISTENCE_OR_WITNESS_MISSING/);
  assert.throws(()=>f.execute({witness:null}),
    /NATIVE_STOP_PERSISTENCE_OR_WITNESS_MISSING/);
  assert.equal(f.calls.stop.length,0);
  assert.equal(f.calls.close,1);
});
test('missing, forged, expired or wrong-role signature blocks all stops',()=>{
  for(const modify of [
    f=>f.signatures.owner='a'.repeat(88),
    f=>f.signatures.reviewer=f.signatures.owner,
    f=>f.trust.reviewer=f.trust.owner,
    f=>f.permit.valid_until_ms=110000,
    f=>f.permit.scope_unit='other.scope',
    f=>f.permit.nonce='not-a-nonce',
    f=>f.permit.source_revision='f'.repeat(40),
    f=>f.permit.stop_budget_ms=9999
  ]){
    const f=input();modify(f);
    const out=f.execute();
    assert.equal(out.state,'NATIVE_EXACT_SCOPE_STOP_HELD');
    assert.equal(f.calls.stop.length,0);
    assert.equal(out.stop_request_issued,false);
    assert.equal(f.calls.close,1);
  }
});
test('distinct PEM strings for the SAME key do not establish independent approvals',()=>{
  const f=input();
  f.trust.reviewer=f.trust.owner+'\n';
  f.signatures.reviewer=f.signatures.owner;
  const r=f.execute();
  assert.equal(r.reason,'STOP_PERMIT_ROLES_NOT_INDEPENDENT');
  assert.equal(f.calls.stop.length,0);
});
test('extra signed authority fields cannot sneak into a strictly bounded permit',()=>{
  const f=input();
  f.permit.model_execution_authorized=true;
  f.signatures.owner=f.signature(f.permit,f.owner.privateKey);
  f.signatures.reviewer=f.signature(f.permit,f.reviewer.privateKey);
  const r=f.execute();
  assert.equal(r.reason,'STOP_PERMIT_FIELDS_NOT_EXACT');
  assert.equal(f.calls.stop.length,0);
});
test('missing clean exact source pin refuses physical stop before reservation',()=>{
  const f=input({dirty:true});
  const result=f.execute();
  assert.equal(result.reason,'NATIVE_STOP_SOURCE_NOT_PINNED_CLEAN');
  assert.equal(f.calls.reserve.length,0);
  assert.equal(f.calls.stop.length,0);
});
test('manager replacement, boot drift and mismatched cgroup identity block',()=>{
  const cases=[
    ['changedUnit','NATIVE_STOP_MANAGER_SCOPE_CHANGED'],
    ['wrongBoot','NATIVE_STOP_HOST_BOOT_CHANGED'],
    ['replacedDir','NATIVE_STOP_KERNEL_SCOPE_CHANGED'],
    ['observerInside','NATIVE_STOP_OBSERVER_INSIDE_TARGET'],
    ['pidReused','NATIVE_STOP_PROCESS_IDENTITY_CHANGED'],
    ['wrongProcessScope','NATIVE_STOP_PROCESS_IDENTITY_CHANGED']
  ];
  for(const [key,reason] of cases){
    const f=input({[key]:true}),r=f.execute();
    assert.equal(r.reason,reason);
    assert.equal(f.calls.stop.length,0);
    assert.equal(f.calls.reserve.length,0);
  }
});
test('denied one-use reservation or failed durable prestop receipt blocks actuation',()=>{
  for(const [option,reason] of [
    ['reservationDenied','NATIVE_STOP_PERMIT_REPLAY_OR_RESERVATION_FAILED'],
    ['auditFails','NATIVE_STOP_PRIVATE_RECEIPT_NOT_DURABLE']
  ]){
    const f=input({[option]:true}),r=f.execute();
    assert.equal(r.reason,reason);
    assert.equal(r.stop_request_issued,false);
    assert.equal(f.calls.stop.length,0);
  }
});
test('timed-out stop attempts exactly one poststop readback and holds lane',()=>{
  const f=input({timedOut:true});
  const r=f.execute();
  assert.equal(r.reason,'NATIVE_STOP_NOT_ACKNOWLEDGED_OR_TIMEOUT');
  assert.equal(r.state,'NATIVE_EXACT_SCOPE_STOP_HELD');
  assert.equal(r.stop_request_issued,true);
  assert.equal(r.exact_scope_cleanup_verified,false);
  assert.equal(f.calls.stop.length,1);
  assert.equal(f.calls.finish.length,1);
  assert.equal(f.calls.finish[0].outcome,'stop-failed-or-unknown');
  assert.equal(f.calls.close,1);
  assert.equal(f.calls.receipts.at(-1).state,'NATIVE_EXACT_SCOPE_STOP_HELD');
  assert.equal(f.calls.receipts.at(-1).private_negative_receipt.state,
    'POSTSTOP_CAPTURE_SUPPLIED_BUT_STOP_NOT_ACKNOWLEDGED');
});
test('native stop subprocess exception also triggers poststop witness, never retries',()=>{
  const f=input({throwStop:true}),r=f.execute();
  assert.equal(r.state,'NATIVE_EXACT_SCOPE_STOP_HELD');
  assert.equal(f.calls.stop.length,1);
  assert.equal(f.calls.finish.length,1);
  assert.equal(f.calls.close,1);
});
test('poststop scope disappeared remains UNKNOWN with negative private record',()=>{
  const f=input({missingPost:true}),r=f.execute();
  assert.equal(r.reason,'POSTSTOP_KERNEL_EVIDENCE_MISSING');
  assert.equal(r.private_negative_observation_supplied,true);
  assert.equal(r.exact_scope_cleanup_verified,false);
  assert.equal(f.calls.stop.length,1);
  assert.equal(f.calls.finish.length,1);
  assert.equal(f.calls.receipts.at(-1).private_negative_receipt.reason,
    'POSTSTOP_KERNEL_EVIDENCE_MISSING');
});
test('approval provided by chat booleans is not a signature or owner host authorization',()=>{
  const f=input();
  const r=f.execute({permit:{...f.permit,ownerApproved:true}});
  assert.equal(r.state,'NATIVE_EXACT_SCOPE_STOP_HELD');
  assert.equal(f.calls.stop.length,0);
});

test('real local fsynced one-use sink works with fake systemd and forbids replay across process reopens',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-stop-real-ledger-ci-'));
  try{
    const first=input(),sink=openPrivateOneUseStopLedger({directory:dir});
    try{
      const r=first.execute({sink});
      assert.equal(r.state,'SYNTHETIC_STOP_ACK_METADATA_REVIEW_REQUIRED');
      assert.deepEqual(first.calls.stop,[{unit:UNIT,timeout:3000}]);
    }finally{sink.close();}
    const names=fs.readdirSync(dir);
    assert.equal(names.length,3);
    assert.ok(names.some(n=>n.endsWith('.reserved.json')));
    const second=input(),reopened=openPrivateOneUseStopLedger({directory:dir});
    try{
      const r=second.execute({sink:reopened});
      assert.equal(r.state,'NATIVE_EXACT_SCOPE_STOP_HELD');
      assert.equal(r.stop_request_issued,false);
      assert.equal(second.calls.stop.length,0);
      assert.equal(second.calls.reserve.length,0);
    }finally{reopened.close();}
    assert.equal(fs.readdirSync(dir).length,3);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('real disk ledger preserves pre-reservation refusal instead of masking it as write failure',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-stop-denial-ci-'));
  try{
    for(const mode of ['forged-signature','changed-manager-scope','dirty-source']){
      const f=input({
        changedUnit:mode==='changed-manager-scope',
        dirty:mode==='dirty-source'
      });
      if(mode==='forged-signature')f.signatures.owner='broken';
      const sink=openPrivateOneUseStopLedger({directory:dir});
      try{
        const result=f.execute({sink});
        assert.equal(result.state,'NATIVE_EXACT_SCOPE_STOP_HELD');
        assert.equal(result.reason,
          mode==='forged-signature'?'STOP_PERMIT_SIGNATURE_INVALID':
          mode==='changed-manager-scope'?'NATIVE_STOP_MANAGER_SCOPE_CHANGED':
          'NATIVE_STOP_SOURCE_NOT_PINNED_CLEAN');
        assert.equal(result.stop_permit_reserved,false);
        assert.equal(result.local_failure_record_persisted,false);
        assert.equal(result.stop_request_issued,false);
        assert.equal(f.calls.stop.length,0);
        assert.equal(f.calls.close,1);
        assert.equal(fs.readdirSync(dir).length,0);
      }finally{sink.close();}
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real disk ledger replay returns replay denial without creating new receipts',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-stop-replay-ci-'));
  try{
    const first=input(),firstSink=openPrivateOneUseStopLedger({directory:dir});
    try{
      assert.equal(first.execute({sink:firstSink}).state,
        'SYNTHETIC_STOP_ACK_METADATA_REVIEW_REQUIRED');
    }finally{firstSink.close();}
    const files=fs.readdirSync(dir).sort();
    const again=input(),secondSink=openPrivateOneUseStopLedger({directory:dir});
    try{
      const denied=again.execute({sink:secondSink});
      assert.equal(denied.reason,
        'NATIVE_STOP_PERMIT_REPLAY_OR_RESERVATION_FAILED');
      assert.equal(denied.stop_permit_reserved,false);
      assert.equal(denied.local_failure_record_persisted,false);
      assert.equal(again.calls.stop.length,0);
      assert.deepEqual(fs.readdirSync(dir).sort(),files);
    }finally{secondSink.close();}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('production/native route remains intentionally unavailable, even with valid signed permit',()=>{
  const f=input();
  const noNative=f.execute({io:null});
  assert.equal(noNative.state,'NATIVE_EXACT_SCOPE_STOP_HELD');
  assert.equal(noNative.reason,'NATIVE_STOP_MANAGER_ATOMIC_BINDING_UNAVAILABLE');
  assert.equal(noNative.stop_request_issued,false);
  assert.equal(noNative.stop_permit_reserved,false);
  assert.equal(noNative.local_failure_record_persisted,false);
  assert.equal(f.calls.reserve.length,0);
  assert.equal(f.calls.stop.length,0);
  assert.equal(f.calls.close,1);
});
test('unlabeled or falsely production-labeled I/O cannot issue a stop',()=>{
  for(const mode of [undefined,'PRODUCTION_NATIVE','APPROVED_FIELD_RUN']){
    const f=input();
    const io={...f.io,executionMode:mode};
    const result=f.execute({io});
    assert.equal(result.reason,'NATIVE_STOP_MANAGER_ATOMIC_BINDING_UNAVAILABLE');
    assert.equal(result.stop_request_issued,false);
    assert.equal(f.calls.stop.length,0);
    assert.equal(f.calls.reserve.length,0);
  }
});
test('controller has no native host subprocess or by-name stop implementation',()=>{
  const code=fs.readFileSync(new URL('./eo001-native-scope-stop.mjs',import.meta.url),'utf8');
  assert.equal(code.includes("from 'node:child_process'"),false);
  assert.equal(code.includes('spawnSync('),false);
  assert.equal(code.includes('function nativeIo('),false);
  assert.equal(code.includes("'/usr/bin/systemctl'"),false);
});

test('alternative held-FD cgroup.kill review can never reuse StopUnit permit',()=>{
  const f=input();
  const reviewOnly={
    schema:'evercraft.eo001.gate1.held-cgroup-kill-review.v1',
    state:'HELD_SCOPE_CGROUP_KILL_CANDIDATE_SOURCE_REVIEW_ONLY',
    candidate_kernel_control_file:'cgroup.kill',
    candidate_single_write_value:'1',
    execution_authorized:false
  };
  const r=f.execute({proposal:reviewOnly});
  assert.equal(r.reason,'NATIVE_STOP_UNREVIEWED_PROPOSAL');
  assert.equal(r.stop_request_issued,false);
  assert.equal(f.calls.reserve.length,0);
  assert.equal(f.calls.stop.length,0);
});
