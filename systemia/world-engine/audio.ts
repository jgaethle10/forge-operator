import crypto from 'node:crypto';
import type { TransformComponent, Vec3, WorldEntity } from './engine.js';

export interface AudioClipDefinition {
  id:string;
  assetRef:string;
  durationSec:number;
}

export interface AudioBusDefinition {
  id:string;
  gain:number;
}

export type AudioSpatialMode='2d'|'3d';
export type AudioRolloff='linear'|'inverse';

export interface AudioEmitterComponent {
  clipId:string;
  busId:string;
  gain:number;
  playbackRate?:number;
  autoplay?:boolean;
  loop?:boolean;
  spatialMode?:AudioSpatialMode;
  minDistance?:number;
  maxDistance?:number;
  rolloff?:AudioRolloff;
  rolloffFactor?:number;
}

export interface AudioListenerComponent {
  gain?:number;
}

export interface AudioSceneDefinition {
  schema:'evercraft.world-engine.audio-scene.v1';
  clips:AudioClipDefinition[];
  buses:AudioBusDefinition[];
  initialListenerEntityId:string;
}

export type AudioPlaybackState='playing'|'paused'|'stopped'|'ended';

export interface AudioRuntimeEvent {
  type:'started'|'paused'|'stopped'|'seeked'|'looped'|'ended';
  clipId:string;
  playheadSec:number;
  loopCount:number;
}

export interface AudioEmitterRuntime {
  state:AudioPlaybackState;
  playheadSec:number;
  loopCount:number;
  events:AudioRuntimeEvent[];
}

export interface AudioSceneRuntime {
  activeListenerEntityId:string;
}

export interface AudioFrameContract {
  schema:'evercraft.world-engine.audio-frame.v1';
  worldId:string;
  tick:number;
  timeSec:number;
  listener:{
    entityId:string;
    transform:TransformComponent;
    gain:number;
  };
  buses:AudioBusDefinition[];
  emitters:Array<{
    entityId:string;
    clipId:string;
    assetRef:string;
    busId:string;
    state:AudioPlaybackState;
    playheadSec:number;
    loopCount:number;
    loop:boolean;
    playbackRate:number;
    spatialMode:AudioSpatialMode;
    transform:TransformComponent;
    relativePosition:Vec3;
    distance:number;
    attenuation:number;
    effectiveGain:number;
  }>;
  digest:string;
}

const EPS=1e-12;

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function finite(value:number,label:string){
  if(!Number.isFinite(value)) throw new Error(`audio_invalid_${label}`);
}

function nonNegative(value:number,label:string){
  finite(value,label);
  if(value<0) throw new Error(`audio_invalid_${label}_negative`);
}

function completeTransform(transform:TransformComponent):TransformComponent{
  return {
    position:clone(transform.position),
    rotationDeg:clone(transform.rotationDeg || {x:0,y:0,z:0}),
    scale:clone(transform.scale || {x:1,y:1,z:1})
  };
}

function distance(a:Vec3,b:Vec3){
  const x=a.x-b.x;
  const y=a.y-b.y;
  const z=a.z-b.z;
  return Math.sqrt(x*x+y*y+z*z);
}

function relative(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}

export function validateAudioClip(clip:AudioClipDefinition){
  if(!clip?.id) throw new Error('audio_clip_id_missing');
  if(!clip.assetRef) throw new Error(`audio_clip_asset_missing:${clip.id}`);
  finite(clip.durationSec,`clip_${clip.id}_duration`);
  if(clip.durationSec<=0) throw new Error(`audio_clip_duration_invalid:${clip.id}`);
  return true;
}

export function validateAudioBus(bus:AudioBusDefinition){
  if(!bus?.id) throw new Error('audio_bus_id_missing');
  nonNegative(bus.gain,`bus_${bus.id}_gain`);
  return true;
}

export function validateAudioEmitter(
  emitter:AudioEmitterComponent,
  scene:AudioSceneDefinition
){
  if(!emitter?.clipId) throw new Error('audio_emitter_clip_missing');
  if(!scene.clips.some(clip=>clip.id===emitter.clipId)){
    throw new Error(`audio_emitter_clip_unknown:${emitter.clipId}`);
  }
  if(!emitter.busId) throw new Error('audio_emitter_bus_missing');
  if(!scene.buses.some(bus=>bus.id===emitter.busId)){
    throw new Error(`audio_emitter_bus_unknown:${emitter.busId}`);
  }
  nonNegative(emitter.gain,'emitter_gain');
  if(emitter.playbackRate!==undefined){
    finite(emitter.playbackRate,'emitter_playback_rate');
    if(emitter.playbackRate<=0) throw new Error('audio_emitter_playback_rate_invalid');
  }

  const spatialMode=emitter.spatialMode || '3d';
  if(spatialMode!=='2d' && spatialMode!=='3d') throw new Error('audio_emitter_spatial_mode_invalid');

  if(spatialMode==='3d'){
    const minDistance=emitter.minDistance ?? 1;
    const maxDistance=emitter.maxDistance ?? 50;
    finite(minDistance,'emitter_min_distance');
    finite(maxDistance,'emitter_max_distance');
    if(minDistance<0 || maxDistance<=minDistance){
      throw new Error('audio_emitter_distance_range_invalid');
    }
    const rolloff=emitter.rolloff || 'inverse';
    if(rolloff!=='linear' && rolloff!=='inverse') throw new Error('audio_emitter_rolloff_invalid');
    if(emitter.rolloffFactor!==undefined){
      nonNegative(emitter.rolloffFactor,'emitter_rolloff_factor');
    }
  }
  return true;
}

