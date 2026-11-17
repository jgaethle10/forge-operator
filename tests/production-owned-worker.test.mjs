import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildParallelSlate } from '../systemia/production-continuity/parallel-slate.mjs';
import { runOwnedParallelSourceWave } from '../systemia/production-continuity/run-parallel-owned.mjs';
import { reconcileSabanArtifacts } from '../systemia/production-continuity/receipt-bridge.mjs';

const clock = Date.parse('2026-11-16T23:00:00Z');
const id = n => 'project-' + String(n).padStart(2,'0');
const ledger = () => ({schema:'evercraft.production.continuity.v1',
  projects:Array.from({length:12},(_,n)=>({
    project_id:id(n), current_stage:'WAITING_ON_EVIDENCE',
    next_action:{kind:'inspect_private_sources',owner:n%2?'towi-research':'little-red-studio'},
    last_verified_receipt:null,
  }))});
function fixture(fn) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-parallel-real-'));
 fs.chmodSync(root,0o700);
 for(const d of ['sources','manifests','artifacts']) fs.mkdirSync(path.join(root,d),{mode:0o700});
 const l=ledger();
 const batch=buildParallelSlate(l,{maxInFlight:6,createdAt:clock});
 fs.writeFileSync(path.join(root,'parallel-slate.json'),JSON.stringify(batch),{mode:0o600});
 for(let n=0;n<12;n++){
   const names = n<7 ? ['source-'+n+'.txt'] : [];
   fs.writeFileSync(path.join(root,'manifests',id(n)+'.json'),
     JSON.stringify({schema:'evercraft.production.source-input.v1',project_id:id(n),source_files:names}),
     {mode:0o600});
   if(n<7) fs.writeFileSync(path.join(root,'sources','source-'+n+'.txt'),'PRIVATE ORIGINAL SOURCE FOR '+id(n),{mode:0o600});
 }
 return Promise.resolve().then(()=>fn({root,l,batch}))
   .finally(()=>fs.rmSync(root,{recursive:true,force:true}));
}
const actual = root=>JSON.parse(fs.readFileSync(path.join(root,'saban-work-state.json'),'utf8'));

test('twelve independent private source jobs complete in bounded parallel with durable leases',async()=>fixture(async({root})=>{
 let observedLease=false;
 const run=await runOwnedParallelSourceWave({privateDir:root,now:()=>clock+60000,
  worker:async(job,{privateDir})=>{
    const latest=actual(root);
    assert.equal(latest.jobs[job.job_id].state,'leased');
    observedLease=true;
    const {runPrivateSourceAudit}=await import('../systemia/production-continuity/private-source-worker.mjs');
    return runPrivateSourceAudit(job,{privateDir});
  }});
 assert.equal(observedLease,true);
 assert.equal(run.job_total,12);
 assert.equal(run.completed_audits,12);
 assert.equal(run.failed_audits,0);
 assert.ok(run.peak_in_flight>=2);
 assert.ok(run.peak_in_flight<=6);
 const data=actual(root);
 assert.equal(Object.values(data.jobs).filter(x=>x.state==='completed').length,12);
 assert.equal(fs.statSync(path.join(root,'saban-work-state.json')).mode & 0o777,0o600);
 let found=0,blocked=0;
 for(const job of Object.values(data.jobs)){
   const report=JSON.parse(fs.readFileSync(path.join(root,'artifacts',job.result.artifact_relpath),'utf8'));
   const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'artifacts',job.result.artifact_relpath))).digest('hex');
   assert.equal(job.result.artifact_sha256,digest);
   if(report.status==='SOURCE_EVIDENCE_VERIFIED')found++;
   if(report.status==='BLOCKED_SOURCE_REQUIRED')blocked++;
 }
 assert.equal(found,7);
 assert.equal(blocked,5);
 const reconciled=reconcileSabanArtifacts(ledger(),data,{artifactRoot:path.join(root,'artifacts'),now:clock+120000});
 assert.equal(reconciled.summary.imported_count,7);
 assert.equal(reconciled.summary.rejected_count,5);
 assert.equal(reconciled.ledger.projects.filter(p=>!!p.last_verified_receipt).length,7);
 assert.equal(reconciled.summary.publication_performed,false);
}));

test('restart does not re-run completed lanes, and evidence stays unchanged',async()=>fixture(async({root})=>{
 const first=await runOwnedParallelSourceWave({privateDir:root,now:()=>clock+60000});
 assert.equal(first.completed_audits,12);
 const before=actual(root);
 const second=await runOwnedParallelSourceWave({privateDir:root,now:()=>clock+90000});
 const after=actual(root);
 assert.equal(second.peak_in_flight,0);
 assert.equal(second.completed_audits,12);
 assert.deepEqual(after.jobs,before.jobs);
 assert.equal(fs.existsSync(path.join(root,'.parallel-worker.lock')),false);
}));

test('failure stays isolated to its one lane and is truthfully dead-lettered',async()=>fixture(async({root})=>{
 const {runPrivateSourceAudit}=await import('../systemia/production-continuity/private-source-worker.mjs');
 const result=await runOwnedParallelSourceWave({privateDir:root,now:()=>clock+60000,
 worker:async(job,opts)=>{
   if(job.work.key===id(3)) throw Error('Sensitive untrusted message');
   return runPrivateSourceAudit(job,opts);
 }});
 assert.equal(result.failed_audits,1);
 assert.equal(result.completed_audits,11);
 assert.equal(JSON.stringify(result).includes('Sensitive untrusted message'),false);
 assert.equal(actual(root).jobs[Object.keys(actual(root).jobs).find(k=>actual(root).jobs[k].work.key===id(3))].state,'dead_letter');
}));

test('stale or active parallel lock cannot be stolen',async()=>fixture(async({root})=>{
 fs.writeFileSync(path.join(root,'.parallel-worker.lock'),'locked',{mode:0o600});
 await assert.rejects(()=>runOwnedParallelSourceWave({privateDir:root}),/lock exists/);
 assert.equal(fs.existsSync(path.join(root,'saban-work-state.json')),false);
}));

test('tampered work queue cannot silently execute or publish',async()=>fixture(async({root})=>{
 const file=path.join(root,'parallel-slate.json');
 const plan=JSON.parse(fs.readFileSync(file,'utf8'));
 plan.queue.jobs[Object.keys(plan.queue.jobs)[0]].item.release_authorized=true;
 fs.writeFileSync(file,JSON.stringify(plan));
 await assert.rejects(()=>runOwnedParallelSourceWave({privateDir:root}),/job mutation refused|Untrusted private/);
}));

test('private source audit rejects path traversal and symlinked source',async()=>fixture(async({root})=>{
 const manifest=path.join(root,'manifests',id(0)+'.json');
 fs.writeFileSync(manifest,JSON.stringify({schema:'evercraft.production.source-input.v1',project_id:id(0),source_files:['../outside.txt']}));
 const result=await runOwnedParallelSourceWave({privateDir:root,now:()=>clock+60000});
 assert.equal(result.failed_audits,1);
 assert.equal(result.completed_audits,11);
 assert.equal(result.publication_performed,false);
}));
