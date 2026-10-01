import crypto from 'node:crypto';
import type { BoundaryContinuityAdmission } from './continuity-boundary.js';
import type { DialogueSyncAdmission } from './dialogue-sync-gate.js';
import type { IdentityFingerprintAdmission } from './identity-fingerprint.js';
import type { StudioMasterQcReceipt } from './master-qc.js';
import type { NarrativeFilmAdmissionReceipt } from './narrative-film-admission.js';
import type { SequenceAestheticReport } from './sequence-aesthetic.js';
import type { StudioDeliveryReceipt } from './studio-delivery.js';

export interface FilmRegressionThresholds {
  minIdentityScore?:number;
  maxIdentityMeanDistance?:number;
  minDialogueVisualSyncScore?:number;
  maxDialogueOffsetMs?:number;
  minAestheticMetricScore?:number;
  maxBlackRatio?:number;
  maxFreezeRatio?:number;
  maxSilenceRatio?:number;
  maxIdentityScoreDrop?:number;
  maxIdentityDistanceIncrease?:number;
  maxDialogueScoreDrop?:number;
  maxDialogueOffsetIncreaseMs?:number;
  maxAestheticScoreDrop?:number;
  maxBlackRatioIncrease?:number;
  maxFreezeRatioIncrease?:number;
  maxSilenceRatioIncrease?:number;
}

export interface FilmBenchmarkRunInput {
  schema:'evercraft.fallen.film-benchmark-run-input.v1';
  benchmarkId:string;
  runId:string;
  engineRef:string;
  filmAdmission:NarrativeFilmAdmissionReceipt;
  identityAdmissions:IdentityFingerprintAdmission[];
  continuityAdmissions:BoundaryContinuityAdmission[];
  dialogueAdmissions:DialogueSyncAdmission[];
  aestheticReport:SequenceAestheticReport;
  masterQc:StudioMasterQcReceipt;
  delivery:StudioDeliveryReceipt;
  sourceRefs:string[];
  thresholds?:FilmRegressionThresholds;
}

export interface FilmBenchmarkSnapshot {
  schema:'evercraft.fallen.film-benchmark-snapshot.v1';
  benchmarkId:string;
  runId:string;
  engineRef:string;
  status:'accepted'|'rejected';
  criticalFailures:string[];
  metrics:{
    identity:{
      count:number;
      minVerifiedScore:number|null;
      meanVerifiedScore:number|null;
      maxLocalMeanDistance:number|null;
    };
    continuity:{
      count:number;
      acceptedCount:number;
    };
    dialogue:{
      count:number;
      minVisualSyncScore:number|null;
      maxAbsOffsetMs:number|null;
      minIdentityScore:number|null;
    };
    aesthetic:{
      metricCount:number;
      minMetricScore:number|null;
      meanMetricScore:number|null;
    };
    master:{
      width:number;
      height:number;
      fps:number;
      blackRatio:number;
      freezeRatio:number;
      silenceRatio:number;
      sha256:string;
    };
    delivery:{
      qualityMode:string;
      mediaSha256:string;
    };
  };
  thresholdPolicy:Required<FilmRegressionThresholds>;
  sourceRefs:string[];
  snapshotDigest:string;
  boundaries:{
    noSingleCompositeScore:true;
    criticalGateFailureCannotBeAveragedAway:true;
    exactMasterDigestBound:true;
    narrativeFilmAdmissionRequired:true;
    publicationAuthorityGranted:false;
  };
  capturedAt:string;
}

export interface FilmBenchmarkComparison {
  schema:'evercraft.fallen.film-benchmark-comparison.v1';
  benchmarkId:string;
  baselineRunId:string;
  currentRunId:string;
  status:'accepted'|'regressed';
  regressions:string[];
  improvements:string[];
  comparisonDigest:string;
  boundaries:{
    criticalFailuresAlwaysRegress:true;
    metricToleranceBounded:true;
    noCompositeScoreMasking:true;
  };
  comparedAt:string;
}

const DEFAULTS:Required<FilmRegressionThresholds>={
  minIdentityScore:.86,
  maxIdentityMeanDistance:.38,
  minDialogueVisualSyncScore:.82,
  maxDialogueOffsetMs:180,
  minAestheticMetricScore:.76,
  maxBlackRatio:.08,
  maxFreezeRatio:.35,
  maxSilenceRatio:.85,
  maxIdentityScoreDrop:.03,
  maxIdentityDistanceIncrease:.05,
  maxDialogueScoreDrop:.03,
  maxDialogueOffsetIncreaseMs:60,
  maxAestheticScoreDrop:.04,
  maxBlackRatioIncrease:.02,
  maxFreezeRatioIncrease:.05,
  maxSilenceRatioIncrease:.08,
};

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

