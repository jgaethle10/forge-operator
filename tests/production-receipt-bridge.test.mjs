import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {planSabanRecovery, reconcileSabanArtifacts} from '../systemia/production-continuity/receipt-bridge.mjs';

const now = Date.parse('2026-11-10T22:00:00Z');
const ledger = () => ({ schema: 'evercraft.production.continuity.v1', projects: [{
  project_id:'test-story-001', current_stage:'EDITORIAL_QA',
  next_action:{kind:'compare_chapters',owner:'little-red-studio'},
  last_verified_receipt:null, publication_approved:false,
}] });
const withFile = (fn) => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-receipt-'));
 try {
  const filename='artifact.txt';
  fs.writeFileSync(path.join(root,filename),'INTERNAL PRIVATE TEST ARTIFACT');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,filename))).digest('hex');
  return fn({root,filename,hash});
 } finally {fs.rmSync(root,{recursive:true,force:true});}
};
const job=(filename,hash,overrides={})=>({job_id:'synthetic-job-01',agent_id:'little-red-studio',updated_at:'2026-11-10T21:50:00Z',
 state:'completed',work:{key:'test-story-001',kind:'compare_chapters'},result:{schema:'evercraft.production.artifact-result.v1',project_id:'test-story-001',action_kind:'compare_chapters',artifact_relpath:filename,artifact_sha256:hash},...overrides});
const saban=(...jobs)=>({schema:'evercraft.saban.work-state.v1',jobs:Object.fromEntries(jobs.map((x,i)=>[String(i),x]))});

test('read-only recovery planner omits unsafe work and does not dispatch',()=>{
 const r=planSabanRecovery({schema:'evercraft.production.continuity.audit.v1',proposed_internal_work:[
  {project_id:'test-story-001',kind:'inspect_and_reconcile_receipts',reason:'stale'},
  {project_id:'test-story-001',kind:'inspect_and_reconcile_receipts',reason:'stale'},
  {project_id:'test-story-001',kind:'publish',reason:'go_live'},
 ]});
 assert.equal(r.assignments.length,1);
 assert.equal(r.assignments[0].work.read_only,true);
 assert.equal(r.dispatch_performed,false);
 assert.equal(r.requires_private_saban_admission,true);
});

test('completed job plus actual artifact digest advances evidence but never canon or release',()=>withFile(({root,filename,hash})=>{
 const r=reconcileSabanArtifacts(ledger(),saban(job(filename,hash)),{artifactRoot:root,now});
 assert.equal(r.summary.imported_count,1);
 assert.equal(r.ledger.projects[0].current_stage,'EDITORIAL_QA');
 assert.equal(r.ledger.projects[0].last_verified_receipt.artifact_sha256,hash);
 assert.equal(r.summary.publication_performed,false);
 assert.equal(r.summary.canon_modified,false);
 assert.equal(r.ledger.projects[0].last_verified_receipt.verified_at,'2026-11-10T21:50:00.000Z');
}));

test('completed job with nonexistent artifact is not evidence',()=>withFile(({root,hash})=>{
 const r=reconcileSabanArtifacts(ledger(),saban(job('missing.txt',hash)),{artifactRoot:root,now});
 assert.equal(r.summary.imported_count,0);
 assert.equal(r.summary.rejected_count,1);
}));

test('digest mismatch and path traversal are refused',()=>withFile(({root,filename,hash})=>{
 for (const j of [job(filename,'0'.repeat(64)),job('../secret.txt',hash)]){
  const r=reconcileSabanArtifacts(ledger(),saban(j),{artifactRoot:root,now});
  assert.equal(r.summary.imported_count,0);
 }
}));

test('untrusted worker and protected founder gate cannot advance receipts',()=>withFile(({root,filename,hash})=>{
 const r=reconcileSabanArtifacts(ledger(),saban(job(filename,hash,{agent_id:'other'})),{artifactRoot:root,now});
 assert.equal(r.summary.imported_count,0);
 const gated=ledger();gated.projects[0].next_action.requires_gate='canon';
 assert.equal(reconcileSabanArtifacts(gated,saban(job(filename,hash)),{artifactRoot:root,now}).summary.imported_count,0);
}));

test('claimed publishing or altered canon is rejected even if bytes match',()=>withFile(({root,filename,hash})=>{
 for(const k of ['publication_performed','canon_modified','release_claimed']){
  const j=job(filename,hash);j.result[k]=true;
  assert.equal(reconcileSabanArtifacts(ledger(),saban(j),{artifactRoot:root,now}).summary.imported_count,0);
 }
}));

test('duplicate result is idempotent; replay of older work does not refresh liveness',()=>withFile(({root,filename,hash})=>{
 const first=reconcileSabanArtifacts(ledger(),saban(job(filename,hash)),{artifactRoot:root,now});
 const next=reconcileSabanArtifacts(first.ledger,saban(job(filename,hash)),{artifactRoot:root,now});
 assert.equal(next.summary.imported_count,0);
 const ancient=job(filename,hash,{updated_at:'2026-08-01T12:00:00Z'});
 assert.equal(reconcileSabanArtifacts(first.ledger,saban(ancient),{artifactRoot:root,now}).summary.imported_count,0);
}));

test('symlink artifacts are refused',()=>withFile(({root,filename,hash})=>{
 fs.symlinkSync(filename,path.join(root,'link.txt'));
 assert.equal(reconcileSabanArtifacts(ledger(),saban(job('link.txt',hash)),{artifactRoot:root,now}).summary.imported_count,0);
}));

test('held research / released stage cannot bypass review via internal receipts',()=>withFile(({root,filename,hash})=>{
 for(const stage of ['FOUNDER_DECISION','READY_FOR_RELEASE','RELEASED_VERIFIED','PARKED_INTENTIONALLY']){
  const l=ledger();l.projects[0].current_stage=stage;
  assert.equal(reconcileSabanArtifacts(l,saban(job(filename,hash)),{artifactRoot:root,now}).summary.imported_count,0);
 }
}));

test('output remains private even if job result includes unpublished text',()=>withFile(({root,filename,hash})=>{
 const secret='UNPUBLISHED PRIVATE FICTION TEXT';
 const j=job(filename,hash);j.result.private_draft=secret;
 const r=reconcileSabanArtifacts(ledger(),saban(j),{artifactRoot:root,now});
 assert.equal(JSON.stringify(r).includes(secret),false);
}));
