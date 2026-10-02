import crypto from 'node:crypto';
import {
  buildCinematicVisualRequest,
  type CinematicSequencePlan,
  type CinematicShotBinding,
  type CinematicShotContract,
} from './cinematic-sequence.js';
import {
  buildVisualFinishPlan,
  buildVisualModelPlan,
  type VisualFinishPlan,
  type VisualModelEndpoint,
  type VisualModelJob,
  type VisualModelPlan,
  type VisualReference,
  type VisualReferenceLocator,
} from './model-fabric.js';

export type PlannedLocatorCapability =
  | {kind:'url'}
  | {kind:'data_uri'}
  | {kind:'inline_base64';mimeType?:string}
  | {kind:'provider_asset';providerId:string}
  | {kind:'provider_generation';providerId:string};

export interface NarrativeShootReadinessInput {
  schema:'evercraft.fallen.narrative-shoot-readiness-input.v1';
  id:string;
  sequencePlan:CinematicSequencePlan;
  endpoints:VisualModelEndpoint[];
  executableModelIds:string[];
  dialogueAudioByShot?:Record<string,VisualReference>;
  shotBindings?:Record<string,Omit<CinematicShotBinding,'startFrame'>>;
  generatedImageMaterializations:PlannedLocatorCapability[];
  generatedVideoMaterializations:PlannedLocatorCapability[];
  candidateCount?:number;
  modelDiversity?:number;
  minimumCandidatesPerShot?:number;
  minimumDistinctModelsPerShot?:number;
  finalTargetResolution?:string;
  sourceRefs:string[];
}

export interface ShootReadinessRouteSummary {
  requestedCandidates:number;
  plannedCandidates:number;
  distinctModels:number;
  distinctProviders:number;
  capableModels:string[];
  executableModels:string[];
  rejectedModels:Array<{modelId:string;reasons:string[]}>;
  planDigest:string;
}

export interface ShootReadinessFinishSummary {
  required:boolean;
  status:'ready'|'blocked'|'not_required';
  steps:Array<{
    task:'lip_sync'|'upscale';
    status:'ready'|'blocked';
    models:string[];
    providers:string[];
    plannedCandidates:number;
    rejectedModels:Array<{modelId:string;reasons:string[]}>;
  }>;
  blockers:string[];
}

export interface ShootReadinessShot {
  shotId:string;
  needId:string;
  state:'ready_now'|'ready_after_predecessor'|'blocked';
  predecessorShotId?:string;
  generation:ShootReadinessRouteSummary;
  finish:ShootReadinessFinishSummary;
  dependencies:string[];
  blockers:string[];
  warnings:string[];
}

export interface NarrativeShootReadinessReport {
  schema:'evercraft.fallen.narrative-shoot-readiness.v1';
  id:string;
  sequenceId:string;
  sequenceDigest:string;
  status:'ready'|'blocked';
  shots:ShootReadinessShot[];
  immediateShotIds:string[];
  deferredShotIds:string[];
  blockedShotIds:string[];
  runtime:{
    declaredEndpointCount:number;
    verifiedEndpointCount:number;
    executableModelIds:string[];
    missingVerifiedAdapterModelIds:string[];
  };
  blockers:string[];
  warnings:string[];
  reportDigest:string;
  boundaries:{
    noProviderCallExecuted:true;
    syntheticRuntimeLocatorsArePlanningOnly:true;
    executableAdapterPresenceRequired:true;
    tournamentCandidateMinimumEnforced:true;
    environmentCanonCheckedEvenBeforeExecution:true;
    paidGenerationAuthorityGranted:false;
    publicationAuthorityGranted:false;
  };
  assessedAt:string;
}

