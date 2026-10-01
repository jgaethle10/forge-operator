import crypto from 'node:crypto';
import type { CinematicSequencePlan, CinematicShotContract } from './cinematic-sequence.js';
import type { BoundaryContinuityAdmission } from './continuity-boundary.js';
import type { DialogueSyncAdmission } from './dialogue-sync-gate.js';
import type { IdentityFingerprintAdmission } from './identity-fingerprint.js';
import type { PerformancePlan } from './performance-director.js';
import type {
  SelectedShotAestheticEvidence,
  SequenceAestheticReport,
} from './sequence-aesthetic.js';
import { timelineDigest, type FallenTimelineProject } from './timeline.js';
import type {
  ProductionAdmission,
  ShotSelectionReceipt,
} from './types.js';

export type FilmPipelineJobKind =
  | 'generate_candidates'
  | 'shot_tournament'
  | 'base_production_admission'
  | 'finish_production'
  | 'finish_production_admission'
  | 'identity_fingerprint'
  | 'dialogue_sync_admission'
  | 'continuity_boundary'
  | 'visual_observation'
  | 'sequence_aesthetic_review'
  | 'narrative_film_admission'
  | 'studio_delivery';

export interface FilmPipelineJob {
  kind:FilmPipelineJobKind;
  key:string;
  shotId?:string;
  entityId?:string;
  artifactDigest?:string;
  dependsOn:string[];
  reason:string;
  payload:Record<string,unknown>;
}

export interface FilmPipelineBlockedStage {
  key:string;
  shotId?:string;
  stage:FilmPipelineJobKind;
  waitingOn:string[];
  reason:string;
}

export interface FilmPipelineShotState {
  shotId:string;
  timelineClipId:string;
  candidateDigests?:string[];
  baseSelection?:ShotSelectionReceipt;
  baseProductionAdmission?:ProductionAdmission;
  finishSteps?:Array<'lip_sync'|'upscale'>;
  finalArtifactDigest?:string;
  finishProductionAdmission?:ProductionAdmission;
  identityAdmissions?:IdentityFingerprintAdmission[];
  dialogueAdmission?:DialogueSyncAdmission;
  continuityAdmission?:BoundaryContinuityAdmission;
  aestheticEvidence?:SelectedShotAestheticEvidence;
}

export interface NarrativeFilmAdmissionState {
  schema:'evercraft.fallen.narrative-film-admission.v1';
  projectId:string;
  projectVersion:number;
  projectTimelineDigest:string;
  sequenceId:string;
  status:'accepted'|'rejected';
  admissionDigest:string;
}

export interface NarrativeFilmPipelineInput {
  schema:'evercraft.fallen.narrative-film-pipeline-input.v1';
  id:string;
  project:FallenTimelineProject;
  sequencePlan:CinematicSequencePlan;
  performancePlan:PerformancePlan;
  shots:FilmPipelineShotState[];
  aestheticReport?:SequenceAestheticReport;
  filmAdmission?:NarrativeFilmAdmissionState;
  deliveryCompleted?:boolean;
}

