import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversionPlan } from './conversion-router.mjs';

test('conversion router preserves the full debt queue and routes selected work through Systemia',()=>{
  const plan=buildConversionPlan({waveSize:12,now:new Date('2026-10-01T15:00:00Z')});
  assert.ok(plan.summary.total_debt>0);
  assert.equal(plan.full_queue.length,plan.summary.total_debt);
  assert.ok(plan.missions.length<=12);
  assert.ok(plan.missions.every((x)=>x.route_via==='systemia'));
  assert.ok(plan.missions.every((x)=>x.execution_authority==='none_from_queue'));
  assert.ok(plan.missions.some((x)=>x.stable_id==='platform:evercraft-fabric'&&x.priority==='P0_SHARED_INFRA'));
  assert.equal(plan.mission_snapshot.schema,'evercraft.kaidance.mission-snapshot.v1');
  assert.equal(plan.mission_snapshot.counts.changed,plan.summary.total_debt);
  assert.equal(plan.mission_snapshot.counts.admitted,plan.missions.length);
});

test('conversion wave reserves capacity for every non-empty priority lane',()=>{
  const source={
    entries:[1,2,3,4,5],
    release_gate:{state:'pass'},
    debt_queue:[
      {stable_id:'p0',name:'p0',priority:'P0_SHARED_INFRA',blocker_count:1,blockers:['machine_endpoint_missing']},
      {stable_id:'p1a',name:'p1a',priority:'P1_PUBLIC_PRODUCT',blocker_count:1,blockers:['problem_language_not_verified']},
      {stable_id:'p1b',name:'p1b',priority:'P1_MACHINE_DOOR',blocker_count:1,blockers:['runtime_reachability_not_proven']},
      {stable_id:'p2',name:'p2',priority:'P2_INTERNAL_CAPABILITY',blocker_count:1,blockers:['machine_contract_not_assessed']},
      {stable_id:'p3',name:'p3',priority:'P3_ARCHAEOLOGY',blocker_count:1,blockers:['capability_state_not_verified']},
    ],
  };
  const plan=buildConversionPlan({source,waveSize:5,now:new Date('2026-10-01T15:00:00Z')});
  assert.deepEqual(new Set(plan.missions.map((x)=>x.priority)),new Set([
    'P0_SHARED_INFRA','P1_PUBLIC_PRODUCT','P1_MACHINE_DOOR','P2_INTERNAL_CAPABILITY','P3_ARCHAEOLOGY'
  ]));
});
