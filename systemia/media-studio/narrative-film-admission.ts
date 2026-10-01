import crypto from 'node:crypto';
import type { CinematicSequencePlan, CinematicShotContract } from './cinematic-sequence.js';
import type { BoundaryContinuityAdmission } from './continuity-boundary.js';
import type { IdentityFingerprintAdmission } from './identity-fingerprint.js';
import type { PerformancePlan } from './performance-director.js';
import { timelineDigest, type FallenTimelineProject } from './timeline.js';
import type {
  ProductionAdmission,
  ShotSelectionReceipt,
} from './types.js';

export interface DialogueSyncAdmissionContract {
  schema:'evercraft.fallen.dialogue-sync-admission.v1';
  packetDigest:string;
  speakerId:string;
  syncedVideoSha256:string;
  status:'accepted'|'rejected';
  reasons:string[];
  warnings:string[];
  bestCorrelation:number;
  bestOffsetMs:number;
  visualSyncScore?:number;
  identityScore?:number;
  admissionDigest:string;
}

export interface SequenceAestheticReportContract {
  schema:'evercraft.fallen.sequence-aesthetic-report.v1';
  sequenceId:string;
  status:'accepted'|'rejected';
  reasons:string[];
  warnings:string[];
  perShot:Array<{
    shotId:string;
    artifactDigest:string;
    status:'accepted'|'rejected';
    reasons:string[];
    motionActivity?:number;
  }>;
  reportDigest:string;
}

export interface NarrativeFilmShotEvidence {
  shotId:string;
  timelineClipId:string;
  finalArtifactDigest:string;
  baseSelection:ShotSelectionReceipt;
  baseProductionAdmission:ProductionAdmission;
  finishProductionAdmission?:ProductionAdmission;
  identityAdmissions:IdentityFingerprintAdmission[];
  continuityAdmission?:BoundaryContinuityAdmission;
  dialogueAdmission?:DialogueSyncAdmissionContract;
  sourceRefs:string[];
}

export interface NarrativeFilmAdmissionInput {
  schema:'evercraft.fallen.narrative-film-admission-input.v1';
  id:string;
  project:FallenTimelineProject;
  sequencePlan:CinematicSequencePlan;
  performancePlan:PerformancePlan;
  shots:NarrativeFilmShotEvidence[];
  aestheticReport:SequenceAestheticReportContract;
}

export interface NarrativeFilmShotAdmission {
  shotId:string;
  timelineClipId:string;
  finalArtifactDigest:string;
  status:'accepted'|'rejected';
  reasons:string[];
  baseSelectionDigest:string;
  identityAdmissionDigests:string[];
  continuityAdmissionDigest?:string;
  dialogueAdmissionDigest?:string;
}

export interface NarrativeFilmAdmissionReceipt {
  schema:'evercraft.fallen.narrative-film-admission.v1';
  id:string;
  projectId:string;
  projectVersion:number;
  projectTimelineDigest:string;
  sequenceId:string;
  sequencePlanDigest:string;
  performancePlanDigest:string;
  aestheticReportDigest:string;
  status:'accepted'|'rejected';
  reasons:string[];
  warnings:string[];
  shots:NarrativeFilmShotAdmission[];
  admissionDigest:string;
  boundaries:{
    finalTimelineBytesBound:true;
    everyVisibleCharacterIdentityBound:true;
    continuousCutsRequireBoundaryAdmission:true;
    dialogueShotsRequireDialogueAdmission:true;
    postSelectionFinishesMustBeAdmitted:true;
    sequenceAestheticAdmissionRequired:true;
    deliveryMustRequireThisReceiptForNarrativeFilm:true;
    masterQcStillRequiredAtDelivery:true;
    publicationAuthorityGranted:false;
  };
  admittedAt:string;
}

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

function cleanDigest(value:string){
  return value.replace(/^sha256:/,'').toLowerCase();
}

function clipArtifactDigest(project:FallenTimelineProject,clipId:string){
  for(const track of project.tracks){
    const clip=track.clips.find(item=>item.id===clipId);
    if(!clip) continue;
    const asset=project.assets.find(item=>item.id===clip.assetId);
    if(!asset) throw new Error('narrative_film_timeline_asset_missing:'+clip.assetId);
    return cleanDigest(asset.digest);
  }
  throw new Error('narrative_film_timeline_clip_missing:'+clipId);
}