export function validateAudioListener(listener:AudioListenerComponent){
  if(listener.gain!==undefined) nonNegative(listener.gain,'listener_gain');
  return true;
}

export function validateAudioScene(scene:AudioSceneDefinition,entities:WorldEntity[]){
  if(scene?.schema!=='evercraft.world-engine.audio-scene.v1'){
    throw new Error('audio_scene_schema_invalid');
  }

  const clipIds=new Set<string>();
  for(const clip of scene.clips || []){
    validateAudioClip(clip);
    if(clipIds.has(clip.id)) throw new Error(`audio_clip_duplicate:${clip.id}`);
    clipIds.add(clip.id);
  }

  const busIds=new Set<string>();
  for(const bus of scene.buses || []){
    validateAudioBus(bus);
    if(busIds.has(bus.id)) throw new Error(`audio_bus_duplicate:${bus.id}`);
    busIds.add(bus.id);
  }

  const listenerIds=entities
    .filter(entity=>Boolean(entity.audioListener))
    .map(entity=>entity.id)
    .sort();
  if(!listenerIds.includes(scene.initialListenerEntityId)){
    throw new Error(`audio_initial_listener_missing:${scene.initialListenerEntityId}`);
  }

  for(const entity of entities){
    if(entity.audioEmitter) validateAudioEmitter(entity.audioEmitter,scene);
    if(entity.audioListener) validateAudioListener(entity.audioListener);
  }
  return true;
}

function event(
  type:AudioRuntimeEvent['type'],
  clipId:string,
  runtime:AudioEmitterRuntime
):AudioRuntimeEvent{
  return {
    type,
    clipId,
    playheadSec:Number(runtime.playheadSec.toFixed(9)),
    loopCount:runtime.loopCount
  };
}

export function initializeAudioEmitter(
  emitter:AudioEmitterComponent
):AudioEmitterRuntime{
  return {
    state:emitter.autoplay?'playing':'stopped',
    playheadSec:0,
    loopCount:0,
    events:emitter.autoplay?[{
      type:'started',
      clipId:emitter.clipId,
      playheadSec:0,
      loopCount:0
    }]:[]
  };
}

export function clearAudioRuntimeEvents(runtime:AudioEmitterRuntime){
  runtime.events=[];
}

export function playAudio(
  emitter:AudioEmitterComponent,
  runtime:AudioEmitterRuntime
){
  if(runtime.state==='ended') runtime.playheadSec=0;
  runtime.state='playing';
  runtime.events.push(event('started',emitter.clipId,runtime));
}

export function pauseAudio(
  emitter:AudioEmitterComponent,
  runtime:AudioEmitterRuntime
){
  runtime.state='paused';
  runtime.events.push(event('paused',emitter.clipId,runtime));
}

export function stopAudio(
  emitter:AudioEmitterComponent,
  runtime:AudioEmitterRuntime
){
  runtime.state='stopped';
  runtime.playheadSec=0;
  runtime.loopCount=0;
  runtime.events.push(event('stopped',emitter.clipId,runtime));
}

export function seekAudio(
  emitter:AudioEmitterComponent,
  runtime:AudioEmitterRuntime,
  clip:AudioClipDefinition,
  playheadSec:number
){
  finite(playheadSec,'seek_playhead');
  runtime.playheadSec=Math.max(0,Math.min(clip.durationSec,playheadSec));
  if(runtime.playheadSec>=clip.durationSec && !emitter.loop){
    runtime.state='ended';
  }
  runtime.events.push(event('seeked',emitter.clipId,runtime));
}

export function stepAudioEmitter(
  emitter:AudioEmitterComponent,
  runtime:AudioEmitterRuntime,
  clip:AudioClipDefinition,
  dt:number
){
  if(!Number.isFinite(dt) || dt<0) throw new Error('audio_dt_invalid');
  if(runtime.state!=='playing' || dt<=0) return runtime;

  const rate=emitter.playbackRate ?? 1;
  let remaining=dt*rate;

  while(remaining>EPS && runtime.state==='playing'){
    const untilEnd=clip.durationSec-runtime.playheadSec;
    if(remaining<untilEnd-EPS){
      runtime.playheadSec+=remaining;
      remaining=0;
      break;
    }

    runtime.playheadSec=clip.durationSec;
    remaining=Math.max(0,remaining-untilEnd);

    if(emitter.loop){
      runtime.loopCount+=1;
      runtime.playheadSec=0;
      runtime.events.push(event('looped',emitter.clipId,runtime));
      if(untilEnd<=EPS && remaining>EPS){
        remaining=Math.max(0,remaining-clip.durationSec);
      }
    }else{
      runtime.state='ended';
      runtime.events.push(event('ended',emitter.clipId,runtime));
      remaining=0;
    }
  }

  runtime.playheadSec=Number(runtime.playheadSec.toFixed(9));
  return runtime;
}

