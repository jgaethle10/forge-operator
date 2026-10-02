import crypto from 'node:crypto';
import type { AspectRatio, CreativeRequirement } from './types.js';
import type { VisualReference, VisualShotRequest } from './model-fabric.js';

export type ScreenZone='far_left'|'left'|'center'|'right'|'far_right';
export type Facing='left'|'right'|'camera'|'away';
export type Eyeline='camera_left'|'camera_right'|'center'|'offscreen_left'|'offscreen_right';
export type ScreenDirection='left_to_right'|'right_to_left'|'neutral';
export type ShotScale='extreme_wide'|'wide'|'medium_wide'|'medium'|'medium_close'|'close'|'extreme_close';
export type CameraMovement='locked'|'pan'|'tilt'|'dolly_in'|'dolly_out'|'truck_left'|'truck_right'|'crane'|'orbit'|'follow'|'handheld';

export interface CharacterBlocking {
  entityId:string;
  startZone:ScreenZone;
  endZone?:ScreenZone;
  startFacing:Facing;
  endFacing?:Facing;
  eyeline?:Eyeline;
  action?:string;
  propIds?:string[];
}

export interface CinematicShotIntent {
  id:string;
  needId:string;
  locationId:string;
  durationSec:number;
  prompt:string;
  sourceRefs:string[];
  characters:CharacterBlocking[];
  shotScale?:ShotScale;
  lensMm?:number;
  cameraMovement?:CameraMovement;
  screenDirection?:ScreenDirection;
  axisReset?:boolean;
  actionContinuityId?:string;
  dialogue?:{
    speakerId:string;
    targetId?:string;
  };
}

export interface CinematicSequenceInput {
  schema:'evercraft.fallen.cinematic-sequence-input.v1';
  id:string;
  aspectRatio:AspectRatio;
  continuityDigest:string;
  shots:CinematicShotIntent[];
  identityReferences:Record<string,VisualReference[]>;
  environmentReferences:Record<string,VisualReference[]>;
  candidateCount?:number;
  modelDiversity?:number;
}

export interface CinematicShotContract {
  schema:'evercraft.fallen.cinematic-shot-contract.v1';
  sequenceId:string;
  id:string;
  needId:string;
  index:number;
  locationId:string;
  durationSec:number;
  aspectRatio:AspectRatio;
  continuityDigest:string;
  shotScale:ShotScale;
  lensMm:number;
  cameraMovement:CameraMovement;
  screenDirection:ScreenDirection;
  axisReset:boolean;
  actionContinuityId?:string;
  dialogue?:CinematicShotIntent['dialogue'];
  characters:CharacterBlocking[];
  sourceRefs:string[];
  baseReferences:VisualReference[];
  carryInFromShotId?:string;
  mustProvideStartFrame:boolean;
  prompt:string;
}

export interface CinematicSequencePlan {
  schema:'evercraft.fallen.cinematic-sequence-plan.v1';
  id:string;
  status:'accepted'|'rejected';
  shots:CinematicShotContract[];
  errors:string[];
  warnings:string[];
  continuityDigest:string;
  digest:string;
  boundaries:{
    identityReferencesRequired:true;
    environmentReferencesRequired:true;
    actionContinuityFailsClosed:true;
    axisCrossingFailsClosed:true;
    carryInFramesRequiredWhenContinuous:true;
    directPublicationAuthority:false;
  };
  createdAt:string;
}

export interface CinematicShotBinding {
  startFrame?:VisualReference;
  endFrame?:VisualReference;
  motionReference?:VisualReference;
  candidateCount?:number;
  modelDiversity?:number;
  targetResolution?:string;
}

