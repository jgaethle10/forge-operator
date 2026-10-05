import type { Vec3 } from './engine.js';

export type AnimationParameter = number|boolean|string;

export interface BoneTransform {
  translation:Vec3;
  rotationDeg:Vec3;
  scale:Vec3;
}

export interface SkeletonBone {
  id:string;
  parentId?:string|null;
  bind:BoneTransform;
}

export interface SkeletalRig {
  id:string;
  bones:SkeletonBone[];
}

export interface Vec3Keyframe {
  timeSec:number;
  value:Vec3;
}

export interface BoneTrack {
  boneId:string;
  translation?:Vec3Keyframe[];
  rotationDeg?:Vec3Keyframe[];
  scale?:Vec3Keyframe[];
}

export interface AnimationEventMarker {
  id:string;
  name:string;
  timeSec:number;
  payload?:Record<string,unknown>;
}

export interface AnimationClip {
  id:string;
  durationSec:number;
  loop?:boolean;
  tracks:BoneTrack[];
  events?:AnimationEventMarker[];
}

export interface AnimationStateDefinition {
  id:string;
  clipId:string;
  speed?:number;
  loop?:boolean;
}

export type AnimationConditionOperator=
  | 'eq'|'neq'
  | 'gt'|'gte'|'lt'|'lte'
  | 'truthy'|'falsy';

export interface AnimationTransitionCondition {
  parameter:string;
  operator:AnimationConditionOperator;
  value?:AnimationParameter;
}

export interface AnimationTransitionDefinition {
  id:string;
  from:string;
  to:string;
  priority?:number;
  blendSec?:number;
  conditions:AnimationTransitionCondition[];
}

export interface SkeletalAnimationComponent {
  schema:'evercraft.world-engine.animation.v1';
  rig:SkeletalRig;
  clips:AnimationClip[];
  states:AnimationStateDefinition[];
  initialState:string;
  transitions:AnimationTransitionDefinition[];
  parameters?:Record<string,AnimationParameter>;
}

export interface BonePose extends BoneTransform {
  boneId:string;
}

export interface AnimationRuntimeEvent {
  markerId:string;
  name:string;
  stateId:string;
  clipId:string;
  timeSec:number;
  payload?:Record<string,unknown>;
}

export interface ActiveAnimationTransition {
  id:string;
  fromStateId:string;
  toStateId:string;
  elapsedSec:number;
  durationSec:number;
  fromPose:BonePose[];
}

export interface AnimationRuntimeState {
  stateId:string;
  stateTimeSec:number;
  parameters:Record<string,AnimationParameter>;
  pose:BonePose[];
  transition:ActiveAnimationTransition|null;
  events:AnimationRuntimeEvent[];
}

const ZERO:Vec3={x:0,y:0,z:0};
const ONE:Vec3={x:1,y:1,z:1};
const EPS=1e-12;

function clone<T>(value:T):T{
  return structuredClone(value);
}

function finiteVec3(value:Vec3,label:string){
  for(const axis of ['x','y','z'] as const){
    if(!Number.isFinite(value?.[axis])) throw new Error(`animation_invalid_${label}_${axis}`);
  }
}

function validateTransform(value:BoneTransform,label:string){
  finiteVec3(value?.translation,`${label}_translation`);
  finiteVec3(value?.rotationDeg,`${label}_rotation`);
  finiteVec3(value?.scale,`${label}_scale`);
  if(value.scale.x<=0 || value.scale.y<=0 || value.scale.z<=0){
    throw new Error(`animation_invalid_${label}_scale`);
  }
}

function validateKeyframes(frames:Vec3Keyframe[]|undefined,durationSec:number,label:string){
  if(!frames) return;
  let previous=-Infinity;
  for(const frame of frames){
    if(!Number.isFinite(frame.timeSec) || frame.timeSec<0 || frame.timeSec>durationSec){
      throw new Error(`animation_invalid_keyframe_time:${label}`);
    }
    if(frame.timeSec<previous) throw new Error(`animation_unsorted_keyframes:${label}`);
    previous=frame.timeSec;
    finiteVec3(frame.value,`keyframe_${label}`);
  }
}