export function initializeAudioSceneRuntime(
  scene:AudioSceneDefinition
):AudioSceneRuntime{
  return {activeListenerEntityId:scene.initialListenerEntityId};
}

export function activateAudioListener(
  runtime:AudioSceneRuntime,
  listenerEntityId:string,
  entities:WorldEntity[]
):AudioSceneRuntime{
  const entity=entities.find(item=>item.id===listenerEntityId);
  if(!entity?.audioListener) throw new Error(`audio_listener_entity_missing:${listenerEntityId}`);
  return {activeListenerEntityId:listenerEntityId};
}

function attenuationFor(
  emitter:AudioEmitterComponent,
  emitterPosition:Vec3,
  listenerPosition:Vec3
){
  if((emitter.spatialMode || '3d')==='2d'){
    return {distance:0,attenuation:1,relativePosition:{x:0,y:0,z:0}};
  }

  const d=distance(emitterPosition,listenerPosition);
  const min=emitter.minDistance ?? 1;
  const max=emitter.maxDistance ?? 50;
  const factor=emitter.rolloffFactor ?? 1;
  let attenuation=1;

  if(d>=max){
    attenuation=0;
  }else if(d>min){
    if((emitter.rolloff || 'inverse')==='linear'){
      attenuation=1-((d-min)/(max-min))*factor;
    }else{
      attenuation=min/(min+factor*(d-min));
    }
  }

  return {
    distance:Number(d.toFixed(9)),
    attenuation:Number(Math.max(0,Math.min(1,attenuation)).toFixed(9)),
    relativePosition:relative(emitterPosition,listenerPosition)
  };
}

export function compileAudioFrame(
  worldId:string,
  tick:number,
  timeSec:number,
  scene:AudioSceneDefinition,
  entities:Array<WorldEntity & {audioRuntime?:AudioEmitterRuntime}>,
  runtime:AudioSceneRuntime,
  activeEntityIds?:string[]
):AudioFrameContract{
  const byId=new Map(entities.map(entity=>[entity.id,entity]));
  const listener=byId.get(runtime.activeListenerEntityId);
  if(!listener?.audioListener){
    throw new Error(`audio_listener_entity_missing:${runtime.activeListenerEntityId}`);
  }

  const listenerGain=listener.audioListener.gain ?? 1;
  const listenerPosition=listener.transform.position;
  const clipMap=new Map(scene.clips.map(clip=>[clip.id,clip]));
  const busMap=new Map(scene.buses.map(bus=>[bus.id,bus]));
  const active=activeEntityIds?new Set(activeEntityIds):null;

  const emitters=[...entities]
    .sort((a,b)=>a.id.localeCompare(b.id))
    .filter(entity=>!active || active.has(entity.id))
    .filter(entity=>Boolean(entity.audioEmitter && entity.audioRuntime))
    .map(entity=>{
      const emitter=entity.audioEmitter!;
      const emitterRuntime=entity.audioRuntime!;
      const clip=clipMap.get(emitter.clipId);
      const bus=busMap.get(emitter.busId);
      if(!clip) throw new Error(`audio_emitter_clip_unknown:${emitter.clipId}`);
      if(!bus) throw new Error(`audio_emitter_bus_unknown:${emitter.busId}`);
      const spatial=attenuationFor(emitter,entity.transform.position,listenerPosition);
      return {
        entityId:entity.id,
        clipId:clip.id,
        assetRef:clip.assetRef,
        busId:bus.id,
        state:emitterRuntime.state,
        playheadSec:emitterRuntime.playheadSec,
        loopCount:emitterRuntime.loopCount,
        loop:emitter.loop===true,
        playbackRate:emitter.playbackRate ?? 1,
        spatialMode:emitter.spatialMode || '3d' as AudioSpatialMode,
        transform:completeTransform(entity.transform),
        relativePosition:spatial.relativePosition,
        distance:spatial.distance,
        attenuation:spatial.attenuation,
        effectiveGain:Number((emitter.gain*bus.gain*listenerGain*spatial.attenuation).toFixed(9))
      };
    });

  const core={
    schema:'evercraft.world-engine.audio-frame.v1' as const,
    worldId,
    tick,
    timeSec,
    listener:{
      entityId:listener.id,
      transform:completeTransform(listener.transform),
      gain:listenerGain
    },
    buses:[...scene.buses].sort((a,b)=>a.id.localeCompare(b.id)).map(clone),
    emitters
  };

  return {...core,digest:digest(core)};
}
