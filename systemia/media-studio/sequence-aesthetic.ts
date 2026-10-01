import crypto from 'node:crypto';
import type { CinematicSequencePlan, CameraMovement, ShotScale } from './cinematic-sequence.js';
import type { ShotCandidate, VisualObservationReceipt } from './shot-tournament.js';
import type { VisualObservationPacket } from './visual-observer.js';

export type SequenceAestheticMetric =
  | 'edit_rhythm'
  | 'composition_variety'
  | 'camera_motivation'
  | 'motion_naturalism'
  | 'performance_naturalism'
  | 'visual_hierarchy'
  | 'tone_coherence'
  | 'spectacle_restraint';

export interface SelectedShotAestheticEvidence {
  shotId:string;
  candidate:ShotCandidate;
  observationPacket:VisualObservationPacket;
  receipts:VisualObservationReceipt[];
}

export interface SequenceAestheticVerifierReceipt {
  schema:'evercraft.fallen.sequence-aesthetic-verifier-receipt.v1';
  sequenceId:string;
  planDigest:string;
  selectedArtifacts:Array<{shotId:string;artifactDigest:string}>;
  verifierId:string;
  verifierState:'declared'|'verified';
  metrics:Array<{
    metric:SequenceAestheticMetric;
    score:number;
    threshold:number;
    findings:string[];
  }>;
  evidenceRefs:string[];
}

export interface SequenceAestheticPolicy {
  maxIdenticalScaleRun?:number;
  maxIdenticalMovementRun?:number;
  maxSameLensFraction?:number;
  maxStaticFraction?:number;
  minDurationCv?:number;
  requiredPerShotMetrics?:Array<VisualObservationReceipt['metric']>;
  minPerShotScore?:number;
  requiredSequenceMetrics?:SequenceAestheticMetric[];
  minSequenceScore?:number;
}

export interface SequenceAestheticReport {
  schema:'evercraft.fallen.sequence-aesthetic-report.v1';
  sequenceId:string;
  status:'accepted'|'rejected';
  reasons:string[];
  warnings:string[];
  structure:{
    shotCount:number;
    identicalScaleRun:number;
    identicalMovementRun:number;
    dominantLensMm:number;
    dominantLensFraction:number;
    staticFraction:number;
    durationMeanSec:number;
    durationCv:number;
    uniqueShotScales:ShotScale[];
    uniqueMovements:CameraMovement[];
  };
  perShot:Array<{
    shotId:string;
    artifactDigest:string;
    status:'accepted'|'rejected';
    reasons:string[];
    motionActivity?:number;
  }>;
  sequenceMetrics:Array<{
    metric:SequenceAestheticMetric;
    score:number;
    threshold:number;
    findings:string[];
  }>;
  reportDigest:string;
  boundaries:{
    selectedArtifactsBound:true;
    perShotVisualEvidenceRequired:true;
    sequenceLevelVerifierRequired:true;
    structuralHeuristicsAreNotAestheticTruth:true;
    noAutomaticStylePrescription:true;
    publicationAuthorityGranted:false;
  };
  assessedAt:string;
}

const DEFAULT_SEQUENCE_METRICS:SequenceAestheticMetric[]=[
  'edit_rhythm',
  'composition_variety',
  'camera_motivation',
  'motion_naturalism',
  'performance_naturalism',
  'visual_hierarchy',
  'tone_coherence',
  'spectacle_restraint',
];

const DEFAULT_PER_SHOT_METRICS:VisualObservationReceipt['metric'][]=[
  'composition',
  'motion_quality',
  'beauty',
  'editability',
];

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function longestRun<T>(values:T[]){
  if(!values.length) return 0;
  let best=1,current=1;
  for(let index=1;index<values.length;index+=1){
    if(values[index]===values[index-1]){
      current+=1;
      best=Math.max(best,current);
    }else current=1;
  }
  return best;
}

function dominant(values:number[]){
  const counts=new Map<number,number>();
  for(const value of values) counts.set(value,(counts.get(value)??0)+1);
  let bestValue=values[0]??0,bestCount=0;
  for(const [value,count] of counts){
    if(count>bestCount||(count===bestCount&&value<bestValue)){
      bestValue=value;bestCount=count;
    }
  }
  return {value:bestValue,count:bestCount};
}

function mean(values:number[]){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}

function coefficientOfVariation(values:number[]){
  if(values.length<2) return 0;
  const m=mean(values);
  if(m<=0) return 0;
  const variance=values.reduce((sum,value)=>sum+(value-m)**2,0)/values.length;
  return Math.sqrt(variance)/m;
}

