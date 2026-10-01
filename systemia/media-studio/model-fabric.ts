import crypto from 'node:crypto';
import type { AspectRatio, CreativeRequirement } from './types.js';

export type VisualModelTask =
  | 'image'
  | 'video'
  | 'motion_transfer'
  | 'lip_sync'
  | 'upscale';

export type VisualInputMode =
  | 'text'
  | 'image_reference'
  | 'video_reference'
  | 'audio_reference'
  | 'start_frame'
  | 'end_frame'
  | 'motion_reference';

export type VisualReferenceRole =
  | 'identity'
  | 'environment'
  | 'style'
  | 'product'
  | 'start_frame'
  | 'end_frame'
  | 'motion'
  | 'dialogue_audio';

export type VisualReferenceLocator =
  | { kind:'url'; value:string }
  | { kind:'data_uri'; value:string }
  | { kind:'inline_base64'; value:string; mimeType:string }
  | { kind:'provider_asset'; providerId:string; value:string }
  | { kind:'provider_generation'; providerId:string; value:string };

export interface VisualReference {
  id:string;
  kind:'image'|'video'|'audio';
  role:VisualReferenceRole;
  digest?:string;
  sourceRefs:string[];
  locator?:VisualReferenceLocator;
}

export interface VisualModelCapability {
  task:VisualModelTask;
  inputModes:VisualInputMode[];
  requirements:CreativeRequirement[];
  aspectRatios?:AspectRatio[];
  maxDurationSec?:number;
  resolutions?:string[];
  durationOptions?:number[];
  maxReferences?:number;
  referenceRoles?:VisualReferenceRole[];
  identityContinuityViaStartFrame?:boolean;
  framesExclusiveWithReferences?:boolean;
  referenceImageDurationOptions?:number[];
  nativeAudio?:boolean;
  batchVariants?:number;
  qualityTier:1|2|3|4|5;
  costTier:1|2|3|4|5;
  latencyTier:1|2|3|4|5;
}

export interface VisualModelEndpoint {
  id:string;
  providerId:string;
  displayName:string;
  enabled:boolean;
  executionState:'declared'|'verified';
  capabilities:VisualModelCapability[];
}

export interface VisualShotRequest {
  schema:'evercraft.fallen.visual-shot-request.v1';
  id:string;
  needId:string;
  task:VisualModelTask;
  prompt:string;
  durationSec?:number;
  aspectRatio?:AspectRatio;
  targetResolution?:string;
  continuityDigest:string;
  requires:CreativeRequirement[];
  requiredInputModes?:VisualInputMode[];
  references:VisualReference[];
  candidateCount?:number;
  modelDiversity?:number;
  requireNativeAudio?:boolean;
  sourceRefs:string[];
}

export interface VisualModelJob {
  schema:'evercraft.fallen.visual-model-job.v1';
  id:string;
  requestId:string;
  needId:string;
  modelId:string;
  providerId:string;
  task:VisualModelTask;
  prompt:string;
  durationSec?:number;
  aspectRatio?:AspectRatio;
  targetResolution?:string;
  references:VisualReference[];
  continuityDigest:string;
  requires:CreativeRequirement[];
  outputContract:{
    commercialRightsRequired:boolean;
    provenanceRequired:boolean;
    artifactDigestRequired:true;
    tournamentCandidateRequired:true;
  };
}

export interface VisualModelPlan {
  schema:'evercraft.fallen.visual-model-plan.v1';
  requestId:string;
  status:'routed'|'blocked';
  jobs:VisualModelJob[];
  eligibleModels:string[];
  rejectedModels:Array<{modelId:string;reasons:string[]}>;
  boundaries:{
    verifiedExecutionOnly:true;
    referenceIdentityFailsClosed:true;
    providerDiversityPreferred:true;
    tournamentSelectionRequired:true;
    directPublicationAuthority:false;
  };
  digest:string;
  createdAt:string;
}

export interface VisualFinishRequest {
  schema:'evercraft.fallen.visual-finish-request.v1';
  id:string;
  needId:string;
  sourceVideoRef:VisualReference;
  dialogueAudioRef?:VisualReference;
  targetResolution?:string;
  continuityDigest:string;
  sourceRefs:string[];
}

