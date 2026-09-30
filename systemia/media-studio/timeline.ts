import crypto from 'node:crypto';
import type { AspectRatio, MediaKind } from './types.js';

export type TimelineTrackKind='video'|'overlay'|'voice'|'music'|'sfx'|'captions';

export interface TimelineAudioMasterSettings {
  targetLufs?:number;
  truePeakDb?:number;
  lra?:number;
  dialogueDucking?:boolean;
  duckThreshold?:number;
  duckRatio?:number;
  attackMs?:number;
  releaseMs?:number;
  sampleRate?:number;
}

export interface TimelineAsset {
  id:string;
  path:string;
  digest:string;
  kind:MediaKind|'captions';
  sourceRefs:string[];
  evidenceState?:'observed'|'public_source'|'licensed'|'modeled'|'inferred'|'synthetic_visualization';
  continuityDigest?:string;
}

export interface TimelineClip {
  id:string;
  trackId:string;
  assetId:string;
  startSec:number;
  durationSec:number;
  trimStartSec?:number;
  locked?:boolean;
  opacity?:number;
  volume?:number;
  x?:number;
  y?:number;
  scale?:number;
  rotationDeg?:number;
  label?:string;
}

export interface TimelineTrack {
  id:string;
  kind:TimelineTrackKind;
  name:string;
  locked?:boolean;
  clips:TimelineClip[];
}

export interface FallenTimelineProject {
  schema:'evercraft.fallen.timeline.v1';
  id:string;
  title:string;
  aspectRatio:AspectRatio;
  fps:number;
  version:number;
  assets:TimelineAsset[];
  tracks:TimelineTrack[];
  audioMaster?:TimelineAudioMasterSettings;
  createdAt:string;
  updatedAt:string;
}

export interface TimelineMutationReceipt {
  schema:'evercraft.fallen.timeline-mutation-receipt.v1';
  projectId:string;
  fromVersion:number;
  toVersion:number;
  operation:'replace_clip_asset'|'move_clip'|'trim_clip';
  clipId:string;
  previousProjectDigest:string;
  projectDigest:string;
  previousAssetDigest?:string;
  newAssetDigest?:string;
  preserved:{
    clipIdentity:boolean;
    startTime:boolean;
    duration:boolean;
    downstreamClipTiming:boolean;
  };
  publicationAuthorityGranted:false;
  mutatedAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>[key,stable(item)]));
  }
  return value;
}

export function timelineDigest(project:FallenTimelineProject){
  return crypto.createHash('sha256').update(JSON.stringify(stable({
    ...project,createdAt:undefined,updatedAt:undefined
  }))).digest('hex');
}

function clone(project:FallenTimelineProject):FallenTimelineProject{
  return JSON.parse(JSON.stringify(project)) as FallenTimelineProject;
}

function assertProject(project:FallenTimelineProject){
  if(project.schema!=='evercraft.fallen.timeline.v1') throw new Error('timeline_schema_invalid');
  if(!project.id?.trim()) throw new Error('timeline_id_missing');
  if(!Number.isFinite(project.fps)||project.fps<=0||project.fps>120) throw new Error('timeline_fps_invalid');
  const assetIds=new Set(project.assets.map(asset=>asset.id));
  if(assetIds.size!==project.assets.length) throw new Error('timeline_duplicate_asset_id');
  const clipIds=new Set<string>();
  for(const track of project.tracks){
    for(const clip of track.clips){
      if(clipIds.has(clip.id)) throw new Error('timeline_duplicate_clip_id');
      clipIds.add(clip.id);
      if(clip.trackId!==track.id) throw new Error(`timeline_clip_track_mismatch:${clip.id}`);
      if(!assetIds.has(clip.assetId)) throw new Error(`timeline_asset_missing:${clip.assetId}`);
      if(clip.startSec<0||clip.durationSec<=0) throw new Error(`timeline_clip_timing_invalid:${clip.id}`);
    }
  }
}

function clipLocation(project:FallenTimelineProject,clipId:string){
  for(const track of project.tracks){
    const index=track.clips.findIndex(clip=>clip.id===clipId);
    if(index>=0) return {track,index,clip:track.clips[index]};
  }
  throw new Error(`timeline_clip_missing:${clipId}`);
}

function asset(project:FallenTimelineProject,assetId:string){
  const found=project.assets.find(item=>item.id===assetId);
  if(!found) throw new Error(`timeline_asset_missing:${assetId}`);
  return found;
}

