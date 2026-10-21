import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftOsLabLifecycleJournal} from './runtime-lab-journal.mjs';

function withJournal(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evos-journal-'));
  try{return fn(new EvercraftOsLabLifecycleJournal(root),root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
function baseline(j){
  const empty=j.inspect();assert.equal(empty.state,'clean_empty');assert.equal(empty.mutation_performed,false);
  assert.equal(j.append({job_id:'proof-1',state:'intent_recorded',nonce:'abc'}).state,'committed_local');
  assert.equal(j.append({job_id:'proof-1',state:'spawn_observed',pid:123}).state,'committed_local');
  assert.equal(j.inspect().state,'verified_local_chain');
  assert.equal(j.inspect().count,2);
}

test('journal commits an independently verifiable local hash chain and matching checkpoint',()=>withJournal(j=>{
  baseline(j);const s=j.inspect();assert.match(s.head_hash,/^sha256:[a-f0-9]{64}$/);assert.equal(s.events[1].pid,123);assert.equal(s.independently_anchored,false);
}));
test('tampering an old event fails closed rather than appending over forged history',()=>withJournal(j=>{
  baseline(j);const content=fs.readFileSync(j.log,'utf8');fs.writeFileSync(j.log,content.replace('intent_recorded','launch_authorized'));
  assert.match(j.inspect().reason,/journal_hash_mismatch/);
  assert.throws(()=>j.append({state:'unsafe'}),/lab_journal_held/);
}));
test('truncating the tail is detected against the checkpoint',()=>withJournal(j=>{
  baseline(j);const lines=fs.readFileSync(j.log,'utf8').trim().split('\n');fs.writeFileSync(j.log,lines[0]+'\n');
  assert.match(j.inspect().reason,/journal_head_mismatch_or_truncation/);
}));
test('partial final line is a hold not ignored as a complete event',()=>withJournal(j=>{
  baseline(j);fs.appendFileSync(j.log,'{"partial":');assert.match(j.inspect().reason,/journal_incomplete_line/);
}));
test('missing checkpoint after event append is a hold, never automatic reconciliation',()=>withJournal(j=>{
  baseline(j);fs.unlinkSync(j.head);assert.match(j.inspect().reason,/journal_log_checkpoint_disagree/);
  assert.equal(fs.existsSync(j.head),false);
}));
test('missing log with a surviving head is held',()=>withJournal(j=>{
  baseline(j);fs.unlinkSync(j.log);assert.match(j.inspect().reason,/journal_log_checkpoint_disagree/);
}));
test('checkpoint substitution cannot mark a truncated history as verified',()=>withJournal(j=>{
  baseline(j);const head=JSON.parse(fs.readFileSync(j.head));head.seq=1;fs.writeFileSync(j.head,JSON.stringify(head));
  assert.match(j.inspect().reason,/journal_head_mismatch_or_truncation/);
}));
test('log symlink refused without following it',()=>withJournal((j,root)=>{
  baseline(j);const outside=path.join(root,'outside');fs.renameSync(j.log,outside);fs.symlinkSync(outside,j.log);
  assert.match(j.inspect().reason,/journal_nonregular_or_linked/);
  assert.equal(fs.existsSync(outside),true);
}));
test('checkpoint symlink refused without following it',()=>withJournal((j,root)=>{
  baseline(j);const outside=path.join(root,'outside');fs.renameSync(j.head,outside);fs.symlinkSync(outside,j.head);
  assert.match(j.inspect().reason,/journal_nonregular_or_linked/);
}));
test('hardlinked log refused rather than granting a mutable alias',()=>withJournal((j,root)=>{
  baseline(j);fs.linkSync(j.log,path.join(root,'other'));assert.match(j.inspect().reason,/journal_nonregular_or_linked/);
}));
test('a writer reservation fails closed and leaves journal/checkpoint untouched',()=>withJournal(j=>{
  baseline(j);const original=fs.readFileSync(j.log);fs.writeFileSync(j.writer,'unknown owner');
  assert.throws(()=>j.append({state:'unsafe'}),/EEXIST/);
  assert.deepEqual(fs.readFileSync(j.log),original);
}));
test('writer reservation is cleaned after successful append; neither log nor head is writable via symlink',()=>withJournal(j=>{
  baseline(j);assert.equal(fs.existsSync(j.writer),false);
  assert.equal(fs.lstatSync(j.log).isSymbolicLink(),false);
  assert.equal(fs.lstatSync(j.head).isSymbolicLink(),false);
}));
