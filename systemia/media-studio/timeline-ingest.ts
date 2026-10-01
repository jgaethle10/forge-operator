import type { ShotCandidate } from './shot-tournament.js';
import type { ShotSelectionReceipt } from './types.js';
import type { BoundaryContinuityAdmission } from './continuity-boundary.js';
import type { VisualExecutionResult } from './model-fabric-runtime.js';
import {
  replaceTimelineClipAsset,
  type FallenTimelineProject,
  type TimelineMutationReceipt,
} from './timeline.js';

export function executionToShotCandidates(input:{
  execution:VisualExecutionResult;
  shotId:string;
  aspectRatio:'9:16'|'16:9'|'1:1';
  subjectIds?:string[];
}):ShotCandidate[]{
  if(input.execution.schema!=='evercraft.fallen.visual-model-execution.v1'){
    throw new Error('shot_ingest_execution_schema_invalid');
  }
  return input.execution.completed.map(receipt=>({
    id:receipt.jobId,
    shotId:input.shotId,
    artifactPath:receipt.artifact.path,
    artifactDigest:receipt.artifact.digest,
    kind:'video',
    durationSec:receipt.artifact.durationSec,
    aspectRatio:receipt.artifact.aspectRatio??input.aspectRatio,
    sourceState:'generated_visualization',
    provenance:receipt.provenance,
    syntheticLabelPresent:true,
    providerId:receipt.providerId,
    providerModel:receipt.modelId,
    providerRequestId:receipt.providerRequestId,
    subjectIds:[...(input.subjectIds??[])],
    observations:[],
  }));
}

export function applySelectedExecutionToTimeline(input:{
  project:FallenTimelineProject;
  clipId:string;
  execution:VisualExecutionResult;
  selection:ShotSelectionReceipt;
  expectedVersion:number;
  continuity?:{
    required:boolean;
    admission?:BoundaryContinuityAdmission;
  };
}):{
  project:FallenTimelineProject;
  receipt:TimelineMutationReceipt;
}{
  if(input.selection.schema!=='evercraft.fallen.shot-selection-receipt.v1'){
    throw new Error('timeline_ingest_selection_schema_invalid');
  }
  const selected=input.execution.completed.find(
    receipt=>receipt.artifact.digest===input.selection.artifactDigest
  );
  if(!selected) throw new Error('timeline_ingest_selected_artifact_missing');
  if(selected.needId!==input.selection.needId){
    throw new Error('timeline_ingest_need_id_mismatch');
  }

  const continuity=input.continuity;
  if(continuity?.required){
    if(!continuity.admission){
      throw new Error('timeline_ingest_continuity_admission_missing');
    }
    if(continuity.admission.schema!=='evercraft.fallen.boundary-continuity-admission.v1'){
      throw new Error('timeline_ingest_continuity_schema_invalid');
    }
    if(continuity.admission.status!=='accepted'){
      throw new Error('timeline_ingest_continuity_rejected:'+continuity.admission.reasons.join('|'));
    }
    if(continuity.admission.currentArtifactDigest!==selected.artifact.digest){
      throw new Error('timeline_ingest_continuity_artifact_mismatch');
    }
  }

  return replaceTimelineClipAsset({
    project:input.project,
    clipId:input.clipId,
    expectedVersion:input.expectedVersion,
    newAsset:{
      id:`${input.selection.candidateId}-selected`,
      path:selected.artifact.path,
      digest:selected.artifact.digest,
      kind:'video',
      sourceRefs:[
        `shot-selection:${input.selection.tournamentReceiptDigest}`,
        ...(continuity?.required&&continuity.admission
          ?[`continuity-boundary:${continuity.admission.receiptDigest}`]
          :[]),
        ...selected.sourceRefs,
      ],
      evidenceState:'synthetic_visualization',
      continuityDigest:selected.continuityDigest,
    },
  });
}
