/**
 * Evercraft Spatial Perception V7: evidence-aware field retest planning.
 * Input MUST be the result of inspectFieldReport(), not an arbitrary report.
 * No risk scores, safety events, geographic data or approval decisions.
 */
export const RETEST_SCHEMA='evercraft.spatial-perception.retest-plan.v1';
const REVIEW_SCHEMA='evercraft.spatial-perception.field-evaluation.v1';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fail=x=>{throw Error('spatial_retest_'+x)};
const guidelines={
 no_corresponding_detection:{
  order:0,kind:'missing_detection',title:'Recheck detector coverage',
  objective:'Identify why the labeled reference was not matched to a detection',
  collect:['Inspect original left-frame exposure, occlusion, object boundaries and labels',
   'Retain the independently labeled reference box, including missed cases',
   'Repeat a controlled capture with the same rig and record detector version']
 },
 ambiguous_detection:{
  order:1,kind:'ambiguous_association',title:'Resolve overlapping detections',
  objective:'Separate competing image matches without assuming physical identity',
  collect:['Compare candidate boxes and class labels against the original frame',
   'Retain all similar detections and mark uncertain identity explicitly',
   'Repeat with less occlusion or alternate capture angle while preserving calibration']
 },
 no_depth_estimate:{
  order:2,kind:'insufficient_stereo_depth',title:'Investigate missing disparity',
  objective:'Determine why synchronized stereo frames did not support reliable camera-axis Z',
  collect:['Verify left/right frame synchronization, rectification and timestamp basis',
   'Inspect central object texture, blur, glare, and left-right occlusion',
   'Repeat at a documented camera-axis reference distance and keep null outputs']
 },
 duplicate_detection_match:{
  order:3,kind:'duplicate_target_match',title:'Review reference segmentation',
  objective:'Ensure one detection was not counted for multiple independent references',
  collect:['Compare independently annotated target boundaries in the original left frame',
   'Confirm separate object IDs, labels and spatial overlap without reusing one detection',
   'Keep duplicate matching attempts in the report rather than discarding them']
 },
 high_absolute_error:{
  order:4,kind:'depth_disagreement',title:'Recheck depth geometry and reference',
  objective:'Investigate a measured camera-axis depth error exceeding the operator review threshold',
  collect:['Check independent camera-axis Z measurement and its stated uncertainty',
   'Verify focal length, physical baseline, image scale, rectification and original source hashes',
   'Repeat the distance measurement across several positions; retain unsuccessful captures']
 }
};
const taskFor=(row,kind,threshold)=>{
 const g=guidelines[kind];
 return {
  id:row.id,frameId:row.frameId,label:row.label,
  engineeringPriority:g.order+1,
  finding:kind,title:g.title,objective:g.objective,
  referenceCameraAxisDepthM:row.reference,
  referenceUncertaintyM:row.uncertainty,
  estimatedCameraAxisDepthM:row.estimate,
  absoluteErrorM:row.error,
  reviewThresholdM:kind==='high_absolute_error'?threshold:null,
  measurementMethod:row.method,
  actions:[...g.collect],
  humanReviewRequired:true,
  status:'open_unverified'
 };
};
export function buildFieldRetestPlan(review,{reviewThresholdM=.5,maxTasks=500}={}){
 if(!review||review.schema!==REVIEW_SCHEMA||!Array.isArray(review.rows)||
    review.rows.length<1||review.rows.length>500||
    !['synthetic_fixture','operator_attested_measurements_unverified']
      .includes(review.scope)||
    review.humanReviewRequired!==true||
    review.fieldAccuracyCertified!==false||
    review.georegistered!==false||
    review.worldPersistenceAuthorized!==false)
   fail('invalid_review_input');
 if(!finite(reviewThresholdM)||reviewThresholdM<0||reviewThresholdM>1000)
   fail('invalid_threshold');
 if(!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>500)
   fail('invalid_max_tasks');
 const tasks=[],ids=new Set(),types={};
 for(const row of review.rows){
  if(!row||typeof row.id!=='string'||!row.id||
     typeof row.frameId!=='string'||!row.frameId||
     typeof row.label!=='string'||!row.label||
     ids.has(row.id)||!finite(row.reference)||row.reference<=0||
     !finite(row.uncertainty)||row.uncertainty<0||
     !['evaluated_uncertified','no_corresponding_detection',
       'ambiguous_detection','no_depth_estimate','duplicate_detection_match']
       .includes(row.status))
    fail('invalid_review_row');
  ids.add(row.id);
  let kind=row.status;
  if(row.status==='evaluated_uncertified'){
   if(!finite(row.error)||row.error<0||!finite(row.estimate)||row.estimate<=0)
     fail('invalid_evaluated_row');
   if(row.error<=reviewThresholdM)continue;
   kind='high_absolute_error';
  } else if(row.error!==null||row.estimate!==null){
   fail('fabricated_missing_depth');
  }
  const task=taskFor(row,kind,reviewThresholdM);
  tasks.push(task);
  types[kind]=(types[kind]??0)+1;
 }
 tasks.sort((a,b)=>a.engineeringPriority-b.engineeringPriority||
   (b.absoluteErrorM??0)-(a.absoluteErrorM??0)||
   a.frameId.localeCompare(b.frameId)||a.id.localeCompare(b.id));
 const all=tasks.length;
 const selected=tasks.slice(0,maxTasks);
 return {
  schema:RETEST_SCHEMA,
  sourceScope:review.scope,
  rigId:review.rigId,
  sourceSha256Prefix:review.hashPrefix,
  configuredReviewThresholdM:reviewThresholdM,
  thresholdMeaning:'operator_triage_only_not_accuracy_acceptance',
  totalReferences:review.rows.length,
  totalFlagged:all,
  exportedTasks:selected.length,
  truncated:all>selected.length,
  categories:types,
  tasks:selected,
  captureChecklist:[
   'Confirm capture consent, recording rights and original source checksums',
   'Review the actual camera-pair calibration and independent optical-axis Z references',
   'Record lighting, texture, range, camera movement, blur and occlusion for every retest',
   'Keep planned targets that yield no detection or no depth in evaluation coverage',
   'Run V3 offline importer, V5 measurement evaluator and V6 field review before human sign-off'
  ],
  interpretationWarning:review.scope==='synthetic_fixture'
   ?'Artificial fixture only. No real-camera retest has been scheduled or completed.'
   :'Operator-attested measurements, not independently verified or certified.',
  humanReviewRequired:true,
  fieldAccuracyCertified:false,
  safetyCriticalApproved:false,
  georegistered:false,
  worldPersistenceAuthorized:false,
  realWorldCaptureScheduled:false,
  retestCompleted:false
 };
}
