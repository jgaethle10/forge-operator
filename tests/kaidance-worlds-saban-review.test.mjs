import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runKaidanceWorldsSabanReview,worldsSabanSourceFingerprint,
 makeSabanWorldReviewGoal} from '../systemia/organism/kaidance-worlds-saban-review.mjs';

const NOW=new Date('2026-11-22T12:00:00.000Z');
function folder(){return fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-saban-world-'));}
function makeRoot(){
 const root=folder();
 const relative=[
 'public/worlds/world-core.mjs','public/worlds/world-bridge.mjs',
 'systemia/world-engine/saban-adapter.mjs','systemia/saban/registered-worker.mjs',
 'systemia/saban/multiplication-registry.json'
 ];
 for(const p of relative){const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.copyFileSync(p,f);}
 return root;
}
test('registered Saban reviewer actually completes a durable read-only Systemia goal',async()=>{
 const dir=folder();
 try{
  const first=await runKaidanceWorldsSabanReview({root:process.cwd(),outDir:dir,now:NOW});
  assert.equal(first.report.local_readonly_completed,true);
  assert.equal(first.report.actual_assignment_ran_this_cycle,true);
  assert.equal(first.report.new_verified_source_review_this_cycle,true);
  assert.equal(first.report.workload,'world-engine-review');
  assert.equal(first.report.review_role,'engine_architect');
  assert.equal(first.report.full_23_role_saban_review,false);
  assert.equal(first.report.source_code_changes,0);
  assert.equal(first.report.features_deployed,0);
  assert.equal(first.report.physical_nodeseed_dispatched,false);
  assert.equal(first.snapshot.counts.admitted,1);
  assert.equal(first.snapshot.counts.held,0);
  assert.equal(first.goal.status,'complete');
  assert.equal(first.goal.counts.complete,1);
  assert.ok(first.report.receipt_refs.some(x=>/^sha256:[a-f0-9]{64}$/.test(x)));
  const saved=path.join(dir,'goals',first.report.goal_key+'.json');
  assert.equal(fs.statSync(saved).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(dir,'latest.json')).mode&0o777,0o600);
  const second=await runKaidanceWorldsSabanReview({root:process.cwd(),outDir:dir,
   now:new Date(NOW.getTime()+300000),
   registeredAssignment:async()=>{throw Error('must not rerun a completed durable goal')}});
  assert.equal(second.report.actual_assignment_ran_this_cycle,false);
  assert.equal(second.report.existing_goal_reused,true);
  assert.equal(second.report.attempt,1);
  assert.equal(second.snapshot.counts.admitted,0);
  assert.equal(second.report.execution_receipt_verified,true);
  assert.equal(second.report.local_readonly_completed,true);
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
test('Source change creates a new content-bound goal while old completed work is retained',async()=>{
 const root=makeRoot(),out=folder();
 let calls=0;
 try{
  const mock=async({assignment})=>{
   calls++;
   return {software_id:'world-engine-review',result:{
    schema:'evercraft.world-engine.saban-review-note.v1',status:'completed',
    role:'engine_architect',world_id:'worlds-mossmere-v1',findings:[],
    review:{category:'architecture',findings:[],directives:[]},
    boundaries:{no_publication_authority:true,no_payment_authority:true,no_canon_mutation:true},
    agent_id:assignment.agent_id
   }};
  };
  const first=await runKaidanceWorldsSabanReview({root,outDir:out,now:NOW,registeredAssignment:mock});
  assert.equal(first.report.new_verified_source_review_this_cycle,true);
  const f=path.join(root,'public/worlds/world-core.mjs');
  fs.appendFileSync(f,'\n// source fingerprint fixture change\n');
  const next=await runKaidanceWorldsSabanReview({root,outDir:out,now:new Date(NOW.getTime()+300000),registeredAssignment:mock});
  assert.notEqual(next.report.goal_key,first.report.goal_key);
  assert.notEqual(next.report.source_fingerprint,first.report.source_fingerprint);
  assert.equal(calls,2);
  assert.equal(fs.readdirSync(path.join(out,'goals')).filter(x=>x.endsWith('.json')).length,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true})}
});
test('Bad registered reviewer receipt is quarantined with no automatic replay',async()=>{
 const out=folder();
 let calls=0;
 try{
  const first=await runKaidanceWorldsSabanReview({root:process.cwd(),outDir:out,now:NOW,
   registeredAssignment:async()=>{calls++;return {software_id:'world-engine-review',result:{
    schema:'evercraft.world-engine.saban-review-note.v1',status:'blocked',
    role:'engine_architect',world_id:'worlds-mossmere-v1',findings:['invalid']}};
   }});
  assert.equal(first.report.actual_assignment_ran_this_cycle,true);
  assert.equal(first.report.local_readonly_completed,false);
  assert.equal(first.report.operator_reconciliation_required,true);
  assert.equal(first.snapshot.counts.held,1);
  const second=await runKaidanceWorldsSabanReview({root:process.cwd(),outDir:out,
   now:new Date(NOW.getTime()+300000),
   registeredAssignment:async()=>{calls++;throw Error('must not replay')}});
  assert.equal(second.report.actual_assignment_ran_this_cycle,false);
  assert.equal(second.report.operator_reconciliation_required,true);
  assert.equal(calls,1);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
test('Fingerprint and persisted goal identity fail closed on unsafe storage tampering',async()=>{
 const root=makeRoot(),out=folder();
 try{
  const h=worldsSabanSourceFingerprint(root);
  assert.match(h,/^sha256:[a-f0-9]{64}$/);
  assert.equal(h,worldsSabanSourceFingerprint(root));
  const goal=makeSabanWorldReviewGoal(h,NOW);
  assert.equal(goal.tasks[0].status,'pending');
  assert.equal(goal.tasks[0].dedupe_key,'evercraft-worlds-source-development|'+h);
  assert.equal(goal.tasks[0].human_gate_required,false);
  const dir=path.join(out,'goals');fs.mkdirSync(dir,{recursive:true});
  const goalFile=path.join(dir,goal.goal_key+'.json');
  fs.writeFileSync(goalFile,JSON.stringify({...goal,mission_key:'different-mission'}));
  await assert.rejects(()=>runKaidanceWorldsSabanReview({root,outDir:out,now:NOW}),/identity_conflict/);
  fs.rmSync(goalFile);
  fs.symlinkSync(path.join(root,'public/worlds/world-core.mjs'),
   path.join(root,'public/worlds/world-core-link.mjs'));
  const source=path.join(root,'public/worlds/world-core.mjs');
  fs.rmSync(source);fs.symlinkSync(path.join(root,'public/worlds/world-core-link.mjs'),source);
  assert.throws(()=>worldsSabanSourceFingerprint(root),/source_untrusted/);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true})}
});
