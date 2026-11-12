import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFieldReport,filterFieldRows} from '../public/worlds/perception-lab/field-review.mjs';

const hash='a'.repeat(64);
const evaluated=(id,ref,estimate,method='synthetic_known_disparity')=>({
 targetId:id,frameId:'frame0',label:'car',
 referenceCameraAxisDepthM:ref,referenceUncertaintyM:0.025,
 measurementMethod:method,matchedObservationId:'observation:'+id,
 intersectionOverUnion:0.9,estimatedCameraAxisDepthM:estimate,
 absoluteErrorM:Math.round(Math.abs(ref-estimate)*10000)/10000,
 relativeErrorPct:Math.round(Math.abs(ref-estimate)/ref*100000)/1000,
 result:'evaluated_uncertified'
});
const missing=(id,result,method='synthetic_known_disparity')=>({
 targetId:id,frameId:'frame1',label:'bus',
 referenceCameraAxisDepthM:8,referenceUncertaintyM:.02,
 measurementMethod:method,matchedObservationId:null,intersectionOverUnion:null,
 estimatedCameraAxisDepthM:null,absoluteErrorM:null,relativeErrorPct:null,result
});
function report(rows=[evaluated('a',3.6,3.4),evaluated('b',4,4.2),
 missing('c','no_corresponding_detection'),
 missing('d','no_depth_estimate')]){
 const errors=rows.filter(x=>x.absoluteErrorM!==null).map(x=>x.absoluteErrorM);
 const sorted=[...errors].sort((a,b)=>a-b),mid=Math.floor(errors.length/2);
 const median=!errors.length?null:(errors.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2);
 const avg=!errors.length?null:errors.reduce((s,x)=>s+x,0)/errors.length;
 const round4=x=>x===null?null:Math.round(x*10000)/10000;
 return {
  schema:'evercraft.spatial-perception.field-evaluation.v1',
  provenance:{sourceSha256:hash,modelSha256:hash,calibrationEvidenceSha256:hash,
   rigId:'fixture-only',byteIntegrityCheckedLocally:true,
   calibrationAuthenticityVerified:false,referenceIndependenceVerified:false},
  measurementAxis:'left_camera_optical_z_meters',
  referenceEvidenceClass:rows.some(x=>x.measurementMethod==='synthetic_known_disparity')
   ?'synthetic_fixture':'operator_attested_measurements_unverified',
  summary:{referenceTargets:rows.length,evaluatedTargets:errors.length,
   coveragePct:Math.round(10000*errors.length/rows.length)/100,
   noDetection:rows.filter(x=>x.result==='no_corresponding_detection').length,
   ambiguousDetections:rows.filter(x=>x.result==='ambiguous_detection').length,
   noDepth:rows.filter(x=>x.result==='no_depth_estimate').length,
   meanAbsoluteErrorM:round4(avg),
   rootMeanSquareErrorM:round4(errors.length?Math.sqrt(errors.reduce((s,x)=>s+x*x,0)/errors.length):null),
   medianAbsoluteErrorM:round4(median),maximumAbsoluteErrorM:round4(errors.length?Math.max(...errors):null)},
  targets:rows,status:'operator_supplied_reference_comparison_not_certified',
  humanReviewRequired:true,fieldAccuracyCertified:false,
  safetyCriticalApproved:false,georegistered:false,worldPersistenceAuthorized:false
 };
}
test('valid synthetic report yields accurate coverage, errors and explicit warnings',()=>{
 const inspected=inspectFieldReport(report());
 assert.equal(inspected.total,4);assert.equal(inspected.evaluated,2);
 assert.equal(inspected.coverage,50);
 assert.equal(inspected.metrics.mae,.2);
 assert.equal(inspected.counts.no_corresponding_detection,1);
 assert.equal(inspected.counts.no_depth_estimate,1);
 assert.equal(inspected.scope,'synthetic_fixture');
 assert.equal(inspected.fieldAccuracyCertified,false);
 assert.ok(inspected.warnings.some(w=>w.includes('NOT a physical field trial')));
});
test('all unknown depth is null metrics not zero',()=>{
 const v=inspectFieldReport(report([missing('x','no_depth_estimate'),
 missing('y','no_corresponding_detection')]));
 assert.equal(v.coverage,0);assert.equal(v.metrics.mae,null);
 assert.equal(v.metrics.rmse,null);assert.deepEqual(v.plottedErrors,[]);
});
test('operator-attested physical references are still not certified',()=>{
 const data=report([evaluated('a',3,3.2,'laser_camera_axis')]);
 const v=inspectFieldReport(data);
 assert.equal(v.scope,'operator_attested_measurements_unverified');
 assert.equal(v.fieldAccuracyCertified,false);
 assert.ok(v.warnings.some(w=>w.includes('custody')));
});
test('do not allow edited summary coverage and error to masquerade as truth',()=>{
 const a=report();a.summary.coveragePct=100;
 assert.throws(()=>inspectFieldReport(a),/inconsistent_coverage/);
 const b=report();b.summary.meanAbsoluteErrorM=0;
 assert.throws(()=>inspectFieldReport(b),/inconsistent_mae/);
 const c=report();c.targets[0].absoluteErrorM=.0001;
 assert.throws(()=>inspectFieldReport(c),/inconsistent_row_error/);
});
test('reject forged authority and provenance assertions',()=>{
 const a=report();a.fieldAccuracyCertified=true;
 assert.throws(()=>inspectFieldReport(a),/authority_escalation/);
 const b=report();b.worldPersistenceAuthorized=true;
 assert.throws(()=>inspectFieldReport(b),/authority_escalation/);
 const c=report();c.provenance.calibrationAuthenticityVerified=true;
 assert.throws(()=>inspectFieldReport(c),/unsupported_provenance_claim/);
});
test('reject synthetic fixture mislabeled as physical',()=>{
 const a=report();a.referenceEvidenceClass='operator_attested_measurements_unverified';
 assert.throws(()=>inspectFieldReport(a),/synthetic_mislabeled_as_physical/);
});
test('identify mixed synthetic and operator-attested references',()=>{
 const a=report([evaluated('s',4,4.1),
 evaluated('physical',5,5.3,'laser_camera_axis')]);
 const result=inspectFieldReport(a);
 assert.ok(result.warnings.some(w=>w.includes('mixed')));
});
test('reject missing measurement fabricated as error',()=>{
 const a=report();a.targets[2].estimatedCameraAxisDepthM=7.5;
 assert.throws(()=>inspectFieldReport(a),/invented_missing_measurement/);
});
test('reject duplicate target ids, nonfinite inputs, bad hashes',()=>{
 const a=report();a.targets[1].targetId='a';
 assert.throws(()=>inspectFieldReport(a),/invalid_target/);
 const b=report();b.targets[0].referenceCameraAxisDepthM=Infinity;
 assert.throws(()=>inspectFieldReport(b),/invalid_reference/);
 const c=report();c.provenance.sourceSha256='0000';
 assert.throws(()=>inspectFieldReport(c),/invalid_sourceSha256/);
});
test('status filter, text search and sort preserve missing targets',()=>{
 const v=inspectFieldReport(report());
 assert.equal(filterFieldRows(v,{status:'all'}).length,4);
 assert.deepEqual(filterFieldRows(v,{status:'evaluated_uncertified',sort:'error_asc'})
  .map(x=>x.id),['a','b']);
 assert.deepEqual(filterFieldRows(v,{query:'frame1'}).map(x=>x.id).sort(),['c','d']);
 assert.equal(filterFieldRows(v,{status:'no_corresponding_detection'})[0].id,'c');
 assert.throws(()=>filterFieldRows(v,{sort:'invalid'}),/invalid_sort/);
});
