import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PROGRESS_TRIAL_SCHEMA} from './progress-trial-rc05.mjs';
import {assessProgressGate,verifyProgressGate} from './promotion-gate-rc05a.mjs';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function report(firstSeed,{baselineArrived=2,progressArrived=7,baselineCollisions=0,progressCollisions=0}={}){
  const seeds=8,score=(arrived,collisions)=>({total:seeds,arrived,collisions,geofence:0,timeouts:seeds-arrived-collisions});
  const pairs=Array.from({length:seeds},(_,i)=>({seed:firstSeed+i,baseline:{status:'timeout'},progress:{status:'timeout'}}));
  const core={schema:PROGRESS_TRIAL_SCHEMA,firstSeed,seeds,hardwareExecution:false,
    baseline:score(baselineArrived,baselineCollisions),progressGated:score(progressArrived,progressCollisions),pairs};
  return {...core,sha256:hash(core)};
}
test('RC05A collision regressions block candidate eligibility, not just hardware',()=>{
  const review=assessProgressGate({development:report(41),evaluation:report(49,{progressArrived:6,progressCollisions:2,baselineArrived:1})});
  assert.equal(review.candidateEligible,false);
  assert.equal(review.releaseAuthorized,false);
  assert.equal(review.hardwareAuthority,false);
  assert.ok(review.reasons.includes('collision_or_geofence_regression_observed'));
  assert.equal(verifyProgressGate(review),true);
});
test('clean modeled cohorts can only become eligible for human review, never deployment',()=>{
  const review=assessProgressGate({development:report(41),evaluation:report(49,{baselineArrived:1,progressArrived:6})});
  assert.equal(review.candidateEligible,true);
  assert.equal(review.promotion,'human_review_only');
  assert.equal(review.releaseAuthorized,false);
  assert.equal(review.hardwareAuthority,false);
  assert.equal(review.safetyCertified,false);
});
test('unsorted or overlapping cohorts and tampered evidence fail closed',()=>{
  const dev=report(41),evalR=report(45);
  assert.throws(()=>assessProgressGate({development:dev,evaluation:evalR}),/cohorts_overlap_or_unsorted/);
  dev.baseline.arrived=7;
  assert.throws(()=>assessProgressGate({development:dev,evaluation:report(49)}),/invalid_trial_receipt/);
});
test('receipt tampering breaks verification',()=>{
  const review=assessProgressGate({development:report(41),evaluation:report(49)});
  review.releaseAuthorized=true;
  assert.equal(verifyProgressGate(review),false);
});