type ExtendedCapability=VisualModelEndpoint['capabilities'][number]&{
  environmentContinuityViaStartFrame?:boolean;
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

function unique<T>(values:T[]){
  return [...new Set(values)];
}

function plannedLocator(
  item:PlannedLocatorCapability,
  id:string,
  media:'image'|'video',
):VisualReferenceLocator{
  const token=Buffer.from('planned:'+id).toString('base64');
  if(item.kind==='url'){
    return {kind:'url',value:'https://readiness.invalid/'+encodeURIComponent(id)+(media==='image'?'.png':'.mp4')};
  }
  if(item.kind==='data_uri'){
    const mime=media==='image'?'image/png':'video/mp4';
    return {kind:'data_uri',value:'data:'+mime+';base64,'+token};
  }
  if(item.kind==='inline_base64'){
    return {
      kind:'inline_base64',
      value:token,
      mimeType:item.mimeType??(media==='image'?'image/png':'video/mp4'),
    };
  }
  if(item.kind==='provider_asset'){
    return {kind:'provider_asset',providerId:item.providerId,value:'planned-'+id};
  }
  return {kind:'provider_generation',providerId:item.providerId,value:'planned-'+id};
}

function plannedReference(input:{
  id:string;
  kind:'image'|'video';
  role:'start_frame'|'product';
  capabilities:PlannedLocatorCapability[];
  sourceRefs:string[];
}):VisualReference{
  return {
    id:input.id,
    kind:input.kind,
    role:input.role,
    digest:digest({planned:true,id:input.id}),
    sourceRefs:input.sourceRefs,
    locators:input.capabilities.map(item=>plannedLocator(item,input.id,input.kind)),
  };
}

function endpointCapability(
  endpoints:VisualModelEndpoint[],
  modelId:string,
  task:VisualModelJob['task'],
):ExtendedCapability|undefined{
  const endpoint=endpoints.find(item=>item.id===modelId);
  return endpoint?.capabilities.find(item=>item.task===task) as ExtendedCapability|undefined;
}

function worldCanonJobAccepted(
  job:VisualModelJob,
  endpoints:VisualModelEndpoint[],
){
  if(job.task!=='video') return true;
  if(job.references.some(ref=>ref.role==='environment')) return true;
  const start=job.references.some(ref=>ref.role==='start_frame'&&ref.kind==='image');
  if(!start) return false;
  return endpointCapability(endpoints,job.modelId,job.task)?.environmentContinuityViaStartFrame===true;
}

function worldCanonFiltered(
  plan:VisualModelPlan,
  endpoints:VisualModelEndpoint[],
):VisualModelJob[]{
  return plan.jobs.filter(job=>worldCanonJobAccepted(job,endpoints));
}

function mergeRejections(
  plan:VisualModelPlan,
  droppedJobs:VisualModelJob[],
){
  const byModel=new Map<string,string[]>();
  for(const row of plan.rejectedModels){
    byModel.set(row.modelId,[...row.reasons]);
  }
  for(const job of droppedJobs){
    const rows=byModel.get(job.modelId)??[];
    rows.push('environment_canon_not_carried_to_provider');
    byModel.set(job.modelId,rows);
  }
  return [...byModel.entries()]
    .map(([modelId,reasons])=>({modelId,reasons:unique(reasons)}))
    .sort((a,b)=>a.modelId.localeCompare(b.modelId));
}

function routeSummary(input:{
  request:ReturnType<typeof buildCinematicVisualRequest>;
  endpoints:VisualModelEndpoint[];
  executableModelIds:Set<string>;
}):ShootReadinessRouteSummary{
  const allPlan=buildVisualModelPlan(input.request,input.endpoints);
  const allWorld=worldCanonFiltered(allPlan,input.endpoints);
  const droppedAll=allPlan.jobs.filter(job=>!allWorld.includes(job));

  const executableEndpoints=input.endpoints.filter(endpoint=>
    input.executableModelIds.has(endpoint.id)
  );
  const runtimePlan=buildVisualModelPlan(input.request,executableEndpoints);
  const runtimeWorld=worldCanonFiltered(runtimePlan,executableEndpoints);
  const droppedRuntime=runtimePlan.jobs.filter(job=>!runtimeWorld.includes(job));

  return {
    requestedCandidates:Math.max(1,Math.min(8,Math.trunc(input.request.candidateCount??4))),
    plannedCandidates:runtimeWorld.length,
    distinctModels:new Set(runtimeWorld.map(job=>job.modelId)).size,
    distinctProviders:new Set(runtimeWorld.map(job=>job.providerId)).size,
    capableModels:unique(allWorld.map(job=>job.modelId)),
    executableModels:unique(runtimeWorld.map(job=>job.modelId)),
    rejectedModels:mergeRejections(runtimePlan,droppedRuntime.length?droppedRuntime:droppedAll),
    planDigest:runtimePlan.digest,
  };
}

function finishSummary(input:{
  shot:CinematicShotContract;
  endpoints:VisualModelEndpoint[];
  executableModelIds:Set<string>;
  dialogueAudio?:VisualReference;
  sourceVideo:VisualReference;
  finalTargetResolution?:string;
}):ShootReadinessFinishSummary{
  const required=Boolean(input.shot.dialogue)||Boolean(input.finalTargetResolution);
  if(!required){
    return {required:false,status:'not_required',steps:[],blockers:[]};
  }

  const blockers:string[]=[];
  if(input.shot.dialogue&&!input.dialogueAudio){
    blockers.push('dialogue_audio_missing');
    return {required:true,status:'blocked',steps:[],blockers};
  }
  if(input.dialogueAudio&&input.dialogueAudio.kind!=='audio'){
    blockers.push('dialogue_audio_kind_invalid');
    return {required:true,status:'blocked',steps:[],blockers};
  }

  const executableEndpoints=input.endpoints.filter(endpoint=>
    input.executableModelIds.has(endpoint.id)
  );
  const plan:VisualFinishPlan=buildVisualFinishPlan({
    schema:'evercraft.fallen.visual-finish-request.v1',
    id:'readiness-'+input.shot.id,
    needId:input.shot.needId,
    sourceVideoRef:input.sourceVideo,
    dialogueAudioRef:input.dialogueAudio,
    targetResolution:input.finalTargetResolution,
    continuityDigest:input.shot.continuityDigest,
    sourceRefs:input.shot.sourceRefs,
  },executableEndpoints);

  const steps=plan.steps.map(step=>{
    const jobs=step.modelPlan.jobs;
    const status=jobs.length?'ready' as const:'blocked' as const;
    if(status==='blocked') blockers.push('finish_step_unroutable:'+step.task);
    return {
      task:step.task,
      status,
      models:unique(jobs.map(job=>job.modelId)),
      providers:unique(jobs.map(job=>job.providerId)),
      plannedCandidates:jobs.length,
      rejectedModels:step.modelPlan.rejectedModels,
    };
  });

  if(input.shot.dialogue&&!steps.some(step=>step.task==='lip_sync')){
    blockers.push('dialogue_lip_sync_step_missing');
  }
  if(input.finalTargetResolution&&!steps.some(step=>step.task==='upscale')){
    blockers.push('upscale_step_missing');
  }

  return {
    required:true,
    status:blockers.length?'blocked':'ready',
    steps,
    blockers:unique(blockers),
  };
}

export function assessNarrativeShootReadiness(
  input:NarrativeShootReadinessInput,
):NarrativeShootReadinessReport{
  if(input.schema!=='evercraft.fallen.narrative-shoot-readiness-input.v1'){
    throw new Error('shoot_readiness_schema_invalid');
  }
  if(!input.id?.trim()) throw new Error('shoot_readiness_id_missing');
  if(!input.sourceRefs?.length) throw new Error('shoot_readiness_source_refs_missing');
  if(input.sequencePlan.schema!=='evercraft.fallen.cinematic-sequence-plan.v1'){
    throw new Error('shoot_readiness_sequence_schema_invalid');
  }

  const blockers:string[]=[];
  const warnings:string[]=[];
  if(input.sequencePlan.status!=='accepted'){
    blockers.push('cinematic_sequence_plan_not_accepted');
  }

  const minimumCandidates=Math.max(2,Math.min(8,Math.trunc(input.minimumCandidatesPerShot??2)));
  const minimumDistinctModels=Math.max(1,Math.min(8,Math.trunc(input.minimumDistinctModelsPerShot??1)));
  const executableModelIds=new Set(input.executableModelIds);
  const verifiedIds=new Set(
    input.endpoints.filter(endpoint=>endpoint.enabled&&endpoint.executionState==='verified').map(endpoint=>endpoint.id)
  );
  const missingVerifiedAdapterModelIds=[...verifiedIds]
    .filter(id=>!executableModelIds.has(id))
    .sort();

  const shots:ShootReadinessShot[]=[];

  for(const shot of input.sequencePlan.shots){
    const dependencies:string[]=[];
    const shotBlockers:string[]=[];
    const shotWarnings:string[]=[];
    const options=input.shotBindings?.[shot.id]??{};

    let startFrame:VisualReference|undefined;
    if(shot.mustProvideStartFrame){
      if(!shot.carryInFromShotId){
        shotBlockers.push('continuous_shot_predecessor_missing');
      }else{
        dependencies.push('selected_end_frame:'+shot.carryInFromShotId);
        startFrame=plannedReference({
          id:'planned-start-'+shot.id,
          kind:'image',
          role:'start_frame',
          capabilities:input.generatedImageMaterializations,
          sourceRefs:['planned:continuity:'+shot.carryInFromShotId+'->'+shot.id],
        });
        if(!input.generatedImageMaterializations.length){
          shotBlockers.push('generated_start_frame_materialization_missing');
        }
      }
    }

    let request:ReturnType<typeof buildCinematicVisualRequest>;
    try{
      request=buildCinematicVisualRequest(shot,{
        ...options,
        startFrame,
        candidateCount:input.candidateCount??4,
        modelDiversity:input.modelDiversity??2,
      });
    }catch(error){
      const reason=error instanceof Error?error.message:String(error);
      shotBlockers.push('cinematic_request_failed:'+reason);
      request={
        schema:'evercraft.fallen.visual-shot-request.v1',
        id:shot.id+'-unroutable',
        needId:shot.needId,
        task:'video',
        prompt:shot.prompt,
        durationSec:shot.durationSec,
        aspectRatio:shot.aspectRatio,
        continuityDigest:shot.continuityDigest,
        requires:['commercial_rights','provenance_receipt','timing_control'],
        references:shot.baseReferences,
        candidateCount:input.candidateCount??4,
        modelDiversity:input.modelDiversity??2,
        sourceRefs:shot.sourceRefs,
      };
    }

    const generation=routeSummary({
      request,
      endpoints:input.endpoints,
      executableModelIds,
    });

    if(!generation.capableModels.length){
      shotBlockers.push('no_capable_visual_model');
    }else if(!generation.executableModels.length){
      shotBlockers.push('no_executable_visual_adapter');
    }
    if(generation.plannedCandidates<minimumCandidates){
      shotBlockers.push(
        'tournament_candidate_shortfall:'+generation.plannedCandidates+'<'+minimumCandidates
      );
    }
    if(generation.distinctModels<minimumDistinctModels){
      shotBlockers.push(
        'model_diversity_shortfall:'+generation.distinctModels+'<'+minimumDistinctModels
      );
    }
    if(generation.distinctProviders<2&&minimumCandidates>=2){
      shotWarnings.push('candidate_pool_single_provider');
    }

    const sourceVideo=plannedReference({
      id:'planned-final-video-'+shot.id,
      kind:'video',
      role:'product',
      capabilities:input.generatedVideoMaterializations,
      sourceRefs:['planned:shot-output:'+shot.id],
    });
    if((shot.dialogue||input.finalTargetResolution)&&!input.generatedVideoMaterializations.length){
      shotBlockers.push('generated_video_materialization_missing_for_finish');
    }

    const finish=finishSummary({
      shot,
      endpoints:input.endpoints,
      executableModelIds,
      dialogueAudio:input.dialogueAudioByShot?.[shot.id],
      sourceVideo,
      finalTargetResolution:input.finalTargetResolution,
    });
    shotBlockers.push(...finish.blockers);

    const state:ShootReadinessShot['state']=shotBlockers.length
      ?'blocked'
      :shot.mustProvideStartFrame
        ?'ready_after_predecessor'
        :'ready_now';

    shots.push({
      shotId:shot.id,
      needId:shot.needId,
      state,
      predecessorShotId:shot.carryInFromShotId,
      generation,
      finish,
      dependencies:unique(dependencies),
      blockers:unique(shotBlockers),
      warnings:unique(shotWarnings),
    });
  }

  for(const shot of shots){
    blockers.push(...shot.blockers.map(reason=>shot.shotId+':'+reason));
    warnings.push(...shot.warnings.map(reason=>shot.shotId+':'+reason));
  }
  if(missingVerifiedAdapterModelIds.length){
    warnings.push(
      ...missingVerifiedAdapterModelIds.map(modelId=>'verified_endpoint_without_runtime_adapter:'+modelId)
    );
  }

  const immediateShotIds=shots.filter(shot=>shot.state==='ready_now').map(shot=>shot.shotId);
  const deferredShotIds=shots.filter(shot=>shot.state==='ready_after_predecessor').map(shot=>shot.shotId);
  const blockedShotIds=shots.filter(shot=>shot.state==='blocked').map(shot=>shot.shotId);

  const core={
    id:input.id,
    sequenceId:input.sequencePlan.id,
    sequenceDigest:input.sequencePlan.digest,
    status:blockers.length?'blocked':'ready',
    shots,
    immediateShotIds,
    deferredShotIds,
    blockedShotIds,
    runtime:{
      declaredEndpointCount:input.endpoints.length,
      verifiedEndpointCount:verifiedIds.size,
      executableModelIds:[...executableModelIds].sort(),
      missingVerifiedAdapterModelIds,
    },
    blockers:unique(blockers),
    warnings:unique(warnings),
  };

  return {
    schema:'evercraft.fallen.narrative-shoot-readiness.v1',
    ...core,
    status:core.status as 'ready'|'blocked',
    reportDigest:digest(core),
    boundaries:{
      noProviderCallExecuted:true,
      syntheticRuntimeLocatorsArePlanningOnly:true,
      executableAdapterPresenceRequired:true,
      tournamentCandidateMinimumEnforced:true,
      environmentCanonCheckedEvenBeforeExecution:true,
      paidGenerationAuthorityGranted:false,
      publicationAuthorityGranted:false,
    },
    assessedAt:new Date().toISOString(),
  };
}