function verifiedReceiptMap(receipts:VisualObservationReceipt[]){
  const map=new Map<VisualObservationReceipt['metric'],VisualObservationReceipt[]>();
  for(const receipt of receipts){
    const rows=map.get(receipt.metric)??[];
    rows.push(receipt);
    map.set(receipt.metric,rows);
  }
  return map;
}

function exactPacketMatch(evidence:SelectedShotAestheticEvidence){
  const expected=evidence.candidate.artifactDigest.replace(/^sha256:/,'');
  return (
    evidence.observationPacket.candidateId===evidence.candidate.id&&
    evidence.observationPacket.shotId===evidence.shotId&&
    evidence.observationPacket.artifactDigest===expected
  );
}

function assessPerShot(input:{
  evidence:SelectedShotAestheticEvidence;
  requiredMetrics:VisualObservationReceipt['metric'][];
  minScore:number;
}){
  const {evidence}=input;
  const reasons:string[]=[];
  if(evidence.candidate.shotId!==evidence.shotId){
    reasons.push('candidate_shot_mismatch');
  }
  if(!exactPacketMatch(evidence)){
    reasons.push('observation_packet_artifact_mismatch');
  }
  const receipts=verifiedReceiptMap(evidence.receipts);
  for(const metric of input.requiredMetrics){
    const valid=(receipts.get(metric)??[]).some(receipt=>
      receipt.candidateId===evidence.candidate.id&&
      receipt.verifierState==='verified'&&
      Number.isFinite(receipt.score)&&
      Number.isFinite(receipt.threshold)&&
      receipt.score>=Math.max(input.minScore,receipt.threshold)&&
      receipt.evidenceRefs.length>0
    );
    if(!valid) reasons.push('required_visual_metric_failed_or_missing:'+metric);
  }
  return {
    shotId:evidence.shotId,
    artifactDigest:evidence.candidate.artifactDigest.replace(/^sha256:/,''),
    status:reasons.length?('rejected' as const):('accepted' as const),
    reasons:[...new Set(reasons)],
    motionActivity:evidence.observationPacket.objective.motionActivity,
  };
}