const DEFAULT_LENS:Record<ShotScale,number>={
  extreme_wide:24,
  wide:28,
  medium_wide:35,
  medium:50,
  medium_close:65,
  close:85,
  extreme_close:100,
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

function endZone(character:CharacterBlocking){
  return character.endZone??character.startZone;
}

function endFacing(character:CharacterBlocking){
  return character.endFacing??character.startFacing;
}

function byEntity(shot:CinematicShotIntent){
  return new Map(shot.characters.map(character=>[character.entityId,character]));
}

function uniqueRefs(refs:VisualReference[]){
  const seen=new Set<string>();
  return refs.filter(ref=>{
    const key=ref.id+'|'+ref.role+'|'+ref.kind+'|'+(ref.digest??'');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function oppositeEyeline(a:Eyeline|undefined,b:Eyeline|undefined){
  const pairs=new Set([
    'camera_left|camera_right',
    'camera_right|camera_left',
    'offscreen_left|offscreen_right',
    'offscreen_right|offscreen_left',
  ]);
  return Boolean(a&&b&&pairs.has(a+'|'+b));
}

function continuous(previous:CinematicShotIntent,current:CinematicShotIntent){
  if(current.axisReset) return false;
  if(previous.locationId!==current.locationId) return false;
  if(previous.actionContinuityId&&current.actionContinuityId&&previous.actionContinuityId===current.actionContinuityId) return true;
  const priorIds=new Set(previous.characters.map(character=>character.entityId));
  return current.characters.some(character=>priorIds.has(character.entityId));
}

function formatBlocking(character:CharacterBlocking){
  const start=character.startZone+'/'+character.startFacing;
  const end=endZone(character)+'/'+endFacing(character);
  const movement=start===end?'hold '+start:start+' -> '+end;
  const action=character.action?'; action='+character.action:'';
  const eyeline=character.eyeline?'; eyeline='+character.eyeline:'';
  const props=character.propIds?.length?'; props='+character.propIds.join(','):'';
  return character.entityId+': '+movement+action+eyeline+props;
}

function shotPrompt(input:CinematicSequenceInput,shot:CinematicShotIntent,index:number,carryInFromShotId?:string){
  const scale=shot.shotScale??'medium';
  const lens=shot.lensMm??DEFAULT_LENS[scale];
  const movement=shot.cameraMovement??'locked';
  const direction=shot.screenDirection??'neutral';
  const characterLines=shot.characters.map(formatBlocking);
  return [
    'FALLEN CINEMATIC SEQUENCE CONTRACT.',
    'Sequence: '+input.id+'. Shot '+String(index+1)+' of '+String(input.shots.length)+': '+shot.id+'.',
    'Location lock: '+shot.locationId+'.',
    'Camera: '+scale+', '+lens+'mm, movement='+movement+', screen_direction='+direction+'.',
    shot.axisReset?'AXIS RESET AUTHORIZED: establish geography clearly before changing screen direction.':'AXIS LOCKED: preserve the established 180-degree line and screen direction.',
    carryInFromShotId
      ? 'CONTINUOUS TAKE LOGIC: begin from the verified end frame of '+carryInFromShotId+'. Preserve body position, wardrobe, props, lighting, geography, weather, damage/state and action phase.'
      : 'ESTABLISHING LOGIC: no prior-shot carry-in is required, but all locked identity and environment references remain mandatory.',
    ...(shot.actionContinuityId?['Action continuity id: '+shot.actionContinuityId+'. Match the exact action phase across the cut.']:[]),
    ...(shot.dialogue?['Dialogue blocking: speaker='+shot.dialogue.speakerId+(shot.dialogue.targetId?'; target='+shot.dialogue.targetId:'')+'. Preserve eyelines and conversational geography.']:[]),
    'Character blocking:',
    ...characterLines.map(line=>'- '+line),
    'Creative intent: '+shot.prompt.trim(),
    'Do not redesign a character, swap wardrobe, teleport a prop, reverse handedness, move a landmark, change time-of-day/lighting, cross the axis, or reset an in-progress action unless the contract explicitly authorizes it.',
    'Prefer physically coherent camera motion, motivated cuts, believable inertia, natural micro-movement and performance over spectacle for its own sake.',
  ].join('\n');
}

function validateReferences(
  shot:CinematicShotIntent,
  input:CinematicSequenceInput,
  errors:string[],
){
  for(const character of shot.characters){
    const refs=input.identityReferences[character.entityId]??[];
    const valid=refs.filter(ref=>ref.role==='identity'&&(ref.kind==='image'||ref.kind==='video')&&ref.sourceRefs?.length);
    if(!valid.length) errors.push('identity_reference_missing:'+shot.id+':'+character.entityId);
  }
  const env=input.environmentReferences[shot.locationId]??[];
  const validEnv=env.filter(ref=>ref.role==='environment'&&(ref.kind==='image'||ref.kind==='video')&&ref.sourceRefs?.length);
  if(!validEnv.length) errors.push('environment_reference_missing:'+shot.id+':'+shot.locationId);
}

function validateAdjacent(
  previous:CinematicShotIntent,
  current:CinematicShotIntent,
  errors:string[],
  warnings:string[],
){
  if(!continuous(previous,current)) return;

  const prevDirection=previous.screenDirection??'neutral';
  const nextDirection=current.screenDirection??prevDirection;
  if(
    prevDirection!=='neutral'&&
    nextDirection!=='neutral'&&
    prevDirection!==nextDirection&&
    !current.axisReset
  ){
    errors.push('axis_cross_without_reset:'+previous.id+'->'+current.id);
  }

  if(
    previous.actionContinuityId&&
    current.actionContinuityId&&
    previous.actionContinuityId===current.actionContinuityId
  ){
    const prior=byEntity(previous);
    for(const character of current.characters){
      const before=prior.get(character.entityId);
      if(!before) continue;
      if(endZone(before)!==character.startZone){
        errors.push('action_position_discontinuity:'+previous.id+'->'+current.id+':'+character.entityId);
      }
      if(endFacing(before)!==character.startFacing){
        errors.push('action_facing_discontinuity:'+previous.id+'->'+current.id+':'+character.entityId);
      }
    }
  }

  if(
    previous.dialogue?.targetId&&
    current.dialogue?.targetId&&
    previous.dialogue.speakerId===current.dialogue.targetId&&
    previous.dialogue.targetId===current.dialogue.speakerId
  ){
    const a=previous.characters.find(character=>character.entityId===previous.dialogue?.speakerId);
    const b=current.characters.find(character=>character.entityId===current.dialogue?.speakerId);
    if(a&&b&&!oppositeEyeline(a.eyeline,b.eyeline)){
      errors.push('dialogue_eyeline_mismatch:'+previous.id+'->'+current.id);
    }
  }

  if((previous.shotScale??'medium')===(current.shotScale??'medium')){
    warnings.push('repeated_shot_scale:'+previous.id+'->'+current.id);
  }
}

export function compileCinematicSequence(input:CinematicSequenceInput):CinematicSequencePlan{
  if(input.schema!=='evercraft.fallen.cinematic-sequence-input.v1') throw new Error('cinematic_sequence_schema_invalid');
  if(!input.id?.trim()) throw new Error('cinematic_sequence_id_missing');
  if(!input.continuityDigest?.trim()) throw new Error('cinematic_sequence_continuity_digest_missing');
  if(!input.shots?.length) throw new Error('cinematic_sequence_shots_missing');

  const errors:string[]=[];
  const warnings:string[]=[];
  const seen=new Set<string>();

  for(const shot of input.shots){
    if(!shot.id?.trim()) errors.push('shot_id_missing');
    else if(seen.has(shot.id)) errors.push('duplicate_shot_id:'+shot.id);
    else seen.add(shot.id);
    if(!shot.needId?.trim()) errors.push('need_id_missing:'+shot.id);
    if(!shot.locationId?.trim()) errors.push('location_id_missing:'+shot.id);
    if(!shot.prompt?.trim()) errors.push('shot_prompt_missing:'+shot.id);
    if(!shot.sourceRefs?.length) errors.push('source_refs_missing:'+shot.id);
    if(!Number.isFinite(shot.durationSec)||shot.durationSec<.5||shot.durationSec>30){
      errors.push('shot_duration_invalid:'+shot.id);
    }
    if(shot.lensMm!==undefined&&(!Number.isFinite(shot.lensMm)||shot.lensMm<12||shot.lensMm>200)){
      errors.push('lens_out_of_range:'+shot.id);
    }
    const ids=new Set<string>();
    for(const character of shot.characters){
      if(ids.has(character.entityId)) errors.push('duplicate_character_blocking:'+shot.id+':'+character.entityId);
      ids.add(character.entityId);
    }
    validateReferences(shot,input,errors);
  }

  for(let index=1;index<input.shots.length;index+=1){
    validateAdjacent(input.shots[index-1],input.shots[index],errors,warnings);
  }

  for(let index=2;index<input.shots.length;index+=1){
    const a=input.shots[index-2].shotScale??'medium';
    const b=input.shots[index-1].shotScale??'medium';
    const c=input.shots[index].shotScale??'medium';
    if(a===b&&b===c) warnings.push('three_identical_shot_scales:'+input.shots[index-2].id+'->'+input.shots[index].id);
  }

  const shots=input.shots.map((shot,index):CinematicShotContract=>{
    const previous=index>0?input.shots[index-1]:undefined;
    const carryInFromShotId=previous&&continuous(previous,shot)?previous.id:undefined;
    const identity=shot.characters.flatMap(character=>input.identityReferences[character.entityId]??[]);
    const environment=input.environmentReferences[shot.locationId]??[];
    const shotScale=shot.shotScale??'medium';
    return {
      schema:'evercraft.fallen.cinematic-shot-contract.v1',
      sequenceId:input.id,
      id:shot.id,
      needId:shot.needId,
      index,
      locationId:shot.locationId,
      durationSec:shot.durationSec,
      aspectRatio:input.aspectRatio,
      continuityDigest:input.continuityDigest,
      shotScale,
      lensMm:shot.lensMm??DEFAULT_LENS[shotScale],
      cameraMovement:shot.cameraMovement??'locked',
      screenDirection:shot.screenDirection??previous?.screenDirection??'neutral',
      axisReset:shot.axisReset===true,
      actionContinuityId:shot.actionContinuityId,
      dialogue:shot.dialogue,
      characters:shot.characters,
      sourceRefs:[...new Set(shot.sourceRefs)],
      baseReferences:uniqueRefs([...identity,...environment]),
      carryInFromShotId,
      mustProvideStartFrame:Boolean(carryInFromShotId),
      prompt:shotPrompt(input,shot,index,carryInFromShotId),
    };
  });

  const planWithoutDigest={
    schema:'evercraft.fallen.cinematic-sequence-plan.v1' as const,
    id:input.id,
    status:errors.length?('rejected' as const):('accepted' as const),
    shots,
    errors:[...new Set(errors)],
    warnings:[...new Set(warnings)],
    continuityDigest:input.continuityDigest,
    boundaries:{
      identityReferencesRequired:true as const,
      environmentReferencesRequired:true as const,
      actionContinuityFailsClosed:true as const,
      axisCrossingFailsClosed:true as const,
      carryInFramesRequiredWhenContinuous:true as const,
      directPublicationAuthority:false as const,
    },
    createdAt:new Date().toISOString(),
  };

  return {
    ...planWithoutDigest,
    digest:digest({...planWithoutDigest,createdAt:undefined}),
  };
}

function normalizeBoundReference(
  ref:VisualReference,
  role:'start_frame'|'end_frame'|'motion',
):VisualReference{
  if(role==='motion'){
    if(ref.kind!=='video') throw new Error('cinematic_motion_reference_must_be_video');
  }else if(ref.kind!=='image'){
    throw new Error('cinematic_'+role+'_must_be_image');
  }
  if(!ref.sourceRefs?.length) throw new Error('cinematic_'+role+'_source_refs_missing');
  return {...ref,role};
}

export function buildCinematicVisualRequest(
  shot:CinematicShotContract,
  binding:CinematicShotBinding={},
):VisualShotRequest{
  if(shot.mustProvideStartFrame&&!binding.startFrame){
    throw new Error('cinematic_start_frame_required:'+shot.id+':'+shot.carryInFromShotId);
  }

  const references=[...shot.baseReferences];
  const requiredInputModes:NonNullable<VisualShotRequest['requiredInputModes']>=[];

  if(binding.startFrame){
    references.push(normalizeBoundReference(binding.startFrame,'start_frame'));
    requiredInputModes.push('start_frame');
  }
  if(binding.endFrame){
    references.push(normalizeBoundReference(binding.endFrame,'end_frame'));
    requiredInputModes.push('end_frame');
  }
  if(binding.motionReference){
    references.push(normalizeBoundReference(binding.motionReference,'motion'));
    requiredInputModes.push('motion_reference');
  }

  const requirements:CreativeRequirement[]=[
    'commercial_rights',
    'provenance_receipt',
    'timing_control',
  ];
  requirements.unshift('reference_environment');
  if(shot.characters.length) requirements.unshift('reference_identity');

  return {
    schema:'evercraft.fallen.visual-shot-request.v1',
    id:shot.id+'-cinematic',
    needId:shot.needId,
    task:'video',
    prompt:shot.prompt,
    durationSec:shot.durationSec,
    aspectRatio:shot.aspectRatio,
    targetResolution:binding.targetResolution,
    continuityDigest:shot.continuityDigest,
    requires:requirements,
    requiredInputModes,
    references:uniqueRefs(references),
    candidateCount:binding.candidateCount??4,
    modelDiversity:binding.modelDiversity??2,
    sourceRefs:shot.sourceRefs,
  };
}