function finalizeMutation(
  before:FallenTimelineProject,
  after:FallenTimelineProject,
  operation:TimelineMutationReceipt['operation'],
  clipId:string,
  previousAssetDigest?:string,
  newAssetDigest?:string,
  preserved:TimelineMutationReceipt['preserved']={
    clipIdentity:true,startTime:true,duration:true,downstreamClipTiming:true
  }
){
  after.version=before.version+1;
  after.updatedAt=new Date().toISOString();
  assertProject(after);
  const receipt:TimelineMutationReceipt={
    schema:'evercraft.fallen.timeline-mutation-receipt.v1',
    projectId:after.id,
    fromVersion:before.version,
    toVersion:after.version,
    operation,
    clipId,
    previousProjectDigest:timelineDigest(before),
    projectDigest:timelineDigest(after),
    previousAssetDigest,
    newAssetDigest,
    preserved,
    publicationAuthorityGranted:false,
    mutatedAt:after.updatedAt,
  };
  return {project:after,receipt};
}

export function replaceTimelineClipAsset(input:{
  project:FallenTimelineProject;
  clipId:string;
  newAsset:TimelineAsset;
  expectedVersion:number;
  preserveDuration?:boolean;
}){
  assertProject(input.project);
  if(input.project.version!==input.expectedVersion) throw new Error('timeline_version_conflict');
  if(!input.newAsset.sourceRefs?.length) throw new Error('timeline_new_asset_source_refs_missing');

  const before=clone(input.project);
  const after=clone(input.project);
  const located=clipLocation(after,input.clipId);
  if(located.track.locked||located.clip.locked) throw new Error('timeline_clip_locked');

  const previous=asset(after,located.clip.assetId);
  const existingIndex=after.assets.findIndex(item=>item.id===input.newAsset.id);
  if(existingIndex>=0) after.assets[existingIndex]=input.newAsset;
  else after.assets.push(input.newAsset);

  const start=located.clip.startSec;
  const duration=located.clip.durationSec;
  located.clip.assetId=input.newAsset.id;
  if(input.preserveDuration!==false){
    located.clip.startSec=start;
    located.clip.durationSec=duration;
  }

  return finalizeMutation(
    before,after,'replace_clip_asset',input.clipId,
    previous.digest,input.newAsset.digest,
    {
      clipIdentity:true,
      startTime:located.clip.startSec===start,
      duration:located.clip.durationSec===duration,
      downstreamClipTiming:true,
    }
  );
}

export function moveTimelineClip(input:{
  project:FallenTimelineProject;
  clipId:string;
  startSec:number;
  expectedVersion:number;
}){
  assertProject(input.project);
  if(input.project.version!==input.expectedVersion) throw new Error('timeline_version_conflict');
  if(!Number.isFinite(input.startSec)||input.startSec<0) throw new Error('timeline_move_invalid');

  const before=clone(input.project);
  const after=clone(input.project);
  const located=clipLocation(after,input.clipId);
  if(located.track.locked||located.clip.locked) throw new Error('timeline_clip_locked');
  const oldStart=located.clip.startSec;
  located.clip.startSec=input.startSec;

  return finalizeMutation(before,after,'move_clip',input.clipId,undefined,undefined,{
    clipIdentity:true,
    startTime:oldStart===input.startSec,
    duration:true,
    downstreamClipTiming:true,
  });
}

export function trimTimelineClip(input:{
  project:FallenTimelineProject;
  clipId:string;
  durationSec:number;
  trimStartSec?:number;
  expectedVersion:number;
}){
  assertProject(input.project);
  if(input.project.version!==input.expectedVersion) throw new Error('timeline_version_conflict');
  if(!Number.isFinite(input.durationSec)||input.durationSec<=0) throw new Error('timeline_trim_duration_invalid');
  if(input.trimStartSec!==undefined&&(!Number.isFinite(input.trimStartSec)||input.trimStartSec<0)){
    throw new Error('timeline_trim_start_invalid');
  }

  const before=clone(input.project);
  const after=clone(input.project);
  const located=clipLocation(after,input.clipId);
  if(located.track.locked||located.clip.locked) throw new Error('timeline_clip_locked');
  const oldStart=located.clip.startSec;
  const oldDuration=located.clip.durationSec;
  located.clip.durationSec=input.durationSec;
  if(input.trimStartSec!==undefined) located.clip.trimStartSec=input.trimStartSec;

  return finalizeMutation(before,after,'trim_clip',input.clipId,undefined,undefined,{
    clipIdentity:true,
    startTime:located.clip.startSec===oldStart,
    duration:located.clip.durationSec===oldDuration,
    downstreamClipTiming:true,
  });
}

export function makeTimelineProject(input:{
  id:string;
  title:string;
  aspectRatio:AspectRatio;
  fps?:number;
  assets?:TimelineAsset[];
  tracks?:TimelineTrack[];
  audioMaster?:TimelineAudioMasterSettings;
}):FallenTimelineProject{
  const now=new Date().toISOString();
  const project:FallenTimelineProject={
    schema:'evercraft.fallen.timeline.v1',
    id:input.id,
    title:input.title,
    aspectRatio:input.aspectRatio,
    fps:input.fps??30,
    version:1,
    assets:input.assets??[],
    tracks:input.tracks??[],
    audioMaster:input.audioMaster,
    createdAt:now,
    updatedAt:now,
  };
  assertProject(project);
  return project;
}