function assertAcyclicRig(rig:SkeletalRig){
  const bones=new Map(rig.bones.map(bone=>[bone.id,bone]));
  const visited=new Set<string>();
  const visiting=new Set<string>();

  const visit=(id:string)=>{
    if(visited.has(id)) return;
    if(visiting.has(id)) throw new Error(`animation_rig_cycle:${id}`);
    visiting.add(id);
    const bone=bones.get(id);
    if(!bone) throw new Error(`animation_rig_bone_missing:${id}`);
    if(bone.parentId){
      if(!bones.has(bone.parentId)) throw new Error(`animation_rig_parent_missing:${id}:${bone.parentId}`);
      visit(bone.parentId);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for(const id of [...bones.keys()].sort()) visit(id);
}

export function validateAnimationComponent(component:SkeletalAnimationComponent){
  if(component?.schema!=='evercraft.world-engine.animation.v1'){
    throw new Error('animation_schema_invalid');
  }
  if(!component.rig?.id) throw new Error('animation_rig_id_missing');
  if(!Array.isArray(component.rig.bones) || !component.rig.bones.length){
    throw new Error('animation_rig_bones_missing');
  }

  const boneIds=new Set<string>();
  for(const bone of component.rig.bones){
    if(!bone.id) throw new Error('animation_bone_id_missing');
    if(boneIds.has(bone.id)) throw new Error(`animation_bone_duplicate:${bone.id}`);
    boneIds.add(bone.id);
    validateTransform(bone.bind,`bind_${bone.id}`);
  }
  assertAcyclicRig(component.rig);

  const clipIds=new Set<string>();
  for(const clip of component.clips || []){
    if(!clip.id) throw new Error('animation_clip_id_missing');
    if(clipIds.has(clip.id)) throw new Error(`animation_clip_duplicate:${clip.id}`);
    clipIds.add(clip.id);
    if(!Number.isFinite(clip.durationSec) || clip.durationSec<=0){
      throw new Error(`animation_clip_duration_invalid:${clip.id}`);
    }

    const trackBones=new Set<string>();
    for(const track of clip.tracks || []){
      if(!boneIds.has(track.boneId)) throw new Error(`animation_track_bone_missing:${clip.id}:${track.boneId}`);
      if(trackBones.has(track.boneId)) throw new Error(`animation_track_bone_duplicate:${clip.id}:${track.boneId}`);
      trackBones.add(track.boneId);
      validateKeyframes(track.translation,clip.durationSec,`${clip.id}:${track.boneId}:translation`);
      validateKeyframes(track.rotationDeg,clip.durationSec,`${clip.id}:${track.boneId}:rotation`);
      validateKeyframes(track.scale,clip.durationSec,`${clip.id}:${track.boneId}:scale`);
    }

    const eventIds=new Set<string>();
    for(const marker of clip.events || []){
      if(!marker.id) throw new Error(`animation_event_id_missing:${clip.id}`);
      if(eventIds.has(marker.id)) throw new Error(`animation_event_duplicate:${clip.id}:${marker.id}`);
      eventIds.add(marker.id);
      if(!Number.isFinite(marker.timeSec) || marker.timeSec<0 || marker.timeSec>clip.durationSec){
        throw new Error(`animation_event_time_invalid:${clip.id}:${marker.id}`);
      }
    }
  }

  const stateIds=new Set<string>();
  for(const state of component.states || []){
    if(!state.id) throw new Error('animation_state_id_missing');
    if(stateIds.has(state.id)) throw new Error(`animation_state_duplicate:${state.id}`);
    stateIds.add(state.id);
    if(!clipIds.has(state.clipId)) throw new Error(`animation_state_clip_missing:${state.id}:${state.clipId}`);
    if(state.speed!==undefined && (!Number.isFinite(state.speed) || state.speed<0)){
      throw new Error(`animation_state_speed_invalid:${state.id}`);
    }
  }
  if(!stateIds.has(component.initialState)) throw new Error(`animation_initial_state_missing:${component.initialState}`);

  const transitionIds=new Set<string>();
  for(const transition of component.transitions || []){
    if(!transition.id) throw new Error('animation_transition_id_missing');
    if(transitionIds.has(transition.id)) throw new Error(`animation_transition_duplicate:${transition.id}`);
    transitionIds.add(transition.id);
    if(!stateIds.has(transition.from)) throw new Error(`animation_transition_from_missing:${transition.id}:${transition.from}`);
    if(!stateIds.has(transition.to)) throw new Error(`animation_transition_to_missing:${transition.id}:${transition.to}`);
    if(transition.from===transition.to) throw new Error(`animation_transition_self:${transition.id}`);
    if(transition.priority!==undefined && !Number.isFinite(transition.priority)){
      throw new Error(`animation_transition_priority_invalid:${transition.id}`);
    }
    if(transition.blendSec!==undefined && (!Number.isFinite(transition.blendSec) || transition.blendSec<0)){
      throw new Error(`animation_transition_blend_invalid:${transition.id}`);
    }
    if(!Array.isArray(transition.conditions) || !transition.conditions.length){
      throw new Error(`animation_transition_conditions_missing:${transition.id}`);
    }
    for(const condition of transition.conditions){
      if(!condition.parameter) throw new Error(`animation_transition_parameter_missing:${transition.id}`);
    }
  }
  return true;
}

function stateById(component:SkeletalAnimationComponent,id:string){
  const state=component.states.find(item=>item.id===id);
  if(!state) throw new Error(`animation_state_missing:${id}`);
  return state;
}

function clipForState(component:SkeletalAnimationComponent,stateId:string){
  const state=stateById(component,stateId);
  const clip=component.clips.find(item=>item.id===state.clipId);
  if(!clip) throw new Error(`animation_clip_missing:${state.clipId}`);
  return {state,clip};
}

function normalizeTime(timeSec:number,durationSec:number,loop:boolean){
  if(loop){
    const wrapped=((timeSec%durationSec)+durationSec)%durationSec;
    return Math.abs(wrapped-durationSec)<EPS?0:wrapped;
  }
  return Math.max(0,Math.min(durationSec,timeSec));
}

function lerp(a:number,b:number,t:number){
  return a+(b-a)*t;
}

function lerpVec(a:Vec3,b:Vec3,t:number):Vec3{
  return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)};
}