export interface VisualFinishPlan {
  schema:'evercraft.fallen.visual-finish-plan.v1';
  requestId:string;
  steps:Array<{
    id:string;
    task:'lip_sync'|'upscale';
    sourceRole:'selected_video';
    reference?:VisualReference;
    targetResolution?:string;
    modelPlan:VisualModelPlan;
  }>;
  boundaries:{
    finishAfterTournament:true;
    sourceDigestMustRemainTraceable:true;
    directPublicationAuthority:false;
  };
  createdAt:string;
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

function referenceModes(references:VisualReference[]):Set<VisualInputMode>{
  const modes=new Set<VisualInputMode>(['text']);
  for(const ref of references){
    if(ref.role==='start_frame') modes.add('start_frame');
    else if(ref.role==='end_frame') modes.add('end_frame');
    else if(ref.role==='motion') modes.add('motion_reference');
    else if(ref.kind==='image') modes.add('image_reference');
    else if(ref.kind==='video') modes.add('video_reference');
    else if(ref.kind==='audio') modes.add('audio_reference');
  }
  return modes;
}

function capabilityReasons(
  request:VisualShotRequest,
  endpoint:VisualModelEndpoint,
  capability:VisualModelCapability|undefined,
){
  const reasons:string[]=[];
  if(!endpoint.enabled) reasons.push('endpoint_disabled');
  if(endpoint.executionState!=='verified') reasons.push('endpoint_not_verified');
  if(!capability){
    reasons.push('task_not_supported');
    return reasons;
  }

  if(request.durationSec!==undefined&&capability.maxDurationSec!==undefined&&request.durationSec>capability.maxDurationSec){
    reasons.push('duration_exceeds_model_limit');
  }
  if(request.durationSec!==undefined&&capability.durationOptions&&!capability.durationOptions.includes(request.durationSec)){
    reasons.push('duration_not_supported');
  }
  if(request.targetResolution&&capability.resolutions&&!capability.resolutions.includes(request.targetResolution)){
    reasons.push('resolution_not_supported');
  }
  if(request.aspectRatio&&capability.aspectRatios&&!capability.aspectRatios.includes(request.aspectRatio)){
    reasons.push('aspect_ratio_not_supported');
  }
  const supportedRequirements=new Set(capability.requirements);
  for(const required of request.requires){
    if(!supportedRequirements.has(required)) reasons.push(`requirement_not_supported:${required}`);
  }

  const supplied=referenceModes(request.references);
  const requiredModes=request.requiredInputModes??[];
  for(const mode of requiredModes){
    if(!capability.inputModes.includes(mode)) reasons.push(`input_mode_not_supported:${mode}`);
    if(mode!=='text'&&!supplied.has(mode)) reasons.push(`required_input_not_supplied:${mode}`);
  }

  if(request.requireNativeAudio===true&&capability.nativeAudio!==true){
    reasons.push('native_audio_not_supported');
  }

  const compatible=compatibleReferences(request.references,capability);
  if(capability.maxReferences!==undefined&&compatible.length>capability.maxReferences){
    reasons.push('too_many_references');
  }

  const compatibleReferenceImages=compatible.filter(ref=>
    ref.kind==='image'&&
    ref.role!=='start_frame'&&
    ref.role!=='end_frame'
  );
  if(
    compatibleReferenceImages.length&&
    capability.referenceImageDurationOptions&&
    request.durationSec!==undefined&&
    !capability.referenceImageDurationOptions.includes(request.durationSec)
  ){
    reasons.push('reference_image_duration_not_supported');
  }

  if(request.requires.includes('reference_identity')){
    const declaredIdentity=request.references.filter(
      ref=>ref.role==='identity'&&(ref.kind==='image'||ref.kind==='video')
    );
    const compatibleIdentity=compatible.filter(
      ref=>ref.role==='identity'&&(ref.kind==='image'||ref.kind==='video')
    );
    const continuityStart=capability.identityContinuityViaStartFrame===true&&
      compatible.some(ref=>ref.role==='start_frame'&&ref.kind==='image');

    if(!declaredIdentity.length&&!continuityStart){
      reasons.push('identity_reference_missing');
    }else if(!compatibleIdentity.length&&!continuityStart){
      reasons.push('identity_reference_mode_not_supported');
    }
  }
  return [...new Set(reasons)];
}

function routeScore(capability:VisualModelCapability){
  return capability.qualityTier*100-capability.costTier*10-capability.latencyTier;
}

function compatibleReferences(
  refs:VisualReference[],
  capability:VisualModelCapability,
){
  const frameMode=capability.framesExclusiveWithReferences===true&&
    refs.some(ref=>ref.role==='start_frame'||ref.role==='end_frame');

  return refs.filter(ref=>{
    if(capability.referenceRoles&&!capability.referenceRoles.includes(ref.role)){
      return false;
    }
    if(frameMode&&ref.role!=='start_frame'&&ref.role!=='end_frame'){
      return false;
    }
    if(ref.role==='start_frame') return capability.inputModes.includes('start_frame');
    if(ref.role==='end_frame') return capability.inputModes.includes('end_frame');
    if(ref.role==='motion') return capability.inputModes.includes('motion_reference');
    if(ref.kind==='image') return capability.inputModes.includes('image_reference');
    if(ref.kind==='video') return capability.inputModes.includes('video_reference');
    if(ref.kind==='audio') return capability.inputModes.includes('audio_reference');
    return false;
  });
}

function chooseDiverse<T extends {endpoint:VisualModelEndpoint;score:number}>(
  rows:T[],
  count:number,
  diversity:number,
){
  const selected:T[]=[];
  const providerCounts=new Map<string,number>();
  for(const row of rows){
    if(selected.length>=count) break;
    const used=providerCounts.get(row.endpoint.providerId)??0;
    if(used>=diversity) continue;
    selected.push(row);
    providerCounts.set(row.endpoint.providerId,used+1);
  }
  if(selected.length<count){
    for(const row of rows){
      if(selected.length>=count) break;
      if(selected.includes(row)) continue;
      selected.push(row);
    }
  }
  return selected;
}

export function buildVisualModelPlan(
  request:VisualShotRequest,
  endpoints:VisualModelEndpoint[],
):VisualModelPlan{
  if(request.schema!=='evercraft.fallen.visual-shot-request.v1') throw new Error('visual_model_request_schema_invalid');
  if(!request.id?.trim()) throw new Error('visual_model_request_id_missing');
  if(!request.needId?.trim()) throw new Error('visual_model_need_id_missing');
  if(!request.prompt?.trim()) throw new Error('visual_model_prompt_missing');
  if(!request.continuityDigest?.trim()) throw new Error('visual_model_continuity_digest_missing');
  if(!request.sourceRefs?.length) throw new Error('visual_model_source_refs_missing');

  const rejectedModels:Array<{modelId:string;reasons:string[]}>=[];

  const eligible=endpoints.flatMap(endpoint=>{
    const capability=endpoint.capabilities.find(item=>item.task===request.task);
    const reasons=capabilityReasons(request,endpoint,capability);
    if(reasons.length||!capability){
      rejectedModels.push({modelId:endpoint.id,reasons});
      return [];
    }
    return [{endpoint,capability,score:routeScore(capability)}];
  }).sort((a,b)=>b.score-a.score||a.endpoint.id.localeCompare(b.endpoint.id));

  const desired=Math.max(1,Math.min(8,Math.trunc(request.candidateCount??4)));
  const diversity=Math.max(1,Math.min(4,Math.trunc(request.modelDiversity??1)));
  const selected=chooseDiverse(eligible,desired,diversity);

  const jobs=selected.map((row,index):VisualModelJob=>({
    schema:'evercraft.fallen.visual-model-job.v1',
    id:`${request.id}-candidate-${String(index+1).padStart(2,'0')}`,
    requestId:request.id,
    needId:request.needId,
    modelId:row.endpoint.id,
    providerId:row.endpoint.providerId,
    task:request.task,
    prompt:request.prompt,
    durationSec:request.durationSec,
    aspectRatio:request.aspectRatio,
    targetResolution:request.targetResolution,
    references:compatibleReferences(request.references,row.capability),
    continuityDigest:request.continuityDigest,
    requires:[...request.requires],
    outputContract:{
      commercialRightsRequired:request.requires.includes('commercial_rights'),
      provenanceRequired:request.requires.includes('provenance_receipt'),
      artifactDigestRequired:true,
      tournamentCandidateRequired:true,
    },
  }));

  const planWithoutDigest={
    schema:'evercraft.fallen.visual-model-plan.v1' as const,
    requestId:request.id,
    status:jobs.length?('routed' as const):('blocked' as const),
    jobs,
    eligibleModels:eligible.map(row=>row.endpoint.id),
    rejectedModels,
    boundaries:{
      verifiedExecutionOnly:true as const,
      referenceIdentityFailsClosed:true as const,
      providerDiversityPreferred:true as const,
      tournamentSelectionRequired:true as const,
      directPublicationAuthority:false as const,
    },
    createdAt:new Date().toISOString(),
  };

  return {...planWithoutDigest,digest:digest({...planWithoutDigest,createdAt:undefined})};
}

export function buildVisualFinishPlan(
  request:VisualFinishRequest,
  endpoints:VisualModelEndpoint[],
):VisualFinishPlan{
  if(request.schema!=='evercraft.fallen.visual-finish-request.v1') throw new Error('visual_finish_schema_invalid');
  if(request.sourceVideoRef.kind!=='video') throw new Error('visual_finish_source_must_be_video');

  const steps:VisualFinishPlan['steps']=[];

  if(request.dialogueAudioRef){
    if(request.dialogueAudioRef.kind!=='audio') throw new Error('visual_finish_dialogue_must_be_audio');
    const lipRequest:VisualShotRequest={
      schema:'evercraft.fallen.visual-shot-request.v1',
      id:`${request.id}-lip-sync`,
      needId:request.needId,
      task:'lip_sync',
      prompt:'Preserve the selected shot and synchronize visible speech to the approved dialogue performance without changing identity or scene continuity.',
      continuityDigest:request.continuityDigest,
      requires:['reference_identity','commercial_rights','provenance_receipt','timing_control'],
      requiredInputModes:['video_reference','audio_reference'],
      references:[
        {...request.sourceVideoRef,role:'identity'},
        {...request.dialogueAudioRef,role:'dialogue_audio'},
      ],
      candidateCount:2,
      modelDiversity:1,
      sourceRefs:request.sourceRefs,
    };
    steps.push({
      id:`${request.id}-lip-sync`,
      task:'lip_sync',
      sourceRole:'selected_video',
      reference:request.dialogueAudioRef,
      modelPlan:buildVisualModelPlan(lipRequest,endpoints),
    });
  }

  if(request.targetResolution){
    const upscaleRequest:VisualShotRequest={
      schema:'evercraft.fallen.visual-shot-request.v1',
      id:`${request.id}-upscale`,
      needId:request.needId,
      task:'upscale',
      prompt:'Enhance the selected final video while preserving identity, framing, timing, text legibility, evidence overlays and natural texture.',
      targetResolution:request.targetResolution,
      continuityDigest:request.continuityDigest,
      requires:['commercial_rights','provenance_receipt'],
      requiredInputModes:['video_reference'],
      references:[{...request.sourceVideoRef,role:'product'}],
      candidateCount:1,
      sourceRefs:request.sourceRefs,
    };
    steps.push({
      id:`${request.id}-upscale`,
      task:'upscale',
      sourceRole:'selected_video',
      targetResolution:request.targetResolution,
      modelPlan:buildVisualModelPlan(upscaleRequest,endpoints),
    });
  }

  return {
    schema:'evercraft.fallen.visual-finish-plan.v1',
    requestId:request.id,
    steps,
    boundaries:{
      finishAfterTournament:true,
      sourceDigestMustRemainTraceable:true,
      directPublicationAuthority:false,
    },
    createdAt:new Date().toISOString(),
  };
}
