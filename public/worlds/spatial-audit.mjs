/**
 * Spatial Perception QA V1.
 * Checks left/right patch correspondence, then compares a filtered stereo
 * depth field with independently supplied camera-range targets.
 *
 * Correspondence consistency is NOT metric ground truth or an accuracy certificate.
 * All inputs are camera-relative, not georeferenced.
 */
import {SPATIAL_SCHEMA} from './spatial-perception.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const rounded=n=>Math.round(n*1000)/1000;
function bad(label){throw new Error('spatial_qa_'+label);}
function number(n,lo,hi,label){if(!finite(n)||n<lo||n>hi)bad(label);}
function pixels(a,size,label){
 if(!a||a.length!==size)bad(label+'_pixels');
 for(let i=0;i<size;i++)if(!finite(a[i])||a[i]<0||a[i]>255)bad(label+'_sample');
}
function median(v){
 const a=[...v].sort((x,y)=>x-y),m=Math.floor(a.length/2);
 return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
/**
 * Reverse match at a forward-matched pixel: right(x-d) -> left(x-d+d2).
 * Returns a NEW depth object. The original is never modified.
 */
export function auditStereoConsistency(depth,left,right,{
 radius=2,minDisparity=1,maxDisparity=16,tolerancePx=1,
 maxPoints=50000
}={}){
 if(depth?.schema!==SPATIAL_SCHEMA || !Number.isInteger(depth.width) ||
  !Number.isInteger(depth.height) || !Array.isArray(depth.points))bad('invalid_depth');
 const {width,height,points}=depth;
 pixels(left,width*height,'left');pixels(right,width*height,'right');
 number(radius,1,5,'invalid_radius');
 number(minDisparity,1,256,'invalid_min_disparity');
 number(maxDisparity,minDisparity,256,'invalid_max_disparity');
 number(tolerancePx,0,10,'invalid_tolerance');
 number(maxPoints,1,50000,'invalid_max_points');
 if(![radius,minDisparity,maxDisparity,maxPoints].every(Number.isInteger))bad('integer_configuration');
 if(points.length>maxPoints)bad('point_budget_exceeded');
 let outOfBounds=0,inconsistent=0;
 const accepted=[],residuals=[];
 for(const p of points){
  if(!finite(p.x)||!finite(p.y)||!finite(p.disparityPx)||
    !finite(p.depthM)||p.disparityPx<=0 ||
    p.x<0||p.x>=width||p.y<0||p.y>=height)bad('invalid_point');
  const xr=p.x-p.disparityPx;
  if(!Number.isInteger(xr)||p.y<radius||p.y>=height-radius||
    xr<radius||xr>=width-radius){outOfBounds++;continue;}
  let best=Infinity,reverseDisparity=null;
  for(let d=minDisparity;d<=maxDisparity;d++){
   if(xr+d+radius>=width)break;
   let sad=0;
   for(let dy=-radius;dy<=radius;dy++)
    for(let dx=-radius;dx<=radius;dx++){
     sad+=Math.abs(right[(p.y+dy)*width+xr+dx]-
      left[(p.y+dy)*width+xr+d+dx]);
    }
   if(sad<best){best=sad;reverseDisparity=d;}
  }
  if(reverseDisparity===null){outOfBounds++;continue;}
  const residual=Math.abs(p.disparityPx-reverseDisparity);
  if(residual>tolerancePx){inconsistent++;continue;}
  accepted.push({...p,leftRightResidualPx:residual});
  residuals.push(residual);
 }
 const total=points.length;
 return {...depth,points:accepted,sampleCount:accepted.length,
  qualityStatus:'left_right_consistency_filtered_not_field_validated',
  audit:{
   schema:'evercraft.spatial-perception.consistency-audit.v1',
   sourceSamples:total,retainedSamples:accepted.length,
   rejectedOutOfBounds:outOfBounds,rejectedInconsistent:inconsistent,
   retentionRatio:total?rounded(accepted.length/total):null,
   medianResidualPx:residuals.length?rounded(median(residuals)):null,
   metricAccuracyVerified:false
  }};
}
/** Independent ground-truth measurements provided by the operator.
 * The sample median is drawn from the target's image bounding box.
 * A comparison NEVER changes the evidence classification automatically.
 */
export function compareRangingTargets(depth,targets,{minimumSamples=3}={}){
 if(depth?.schema!==SPATIAL_SCHEMA||!Array.isArray(depth.points))bad('invalid_depth');
 if(!Array.isArray(targets)||targets.length>100)bad('invalid_targets');
 number(minimumSamples,1,1000,'invalid_min_samples');
 if(!Number.isInteger(minimumSamples))bad('integer_min_samples');
 const comparisons=targets.map((t,index)=>{
  if(typeof t?.id!=='string'||!t.id||t.id.length>96)bad('invalid_target_id');
  number(t.rangeM,0.01,10000,'invalid_reference_range');
  const b=t.box;
  if(!b||!['x','y','width','height'].every(k=>finite(b[k]))||
   b.x<0||b.y<0||b.width<=0||b.height<=0||
   b.x+b.width>depth.width||b.y+b.height>depth.height)bad('invalid_target_box');
  const matches=depth.points.filter(p=>p.x>=b.x&&p.x<b.x+b.width&&
   p.y>=b.y&&p.y<b.y+b.height);
  const estimate=matches.length>=minimumSamples?median(matches.map(p=>p.depthM)):null;
  return {id:t.id,referenceRangeM:t.rangeM,sampleCount:matches.length,
   estimateM:estimate===null?null:rounded(estimate),
   absoluteErrorM:estimate===null?null:rounded(Math.abs(estimate-t.rangeM)),
   absolutePercentError:estimate===null?null:rounded(Math.abs(estimate-t.rangeM)/t.rangeM*100),
   result:estimate===null?'insufficient_depth_samples':'comparison_only_not_certified',
   referenceMethod:typeof t.method==='string'&&t.method.length<=80?t.method:'operator_supplied_unknown'};
 });
 const evaluated=comparisons.filter(c=>c.absoluteErrorM!==null);
 const mean=evaluated.length?evaluated.reduce((s,c)=>s+c.absoluteErrorM,0)/evaluated.length:null;
 const rmse=evaluated.length?Math.sqrt(evaluated.reduce((s,c)=>s+c.absoluteErrorM**2,0)/evaluated.length):null;
 return {schema:'evercraft.spatial-perception.ranging-report.v1',
  targets:comparisons,totalTargets:targets.length,evaluatedTargets:evaluated.length,
  meanAbsoluteErrorM:mean===null?null:rounded(mean),
  rootMeanSquareErrorM:rmse===null?null:rounded(rmse),
  evaluationStatus:'reference_comparison_requires_independent_review',
  certifiedForSafety:false,georegistered:false};
}
