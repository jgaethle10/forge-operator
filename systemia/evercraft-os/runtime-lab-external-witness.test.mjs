import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {EvercraftOsLabLifecycleJournal} from './runtime-lab-journal.mjs';
import {EvercraftOsLabExternalWitnessGate,LAB_EXTERNAL_WITNESS_ENVELOPE,LAB_EXTERNAL_WITNESS_BODY,LAB_EXTERNAL_WITNESS_DOMAIN,hashLabExternalWitnessReceipt} from './runtime-lab-external-witness.mjs';
const NOW=new Date('2026-10-13T05:00:00.000Z');
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const jId='node-A:lab-runtime';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'os-lab-witness-'));
 const journal=new EvercraftOsLabLifecycleJournal(root);
 const key=generateKeyPairSync('ed25519');
 let external=null;
 let seen=0;
 const gate=new EvercraftOsLabExternalWitnessGate({journalId:jId,publicKey:key.publicKey.export({type:'spki',format:'pem'}),witnessSource:()=>{seen++;return external;},now:()=>NOW});
 const issue=(state=journal.inspect(),changes={},privateKey=key.privateKey)=>{
   const body={schema:LAB_EXTERNAL_WITNESS_BODY,journal_id:jId,sequence:state.count,head_hash:state.head_hash,witness_epoch:1,issued_at:NOW.toISOString(),expires_at:new Date(NOW.getTime()+60000).toISOString(),...changes};
   const envelope={schema:LAB_EXTERNAL_WITNESS_ENVELOPE,signature_algorithm:'ed25519',body,
    signature_base64:sign(null,Buffer.concat([Buffer.from(LAB_EXTERNAL_WITNESS_DOMAIN),Buffer.from(JSON.stringify(canon(body)))]),privateKey).toString('base64')};
   return {receipt:envelope,committedDigest:hashLabExternalWitnessReceipt(envelope)};
 };
 const set=(x)=>{external=x;};
 return {root,journal,gate,issue,set,reads:()=>seen};
}
function run(title,fn){test(title,()=>{const f=fixture();try{fn(f);}finally{fs.rmSync(f.root,{recursive:true,force:true});}});}
run('detached signed genesis is needed even when local log has no events',f=>{
 assert.equal(f.gate.inspect(f.journal.inspect()).state,'held');
 f.set(f.issue());const r=f.gate.inspect(f.journal.inspect());assert.equal(r.state,'witnessed_exact_checkpoint');assert.equal(r.sequence,0);assert.equal(r.mutation_performed,false);
});
run('external signer anchors an exact populated journal checkpoint without mutating it',f=>{
 f.journal.append({job_id:'p1',state:'intent'});f.set(f.issue());const before=fs.readFileSync(f.journal.log);const r=f.gate.inspect(f.journal.inspect());assert.equal(r.state,'witnessed_exact_checkpoint');assert.equal(r.independently_witnessed,true);assert.deepEqual(fs.readFileSync(f.journal.log),before);
});
run('local journal and checkpoint rewritten together to older valid pair cannot satisfy newer witness',f=>{
 f.journal.append({job_id:'p1',state:'intent'});const logOld=fs.readFileSync(f.journal.log),headOld=fs.readFileSync(f.journal.head);
 f.journal.append({job_id:'p1',state:'spawned'});f.set(f.issue());
 fs.writeFileSync(f.journal.log,logOld);fs.writeFileSync(f.journal.head,headOld);
 assert.equal(f.journal.inspect().state,'verified_local_chain');
 assert.match(f.gate.inspect(f.journal.inspect()).reason,/witness_checkpoint_diverged/);
});
run('same-length rebuilt journal and matching forged local head cannot satisfy independent witness',f=>{
 f.journal.append({job_id:'p1',state:'intent'});const original=f.issue();f.journal.append({job_id:'p1',state:'spawned'});f.set(f.issue());
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'os-witness-rewrite-'));
 try{const other=new EvercraftOsLabLifecycleJournal(tmp);other.append({job_id:'p1',state:'fake'});other.append({job_id:'p1',state:'spawned'});fs.copyFileSync(other.log,f.journal.log);fs.copyFileSync(other.head,f.journal.head);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
 assert.equal(f.journal.inspect().state,'verified_local_chain');assert.match(f.gate.inspect(f.journal.inspect()).reason,/checkpoint_diverged/);assert.notEqual(original.receipt.body.head_hash,f.journal.inspect().head_hash);
});
run('replaying a previously signed old receipt fails against newer independently pinned digest',f=>{
 f.journal.append({state:'old'});const old=f.issue();f.journal.append({state:'new'});const newest=f.issue();
 f.set({receipt:old.receipt,committedDigest:newest.committedDigest});
 assert.match(f.gate.inspect(f.journal.inspect()).reason,/external_commitment_mismatch/);
});
run('signed witness from different journal is rejected',f=>{f.set(f.issue(f.journal.inspect(),{journal_id:'other-node'}));assert.match(f.gate.inspect(f.journal.inspect()).reason,/body_invalid/);});
run('signed but expired witness is held rather than ignored',f=>{f.set(f.issue(f.journal.inspect(),{issued_at:new Date(NOW.getTime()-180000).toISOString(),expires_at:new Date(NOW.getTime()-120000).toISOString()}));assert.match(f.gate.inspect(f.journal.inspect()).reason,/expired_or_future/);});
run('future-dated witness is held',f=>{f.set(f.issue(f.journal.inspect(),{issued_at:new Date(NOW.getTime()+1000).toISOString(),expires_at:new Date(NOW.getTime()+2000).toISOString()}));assert.match(f.gate.inspect(f.journal.inspect()).reason,/expired_or_future/);});
run('signature from a non-enrolled key is refused even with matching hash',f=>{const other=generateKeyPairSync('ed25519');f.set(f.issue(f.journal.inspect(),{},other.privateKey));assert.match(f.gate.inspect(f.journal.inspect()).reason,/signature_invalid/);});
run('changing signed checkpoint after signature cannot forge the external commitment',f=>{const v=f.issue();v.receipt.body.sequence=10;f.set(v);assert.match(f.gate.inspect(f.journal.inspect()).reason,/commitment_mismatch/);});
run('invalid local checkpoint is held before any witness-source read',f=>{f.journal.append({state:'x'});f.set(f.issue());const count=f.reads();fs.writeFileSync(f.journal.head,'{}');assert.match(f.gate.inspect(f.journal.inspect()).reason,/local_journal_not_verified/);assert.equal(f.reads(),count);});
run('missing external committed digest always fails closed',f=>{f.set({receipt:f.issue().receipt,committedDigest:''});assert.match(f.gate.inspect(f.journal.inspect()).reason,/commitment_missing/);});
run('witness epoch must be valid nonzero integer',f=>{f.set(f.issue(f.journal.inspect(),{witness_epoch:0}));assert.match(f.gate.inspect(f.journal.inspect()).reason,/body_invalid/);});
run('witness age cannot exceed maximum even when date is later',f=>{f.set(f.issue(f.journal.inspect(),{expires_at:new Date(NOW.getTime()+600000).toISOString()}));assert.match(f.gate.inspect(f.journal.inspect()).reason,/expired_or_future/);});
run('unrelated attacker key in certificate format cannot be substituted at construction',f=>{assert.throws(()=>new EvercraftOsLabExternalWitnessGate({journalId:jId,publicKey:'not-a-key',witnessSource:()=>null}),/error|key|DECODER/i);});
