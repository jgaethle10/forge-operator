import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateStereoDepth} from '../public/worlds/spatial-perception.mjs';
import {auditStereoConsistency,compareRangingTargets} from '../public/worlds/spatial-audit.mjs';

function pair(disparity=4){
 const width=80,height=48,left=new Uint8Array(width*height),right=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)
  left[y*width+x]=(x*71+y*37+(x*y*17)%251)%256;
 for(let y=0;y<height;y++)for(let x=0;x<width-disparity;x++)
  right[y*width+x]=left[y*width+x+disparity];
 return {left,right,width,height,fxPx:120,baselineM:0.12,
  minDisparity:1,maxDisparity:9,stride:2,minTexture:5};
}
const bbox={x:25,y:10,width:40,height:28};
test('identical synthetic geometry stays consistent without mutation',()=>{
 const p=pair(),raw=estimateStereoDepth(p);
 const rawCopy=JSON.stringify(raw);
 const audited=auditStereoConsistency(raw,p.left,p.right,{maxDisparity:9});
 assert.ok(raw.sampleCount>100);
 assert.ok(audited.sampleCount>70);
 assert.ok(audited.audit.retentionRatio>0.5);
 assert.equal(audited.qualityStatus,'left_right_consistency_filtered_not_field_validated');
 assert.equal(audited.audit.metricAccuracyVerified,false);
 assert.equal(JSON.stringify(raw),rawCopy);
 for(const point of audited.points)assert.ok(point.leftRightResidualPx<=1);
});
test('reverse mismatch rejects corrupted right correspondence',()=>{
 const p=pair(),raw=estimateStereoDepth(p);
 const corrupt=new Uint8Array(p.width*p.height);
 const result=auditStereoConsistency(raw,p.left,corrupt,{maxDisparity:9});
 assert.ok(result.sampleCount<raw.sampleCount/10);
 assert.ok(result.audit.rejectedPoorPhotometricMatch>0);
});
test('known synthetic 3.6 meter target returns close numeric comparison, not certificate',()=>{
 const p=pair(),raw=estimateStereoDepth(p);
 const audited=auditStereoConsistency(raw,p.left,p.right,{maxDisparity:9});
 const report=compareRangingTargets(audited,[{id:'synthetic-range',cameraAxisDepthM:3.6,box:bbox,method:'known synthetic geometry'}]);
 assert.equal(report.evaluatedTargets,1);
 assert.ok(report.meanAbsoluteErrorM<0.1);
 assert.equal(report.certifiedForSafety,false);
 assert.equal(report.georegistered,false);
 assert.equal(report.evaluationStatus,'reference_comparison_requires_independent_review');
});
test('poor target coverage must report unknown rather than zero error',()=>{
 const p=pair(),raw=estimateStereoDepth(p);
 const report=compareRangingTargets(raw,[{id:'empty-region',cameraAxisDepthM:3.6,box:{x:0,y:0,width:5,height:5}}]);
 assert.equal(report.evaluatedTargets,0);
 assert.equal(report.meanAbsoluteErrorM,null);
 assert.equal(report.targets[0].estimateM,null);
});
test('reject forged/out-of-bounds reference and malformed reverse inputs',()=>{
 const p=pair(),raw=estimateStereoDepth(p);
 assert.throws(()=>auditStereoConsistency(raw,p.left,new Uint8Array(2)),/right_pixels/);
 assert.throws(()=>auditStereoConsistency(raw,p.left,p.right,{maxDisparity:500}),/invalid_max_disparity/);
 assert.throws(()=>compareRangingTargets(raw,[{id:'bad',cameraAxisDepthM:3,box:{x:-2,y:0,width:20,height:20}}]),/invalid_target_box/);
 assert.throws(()=>compareRangingTargets(raw,[{id:'bad',cameraAxisDepthM:NaN,box:bbox}]),/invalid_reference_axial_depth/);
});
test('blank stereo yields undefined retention and no reference estimates',()=>{
 const p=pair();p.left.fill(64);p.right.fill(64);
 const raw=estimateStereoDepth(p),audited=auditStereoConsistency(raw,p.left,p.right,{maxDisparity:9});
 assert.equal(audited.sampleCount,0);
 assert.equal(audited.audit.retentionRatio,null);
 const report=compareRangingTargets(audited,[{id:'blank',cameraAxisDepthM:10,box:bbox}]);
 assert.equal(report.targets[0].result,'insufficient_depth_samples');
});
