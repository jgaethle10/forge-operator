import test from 'node:test';
import assert from 'node:assert/strict';
import {runSabanBlackBoxReview} from './saban-blackbox-review.mjs';

test('Saban leases 8 scoped adversarial Black Box reviews with one bounded retry, never escalating authority',async()=>{
 const r=await runSabanBlackBoxReview();
 assert.equal(r.runner,'REAL_SABAN_WORK_STATE_AND_SCHEDULER');
 assert.equal(r.status,'PASS_SYNTHETIC_REVIEW_ONLY');
 assert.equal(r.scheduler.jobs,8);
 assert.equal(r.scheduler.completed,8);
 assert.equal(r.scheduler.workers,3);
 assert.equal(r.scheduler.retried,1);
 assert.equal(r.scheduler.dead_letter,0);
 assert.equal(r.scenarios.length,8);
 assert.equal(new Set(r.scenarios.map(x=>x.scenario)).size,8);
 assert.equal(r.scenarios.find(x=>x.scenario==='tenant_swap_hold').attempts,2);
 assert.ok(r.scenarios.every(x=>x.state==='completed'));
 assert.equal(r.genuine_passport_enrollment,false);
 assert.equal(r.actual_chum_spider_transport,false);
 assert.equal(r.independent_effect_verification,false);
 assert.equal(r.execution_authority,'NONE_READ_ONLY');
});
test('Saban completed jobs are still synthetic and not canonical admission or production proof',async()=>{
 const r=await runSabanBlackBoxReview({injectTransientFailure:false});
 assert.equal(r.scheduler.retried,0);
 assert.equal(r.admission_readback,'NOT_RUN_CANONICAL_GATE');
 assert.equal(r.blackbox_owner_trust,'HELD');
 assert.equal(r.source_truth,'TEST_ONLY_NO_LIVE_SYSTEMIA_ADMISSION_OR_PROVIDER_EFFECT');
 assert.equal(r.scenarios.find(x=>x.scenario==='canonical_mission_bridge_ineligible').claim,
  'OFFLINE_GATE_POLICY_REJECTS_DIRECT_ADMISSION');
 assert.equal(r.scenarios.find(x=>x.scenario==='out_of_scope_response').claim,'OTHER_TENANT_RESPONSE_DENIED');
});