function wrapAngleDelta(delta:number){
  let value=((delta+180)%360+360)%360-180;
  if(Math.abs(value+180)<EPS) value=180;
  return value;
}

function lerpAngle(a:number,b:number,t:number){
  return a+wrapAngleDelta(b-a)*t;
}

function lerpRotation(a:Vec3,b:Vec3,t:number):Vec3{
  return {x:lerpAngle(a.x,b.x,t),y:lerpAngle(a.y,b.y,t),z:lerpAngle(a.z,b.z,t)};
}

function sampleVec(frames:Vec3Keyframe[]|undefined,timeSec:number,fallback:Vec3,rotation=false){
  if(!frames?.length) return clone(fallback);
  if(timeSec<=frames[0].timeSec) return clone(frames[0].value);
  const last=frames[frames.length-1];
  if(timeSec>=last.timeSec) return clone(last.value);

  for(let i=1;i<frames.length;i++){
    const right=frames[i];
    if(timeSec>right.timeSec) continue;
    const left=frames[i-1];
    const span=right.timeSec-left.timeSec;
    const t=span<=EPS?1:(timeSec-left.timeSec)/span;
    return rotation
      ? lerpRotation(left.value,right.value,t)
      : lerpVec(left.value,right.value,t);
  }
  return clone(last.value);
}

export function sampleAnimationPose(
  component:SkeletalAnimationComponent,
  stateId:string,
  stateTimeSec:number
):BonePose[]{
  const {state,clip}=clipForState(component,stateId);
  const loop=state.loop ?? clip.loop ?? false;
  const clipTime=normalizeTime(stateTimeSec,clip.durationSec,loop);
  const tracks=new Map((clip.tracks || []).map(track=>[track.boneId,track]));

  return [...component.rig.bones]
    .sort((a,b)=>a.id.localeCompare(b.id))
    .map(bone=>{
      const track=tracks.get(bone.id);
      return {
        boneId:bone.id,
        translation:sampleVec(track?.translation,clipTime,bone.bind.translation),
        rotationDeg:sampleVec(track?.rotationDeg,clipTime,bone.bind.rotationDeg,true),
        scale:sampleVec(track?.scale,clipTime,bone.bind.scale)
      };
    });
}

function blendPose(from:BonePose[],to:BonePose[],weight:number){
  const fromMap=new Map(from.map(pose=>[pose.boneId,pose]));
  return [...to]
    .sort((a,b)=>a.boneId.localeCompare(b.boneId))
    .map(target=>{
      const source=fromMap.get(target.boneId) || target;
      return {
        boneId:target.boneId,
        translation:lerpVec(source.translation,target.translation,weight),
        rotationDeg:lerpRotation(source.rotationDeg,target.rotationDeg,weight),
        scale:lerpVec(source.scale,target.scale,weight)
      };
    });
}

function truthy(value:AnimationParameter|undefined){
  return Boolean(value);
}