function mean(values:number[]){
  if(!values.length) return null;
  return values.reduce((a,b)=>a+b,0)/values.length;
}

function min(values:number[]){
  return values.length?Math.min(...values):null;
}

function max(values:number[]){
  return values.length?Math.max(...values):null;
}

function round(value:number|null,digits=4){
  if(value===null) return null;
  return Number(value.toFixed(digits));
}

export function captureFilmBenchmark(
  input:FilmBenchmarkRunInput,
):FilmBenchmarkSnapshot{
  if(input.schema!=='evercraft.fallen.film-benchmark-run-input.v1'){
    throw new Error('film_benchmark_input_schema_invalid');
  }
  if(!input.benchmarkId?.trim()) throw new Error('film_benchmark_id_missing');
  if(!input.runId?.trim()) throw new Error('film_benchmark_run_id_missing');
  if(!input.engineRef?.trim()) throw new Error('film_benchmark_engine_ref_missing');
  if(!input.sourceRefs?.length) throw new Error('film_benchmark_source_refs_missing');

  const policy:Required<FilmRegressionThresholds>={...DEFAULTS,...(input.thresholds??{})};
  const criticalFailures:string[]=[];

  if(input.filmAdmission.schema!=='evercraft.fallen.narrative-film-admission.v1'){
    criticalFailures.push('film_admission_schema_invalid');
  }
  if(input.filmAdmission.status!=='accepted'){
    criticalFailures.push('film_admission_not_accepted');
  }
  if(input.aestheticReport.schema!=='evercraft.fallen.sequence-aesthetic-report.v1'){
    criticalFailures.push('aesthetic_report_schema_invalid');
  }
  if(input.aestheticReport.status!=='accepted'){
    criticalFailures.push('aesthetic_report_not_accepted');
  }
  if(input.masterQc.schema!=='evercraft.fallen.master-qc-receipt.v1'){
    criticalFailures.push('master_qc_schema_invalid');
  }
  if(input.masterQc.status!=='accepted'){
    criticalFailures.push('master_qc_not_accepted');
  }
  if(input.delivery.schema!=='evercraft.fallen.studio-delivery-receipt.v1'){
    criticalFailures.push('delivery_schema_invalid');
  }
  if(input.delivery.qualityMode!=='narrative_film'){
    criticalFailures.push('delivery_not_narrative_film_mode');
  }
  if(input.delivery.mediaSha256!==input.masterQc.sha256){
    criticalFailures.push('delivery_master_digest_mismatch');
  }

  const identityScores=input.identityAdmissions
    .filter(item=>item.status==='accepted'&&Number.isFinite(item.verifiedIdentityScore))
    .map(item=>Number(item.verifiedIdentityScore));
  const identityDistances=input.identityAdmissions
    .filter(item=>item.status==='accepted'&&Number.isFinite(item.localMeanDistance))
    .map(item=>item.localMeanDistance);
  if(input.identityAdmissions.some(item=>item.status!=='accepted')){
    criticalFailures.push('identity_admission_rejected');
  }
  if(input.identityAdmissions.length&&identityScores.length!==input.identityAdmissions.length){
    criticalFailures.push('identity_verified_score_missing');
  }
  const minIdentity=min(identityScores);
  const maxIdentityDistance=max(identityDistances);
  if(minIdentity!==null&&minIdentity<policy.minIdentityScore){
    criticalFailures.push('identity_score_below_benchmark_min');
  }
  if(maxIdentityDistance!==null&&maxIdentityDistance>policy.maxIdentityMeanDistance){
    criticalFailures.push('identity_distance_above_benchmark_max');
  }

  const acceptedContinuity=input.continuityAdmissions.filter(item=>item.status==='accepted').length;
  if(acceptedContinuity!==input.continuityAdmissions.length){
    criticalFailures.push('continuity_admission_rejected');
  }

  const dialogueScores=input.dialogueAdmissions
    .filter(item=>item.status==='accepted'&&Number.isFinite(item.visualSyncScore))
    .map(item=>Number(item.visualSyncScore));
  const dialogueOffsets=input.dialogueAdmissions
    .filter(item=>item.status==='accepted'&&Number.isFinite(item.bestOffsetMs))
    .map(item=>Math.abs(item.bestOffsetMs));
  const dialogueIdentity=input.dialogueAdmissions
    .filter(item=>item.status==='accepted'&&Number.isFinite(item.identityScore))
    .map(item=>Number(item.identityScore));
  if(input.dialogueAdmissions.some(item=>item.status!=='accepted')){
    criticalFailures.push('dialogue_admission_rejected');
  }
  if(input.dialogueAdmissions.length&&dialogueScores.length!==input.dialogueAdmissions.length){
    criticalFailures.push('dialogue_visual_sync_score_missing');
  }
  const minDialogue=min(dialogueScores);
  const maxDialogueOffset=max(dialogueOffsets);
  if(minDialogue!==null&&minDialogue<policy.minDialogueVisualSyncScore){
    criticalFailures.push('dialogue_visual_sync_below_benchmark_min');
  }
  if(maxDialogueOffset!==null&&maxDialogueOffset>policy.maxDialogueOffsetMs){
    criticalFailures.push('dialogue_offset_above_benchmark_max');
  }

  const aestheticScores=input.aestheticReport.sequenceMetrics
    .filter(item=>Number.isFinite(item.score))
    .map(item=>item.score);
  if(input.aestheticReport.sequenceMetrics.length&&
     aestheticScores.length!==input.aestheticReport.sequenceMetrics.length){
    criticalFailures.push('aesthetic_metric_score_missing');
  }
  const minAesthetic=min(aestheticScores);
  if(minAesthetic!==null&&minAesthetic<policy.minAestheticMetricScore){
    criticalFailures.push('aesthetic_metric_below_benchmark_min');
  }

  const m=input.masterQc.measurements;
  if(m.blackRatio>policy.maxBlackRatio) criticalFailures.push('master_black_ratio_above_benchmark_max');
  if(m.freezeRatio>policy.maxFreezeRatio) criticalFailures.push('master_freeze_ratio_above_benchmark_max');
  if(m.silenceRatio>policy.maxSilenceRatio) criticalFailures.push('master_silence_ratio_above_benchmark_max');

  const metrics:FilmBenchmarkSnapshot['metrics']={
    identity:{
      count:input.identityAdmissions.length,
      minVerifiedScore:round(minIdentity),
      meanVerifiedScore:round(mean(identityScores)),
      maxLocalMeanDistance:round(maxIdentityDistance),
    },
    continuity:{
      count:input.continuityAdmissions.length,
      acceptedCount:acceptedContinuity,
    },
    dialogue:{
      count:input.dialogueAdmissions.length,
      minVisualSyncScore:round(minDialogue),
      maxAbsOffsetMs:round(maxDialogueOffset,1),
      minIdentityScore:round(min(dialogueIdentity)),
    },
    aesthetic:{
      metricCount:input.aestheticReport.sequenceMetrics.length,
      minMetricScore:round(minAesthetic),
      meanMetricScore:round(mean(aestheticScores)),
    },
    master:{
      width:m.width,
      height:m.height,
      fps:round(m.fps,3)??0,
      blackRatio:m.blackRatio,
      freezeRatio:m.freezeRatio,
      silenceRatio:m.silenceRatio,
      sha256:input.masterQc.sha256,
    },
    delivery:{
      qualityMode:input.delivery.qualityMode,
      mediaSha256:input.delivery.mediaSha256,
    },
  };

  const core={
    benchmarkId:input.benchmarkId,
    runId:input.runId,
    engineRef:input.engineRef,
    status:criticalFailures.length?'rejected':'accepted',
    criticalFailures:[...new Set(criticalFailures)],
    metrics,
    thresholdPolicy:policy,
    sourceRefs:[...new Set(input.sourceRefs)],
  };

  return {
    schema:'evercraft.fallen.film-benchmark-snapshot.v1',
    ...core,
    status:core.status as 'accepted'|'rejected',
    snapshotDigest:digest(core),
    boundaries:{
      noSingleCompositeScore:true,
      criticalGateFailureCannotBeAveragedAway:true,
      exactMasterDigestBound:true,
      narrativeFilmAdmissionRequired:true,
      publicationAuthorityGranted:false,
    },
    capturedAt:new Date().toISOString(),
  };
}

