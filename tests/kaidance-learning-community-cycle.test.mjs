import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 validateLearningCommunityManifest,fingerprintLearningSources,runLearningCommunityCycle
} from '../systemia/organism/kaidance-learning-community-cycle.mjs';

const manifest=JSON.parse(fs.readFileSync('registry/kaidance-learning-community-workstreams.v1.json','utf8'));
const products=JSON.parse(fs.readFileSync('registry/public-products.json','utf8'));
const time=new Date('2026-11-25T23:00:00.000Z');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-learning-cycle-'));
test('All named families are present without duplicate products, unsafe source or hidden authority',()=>{
 const v=validateLearningCommunityManifest(manifest,products);
 assert.equal(v.workstreams,8);
 assert(manifest.workstreams.some(x=>x.key==='evercraft-circles'));
 assert(manifest.workstreams.some(x=>x.key==='infinite-classroom'));
 assert(manifest.workstreams.some(x=>x.key==='nepal-offline-academy'));
 assert.equal(manifest.policy.automatic_code_writes,false);
 assert.equal(manifest.policy.student_or_member_data_access,false);
 const keys=manifest.workstreams.flatMap(x=>x.product_keys);
 assert.equal(new Set(keys).size,keys.length);
 const invalid=structuredClone(manifest);
 invalid.workstreams[0].proof_tests=['../../private/secrets.js'];
 assert.throws(()=>validateLearningCommunityManifest(invalid,products),/learning_proof_not_allowlisted/);
 const bad=structuredClone(manifest);
 bad.workstreams[1].product_keys=['made-up-product'];
 assert.throws(()=>validateLearningCommunityManifest(bad,products),/learning_product_binding_unknown_or_duplicate/);
});
test('Fingerprint is content-bound, source-scoped and never reads path traversal',()=>{
 const files=manifest.workstreams[0].source_files;
 const a=fingerprintLearningSources('.',files),b=fingerprintLearningSources('.',[...files].reverse());
 assert.match(a.fingerprint,/^sha256:[a-f0-9]{64}$/);
 assert.equal(a.fingerprint,b.fingerprint);
 assert.deepEqual(a.missing,[]);
 assert.throws(()=>fingerprintLearningSources('.',['../.ssh/id_ed25519']),/learning_untrusted_source_path/);
 const gap=fingerprintLearningSources('.',['public/missing-classroom-file.mjs']);
 assert.deepEqual(gap.missing,['public/missing-classroom-file.mjs']);
});
test('Every five-minute tick reconciles all eight without inventing deployments',()=>{
 const dir=temp();
 try{
  const first=runLearningCommunityCycle({root:'.',outDir:dir,now:time,runProofs:false});
  assert.equal(first.duplicate,false);
  assert.equal(first.report.counts.tracked,8);
  assert.equal(first.report.counts.source_proofs_run,0);
  assert.equal(first.report.source_edit_count,0);
  assert.equal(first.report.production_mutations,0);
  assert.equal(first.report.automatic_development_workers_launched,0);
  assert.equal(first.report.owner_runtime_heartbeat_independently_attested,false);
  assert(first.report.workstreams.every(x=>x.commercially_ready_verified===false));
  assert.equal(first.queue.candidates.length,8);
  assert.equal(first.queue.execution_authorized,false);
  assert(first.queue.candidates.every(x=>x.execution_authorized===false));
  assert.equal(fs.statSync(path.join(dir,'state.json')).mode&0o077,0);
  const same=runLearningCommunityCycle({root:'.',outDir:dir,now:new Date(time.getTime()+290000)});
  assert.equal(same.duplicate,true);
  const next=runLearningCommunityCycle({root:'.',outDir:dir,
   now:new Date(time.getTime()+300000)});
  assert.equal(next.duplicate,false);
  assert.equal(next.report.counts.tracked,8);
  assert.equal(next.report.counts.source_proofs_run,0);
  assert(next.report.workstreams.some(x=>x.source_status==='recovery_review_required'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Bounded rotating proofs do real work only when authorized, never more than two per tick',()=>{
 const dir=temp(),calls=[];
 const spawn=(exe,args,opts)=>{calls.push({exe,args,opts});return {status:0,error:null}};
 try{
  let next=time,verified=new Set();
  for(let i=0;i<4;i++){
   const result=runLearningCommunityCycle({root:'.',outDir:dir,
    now:next,runProofs:true,spawn});
   assert(result.report.counts.source_proofs_run<=2);
   assert(result.report.counts.failed===0);
   result.report.proofs.forEach(x=>verified.add(x.workstream));
   next=new Date(next.getTime()+300000);
  }
  assert.equal(calls.length,6); // Six workstreams with runnable tests; two held for source recovery.
  assert.equal(verified.size,6);
  for(const call of calls){
   assert.equal(call.exe,process.execPath);
   assert.equal(call.args[0],'--test');
   assert(call.args.slice(1).every(x=>x.startsWith('tests/')&&x.endsWith('.test.mjs')));
   assert.equal(call.opts.timeout,25000);
   assert(!JSON.stringify(call.opts.env).includes('TOKEN'));
  }
  const final=runLearningCommunityCycle({root:'.',outDir:dir,now:next,
   runProofs:true,spawn});
  assert.equal(final.report.counts.source_proofs_run,0);
  assert.equal(calls.length,6);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Failed proof stays failed, never promoted to verified release; next tick may retry',()=>{
 const dir=temp();
 try{
  const broken=runLearningCommunityCycle({root:'.',outDir:dir,now:time,
   runProofs:true,spawn:()=>({status:1,error:null})});
  assert.equal(broken.report.counts.failed,2);
  assert(broken.report.workstreams.some(x=>x.source_status==='source_proof_failed'));
  assert.equal(broken.report.public_launches,0);
  assert.equal(broken.report.commercial_readiness_unverified,true);
  const next=runLearningCommunityCycle({root:'.',outDir:dir,
   now:new Date(time.getTime()+300000),runProofs:true,
   spawn:()=>({status:0,error:null})});
  assert.equal(next.report.counts.passed,2);
  assert.equal(next.report.production_mutations,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