function conditionMatches(condition:AnimationTransitionCondition,parameters:Record<string,AnimationParameter>){
  const actual=parameters[condition.parameter];
  switch(condition.operator){
    case 'eq': return actual===condition.value;
    case 'neq': return actual!==condition.value;
    case 'truthy': return truthy(actual);
    case 'falsy': return !truthy(actual);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if(typeof actual!=='number' || typeof condition.value!=='number') return false;
      if(condition.operator==='gt') return actual>condition.value;
      if(condition.operator==='gte') return actual>=condition.value;
      if(condition.operator==='lt') return actual<condition.value;
      return actual<=condition.value;
    }
  }
}

function selectTransition(component:SkeletalAnimationComponent,runtime:AnimationRuntimeState){
  return [...component.transitions]
    .filter(item=>item.from===runtime.stateId)
    .sort((a,b)=>(b.priority||0)-(a.priority||0) || a.id.localeCompare(b.id))
    .find(item=>item.conditions.every(condition=>conditionMatches(condition,runtime.parameters))) || null;
}

function markersCrossed(
  clip:AnimationClip,
  previousTime:number,
  nextTime:number,
  loop:boolean
){
  const markers=[...(clip.events || [])].sort((a,b)=>a.timeSec-b.timeSec || a.id.localeCompare(b.id));
  if(!markers.length || nextTime<=previousTime+EPS) return [];

  if(!loop){
    const start=Math.max(0,previousTime);
    const end=Math.min(clip.durationSec,nextTime);
    return markers.filter(marker=>marker.timeSec>start+EPS && marker.timeSec<=end+EPS);
  }

  const duration=clip.durationSec;
  const startLoop=Math.floor(previousTime/duration);
  const endLoop=Math.floor(nextTime/duration);
  const crossed:AnimationEventMarker[]=[];
  for(let loopIndex=startLoop;loopIndex<=endLoop;loopIndex++){
    const base=loopIndex*duration;
    for(const marker of markers){
      const absolute=base+marker.timeSec;
      if(absolute>previousTime+EPS && absolute<=nextTime+EPS) crossed.push(marker);
    }
  }
  return crossed;
}

export function initializeAnimationRuntime(component:SkeletalAnimationComponent):AnimationRuntimeState{
  validateAnimationComponent(component);
  return {
    stateId:component.initialState,
    stateTimeSec:0,
    parameters:clone(component.parameters || {}),
    pose:sampleAnimationPose(component,component.initialState,0),
    transition:null,
    events:[]
  };
}

export function setAnimationParameter(
  runtime:AnimationRuntimeState,
  key:string,
  value:AnimationParameter
){
  if(!key) throw new Error('animation_parameter_key_missing');
  runtime.parameters[key]=value;
}

export function stepAnimationRuntime(
  component:SkeletalAnimationComponent,
  runtime:AnimationRuntimeState,
  dt:number
):AnimationRuntimeState{
  if(!Number.isFinite(dt) || dt<0) throw new Error('animation_dt_invalid');
  const next=clone(runtime);
  next.events=[];

  if(!next.transition){
    const selected=selectTransition(component,next);
    if(selected){
      const fromPose=clone(next.pose);
      next.stateId=selected.to;
      next.stateTimeSec=0;
      const duration=Math.max(0,selected.blendSec || 0);
      next.transition=duration>EPS?{
        id:selected.id,
        fromStateId:selected.from,
        toStateId:selected.to,
        elapsedSec:0,
        durationSec:duration,
        fromPose
      }:null;
      next.pose=sampleAnimationPose(component,next.stateId,0);
    }
  }

  const {state,clip}=clipForState(component,next.stateId);
  const speed=state.speed ?? 1;
  const previousTime=next.stateTimeSec;
  const advancedTime=previousTime+dt*speed;
  const loop=state.loop ?? clip.loop ?? false;

  next.events=markersCrossed(clip,previousTime,advancedTime,loop).map(marker=>({
    markerId:marker.id,
    name:marker.name,
    stateId:state.id,
    clipId:clip.id,
    timeSec:marker.timeSec,
    payload:marker.payload?clone(marker.payload):undefined
  }));

  next.stateTimeSec=advancedTime;
  const targetPose=sampleAnimationPose(component,next.stateId,next.stateTimeSec);

  if(next.transition){
    next.transition.elapsedSec=Math.min(
      next.transition.durationSec,
      next.transition.elapsedSec+dt
    );
    const weight=next.transition.durationSec<=EPS
      ? 1
      : Math.max(0,Math.min(1,next.transition.elapsedSec/next.transition.durationSec));
    next.pose=blendPose(next.transition.fromPose,targetPose,weight);
    if(weight>=1-EPS) next.transition=null;
  }else{
    next.pose=targetPose;
  }

  return next;
}
