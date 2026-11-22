import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {worldsSabanSourceFingerprint} from '../systemia/organism/kaidance-worlds-saban-review.mjs';
import {runKaidanceSourceRepairCandidate} from '../systemia/organism/kaidance-source-patch-candidate.mjs';
import {REPAIR_ID,PRECONDITION,REPLACEMENT,REGRESSION,planMossmereSourceRepair} from '../systemia/organism/kaidance-source-patch-recipe.mjs';

const now=new Date('2026-11-22T16:00:00.000Z');
const sourceFiles=[
 'public/worlds/world-core.mjs','public/worlds/world-bridge.mjs',
 'tests/world-core.test.mjs','tests/world-bridge.test.mjs',
 'systemia/world-engine/saban-adapter.mjs',
 'systemia/saban/registered-worker.mjs',
 'systemia/saban/multiplication-registry.json'
];
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-code-fix-'));}
function fixture({vulnerable=true}={}){
 const root=temp();
 for(const rel of sourceFiles){
  const dest=path.join(root,rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  let content=fs.readFileSync(rel,'utf8');
  if(vulnerable&&rel==='public/worlds/world-core.mjs'){
   assert.ok(content.includes(REPLACEMENT));
   content=content.replace(REPLACEMENT,PRECONDITION);
  }
  // Simulate the real *pre-repair* source pair for a verified red/green
  // regression, even after the repair and test have landed on main.
  if(vulnerable&&rel==='tests/world-core.test.mjs'){
   assert.ok(content.includes(REGRESSION));
   content=content.replace(REGRESSION,'');
  }
  fs.writeFileSync(dest,content,{mode:0o600});
 }
 return root;
}
function reviewFor(root){
 const fingerprint=worldsSabanSourceFingerprint(root);
 return {schema:'evercraft.kaidance.saban-world-review.v1',
  source_fingerprint:fingerprint,
  goal_key:'mossmere-engine-review-'+fingerprint.slice(7,31),
  state:'complete',local_readonly_completed:true,
  execution_receipt_verified:true,
  receipt_refs:['sha256:'+'f'.repeat(64)]};
}
function writeReview(dir,record){
 const filename=path.join(dir,'review.json');
 fs.writeFileSync(filename,JSON.stringify(record),{mode:0o600});
 return filename;
}
test('source-bound candidate proves failing regression then successful repaired Worlds tests',()=>{
 const root=fixture(),out=temp();
 try{
  const reviewed=reviewFor(root),file=writeReview(out,reviewed);
  const first=runKaidanceSourceRepairCandidate({root,outDir:out,now,reviewFile:file});
  assert.equal(first.report.state,'candidate_proposed');
  assert.equal(first.report.new_verified_candidate_this_cycle,true);
  assert.equal(first.report.red_green_proof,true);
  assert.equal(first.report.canonical_source_changes,0);
  assert.equal(first.report.remote_prs_created,0);
  assert.equal(first.candidate.deterministic_branch.startsWith('kaidance/source-repair-'),true);
  assert.equal(first.candidate.red_green_proof.prepatch_regression_failed,true);
  assert.equal(first.candidate.red_green_proof.postpatch_regression_passed,true);
  assert.equal(first.snapshot.counts.admitted,0);
  assert.equal(fs.readFileSync(path.join(root,'public/worlds/world-core.mjs'),'utf8').includes(PRECONDITION),true);
  const previousDigest=first.candidate.candidate_digest;
  const second=runKaidanceSourceRepairCandidate({root,outDir:out,
   now:new Date(now.getTime()+300000),reviewFile:file,
   prover:()=>{throw Error('same source and goal should reuse existing proof')}});
  assert.equal(second.report.new_verified_candidate_this_cycle,false);
  assert.equal(second.candidate.candidate_digest,previousDigest);
  assert.equal(second.report.red_green_proof,true);
  assert.equal(fs.statSync(path.join(out,'candidate.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(out,'state.json')).mode&0o777,0o600);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true})}
});
test('already repaired current source never creates a new source-change candidate',()=>{
 const root=fixture({vulnerable:false}),out=temp();
 try{
  const receipt=writeReview(out,reviewFor(root));
  const row=runKaidanceSourceRepairCandidate({root,outDir:out,now,reviewFile:receipt,
   prover:()=>{throw Error('no proof should be repeated after issue fixed')}});
  assert.equal(row.report.state,'no_change_required');
  assert.equal(row.report.new_verified_candidate_this_cycle,false);
  assert.equal(row.snapshot.counts.changed,0);
  assert.equal(row.candidate.changed_files.length,0);
  assert.equal(row.candidate.publisher_authority_granted,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true})}
});
test('foreign, stale, incomplete or forged Saban reviews never make a candidate',()=>{
 const root=fixture(),out=temp();
 try{
  const verified=reviewFor(root);
  for(const override of [
   {source_fingerprint:'sha256:'+'0'.repeat(64)},
   {state:'pending'},
   {execution_receipt_verified:false},
   {receipt_refs:[]},
   {schema:'something-else'}
  ]){
   const file=writeReview(out,{...verified,...override});
   assert.throws(()=>runKaidanceSourceRepairCandidate({root,outDir:out,now,reviewFile:file}),
    /verified_review_required/);
  }
  const validFile=writeReview(out,verified);
  fs.appendFileSync(path.join(root,'public/worlds/world-bridge.mjs'),'\n// source changed since review\n');
  assert.throws(()=>runKaidanceSourceRepairCandidate({root,outDir:out,now,reviewFile:validFile}),
   /verified_review_required/);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true})}
});
test('unexpected source anchor drift holds, not arbitrary patching',()=>{
 const source=fs.readFileSync('public/worlds/world-core.mjs','utf8').replace(REPLACEMENT,PRECONDITION);
 const tests=fs.readFileSync('tests/world-core.test.mjs','utf8');
 const review={schema:'evercraft.kaidance.saban-world-review.v1',
  source_fingerprint:'sha256:'+'1'.repeat(64),goal_key:'mock',
  state:'complete',local_readonly_completed:true,
  execution_receipt_verified:true,receipt_refs:['sha256:'+'f'.repeat(64)]};
 const result=planMossmereSourceRepair({
  sourceText:source.replace(PRECONDITION,'if(false)throw Error("not correct");'),
  testText:tests,review,sourceFingerprint:review.source_fingerprint
 });
 assert.equal(result.state,'hold_source_anchor_drift');
 assert.equal(result.changed_files.length,0);
 assert.equal(result.new_source_text,null);
 assert.equal(result.production_mutations,0);
 assert.equal(result.repair_id,REPAIR_ID);
});
test('symlinked source and review evidence are rejected',()=>{
 const root=fixture(),out=temp();
 try{
  const file=writeReview(out,reviewFor(root));
  fs.symlinkSync(file,path.join(out,'review-link.json'));
  assert.throws(()=>runKaidanceSourceRepairCandidate({root,outDir:out,now,
   reviewFile:path.join(out,'review-link.json')}),/review_symlink/);
  fs.rmSync(path.join(root,'public/worlds/world-core.mjs'));
  fs.symlinkSync(path.join(root,'public/worlds/world-bridge.mjs'),
   path.join(root,'public/worlds/world-core.mjs'));
  assert.throws(()=>runKaidanceSourceRepairCandidate({root,outDir:out,now,reviewFile:file}),
   /source_untrusted/);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true})}
});
