/**
 * Evercraft Spatial Perception V6 | local V5 report review.
 *
 * Strictly read-only. Recompute summary from per-target measurements,
 * reject contradictory reports and unsafe authority flags. This cannot
 * establish reference independence, physical calibration, or custody.
 */
export const REVIEW_SCHEMA = 'evercraft.spatial-perception.field-evaluation.v1';
const OUTCOMES = new Set([
  'evaluated_uncertified', 'no_corresponding_detection',
  'ambiguous_detection', 'duplicate_detection_match', 'no_depth_estimate'
]);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const approx = (a,b,tol=.005) => finite(a)&&finite(b)&&Math.abs(a-b)<=tol;
const round = (n, places=4) => Math.round(n*10**places)/10**places;
const fail = name => { throw new Error('field_review_'+name); };
const hash = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const label = x => typeof x === 'string' && x.trim().length>0 && x.length<=160;
const metrics = values => {
  if (!values.length) return {mae:null,rmse:null,median:null,max:null};
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  const median=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  return {
    mae:round(values.reduce((sum,x)=>sum+x,0)/values.length),
    rmse:round(Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length)),
    median:round(median),max:round(sorted[sorted.length-1])
  };
};
function verifyMetric(actual,expected,name,tolerance=.006) {
  if(expected===null) {
    if(actual!==null)fail('inconsistent_'+name);
  }else if(!approx(actual,expected,tolerance)) fail('inconsistent_'+name);
}
export function inspectFieldReport(report) {
  if(!report||typeof report!=='object'||Array.isArray(report)||
     report.schema!==REVIEW_SCHEMA)fail('invalid_schema');
  if(!Array.isArray(report.targets)||!report.targets.length||report.targets.length>500)
    fail('invalid_target_count');
  if(!report.provenance||!report.summary||typeof report.summary!=='object')
    fail('missing_metadata');
  for(const key of ['sourceSha256','modelSha256','calibrationEvidenceSha256'])
    if(!hash(report.provenance[key]))fail('invalid_'+key);
  if(!label(report.provenance.rigId))fail('invalid_rig');
  if(report.measurementAxis!=='left_camera_optical_z_meters')
    fail('invalid_measurement_axis');
  if(!['synthetic_fixture','operator_attested_measurements_unverified']
    .includes(report.referenceEvidenceClass))fail('invalid_reference_class');
  if(report.fieldAccuracyCertified!==false||report.safetyCriticalApproved!==false||
     report.georegistered!==false||report.worldPersistenceAuthorized!==false||
     report.humanReviewRequired!==true)
    fail('authority_escalation');
  if(report.provenance.calibrationAuthenticityVerified!==false||
     report.provenance.referenceIndependenceVerified!==false)
    fail('unsupported_provenance_claim');
  if(typeof report.provenance.byteIntegrityCheckedLocally!=='boolean')
    fail('unknown_integrity_state');
  const ids=new Set();
  const counts={evaluated_uncertified:0,no_corresponding_detection:0,
    ambiguous_detection:0,duplicate_detection_match:0,no_depth_estimate:0};
  const errors=[],rows=[];
  let artificial=0,physical=0;
  for(const t of report.targets) {
    if(!t||!label(t.targetId)||!label(t.frameId)||!label(t.label)||
       !OUTCOMES.has(t.result)||ids.has(t.targetId))fail('invalid_target');
    ids.add(t.targetId);
    if(!finite(t.referenceCameraAxisDepthM)||t.referenceCameraAxisDepthM<=0||
       !finite(t.referenceUncertaintyM)||t.referenceUncertaintyM<0)
      fail('invalid_reference');
    if(t.measurementMethod==='synthetic_known_disparity') artificial++;
    else if(['laser_camera_axis','tape_camera_axis','surveyed_camera_axis']
      .includes(t.measurementMethod))physical++;
    else fail('invalid_reference_method');
    const evaluated=t.result==='evaluated_uncertified';
    if(evaluated) {
      if(!label(t.matchedObservationId)||!finite(t.intersectionOverUnion)||
         t.intersectionOverUnion<0||t.intersectionOverUnion>1||
         !finite(t.estimatedCameraAxisDepthM)||t.estimatedCameraAxisDepthM<=0||
         !finite(t.absoluteErrorM)||t.absoluteErrorM<0||
         !finite(t.relativeErrorPct)||t.relativeErrorPct<0)
        fail('invalid_evaluated_row');
      verifyMetric(t.absoluteErrorM,
        round(Math.abs(t.estimatedCameraAxisDepthM-t.referenceCameraAxisDepthM)),
        'row_error');
      verifyMetric(t.relativeErrorPct,
        round(100*Math.abs(t.estimatedCameraAxisDepthM-
          t.referenceCameraAxisDepthM)/t.referenceCameraAxisDepthM,3),
        'row_relative_error',.012);
      errors.push(t.absoluteErrorM);
    } else if(t.estimatedCameraAxisDepthM!==null||t.absoluteErrorM!==null||
              t.relativeErrorPct!==null) {
      fail('invented_missing_measurement');
    }
    counts[t.result]++;
    rows.push({
      id:t.targetId,frameId:t.frameId,label:t.label,status:t.result,
      reference:t.referenceCameraAxisDepthM,
      uncertainty:t.referenceUncertaintyM,
      estimate:evaluated?t.estimatedCameraAxisDepthM:null,
      error:evaluated?t.absoluteErrorM:null,
      percentage:evaluated?t.relativeErrorPct:null,
      method:t.measurementMethod
    });
  }
  const s=report.summary,stats=metrics(errors);
  if(!Number.isInteger(s.referenceTargets)||s.referenceTargets!==rows.length||
     !Number.isInteger(s.evaluatedTargets)||s.evaluatedTargets!==errors.length||
     s.noDetection!==counts.no_corresponding_detection||
     s.ambiguousDetections!==counts.ambiguous_detection||
     s.noDepth!==counts.no_depth_estimate)
    fail('summary_count_mismatch');
  verifyMetric(s.coveragePct,round(100*errors.length/rows.length,2),
    'coverage',.01);
  verifyMetric(s.meanAbsoluteErrorM,stats.mae,'mae');
  verifyMetric(s.rootMeanSquareErrorM,stats.rmse,'rmse');
  verifyMetric(s.medianAbsoluteErrorM,stats.median,'median');
  verifyMetric(s.maximumAbsoluteErrorM,stats.max,'maximum');
  if(artificial>0 && report.referenceEvidenceClass!=='synthetic_fixture')
    fail('synthetic_mislabeled_as_physical');
  if(artificial===0 && report.referenceEvidenceClass==='synthetic_fixture')
    fail('synthetic_mislabeled_as_physical');
  const warnings=[];
  if(artificial>0) warnings.push(
    'This package includes synthetic targets. It is NOT a physical field trial.');
  if(artificial>0&&physical>0) warnings.push(
    'Synthetic and operator-attested references are mixed. Do not cite combined metrics as real-world accuracy.');
  if(!report.provenance.byteIntegrityCheckedLocally) warnings.push(
    'Original source/model/calibration bytes were NOT locally hash-verified by the producing tool.');
  warnings.push('Hash equality alone does not authenticate calibration, source custody or independent measurements.');
  warnings.push('Review required. This report never authorizes geographic pins, physical speed, world persistence, or safety use.');
  return {
    schema:REVIEW_SCHEMA,scope:report.referenceEvidenceClass,
    rigId:report.provenance.rigId,
    hashPrefix:report.provenance.sourceSha256.slice(0,12),
    byteIntegrityCheckedLocally:report.provenance.byteIntegrityCheckedLocally,
    counts,total:rows.length,evaluated:errors.length,
    coverage:round(100*errors.length/rows.length,2),
    metrics:stats,rows,warnings,
    plottedErrors:[...errors].sort((a,b)=>a-b),
    humanReviewRequired:true,fieldAccuracyCertified:false,
    georegistered:false,worldPersistenceAuthorized:false
  };
}
export function filterFieldRows(review,{status='all',query='',sort='error_desc'}={}) {
  if(review?.schema!==REVIEW_SCHEMA||!Array.isArray(review.rows))
    fail('invalid_review');
  if(status!=='all'&&!OUTCOMES.has(status))fail('invalid_filter');
  if(!['error_desc','error_asc','reference_asc','frame'].includes(sort))
    fail('invalid_sort');
  const q=String(query).slice(0,120).trim().toLowerCase();
  const rows=review.rows.filter(r=>(status==='all'||r.status===status)&&
    (!q||[r.id,r.frameId,r.label].some(v=>v.toLowerCase().includes(q))));
  rows.sort((a,b)=>{
    if(sort==='frame') return a.frameId.localeCompare(b.frameId)||a.id.localeCompare(b.id);
    if(sort==='reference_asc')return a.reference-b.reference||a.id.localeCompare(b.id);
    if(sort==='error_asc')return (a.error??Infinity)-(b.error??Infinity)||a.id.localeCompare(b.id);
    return (b.error??-1)-(a.error??-1)||a.id.localeCompare(b.id);
  });
  return rows;
}