export interface NarrativeFilmPipelinePlan {
  schema:'evercraft.fallen.narrative-film-pipeline-plan.v1';
  id:string;
  projectId:string;
  sequenceId:string;
  status:'blocked'|'work_ready'|'waiting'|'delivery_ready'|'complete';
  readyJobs:FilmPipelineJob[];
  blockedStages:FilmPipelineBlockedStage[];
  completedStages:string[];
  finalArtifactDigests:Record<string,string>;
  planDigest:string;
  boundaries:{
    jobsAreEvidenceBound:true;
    downstreamJobsWaitForExactPrerequisites:true;
    finalArtifactsDriveIdentityDialogueContinuityAndAesthetics:true;
    filmAdmissionPrecedesNarrativeDelivery:true;
    noPaidGenerationAuthority:true;
    noPublicationAuthority:true;
  };
  plannedAt:string;
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

function cleanDigest(value:string|undefined){
  return value?.replace(/^sha256:/,'').toLowerCase();
}

function exactAcceptedProduction(
  admission:ProductionAdmission|undefined,
  artifactDigest:string|undefined,
){
  const expected=cleanDigest(artifactDigest);
  return Boolean(
    expected&&
    admission?.status==='accepted'&&
    cleanDigest(admission.artifactDigest)===expected
  );
}

function visibleEntities(shot:CinematicShotContract){
  return [...new Set(shot.characters.map(character=>character.entityId))];
}

function acceptedIdentity(
  admissions:IdentityFingerprintAdmission[]|undefined,
  entityId:string,
  finalDigest:string,
){
  return Boolean((admissions??[]).some(admission=>
    admission.status==='accepted'&&
    admission.entityId===entityId&&
    cleanDigest(admission.candidateSha256)===finalDigest
  ));
}

function acceptedDialogue(
  admission:DialogueSyncAdmission|undefined,
  shot:CinematicShotContract,
  finalDigest:string,
){
  if(!shot.dialogue) return true;
  return Boolean(
    admission?.status==='accepted'&&
    admission.speakerId===shot.dialogue.speakerId&&
    cleanDigest(admission.syncedVideoSha256)===finalDigest
  );
}

function acceptedContinuity(
  admission:BoundaryContinuityAdmission|undefined,
  shot:CinematicShotContract,
  finalDigest:string,
  previousFinalDigest:string|undefined,
){
  if(!shot.mustProvideStartFrame&&!shot.carryInFromShotId) return true;
  return Boolean(
    previousFinalDigest&&
    admission?.status==='accepted'&&
    cleanDigest(admission.currentArtifactDigest)===finalDigest&&
    cleanDigest(admission.previousArtifactDigest)===previousFinalDigest
  );
}

function exactAestheticEvidence(
  evidence:SelectedShotAestheticEvidence|undefined,
  shotId:string,
  finalDigest:string,
){
  return Boolean(
    evidence&&
    evidence.shotId===shotId&&
    cleanDigest(evidence.candidate.artifactDigest)===finalDigest&&
    cleanDigest(evidence.observationPacket.artifactDigest)===finalDigest
  );
}

function acceptedAestheticReport(
  report:SequenceAestheticReport|undefined,
  sequence:CinematicSequencePlan,
  finalByShot:Map<string,string>,
){
  if(!report||report.status!=='accepted'||report.sequenceId!==sequence.id) return false;
  const rows=new Map(report.perShot.map(row=>[row.shotId,row] as const));
  return sequence.shots.every(shot=>{
    const finalDigest=finalByShot.get(shot.id);
    const row=rows.get(shot.id);
    return Boolean(
      finalDigest&&
      row?.status==='accepted'&&
      cleanDigest(row.artifactDigest)===finalDigest
    );
  });
}

function acceptedFilmAdmission(
  admission:NarrativeFilmAdmissionState|undefined,
  input:NarrativeFilmPipelineInput,
){
  return Boolean(
    admission?.status==='accepted'&&
    admission.projectId===input.project.id&&
    admission.projectVersion===input.project.version&&
    admission.projectTimelineDigest===timelineDigest(input.project)&&
    admission.sequenceId===input.sequencePlan.id
  );
}

function job(input:Omit<FilmPipelineJob,'dependsOn'|'payload'> & {
  dependsOn?:string[];
  payload?:Record<string,unknown>;
}):FilmPipelineJob{
  return {
    ...input,
    dependsOn:[...new Set(input.dependsOn??[])],
    payload:input.payload??{},
  };
}

function blocked(input:FilmPipelineBlockedStage):FilmPipelineBlockedStage{
  return {...input,waitingOn:[...new Set(input.waitingOn)]};
}

export function planNarrativeFilmPipeline(
  input:NarrativeFilmPipelineInput,
):NarrativeFilmPipelinePlan{
  if(input.schema!=='evercraft.fallen.narrative-film-pipeline-input.v1'){
    throw new Error('narrative_film_pipeline_schema_invalid');
  }
  if(!input.id?.trim()) throw new Error('narrative_film_pipeline_id_missing');

  const readyJobs:FilmPipelineJob[]=[];
  const blockedStages:FilmPipelineBlockedStage[]=[];
  const completedStages:string[]=[];
  const finalByShot=new Map<string,string>();
  const stateByShot=new Map(input.shots.map(state=>[state.shotId,state] as const));

  const planReady=
    input.sequencePlan.status==='accepted'&&
    input.performancePlan.status==='accepted'&&
    input.performancePlan.sequenceId===input.sequencePlan.id;

  if(!planReady){
    const core={
      id:input.id,
      projectId:input.project.id,
      sequenceId:input.sequencePlan.id,
      status:'blocked' as const,
      readyJobs,
      blockedStages:[blocked({
        key:'film-plans',
        stage:'narrative_film_admission',
        waitingOn:[
          ...(input.sequencePlan.status==='accepted'?[]:['cinematic_sequence_plan']),
          ...(input.performancePlan.status==='accepted'?[]:['performance_plan']),
          ...(input.performancePlan.sequenceId===input.sequencePlan.id?[]:['performance_sequence_binding']),
        ],
        reason:'Cinematic sequence and performance direction must both be accepted before downstream narrative-film work is scheduled.',
      })],
      completedStages,
      finalArtifactDigests:{},
    };
    return {
      schema:'evercraft.fallen.narrative-film-pipeline-plan.v1',
      ...core,
      planDigest:digest(core),
      boundaries:{
        jobsAreEvidenceBound:true,
        downstreamJobsWaitForExactPrerequisites:true,
        finalArtifactsDriveIdentityDialogueContinuityAndAesthetics:true,
        filmAdmissionPrecedesNarrativeDelivery:true,
        noPaidGenerationAuthority:true,
        noPublicationAuthority:true,
      },
      plannedAt:new Date().toISOString(),
    };
  }

  for(const shot of input.sequencePlan.shots){
    const state=stateByShot.get(shot.id);
    if(!state){
      blockedStages.push(blocked({
        key:'shot-state:'+shot.id,
        shotId:shot.id,
        stage:'generate_candidates',
        waitingOn:['shot_state'],
        reason:'No pipeline state exists for this cinematic shot.',
      }));
      continue;
    }

    const candidateDigests=(state.candidateDigests??[]).map(cleanDigest).filter((value):value is string=>Boolean(value));
    const selection=state.baseSelection;
    const selectedDigest=cleanDigest(selection?.artifactDigest);

    if(candidateDigests.length<2&&!selection){
      readyJobs.push(job({
        kind:'generate_candidates',
        key:'generate:'+shot.id,
        shotId:shot.id,
        reason:'A Shot Tournament requires at least two candidate artifacts.',
        payload:{
          needId:shot.needId,
          candidateCount:4,
          modelDiversity:2,
          continuityDigest:shot.continuityDigest,
        },
      }));
      blockedStages.push(blocked({
        key:'tournament:'+shot.id,
        shotId:shot.id,
        stage:'shot_tournament',
        waitingOn:['generate:'+shot.id],
        reason:'Tournament waits for candidate generation.',
      }));
      continue;
    }

    if(!selection){
      readyJobs.push(job({
        kind:'shot_tournament',
        key:'tournament:'+shot.id,
        shotId:shot.id,
        reason:'Candidate pool exists but no tournament winner is bound.',
        payload:{candidateDigests},
      }));
      continue;
    }
    completedStages.push('tournament:'+shot.id);

    if(selection.needId!==shot.needId){
      blockedStages.push(blocked({
        key:'selection-binding:'+shot.id,
        shotId:shot.id,
        stage:'base_production_admission',
        waitingOn:['correct_shot_selection'],
        reason:'Selection receipt belongs to a different production need.',
      }));
      continue;
    }
    if(candidateDigests.length&&selectedDigest&&!candidateDigests.includes(selectedDigest)){
      blockedStages.push(blocked({
        key:'selection-candidate:'+shot.id,
        shotId:shot.id,
        stage:'base_production_admission',
        waitingOn:['selection_from_candidate_pool'],
        reason:'Selected artifact is not present in the recorded candidate pool.',
      }));
      continue;
    }

    if(!exactAcceptedProduction(state.baseProductionAdmission,selectedDigest)){
      readyJobs.push(job({
        kind:'base_production_admission',
        key:'base-admission:'+shot.id,
        shotId:shot.id,
        artifactDigest:selectedDigest,
        dependsOn:['tournament:'+shot.id],
        reason:'Tournament winner still needs production admission against the selected bytes.',
        payload:{needId:shot.needId,artifactDigest:selectedDigest},
      }));
      continue;
    }
    completedStages.push('base-admission:'+shot.id);

    const finishSteps=[...new Set(state.finishSteps??[])];
    let finalDigest=cleanDigest(state.finalArtifactDigest);
    if(!finishSteps.length){
      finalDigest=finalDigest??selectedDigest;
      if(finalDigest!==selectedDigest){
        blockedStages.push(blocked({
          key:'finish-contract:'+shot.id,
          shotId:shot.id,
          stage:'finish_production',
          waitingOn:['declared_finish_step'],
          reason:'Final bytes differ from the tournament winner but no finish step explains the mutation.',
        }));
        continue;
      }
    }else{
      if(!finalDigest||finalDigest===selectedDigest){
        readyJobs.push(job({
          kind:'finish_production',
          key:'finish:'+shot.id,
          shotId:shot.id,
          artifactDigest:selectedDigest,
          dependsOn:['base-admission:'+shot.id],
          reason:'Declared post-selection finish work has not produced distinct final bytes yet.',
          payload:{finishSteps,sourceArtifactDigest:selectedDigest},
        }));
        continue;
      }
      if(!exactAcceptedProduction(state.finishProductionAdmission,finalDigest)){
        readyJobs.push(job({
          kind:'finish_production_admission',
          key:'finish-admission:'+shot.id,
          shotId:shot.id,
          artifactDigest:finalDigest,
          dependsOn:['finish:'+shot.id],
          reason:'Finished bytes exist but have not passed production admission.',
          payload:{finishSteps,finalArtifactDigest:finalDigest},
        }));
        continue;
      }
      completedStages.push('finish:'+shot.id,'finish-admission:'+shot.id);
    }

    if(!finalDigest){
      blockedStages.push(blocked({
        key:'final-artifact:'+shot.id,
        shotId:shot.id,
        stage:'identity_fingerprint',
        waitingOn:['final_artifact_digest'],
        reason:'Final artifact digest is not known.',
      }));
      continue;
    }
    finalByShot.set(shot.id,finalDigest);

    const missingEntities=visibleEntities(shot).filter(entityId=>
      !acceptedIdentity(state.identityAdmissions,entityId,finalDigest)
    );
    for(const entityId of missingEntities){
      readyJobs.push(job({
        kind:'identity_fingerprint',
        key:'identity:'+shot.id+':'+entityId,
        shotId:shot.id,
        entityId,
        artifactDigest:finalDigest,
        reason:'Visible character needs verified identity evidence against the exact final artifact.',
        payload:{entityId,finalArtifactDigest:finalDigest},
      }));
    }

    if(shot.dialogue&&!acceptedDialogue(state.dialogueAdmission,shot,finalDigest)){
      const waitingOn=missingEntities.map(entityId=>'identity:'+shot.id+':'+entityId);
      readyJobs.push(job({
        kind:'dialogue_sync_admission',
        key:'dialogue:'+shot.id,
        shotId:shot.id,
        entityId:shot.dialogue.speakerId,
        artifactDigest:finalDigest,
        dependsOn:waitingOn,
        reason:'Dialogue shot needs A/V sync admission bound to the exact final video and preserved speaker identity.',
        payload:{
          speakerId:shot.dialogue.speakerId,
          finalArtifactDigest:finalDigest,
        },
      }));
    }

    const previousFinal=shot.carryInFromShotId
      ?finalByShot.get(shot.carryInFromShotId)
      :undefined;
    const continuityRequired=shot.mustProvideStartFrame||Boolean(shot.carryInFromShotId);
    if(continuityRequired){
      if(!previousFinal){
        blockedStages.push(blocked({
          key:'continuity:'+shot.id,
          shotId:shot.id,
          stage:'continuity_boundary',
          waitingOn:['final_artifact:'+String(shot.carryInFromShotId)],
          reason:'Boundary continuity waits for the prior shot final artifact.',
        }));
      }else if(!acceptedContinuity(state.continuityAdmission,shot,finalDigest,previousFinal)){
        readyJobs.push(job({
          kind:'continuity_boundary',
          key:'continuity:'+shot.id,
          shotId:shot.id,
          artifactDigest:finalDigest,
          reason:'Continuous cut needs exact prior-end/current-start boundary admission.',
          payload:{
            previousShotId:shot.carryInFromShotId,
            previousArtifactDigest:previousFinal,
            currentArtifactDigest:finalDigest,
          },
        }));
      }
    }

    if(!exactAestheticEvidence(state.aestheticEvidence,shot.id,finalDigest)){
      readyJobs.push(job({
        kind:'visual_observation',
        key:'observe:'+shot.id,
        shotId:shot.id,
        artifactDigest:finalDigest,
        reason:'Final shot needs visual observations for sequence aesthetic review.',
        payload:{
          finalArtifactDigest:finalDigest,
          requestedMetrics:['composition','motion_quality','beauty','editability'],
        },
      }));
    }

    const identityDone=missingEntities.length===0;
    const dialogueDone=acceptedDialogue(state.dialogueAdmission,shot,finalDigest);
    const continuityDone=acceptedContinuity(state.continuityAdmission,shot,finalDigest,previousFinal);
    const aestheticDone=exactAestheticEvidence(state.aestheticEvidence,shot.id,finalDigest);
    if(identityDone&&dialogueDone&&continuityDone&&aestheticDone){
      completedStages.push('shot-ready:'+shot.id);
    }
  }

  const allFinals=input.sequencePlan.shots.every(shot=>finalByShot.has(shot.id));
  const allShotsReady=input.sequencePlan.shots.every(shot=>completedStages.includes('shot-ready:'+shot.id));

  if(allFinals&&allShotsReady){
    if(!acceptedAestheticReport(input.aestheticReport,input.sequencePlan,finalByShot)){
      readyJobs.push(job({
        kind:'sequence_aesthetic_review',
        key:'sequence-aesthetic:'+input.sequencePlan.id,
        reason:'All final shots are individually evidenced; the exact winning sequence still needs whole-sequence aesthetic admission.',
        payload:{
          sequenceId:input.sequencePlan.id,
          sequencePlanDigest:input.sequencePlan.digest,
          selectedArtifacts:input.sequencePlan.shots.map(shot=>({
            shotId:shot.id,
            artifactDigest:finalByShot.get(shot.id),
          })),
        },
      }));
    }else{
      completedStages.push('sequence-aesthetic:'+input.sequencePlan.id);
    }
  }else{
    blockedStages.push(blocked({
      key:'sequence-aesthetic:'+input.sequencePlan.id,
      stage:'sequence_aesthetic_review',
      waitingOn:input.sequencePlan.shots
        .filter(shot=>!completedStages.includes('shot-ready:'+shot.id))
        .map(shot=>'shot-ready:'+shot.id),
      reason:'Whole-sequence aesthetic review waits for every exact final shot to clear its local gates.',
    }));
  }

  const aestheticAccepted=acceptedAestheticReport(input.aestheticReport,input.sequencePlan,finalByShot);
  const filmAdmissionAccepted=acceptedFilmAdmission(input.filmAdmission,input);

  if(allFinals&&allShotsReady&&aestheticAccepted){
    if(!filmAdmissionAccepted){
      readyJobs.push(job({
        kind:'narrative_film_admission',
        key:'film-admission:'+input.project.id,
        reason:'All shot and sequence gates are ready; bind them to the exact current timeline.',
        payload:{
          projectId:input.project.id,
          projectVersion:input.project.version,
          projectTimelineDigest:timelineDigest(input.project),
          sequenceId:input.sequencePlan.id,
          sequencePlanDigest:input.sequencePlan.digest,
          performancePlanDigest:input.performancePlan.digest,
          aestheticReportDigest:input.aestheticReport?.reportDigest,
        },
      }));
    }else{
      completedStages.push('film-admission:'+input.project.id);
    }
  }else{
    blockedStages.push(blocked({
      key:'film-admission:'+input.project.id,
      stage:'narrative_film_admission',
      waitingOn:[
        ...(!allShotsReady?['all_shot_gates']:[]),
        ...(!aestheticAccepted?['sequence_aesthetic_review']:[]),
      ],
      reason:'Narrative Film Admission waits for all exact final shot gates and the sequence aesthetic report.',
    }));
  }

  if(filmAdmissionAccepted){
    if(input.deliveryCompleted){
      completedStages.push('studio-delivery:'+input.project.id);
    }else{
      readyJobs.push(job({
        kind:'studio_delivery',
        key:'studio-delivery:'+input.project.id,
        dependsOn:['film-admission:'+input.project.id],
        reason:'Narrative Film Admission matches the current timeline; Studio Delivery may render and run Master QC.',
        payload:{
          qualityMode:'narrative_film',
          projectId:input.project.id,
          projectVersion:input.project.version,
          projectTimelineDigest:timelineDigest(input.project),
          filmAdmissionDigest:input.filmAdmission?.admissionDigest,
        },
      }));
    }
  }else{
    blockedStages.push(blocked({
      key:'studio-delivery:'+input.project.id,
      stage:'studio_delivery',
      waitingOn:['film-admission:'+input.project.id],
      reason:'Narrative delivery is locked until exact-timeline Film Admission is accepted.',
    }));
  }

  const finalArtifactDigests=Object.fromEntries([...finalByShot.entries()]);
  let status:NarrativeFilmPipelinePlan['status']='waiting';
  if(input.deliveryCompleted&&filmAdmissionAccepted) status='complete';
  else if(readyJobs.some(item=>item.kind==='studio_delivery')) status='delivery_ready';
  else if(readyJobs.length) status='work_ready';
  else if(blockedStages.length) status='waiting';

  const core={
    id:input.id,
    projectId:input.project.id,
    sequenceId:input.sequencePlan.id,
    status,
    readyJobs,
    blockedStages,
    completedStages:[...new Set(completedStages)],
    finalArtifactDigests,
  };
  return {
    schema:'evercraft.fallen.narrative-film-pipeline-plan.v1',
    ...core,
    planDigest:digest(core),
    boundaries:{
      jobsAreEvidenceBound:true,
      downstreamJobsWaitForExactPrerequisites:true,
      finalArtifactsDriveIdentityDialogueContinuityAndAesthetics:true,
      filmAdmissionPrecedesNarrativeDelivery:true,
      noPaidGenerationAuthority:true,
      noPublicationAuthority:true,
    },
    plannedAt:new Date().toISOString(),
  };
}
