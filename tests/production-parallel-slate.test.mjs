import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParallelSlate, executeParallelSlate } from '../systemia/production-continuity/parallel-slate.mjs';

const clock = Date.parse('2026-11-15T22:00:00.000Z');
const project = (n, extras = {}) => ({
  project_id: 'private-lane-' + String(n).padStart(2, '0'),
  current_stage: 'WAITING_ON_EVIDENCE',
  next_action: {kind: 'source_or_editorial_review', owner: ['little-red-studio','towi-research','fallen-studios','evercraft-journal'][n%4]},
  last_verified_receipt: null, ...extras
});
const ledger = (projects = Array.from({length:12},(_,n)=>project(n)))=>({schema:'evercraft.production.continuity.v1',projects});
const make = (projects)=>buildParallelSlate(ledger(projects),{maxInFlight:6,createdAt:clock});
const outcome = job => ({schema:'evercraft.production.artifact-result.v1',
  project_id:job.work.key, action_kind:job.work.kind,
  artifact_relpath:'artifacts/' + job.work.key + '.json',
  artifact_sha256:'a'.repeat(64), publication_performed:false,canon_modified:false});

test('the complete 12-lane slate is queued without serializing projects',()=>{
 const b=make(Array.from({length:12},(_,n)=>project(n)));
 assert.equal(b.queued_count,12);
 assert.equal(b.held_count,0);
 assert.equal(Object.keys(b.queue.jobs).length,12);
 assert.deepEqual(Object.values(b.queue.jobs).map(j=>j.state),Array(12).fill('queued'));
 assert.equal(b.dispatched,false);
});

test('one protected gate does not block 11 unrelated lanes',()=>{
 const projects=Array.from({length:12},(_,n)=>project(n));
 projects[3].next_action.requires_gate='publication';
 const b=make(projects);
 assert.equal(b.queued_count,11);
 assert.equal(b.held_count,1);
 assert.equal(b.holds[0].project_id,projects[3].project_id);
});

test('six workers run in parallel with separate leased jobs', async()=>{
 const batch=make(Array.from({length:12},(_,n)=>project(n)));
 let current=0, peak=0;
 const r=await executeParallelSlate(batch,{worker:async job=>{
   current++;peak=Math.max(peak,current);
   await new Promise(resolve=>setImmediate(resolve));
   current--;
   return outcome(job);
 }});
 assert.equal(r.peak_in_flight,6);
 assert.equal(peak,6);
 assert.equal(r.work_state_summary.counts.completed,12);
 assert.equal(r.artifact_validation_required,true);
 assert.equal(r.public_release_verified,false);
});

test('failed job is isolated from other parallel lanes',async()=>{
 const batch=make(Array.from({length:12},(_,n)=>project(n)));
 const r=await executeParallelSlate(batch,{worker:async job=>{
   await new Promise(resolve=>setImmediate(resolve));
   if(job.work.key==='private-lane-04') throw new Error('sensitive worker problem');
   return outcome(job);
 }});
 assert.equal(r.work_state_summary.counts.completed,11);
 assert.equal(r.work_state_summary.counts.dead_letter,1);
 assert.equal(r.failures.length,1);
 assert.equal(JSON.stringify(r).includes('sensitive worker problem'),false);
});

test('empty or unsafe worker outcomes do not count as completed',async()=>{
 const batch=make(Array.from({length:3},(_,n)=>project(n)));
 const r=await executeParallelSlate(batch,{worker:async job=>job.work.key==='private-lane-02'
   ? {...outcome(job),publication_performed:true}
   : null});
 assert.equal(r.work_state_summary.counts.dead_letter,3);
 assert.equal(r.work_state_summary.counts.completed||0,0);
});

test('parallel execution requires explicit trusted worker adapter',async()=>{
 const batch=make([project(1),project(2)]);
 await assert.rejects(()=>executeParallelSlate(batch,{}),/trusted private worker/);
});

test('duplicate IDs and invalid concurrency fail closed',()=>{
 assert.throws(()=>make([project(1),project(1)]),/Invalid\/duplicate/);
 assert.throws(()=>buildParallelSlate(ledger([project(1)]),{maxInFlight:1}),/Parallelism/);
});

test('no private manuscript fields or story text leak into Saban assignments',()=>{
 const secret='DO_NOT_LEAK_UNRELEASED_PLOT';
 const b=make([project(1,{title:secret,source_path:secret,story_draft:secret})]);
 assert.equal(JSON.stringify(b).includes(secret),false);
});

test('private preparation CLI persists all 12 jobs and refuses reset',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'evercraft-parallel-'),{mode:0o700});
 try {
   writeFileSync(join(root,'ledger.json'),JSON.stringify(ledger()),{mode:0o600});
   const cli=new URL('../systemia/production-continuity/prepare-parallel.mjs',import.meta.url).pathname;
   const first=spawnSync(process.execPath,[cli,'--private-dir',root,'--max-in-flight','6'],{encoding:'utf8'});
   assert.equal(first.status,0,first.stderr);
   const batch=JSON.parse(readFileSync(join(root,'parallel-slate.json'),'utf8'));
   assert.equal(batch.queued_count,12);
   assert.equal(batch.max_in_flight,6);
   assert.equal(batch.dispatched,false);
   const duplicate=spawnSync(process.execPath,[cli,'--private-dir',root],{encoding:'utf8'});
   assert.notEqual(duplicate.status,0);
   assert.equal(JSON.parse(readFileSync(join(root,'parallel-slate.json'),'utf8')).queued_count,12);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('private preparation CLI refuses a public checkout',async()=>{
 const {mkdtempSync,writeFileSync,mkdirSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'evercraft-public-'),{mode:0o700});
 try {
   mkdirSync(join(root,'.git'));
   writeFileSync(join(root,'ledger.json'),JSON.stringify(ledger()),{mode:0o600});
   const cli=new URL('../systemia/production-continuity/prepare-parallel.mjs',import.meta.url).pathname;
   const r=spawnSync(process.execPath,[cli,'--private-dir',root],{encoding:'utf8'});
   assert.notEqual(r.status,0);
   assert.match(r.stderr,/Source checkout cannot hold private slate/);
 } finally {rmSync(root,{recursive:true,force:true});}
});