function numericRegression(
  regressions:string[],
  improvements:string[],
  label:string,
  baseline:number|null,
  current:number|null,
  allowedWorse:number,
  lowerIsBetter:boolean,
){
  if(baseline===null||current===null) return;
  const delta=current-baseline;
  if(lowerIsBetter){
    if(delta>allowedWorse) regressions.push(label+':worse_by='+Number(delta.toFixed(4)));
    else if(delta<0) improvements.push(label+':improved_by='+Number(Math.abs(delta).toFixed(4)));
  }else{
    if(delta<-allowedWorse) regressions.push(label+':worse_by='+Number(Math.abs(delta).toFixed(4)));
    else if(delta>0) improvements.push(label+':improved_by='+Number(delta.toFixed(4)));
  }
}

export function compareFilmBenchmark(input:{
  baseline:FilmBenchmarkSnapshot;
  current:FilmBenchmarkSnapshot;
  thresholds?:FilmRegressionThresholds;
}):FilmBenchmarkComparison{
  if(input.baseline.schema!=='evercraft.fallen.film-benchmark-snapshot.v1'||
     input.current.schema!=='evercraft.fallen.film-benchmark-snapshot.v1'){
    throw new Error('film_benchmark_snapshot_schema_invalid');
  }
  if(input.baseline.benchmarkId!==input.current.benchmarkId){
    throw new Error('film_benchmark_id_mismatch');
  }

  const policy:Required<FilmRegressionThresholds>={
    ...input.baseline.thresholdPolicy,
    ...(input.thresholds??{}),
  };
  const regressions:string[]=[];
  const improvements:string[]=[];

  if(input.current.status!=='accepted'){
    regressions.push(...input.current.criticalFailures.map(item=>'critical:'+item));
  }
  if(input.baseline.status!=='accepted'){
    regressions.push('baseline_not_accepted');
  }

  numericRegression(
    regressions,improvements,'identity_min_verified_score',
    input.baseline.metrics.identity.minVerifiedScore,
    input.current.metrics.identity.minVerifiedScore,
    policy.maxIdentityScoreDrop,false
  );
  numericRegression(
    regressions,improvements,'identity_max_local_mean_distance',
    input.baseline.metrics.identity.maxLocalMeanDistance,
    input.current.metrics.identity.maxLocalMeanDistance,
    policy.maxIdentityDistanceIncrease,true
  );
  numericRegression(
    regressions,improvements,'dialogue_min_visual_sync_score',
    input.baseline.metrics.dialogue.minVisualSyncScore,
    input.current.metrics.dialogue.minVisualSyncScore,
    policy.maxDialogueScoreDrop,false
  );
  numericRegression(
    regressions,improvements,'dialogue_max_abs_offset_ms',
    input.baseline.metrics.dialogue.maxAbsOffsetMs,
    input.current.metrics.dialogue.maxAbsOffsetMs,
    policy.maxDialogueOffsetIncreaseMs,true
  );
  numericRegression(
    regressions,improvements,'aesthetic_min_metric_score',
    input.baseline.metrics.aesthetic.minMetricScore,
    input.current.metrics.aesthetic.minMetricScore,
    policy.maxAestheticScoreDrop,false
  );
  numericRegression(
    regressions,improvements,'master_black_ratio',
    input.baseline.metrics.master.blackRatio,
    input.current.metrics.master.blackRatio,
    policy.maxBlackRatioIncrease,true
  );
  numericRegression(
    regressions,improvements,'master_freeze_ratio',
    input.baseline.metrics.master.freezeRatio,
    input.current.metrics.master.freezeRatio,
    policy.maxFreezeRatioIncrease,true
  );
  numericRegression(
    regressions,improvements,'master_silence_ratio',
    input.baseline.metrics.master.silenceRatio,
    input.current.metrics.master.silenceRatio,
    policy.maxSilenceRatioIncrease,true
  );

  if(input.current.metrics.master.width<input.baseline.metrics.master.width||
     input.current.metrics.master.height<input.baseline.metrics.master.height){
    regressions.push(
      'master_resolution_regressed:'+
      input.baseline.metrics.master.width+'x'+input.baseline.metrics.master.height+
      '->'+input.current.metrics.master.width+'x'+input.current.metrics.master.height
    );
  }
  if(input.current.metrics.master.fps+0.01<input.baseline.metrics.master.fps){
    regressions.push(
      'master_fps_regressed:'+
      input.baseline.metrics.master.fps+'->'+input.current.metrics.master.fps
    );
  }
  if(input.current.metrics.continuity.acceptedCount<input.current.metrics.continuity.count){
    regressions.push('continuity_not_fully_accepted');
  }
  if(input.current.metrics.identity.count<input.baseline.metrics.identity.count){
    regressions.push('identity_coverage_regressed');
  }
  if(input.current.metrics.dialogue.count<input.baseline.metrics.dialogue.count){
    regressions.push('dialogue_coverage_regressed');
  }

  const core={
    benchmarkId:input.current.benchmarkId,
    baselineRunId:input.baseline.runId,
    currentRunId:input.current.runId,
    status:regressions.length?'regressed':'accepted',
    regressions:[...new Set(regressions)],
    improvements:[...new Set(improvements)],
  };

  return {
    schema:'evercraft.fallen.film-benchmark-comparison.v1',
    ...core,
    status:core.status as 'accepted'|'regressed',
    comparisonDigest:digest(core),
    boundaries:{
      criticalFailuresAlwaysRegress:true,
      metricToleranceBounded:true,
      noCompositeScoreMasking:true,
    },
    comparedAt:new Date().toISOString(),
  };
}
