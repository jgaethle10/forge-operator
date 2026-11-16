import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFieldRetestPlan,RETEST_SCHEMA} from '../public/worlds/perception-lab/field-retest.mjs';
const row=(id,status,error=null)=>({
 id,frameId:'frame-'+id,label:'car',reference:4,uncertainty:.03,
 estimate:error===null?null:4+error,error,
 method:'synthetic_known_disparity',status
});
const review=(rows)=>({
 schema:'evercraft.spatial-perception.field-evaluation.v1',
 scope:'synthetic_fixture',rigId:'synthetic-test-rig',
 hashPrefix:'abc012def345',rows,
 humanReviewRequired:true,fieldAccuracyCertified:false,
 georegistered:false,worldPersistenceAuthorized:false
});
test('retest planner prioritizes every unresolved category then outlier depth',()=>{
 const r=review([
  row('high','evaluated_uncertified',1.2),
  row('fine','evaluated_uncertified',.2),
  row('gap','no_corresponding_detection'),
  row('amb','ambiguous_detection'),
  row('texture','no_depth_estimate'),
  row('reuse','duplicate_detection_match')
 ]);
 const plan=buildFieldRetestPlan(r,{reviewThresholdM:.5});
 assert.equal(plan.schema,RETEST_SCHEMA);
 assert.equal(plan.totalReferences,6);
 assert.equal(plan.totalFlagged,5);
 assert.deepEqual(plan.tasks.map(t=>t.id),['gap','amb','texture','reuse','high']);
 assert.equal(plan.categories.high_absolute_error,1);
 assert.equal(plan.categories.no_corresponding_detection,1);
 assert.equal(plan.thresholdMeaning,'operator_triage_only_not_accuracy_acceptance');
 assert.equal(plan.fieldAccuracyCertified,false);
 assert.equal(plan.worldPersistenceAuthorized,false);
 assert.equal(plan.realWorldCaptureScheduled,false);
});
test('operator review threshold is configurable, not a certification gate',()=>{
 const r=review([row('a','evaluated_uncertified',.6)]);
 assert.equal(buildFieldRetestPlan(r,{reviewThresholdM:.5}).totalFlagged,1);
 assert.equal(buildFieldRetestPlan(r,{reviewThresholdM:.6}).totalFlagged,0);
 assert.equal(buildFieldRetestPlan(r,{reviewThresholdM:0}).totalFlagged,1);
 assert.throws(()=>buildFieldRetestPlan(r,{reviewThresholdM:NaN}),/invalid_threshold/);
 assert.throws(()=>buildFieldRetestPlan(r,{reviewThresholdM:-1}),/invalid_threshold/);
});
test('all successfully evaluated rows below threshold still produce honest zero-action plan',()=>{
 const plan=buildFieldRetestPlan(review([row('one','evaluated_uncertified',.1)]));
 assert.equal(plan.totalFlagged,0);
 assert.deepEqual(plan.tasks,[]);
 assert.equal(plan.fieldAccuracyCertified,false);
});
test('zero depth and missing detection never become numeric errors',()=>{
 const plan=buildFieldRetestPlan(review([
  row('none','no_depth_estimate'),row('miss','no_corresponding_detection')
 ]));
 assert.equal(plan.totalFlagged,2);
 assert.ok(plan.tasks.every(x=>x.absoluteErrorM===null));
 assert.ok(plan.tasks.every(x=>x.humanReviewRequired));
});
test('synthetic fixture cannot become a scheduled physical trial',()=>{
 const plan=buildFieldRetestPlan(review([row('one','no_depth_estimate')]));
 assert.match(plan.interpretationWarning,/Artificial fixture/);
 assert.equal(plan.sourceScope,'synthetic_fixture');
 assert.equal(plan.retestCompleted,false);
});
test('bounded export is truncation-explicit',()=>{
 const r=review(Array.from({length:5},(_,i)=>row('item'+i,'no_depth_estimate')));
 const plan=buildFieldRetestPlan(r,{maxTasks:2});
 assert.equal(plan.totalFlagged,5);
 assert.equal(plan.exportedTasks,2);
 assert.equal(plan.truncated,true);
 assert.equal(plan.tasks.length,2);
});
test('duplicate reference ids and fabricated missing data fail closed',()=>{
 const r=review([row('x','no_depth_estimate'),row('x','no_depth_estimate')]);
 assert.throws(()=>buildFieldRetestPlan(r),/invalid_review_row/);
 const d=review([row('x','no_depth_estimate')]);d.rows[0].estimate=5;
 assert.throws(()=>buildFieldRetestPlan(d),/fabricated_missing_depth/);
});
test('forged certified results and geolocation fail closed',()=>{
 const r=review([row('x','no_depth_estimate')]);
 r.worldPersistenceAuthorized=true;
 assert.throws(()=>buildFieldRetestPlan(r),/invalid_review_input/);
 r.worldPersistenceAuthorized=false;r.fieldAccuracyCertified=true;
 assert.throws(()=>buildFieldRetestPlan(r),/invalid_review_input/);
});
test('operator-attested mode still demands independent human review',()=>{
 const r=review([row('x','no_corresponding_detection')]);
 r.scope='operator_attested_measurements_unverified';
 const p=buildFieldRetestPlan(r);
 assert.equal(p.sourceScope,r.scope);
 assert.match(p.interpretationWarning,/not independently verified/);
 assert.equal(p.humanReviewRequired,true);
 assert.equal(p.safetyCriticalApproved,false);
});
test('plans are deterministic and do not modify validated review rows',()=>{
 const r=review([row('d','no_depth_estimate'),row('a','ambiguous_detection')]);
 const before=JSON.stringify(r);
 const a=buildFieldRetestPlan(r),b=buildFieldRetestPlan(r);
 assert.deepEqual(a,b);assert.equal(JSON.stringify(r),before);
});