function shotById(plan:CinematicSequencePlan){
  return new Map(plan.shots.map(shot=>[shot.id,shot] as const));
}

function visibleEntities(shot:CinematicShotContract){
  return [...new Set(shot.characters.map(character=>character.entityId))];
}

function acceptedProduction(
  admission:ProductionAdmission|undefined,
  digestValue:string,
){
  return Boolean(
    admission&&
    admission.status==='accepted'&&
    admission.artifactDigest&&
    cleanDigest(admission.artifactDigest)===cleanDigest(digestValue)
  );
}

function identityReasons(
  shot:CinematicShotContract,
  evidence:NarrativeFilmShotEvidence,
  finalDigest:string,
){
  const reasons:string[]=[];
  for(const entityId of visibleEntities(shot)){
    const accepted=evidence.identityAdmissions.some(admission=>
      admission.schema==='evercraft.fallen.identity-fingerprint-admission.v1'&&
      admission.status==='accepted'&&
      admission.entityId===entityId&&
      cleanDigest(admission.candidateSha256)===finalDigest
    );
    if(!accepted) reasons.push('final_identity_admission_missing:'+entityId);
  }
  for(const admission of evidence.identityAdmissions){
    if(cleanDigest(admission.candidateSha256)!==finalDigest){
      reasons.push('identity_admission_wrong_final_artifact:'+admission.entityId);
    }
  }
  return reasons;
}

function continuityReasons(input:{
  shot:CinematicShotContract;
  evidence:NarrativeFilmShotEvidence;
  finalDigest:string;
  previousFinalDigest?:string;
}){
  const reasons:string[]=[];
  const required=input.shot.mustProvideStartFrame||Boolean(input.shot.carryInFromShotId);
  if(!required) return reasons;

  const admission=input.evidence.continuityAdmission;
  if(!admission){
    reasons.push('continuity_admission_missing');
    return reasons;
  }
  if(admission.schema!=='evercraft.fallen.boundary-continuity-admission.v1'){
    reasons.push('continuity_admission_schema_invalid');
    return reasons;
  }
  if(admission.status!=='accepted') reasons.push('continuity_admission_rejected');
  if(cleanDigest(admission.currentArtifactDigest)!==input.finalDigest){
    reasons.push('continuity_current_artifact_mismatch');
  }
  if(
    input.previousFinalDigest&&
    cleanDigest(admission.previousArtifactDigest)!==input.previousFinalDigest
  ){
    reasons.push('continuity_previous_artifact_mismatch');
  }
  return reasons;
}

function dialogueReasons(input:{
  shot:CinematicShotContract;
  evidence:NarrativeFilmShotEvidence;
  finalDigest:string;
}){
  const reasons:string[]=[];
  if(!input.shot.dialogue) return reasons;
  const admission=input.evidence.dialogueAdmission;
  if(!admission){
    reasons.push('dialogue_admission_missing');
    return reasons;
  }
  if(admission.schema!=='evercraft.fallen.dialogue-sync-admission.v1'){
    reasons.push('dialogue_admission_schema_invalid');
    return reasons;
  }
  if(admission.status!=='accepted') reasons.push('dialogue_admission_rejected');
  if(admission.speakerId!==input.shot.dialogue.speakerId){
    reasons.push('dialogue_speaker_mismatch');
  }
  if(cleanDigest(admission.syncedVideoSha256)!==input.finalDigest){
    reasons.push('dialogue_final_artifact_mismatch');
  }
  return reasons;
}

