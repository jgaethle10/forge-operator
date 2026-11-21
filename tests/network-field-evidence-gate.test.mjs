import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const gate=new URL('../systemia/network/field-evidence-gate.mjs',import.meta.url).pathname;
const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[gate,...args],{encoding:'utf8',timeout:5000});assert.equal(r.status,expected,r.stderr);return JSON.parse((expected?r.stderr:r.stdout).trim());};
const sh=(cmd,args,cwd)=>{const r=spawnSync(cmd,args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const mk=(dir)=>{fs.mkdirSync(dir,{mode:0o700});};
const addLog=(dir,items)=>{let previous='GENESIS';const lines=items.map((e,i)=>{const body={schema:'evercraft.network.field-outage-lab.receipt.v1',at:new Date(Date.now()+i*1000).toISOString(),event:e.event,previous_hash:previous,...(e.message_id?{message_id:e.message_id}:{}),...(e.envelope_hash?{envelope_hash:e.envelope_hash}:{})};const receipt_hash=sha(JSON.stringify(body));previous=receipt_hash;return JSON.stringify({...body,receipt_hash});});fs.writeFileSync(path.join(dir,'receipts.jsonl'),lines.join('\n')+'\n',{mode:0o600});};
test('two independent self-signed receipt captures reconcile and never promote physical validation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'network-evidence-test-'));
  try{
    fs.chmodSync(root,0o700);
    const repo=path.join(root,'repo'),a=path.join(root,'a'),b=path.join(root,'b');
    mk(repo);mk(a);mk(b);
    for(const file of ['field-outage-lab.mjs','secure-envelope.mjs','transport-router.mjs']){
      const d=path.join(repo,'systemia','network');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,file),'// synthetic fixture\n');
    }
    sh('git',['init','-q'],repo);sh('git',['-c','user.email=ci@example.invalid','-c','user.name=Test','add','.'],repo);
    sh('git',['-c','user.email=ci@example.invalid','-c','user.name=Test','commit','-qm','fixtures'],repo);
    const hash='a'.repeat(64),m1='msg_11111111',m2='msg_22222222';
    addLog(a,[{event:'message.queued',message_id:m1},{event:'message.delivered',message_id:m1,envelope_hash:hash},
      {event:'message.queued',message_id:m2},{event:'peer.unreachable'},{event:'message.delivered',message_id:m2,envelope_hash:hash}]);
    addLog(b,[{event:'node.listener.ready'},{event:'message.received',message_id:m1,envelope_hash:hash},
      {event:'node.listener.ready'},{event:'message.received',message_id:m2,envelope_hash:hash}]);
    const ar=path.join(root,'alpha.json'),br=path.join(root,'beta.json');
    assert.equal(run(['capture','--id','alpha','--peer-id','beta','--repo',repo,'--state',a,'--output',ar,'--acknowledge-owned-device']).status,'CAPTURED_SELF_ATTESTED_ONLY');
    assert.equal(run(['capture','--id','beta','--peer-id','alpha','--repo',repo,'--state',b,'--output',br,'--acknowledge-owned-device']).status,'CAPTURED_SELF_ATTESTED_ONLY');
    const x=run(['review','--alpha',ar,'--beta',br]);
    assert.equal(x.status,'CROSS_NODE_SOFTWARE_EVIDENCE_RECONCILED');assert.equal(x.matched_encrypted_delivery_receipts,2);
    assert.equal(x.distinct_physical_devices_verified,false);assert.equal(x.upstream_outage_verified,false);
    const originalA=JSON.parse(fs.readFileSync(ar,'utf8'));
    const originalB=JSON.parse(fs.readFileSync(br,'utf8'));
    const resign=(file,body,privatePem)=>{
      const copy={...body};delete copy.signature;
      const key=crypto.createPrivateKey(fs.readFileSync(privatePem));
      copy.signature=crypto.sign(null,Buffer.from(JSON.stringify(copy)),key).toString('base64');
      fs.writeFileSync(file,JSON.stringify(copy),{mode:0o600});
    };
    // A fully valid signature with a repeated message ID must not count twice.
    const replayed=structuredClone(originalA);
    replayed.receipt_log.events[4].message_id=m1;
    resign(ar,replayed,path.join(a,'field-evidence-ed25519.pem'));
    const replayReview=run(['review','--alpha',ar,'--beta',br]);
    assert.equal(replayReview.status,'HOLD_INSUFFICIENT_EVIDENCE');
    assert.equal(replayReview.distinct_delivery_ids,false);
    resign(ar,originalA,path.join(a,'field-evidence-ed25519.pem'));
    // Two restarts before the first receipt do not prove recovery after interruption.
    const wrongOrder=structuredClone(originalB);
    [wrongOrder.receipt_log.events[1],wrongOrder.receipt_log.events[2]]=[wrongOrder.receipt_log.events[2],wrongOrder.receipt_log.events[1]];
    resign(br,wrongOrder,path.join(b,'field-evidence-ed25519.pem'));
    const orderReview=run(['review','--alpha',ar,'--beta',br]);
    assert.equal(orderReview.status,'HOLD_INSUFFICIENT_EVIDENCE');
    assert.equal(orderReview.receiver_restart_between_receipts,false);
    resign(br,originalB,path.join(b,'field-evidence-ed25519.pem'));
    const original=JSON.parse(fs.readFileSync(ar,'utf8'));
    original.receipt_log.events[1].envelope_hash='b'.repeat(64);
    fs.writeFileSync(ar,JSON.stringify(original),{mode:0o600});
    assert.match(run(['review','--alpha',ar,'--beta',br],1).reason,/report_signature_invalid/);
    // Log tampering invalidates capture even if a new signed report would otherwise be issued.
    const corrupt=fs.readFileSync(path.join(a,'receipts.jsonl'),'utf8').replace('message.delivered','message.delivereX');
    fs.writeFileSync(path.join(a,'receipts.jsonl'),corrupt,{mode:0o600});
    assert.match(run(['capture','--id','alpha','--peer-id','beta','--repo',repo,'--state',a,'--output',path.join(root,'tampered.json'),'--acknowledge-owned-device'],1).reason,/receipt_hash_mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
