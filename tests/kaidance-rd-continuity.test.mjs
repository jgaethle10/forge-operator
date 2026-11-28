import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reconcileResearchExport,runPrivateResearchContinuity,matchGoalReceipt} from '../systemia/organism/kaidance-rd-continuity.mjs';
const now=new Date('2026-11-25T12:00:00Z');
const m={mission_id:'PRIVATE_FIXTURE_ALPHA',admission_state:'admitted',visibility:'public',disposition:'active',
 owner:'SECRET_OWNER',receipt_sla_seconds:3600,
 last_work_receipt:{ref:'SECRET_RECEIPT',observed_at:'2026-11-25T11:50:00Z'},
 next_action:{description:'SECRET_ACTION',due_at:'2026-11-25T13:00:00Z'}};
const v={schema:'evercraft.systemia.rd-continuity-export.v1',scope:'all_rd',coverage_complete:true,
 exported_at:now.toISOString(),priority_mission_ids:[m.mission_id],missions:[m]};
test('reported data is not independently verified and raw mission data stays out',()=>{
 const r=reconcileResearchExport(v,now);
 assert.equal(r.status,'review_required');assert.equal(r.coverage_verified,false);
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
 fs.mkdirSync(root);fs.mkdirSync(state,{mode:0o700});fs.mkdirSync(dir,{mode:0o700});
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

const bound={...m,goal_binding:{goal_key:'goal-a',work_key:'work-a',state_relpath:'goals/goal-a.json'}};
const completedTask={mission_key:m.mission_id,goal_key:'goal-a',work_key:'work-a',
 status:'complete',last_result:'complete',attempt:1,receipt_refs:[m.last_work_receipt.ref],
 updated_at:m.last_work_receipt.observed_at};
const goal={schema:'evercraft.goal.state.v1',mission_key:m.mission_id,goal_key:'goal-a',
 revision:4,tasks:[completedTask]};
test('durable goal readback is not equivalent to a heartbeat or artifact proof',()=>{
 assert.equal(matchGoalReceipt(bound,goal,now),'completed_work_checkpoint_matched');
 for(const task of [{...completedTask,status:'executing'}, {...completedTask,receipt_refs:[]},
 {...completedTask,updated_at:now.toISOString()}, {...completedTask,recovery_hold:true}])
  assert.equal(matchGoalReceipt(bound,{...goal,tasks:[task]},now),'completed_work_receipt_not_matched');
 assert.equal(matchGoalReceipt(bound,{...goal,mission_key:'different'},now),'goal_state_mismatch');
 const r=reconcileResearchExport({...v,missions:[bound]},now,()=>goal);
 assert.equal(r.status,'reported_receipts_reconciled');
 assert.equal(r.counts.goal_checkpoints_matched,1);
 assert.equal(r.verified_research_artifacts,0);
});
test('owner private crosswalk matches only explicitly bound goal checkpoint files',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rd-goal-fixture-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const root=path.join(temp,'repo'),state=path.join(temp,'state'),outDir=path.join(state,'company'),dir=path.join(state,'kaidance-rd-continuity'),goals=path.join(state,'goals');
 fs.mkdirSync(root);fs.mkdirSync(state,{mode:0o700});fs.mkdirSync(dir,{mode:0o700});fs.mkdirSync(goals,{mode:0o700});
 const exportPath=path.join(dir,'mission-export.json'), goalPath=path.join(goals,'goal-a.json');
 fs.writeFileSync(exportPath,JSON.stringify({...v,missions:[bound]}),{mode:0o600});
 fs.writeFileSync(goalPath,JSON.stringify(goal),{mode:0o600});
 const opts={root,outDir,now,enabled:true};
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'private_reconciled'});
 const report=()=>JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
 assert.equal(report().counts.goal_checkpoints_matched,1);
 fs.unlinkSync(goalPath);fs.symlinkSync(exportPath,goalPath);
 runPrivateResearchContinuity(opts);
 assert.equal(report().counts.goal_checkpoints_matched,0);
 assert.equal(report().status,'review_required');
});

// Keep the four-program review contract on the existing frontier CI entrypoint.
import './kaidance-four-program-continuity.test.mjs';

test('existing private heartbeat persists four-program review without exposing bindings',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rd-four-program-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const root=path.join(temp,'repo'),state=path.join(temp,'state'),outDir=path.join(state,'company'),dir=path.join(state,'kaidance-rd-continuity');
 fs.mkdirSync(root);fs.mkdirSync(state,{mode:0o700});fs.mkdirSync(dir,{mode:0o700});
 const exportPath=path.join(dir,'mission-export.json');
 const write=value=>fs.writeFileSync(exportPath,JSON.stringify(value),{mode:0o600});
 const opts={root,outDir,now,enabled:true};
 const read=()=>JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
 write({...v,research_program_bindings:{'first-contact':m.mission_id}});
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'private_reconciled'});
 let p=read().four_program_continuity;
 assert.equal(p.programs.length,4);assert.equal(p.programs[0].status,'reported_admission_requires_private_receipt_review');
 assert.equal(p.programs[3].status,'identity_recovery_required');
 assert.doesNotMatch(JSON.stringify(p),/PRIVATE_FIXTURE|SECRET_/);
 assert.equal(p.execution_authorized,false);
 write({...v,research_program_bindings:{'first-contact':m.mission_id,oncology:m.mission_id}});
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'private_reconciled'});
 assert.equal(read().four_program_continuity.status,'held_crosswalk');
 write({...v,coverage_complete:false});
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'held'});
 assert.equal(read().four_program_continuity.status,'held_export');
 write(v);
 assert.deepEqual(runPrivateResearchContinuity(opts),{status:'private_reconciled'});
 assert.equal(read().four_program_continuity.status,'held_crosswalk');
});
