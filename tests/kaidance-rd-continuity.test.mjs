import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reconcileResearchExport,runPrivateResearchContinuity} from '../systemia/organism/kaidance-rd-continuity.mjs';
const now=new Date('2026-11-25T12:00:00Z');
const m={mission_id:'PRIVATE_FIXTURE_ALPHA',admission_state:'admitted',visibility:'public',disposition:'active',
 owner:'SECRET_OWNER',receipt_sla_seconds:3600,
 last_work_receipt:{ref:'SECRET_RECEIPT',observed_at:'2026-11-25T11:50:00Z'},
 next_action:{description:'SECRET_ACTION',due_at:'2026-11-25T13:00:00Z'}};
const v={schema:'evercraft.systemia.rd-continuity-export.v1',scope:'all_rd',coverage_complete:true,
 exported_at:now.toISOString(),priority_mission_ids:[m.mission_id],missions:[m]};
test('reported data is not independently verified and raw mission data stays out',()=>{
 const r=reconcileResearchExport(v,now);
 assert.equal(r.status,'reported_receipts_reconciled');assert.equal(r.coverage_verified,false);
 assert.equal(r.verified_research_artifacts,0);assert.equal(r.execution_authorized,false);
 assert.equal(r.missions[0].priority,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_FIXTURE|SECRET_/);
});
test('missing, partial, stale and duplicate inputs never appear healthy',()=>{
 assert.equal(reconcileResearchExport(null,now).missions,null);
 assert.equal(reconcileResearchExport({...v,coverage_complete:false},now).missions,null);
 assert.equal(reconcileResearchExport({...v,exported_at:'2026-11-24T12:00:00Z'},now).missions,null);
 assert.equal(reconcileResearchExport({...v,missions:[m,m]},now).missions,null);
 assert.equal(reconcileResearchExport({...v,missions:[]},now).missions,null);
});
test('per-mission SLA, blocked or paused disposition, and absent priority are truthful',()=>{
 const stale={...m,last_work_receipt:{...m.last_work_receipt,observed_at:'2026-11-25T10:00:00Z'}};
 assert.ok(reconcileResearchExport({...v,missions:[stale]},now).missions[0].problems.includes('work_receipt_stale'));
 const paused={...m,disposition:'paused',disposition_reason:'owner decision'};
 assert.equal(reconcileResearchExport({...v,missions:[paused]},now).counts.attention,0);
 assert.equal(reconcileResearchExport({...v,missions:[{...m,disposition:'blocked_needs_human'}]},now).status,'review_required');
 assert.equal(reconcileResearchExport({...v,priority_mission_ids:['missing']},now).counts.priority_missing,1);
});
test('owner-only filesystem and no private data in public return',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rd-fixture-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const root=path.join(temp,'repo'),state=path.join(temp,'state'),outDir=path.join(state,'company'),dir=path.join(state,'kaidance-rd-continuity');
 fs.mkdirSync(root);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const opts={root,outDir,now,enabled:true};
 assert.deepEqual(runPrivateResearchContinuity({...opts,enabled:false}),{status:'not_configured'});
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'held'});
 const file=path.join(dir,'mission-export.json');
 fs.writeFileSync(file,JSON.stringify(v),{mode:0o600});
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'private_reconciled'});
 assert.equal(fs.statSync(path.join(dir,'latest.json')).mode&0o777,0o600);
 fs.chmodSync(file,0o644);assert.deepEqual(runPrivateResearchContinuity(opts),{status:'held'});
 fs.unlinkSync(file);fs.symlinkSync(path.join(dir,'latest.json'),file);
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'held'});
});
