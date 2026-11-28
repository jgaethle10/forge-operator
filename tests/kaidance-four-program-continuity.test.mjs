import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFourProgramContinuity,PROGRAMS} from '../systemia/organism/kaidance-four-program-continuity.mjs';
const now=new Date('2026-11-27T12:00:00Z');
const m={mission_id:'PRIVATE_TEST_ID',admission_state:'admitted',disposition:'active',
 owner:'PRIVATE_OWNER',receipt_sla_seconds:3600,
 next_action:{description:'PRIVATE_ACTION',due_at:'2026-11-27T13:00:00Z'},
 last_work_receipt:{ref:'PRIVATE_REF',observed_at:'2026-11-27T11:50:00Z'}};
const v={schema:'evercraft.systemia.rd-continuity-export.v1',scope:'all_rd',coverage_complete:true,
 exported_at:now.toISOString(),priority_mission_ids:[m.mission_id],missions:[m]};
const check=(missionExport=v,bindings={'first-contact':m.mission_id})=>
 assessFourProgramContinuity({missionExport,bindings,now});
test('four distinct stable review keys',()=>assert.equal(new Set(PROGRAMS.map(p=>p.key)).size,4));
test('valid reported admission remains review only and private',()=>{
 const r=check();assert.equal(r.programs[0].status,'reported_admission_requires_private_receipt_review');
 assert.equal(r.programs.filter(p=>p.status==='identity_recovery_required').length,3);
 assert.equal(r.execution_authorized,false);assert.equal(r.coverage_verified,false);
 assert.equal(r.verified_research_artifacts,0);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_/);
});
test('partial stale and duplicate export fail closed',()=>{
 for(const e of [null,{...v,coverage_complete:false},{...v,exported_at:'2026-11-26T12:00:00Z'},
 {...v,missions:[m,m]}])assert.equal(check(e).status,'held_export');
});
test('unknown crosswalk key and duplicate mission ID cannot create new work',()=>{
 assert.equal(check(v,{'first-contact':m.mission_id,oncology:m.mission_id}).status,'held_crosswalk');
 assert.equal(check(v,{'not-a-program':'other'}).status,'held_crosswalk');
});
test('missing or proposed mission cannot pass admission',()=>{
 assert.equal(check(v,{'first-contact':'absent'}).programs[0].status,'admission_unverified');
 const other={...m,mission_id:'proposed',admission_state:'proposed'};
 assert.equal(check({...v,missions:[m,other]},{oncology:'proposed'}).programs[2].status,'admission_unverified');
});
test('priority and deliberate pause remain separate from active research',()=>{
 assert.equal(check({...v,priority_mission_ids:['other']}).programs[0].status,'priority_binding_review_required');
 assert.equal(check({...v,missions:[{...m,disposition:'paused',disposition_reason:'owner pause'}]}).programs[0].status,'reported_disposition_review');
});