function assessShot(input:{
  shot:CinematicShotContract;
  evidence:NarrativeFilmShotEvidence;
  project:FallenTimelineProject;
  previousFinalDigest?:string;
}):NarrativeFilmShotAdmission{
  const reasons:string[]=[];
  const finalDigest=cleanDigest(input.evidence.finalArtifactDigest);
  if(!/^[a-f0-9]{64}$/i.test(finalDigest)){
    reasons.push('final_artifact_digest_invalid');
  }
  if(input.evidence.shotId!==input.shot.id) reasons.push('shot_id_mismatch');
  if(!input.evidence.sourceRefs.length) reasons.push('shot_source_refs_missing');
  if(input.evidence.baseSelection.schema!=='evercraft.fallen.shot-selection-receipt.v1'){
    reasons.push('shot_selection_schema_invalid');
  }
  if(input.evidence.baseSelection.needId!==input.shot.needId){
    reasons.push('shot_selection_need_mismatch');
  }

  const selectedDigest=cleanDigest(input.evidence.baseSelection.artifactDigest);
  const finalChanged=selectedDigest!==finalDigest;
  if(!acceptedProduction(input.evidence.baseProductionAdmission,selectedDigest)){
    reasons.push('base_production_admission_missing_or_mismatched');
  }
  if(finalChanged){
    if(!acceptedProduction(input.evidence.finishProductionAdmission,finalDigest)){
      reasons.push('final_finish_production_admission_missing_or_mismatched');
    }
  }else if(
    input.evidence.finishProductionAdmission&&
    !acceptedProduction(input.evidence.finishProductionAdmission,finalDigest)
  ){
    reasons.push('finish_production_admission_mismatched');
  }

  let timelineDigestValue:string|undefined;
  try{
    timelineDigestValue=clipArtifactDigest(input.project,input.evidence.timelineClipId);
  }catch(error){
    reasons.push(error instanceof Error?error.message:'timeline_clip_lookup_failed');
  }
  if(timelineDigestValue&&timelineDigestValue!==finalDigest){
    reasons.push('timeline_clip_final_artifact_mismatch');
  }

  reasons.push(...identityReasons(input.shot,input.evidence,finalDigest));
  reasons.push(...continuityReasons({
    shot:input.shot,
    evidence:input.evidence,
    finalDigest,
    previousFinalDigest:input.previousFinalDigest,
  }));
  reasons.push(...dialogueReasons({
    shot:input.shot,
    evidence:input.evidence,
    finalDigest,
  }));

  return {
    shotId:input.shot.id,
    timelineClipId:input.evidence.timelineClipId,
    finalArtifactDigest:finalDigest,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)],
    baseSelectionDigest:selectedDigest,
    identityAdmissionDigests:input.evidence.identityAdmissions
      .map(admission=>admission.admissionDigest)
      .sort(),
    continuityAdmissionDigest:input.evidence.continuityAdmission?.receiptDigest,
    dialogueAdmissionDigest:input.evidence.dialogueAdmission?.admissionDigest,
  };
}