export function assessSequenceAesthetics(input:{
  plan:CinematicSequencePlan;
  selected:SelectedShotAestheticEvidence[];
  verifierReceipt?:SequenceAestheticVerifierReceipt;
  policy?:SequenceAestheticPolicy;
}):SequenceAestheticReport{
  if(input.plan.schema!=='evercraft.fallen.cinematic-sequence-plan.v1'){
    throw new Error('sequence_aesthetic_plan_schema_invalid');
  }
  if(input.plan.status!=='accepted'){
    throw new Error('sequence_aesthetic_plan_not_accepted');
  }

  const policy={
    maxIdenticalScaleRun:input.policy?.maxIdenticalScaleRun??3,
    maxIdenticalMovementRun:input.policy?.maxIdenticalMovementRun??4,
    maxSameLensFraction:input.policy?.maxSameLensFraction??.72,
    maxStaticFraction:input.policy?.maxStaticFraction??.8,
    minDurationCv:input.policy?.minDurationCv??.08,
    requiredPerShotMetrics:input.policy?.requiredPerShotMetrics??DEFAULT_PER_SHOT_METRICS,
    minPerShotScore:input.policy?.minPerShotScore??.72,
    requiredSequenceMetrics:input.policy?.requiredSequenceMetrics??DEFAULT_SEQUENCE_METRICS,
    minSequenceScore:input.policy?.minSequenceScore??.76,
  };

  const reasons:string[]=[];
  const warnings:string[]=[];
  const shotIds=input.plan.shots.map(shot=>shot.id);
  const selectedByShot=new Map(input.selected.map(item=>[item.shotId,item]));
  if(selectedByShot.size!==input.selected.length){
    reasons.push('duplicate_selected_shot_evidence');
  }
  for(const shotId of shotIds){
    if(!selectedByShot.has(shotId)) reasons.push('selected_shot_evidence_missing:'+shotId);
  }
  for(const selected of input.selected){
    if(!shotIds.includes(selected.shotId)) reasons.push('selected_evidence_unknown_shot:'+selected.shotId);
  }

  const scales=input.plan.shots.map(shot=>shot.shotScale);
  const movements=input.plan.shots.map(shot=>shot.cameraMovement);
  const lenses=input.plan.shots.map(shot=>shot.lensMm);
  const durations=input.plan.shots.map(shot=>shot.durationSec);
  const lens=dominant(lenses);
  const staticCount=movements.filter(movement=>movement==='locked').length;
  const structure={
    shotCount:input.plan.shots.length,
    identicalScaleRun:longestRun(scales),
    identicalMovementRun:longestRun(movements),
    dominantLensMm:lens.value,
    dominantLensFraction:Number((lens.count/Math.max(1,lenses.length)).toFixed(4)),
    staticFraction:Number((staticCount/Math.max(1,movements.length)).toFixed(4)),
    durationMeanSec:Number(mean(durations).toFixed(3)),
    durationCv:Number(coefficientOfVariation(durations).toFixed(4)),
    uniqueShotScales:[...new Set(scales)],
    uniqueMovements:[...new Set(movements)],
  };

  if(structure.identicalScaleRun>policy.maxIdenticalScaleRun){
    reasons.push('shot_scale_run_too_repetitive');
  }
  if(structure.identicalMovementRun>policy.maxIdenticalMovementRun){
    reasons.push('camera_movement_run_too_repetitive');
  }
  if(input.plan.shots.length>=5&&structure.dominantLensFraction>policy.maxSameLensFraction){
    warnings.push('lens_palette_narrow');
  }
  if(input.plan.shots.length>=5&&structure.staticFraction>policy.maxStaticFraction){
    warnings.push('sequence_may_be_overly_static');
  }
  if(input.plan.shots.length>=5&&structure.durationCv<policy.minDurationCv){
    warnings.push('cut_duration_pattern_mechanically_uniform');
  }

  const perShot=input.selected.map(evidence=>assessPerShot({
    evidence,
    requiredMetrics:policy.requiredPerShotMetrics,
    minScore:policy.minPerShotScore,
  }));
  for(const row of perShot){
    if(row.status==='rejected') reasons.push('shot_aesthetic_evidence_failed:'+row.shotId);
  }

  const selectedArtifacts=input.plan.shots.flatMap(shot=>{
    const evidence=selectedByShot.get(shot.id);
    return evidence?[{
      shotId:shot.id,
      artifactDigest:evidence.candidate.artifactDigest.replace(/^sha256:/,''),
    }]:[];
  });

  const receipt=input.verifierReceipt;
  const sequenceMetrics:SequenceAestheticReport['sequenceMetrics']=[];
  if(!receipt){
    reasons.push('sequence_aesthetic_verifier_receipt_missing');
  }else{
    if(receipt.schema!=='evercraft.fallen.sequence-aesthetic-verifier-receipt.v1'){
      reasons.push('sequence_aesthetic_verifier_schema_invalid');
    }
    if(receipt.sequenceId!==input.plan.id) reasons.push('sequence_aesthetic_sequence_mismatch');
    if(receipt.planDigest!==input.plan.digest) reasons.push('sequence_aesthetic_plan_digest_mismatch');
    if(receipt.verifierState!=='verified') reasons.push('sequence_aesthetic_verifier_unverified');

    const expected=new Map(selectedArtifacts.map(item=>[item.shotId,item.artifactDigest]));
    const supplied=new Map(receipt.selectedArtifacts.map(item=>[item.shotId,item.artifactDigest.replace(/^sha256:/,'')]));
    if(expected.size!==supplied.size||[...expected].some(([shotId,dig])=>supplied.get(shotId)!==dig)){
      reasons.push('sequence_aesthetic_selected_artifacts_mismatch');
    }

    for(const metric of policy.requiredSequenceMetrics){
      const rows=receipt.metrics.filter(row=>row.metric===metric);
      if(rows.length!==1){
        reasons.push('sequence_aesthetic_metric_missing_or_duplicate:'+metric);
        continue;
      }
      const row=rows[0];
      sequenceMetrics.push(row);
      if(!Number.isFinite(row.score)||!Number.isFinite(row.threshold)){
        reasons.push('sequence_aesthetic_metric_score_invalid:'+metric);
        continue;
      }
      if(row.score<Math.max(policy.minSequenceScore,row.threshold)){
        reasons.push('sequence_aesthetic_metric_failed:'+metric);
      }
    }
    if(!receipt.evidenceRefs.length){
      reasons.push('sequence_aesthetic_evidence_refs_missing');
    }
  }

  const core={
    sequenceId:input.plan.id,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)],
    warnings:[...new Set(warnings)],
    structure,
    perShot,
    sequenceMetrics,
  };

  return {
    schema:'evercraft.fallen.sequence-aesthetic-report.v1',
    ...core,
    status:core.status as 'accepted'|'rejected',
    reportDigest:digest(core),
    boundaries:{
      selectedArtifactsBound:true,
      perShotVisualEvidenceRequired:true,
      sequenceLevelVerifierRequired:true,
      structuralHeuristicsAreNotAestheticTruth:true,
      noAutomaticStylePrescription:true,
      publicationAuthorityGranted:false,
    },
    assessedAt:new Date().toISOString(),
  };
}