export function admitNarrativeFilm(
  input:NarrativeFilmAdmissionInput,
):NarrativeFilmAdmissionReceipt{
  if(input.schema!=='evercraft.fallen.narrative-film-admission-input.v1'){
    throw new Error('narrative_film_admission_schema_invalid');
  }
  if(!input.id?.trim()) throw new Error('narrative_film_admission_id_missing');

  const reasons:string[]=[];
  const warnings:string[]=[];
  if(input.sequencePlan.schema!=='evercraft.fallen.cinematic-sequence-plan.v1'){
    reasons.push('cinematic_sequence_plan_schema_invalid');
  }
  if(input.sequencePlan.status!=='accepted') reasons.push('cinematic_sequence_plan_not_accepted');
  if(input.performancePlan.schema!=='evercraft.fallen.performance-plan.v1'){
    reasons.push('performance_plan_schema_invalid');
  }
  if(input.performancePlan.status!=='accepted') reasons.push('performance_plan_not_accepted');
  if(input.performancePlan.sequenceId!==input.sequencePlan.id){
    reasons.push('performance_sequence_mismatch');
  }
  if(input.aestheticReport.schema!=='evercraft.fallen.sequence-aesthetic-report.v1'){
    reasons.push('aesthetic_report_schema_invalid');
  }
  if(input.aestheticReport.status!=='accepted') reasons.push('aesthetic_report_not_accepted');
  if(input.aestheticReport.sequenceId!==input.sequencePlan.id){
    reasons.push('aesthetic_sequence_mismatch');
  }

  const evidenceByShot=new Map<string,NarrativeFilmShotEvidence>();
  for(const evidence of input.shots){
    if(evidenceByShot.has(evidence.shotId)){
      reasons.push('duplicate_shot_evidence:'+evidence.shotId);
    }
    evidenceByShot.set(evidence.shotId,evidence);
  }

  const finalByShot=new Map(
    input.shots.map(evidence=>[evidence.shotId,cleanDigest(evidence.finalArtifactDigest)] as const)
  );
  const planShots=shotById(input.sequencePlan);
  for(const shotId of evidenceByShot.keys()){
    if(!planShots.has(shotId)) reasons.push('unknown_shot_evidence:'+shotId);
  }

  const shotAdmissions:NarrativeFilmShotAdmission[]=[];
  for(const shot of input.sequencePlan.shots){
    const evidence=evidenceByShot.get(shot.id);
    if(!evidence){
      reasons.push('shot_evidence_missing:'+shot.id);
      continue;
    }
    const previousFinalDigest=shot.carryInFromShotId
      ?finalByShot.get(shot.carryInFromShotId)
      :undefined;
    if(shot.carryInFromShotId&&!previousFinalDigest){
      reasons.push('continuity_previous_final_artifact_missing:'+shot.id);
    }
    const admission=assessShot({
      shot,
      evidence,
      project:input.project,
      previousFinalDigest,
    });
    shotAdmissions.push(admission);
    if(admission.status==='rejected'){
      reasons.push('shot_admission_rejected:'+shot.id);
    }
  }

  const aestheticByShot=new Map(input.aestheticReport.perShot.map(row=>[row.shotId,row] as const));
  for(const shot of input.sequencePlan.shots){
    const finalDigest=finalByShot.get(shot.id);
    const row=aestheticByShot.get(shot.id);
    if(!row){
      reasons.push('aesthetic_shot_missing:'+shot.id);
      continue;
    }
    if(row.status!=='accepted') reasons.push('aesthetic_shot_rejected:'+shot.id);
    if(finalDigest&&cleanDigest(row.artifactDigest)!==finalDigest){
      reasons.push('aesthetic_shot_artifact_mismatch:'+shot.id);
    }
  }
  if(aestheticByShot.size!==input.sequencePlan.shots.length){
    warnings.push('aesthetic_report_shot_count_differs_from_plan');
  }

  const projectTimelineDigest=timelineDigest(input.project);
  const core={
    id:input.id,
    projectId:input.project.id,
    projectVersion:input.project.version,
    projectTimelineDigest,
    sequenceId:input.sequencePlan.id,
    sequencePlanDigest:input.sequencePlan.digest,
    performancePlanDigest:input.performancePlan.digest,
    aestheticReportDigest:input.aestheticReport.reportDigest,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)],
    warnings:[...new Set(warnings)],
    shots:shotAdmissions,
  };

  return {
    schema:'evercraft.fallen.narrative-film-admission.v1',
    ...core,
    status:core.status as 'accepted'|'rejected',
    admissionDigest:digest(core),
    boundaries:{
      finalTimelineBytesBound:true,
      everyVisibleCharacterIdentityBound:true,
      continuousCutsRequireBoundaryAdmission:true,
      dialogueShotsRequireDialogueAdmission:true,
      postSelectionFinishesMustBeAdmitted:true,
      sequenceAestheticAdmissionRequired:true,
      deliveryMustRequireThisReceiptForNarrativeFilm:true,
      masterQcStillRequiredAtDelivery:true,
      publicationAuthorityGranted:false,
    },
    admittedAt:new Date().toISOString(),
  };
}

export function validateNarrativeFilmAdmissionForProject(input:{
  project:FallenTimelineProject;
  admission:NarrativeFilmAdmissionReceipt|undefined;
}){
  const reasons:string[]=[];
  const admission=input.admission;
  if(!admission){
    return {status:'rejected' as const,reasons:['narrative_film_admission_missing']};
  }
  if(admission.schema!=='evercraft.fallen.narrative-film-admission.v1'){
    reasons.push('narrative_film_admission_schema_invalid');
  }
  if(admission.status!=='accepted') reasons.push('narrative_film_admission_not_accepted');
  if(admission.projectId!==input.project.id) reasons.push('narrative_film_project_id_mismatch');
  if(admission.projectVersion!==input.project.version) reasons.push('narrative_film_project_version_mismatch');
  if(admission.projectTimelineDigest!==timelineDigest(input.project)){
    reasons.push('narrative_film_timeline_digest_mismatch');
  }
  return {
    status:reasons.length?('rejected' as const):('accepted' as const),
    reasons:[...new Set(reasons)],
  };
}
