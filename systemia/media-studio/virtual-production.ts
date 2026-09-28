import {
  EVERCRAFT_STUDIO_WORLD_V1,
  compileStudioRoomStage,
  studioWorldDigest,
  transitionBetween,
  type StudioDisplayContent,
  type StudioRoomId,
  type StudioTransition,
} from './studio-world.js';
import type {
  CameraKeyframe,
  MediaLayer,
  NumericKeyframe,
  VisualLayer,
  VisualStage,
} from './visual-stage.js';
import { EVERCRAFT_VISUAL_THEME_V1 } from './visual-theme.js';

export type VirtualProductionCameraMode =
  | 'follow_host'
  | 'screen_push'
  | 'wide_reveal';

export interface VirtualProductionHost {
  id:string;
  assetId:string;
  mediaKind:'image'|'video';
  evidenceState:'observed'|'licensed';
  sourceRefs:string[];
  identityEvidenceRefs:string[];
  widthPct?:number;
  heightPct?:number;
  yPct?:number;
  playbackRate?:number;
  trimStartSec?:number;
  loop?:boolean;
}

export interface VirtualProductionBeat {
  id:string;
  roomId:StudioRoomId;
  headline:string;
  subhead?:string;
  durationSec:number;
  contents:StudioDisplayContent[];
  cameraMode?:VirtualProductionCameraMode;
  focusSlotId?:string;
  hostEntryXPct?:number;
  hostExitXPct?:number;
  hostScale?:number;
}

export interface VirtualProductionEpisode {
  schema:'evercraft.fallen.virtual-production.v1';
  id:string;
  aspectRatio?:'16:9'|'9:16';
  host:VirtualProductionHost;
  beats:VirtualProductionBeat[];
}

export interface VirtualProductionBeatWindow {
  beatId:string;
  roomId:StudioRoomId;
  roomOffsetX:number;
  startSec:number;
  endSec:number;
  transitionIn:StudioTransition|null;
  cameraMode:VirtualProductionCameraMode;
  focusSlotId?:string;
}

export interface VirtualProductionPlan {
  schema:'evercraft.fallen.virtual-production-plan.v1';
  id:string;
  worldId:string;
  worldDigest:string;
  stage:VisualStage;
  beatWindows:VirtualProductionBeatWindow[];
  hostTrack:Array<{t:number;x:number;y:number;scale:number;roomId:StudioRoomId}>;
  boundaries:{
    continuousWorldSpace:true;
    hostIdentityEvidenceRequired:true;
    syntheticHostIdentityForbidden:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

function dimensions(aspect:'16:9'|'9:16'='16:9'){
  return aspect==='9:16'?{width:1080,height:1920}:{width:1920,height:1080};
}

function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

function roomById(roomId:StudioRoomId){
  const room=EVERCRAFT_STUDIO_WORLD_V1.rooms.find(item=>item.id===roomId);
  if(!room) throw new Error(`virtual_production_room_missing:${roomId}`);
  return room;
}

function slotCenter(roomId:StudioRoomId,slotId:string,width:number,height:number){
  const room=roomById(roomId);
  const slot=room.displaySlots.find(item=>item.id===slotId);
  if(!slot) throw new Error(`virtual_production_focus_slot_missing:${roomId}:${slotId}`);
  return {
    x:(slot.rect.x+slot.rect.width/2)*width,
    y:(slot.rect.y+slot.rect.height/2)*height,
  };
}

function shiftNumeric(
  input:number|NumericKeyframe[]|undefined,
  timeOffset:number,
):number|NumericKeyframe[]|undefined{
  if(input===undefined||typeof input==='number') return input;
  return input.map(frame=>({...frame,t:frame.t+timeOffset}));
}

function withPrefixAndOffset(
  layer:VisualLayer,
  prefix:string,
  offsetX:number,
  roomIndex:number,
  timeOffset:number,
):VisualLayer{
  const next={
    ...layer,
    id:`${prefix}-${layer.id}`,
    x:layer.x+offsetX,
    z:layer.z+(roomIndex*30),
    opacity:shiftNumeric(layer.opacity,timeOffset),
    scale:shiftNumeric(layer.scale,timeOffset),
    rotationDeg:shiftNumeric(layer.rotationDeg,timeOffset),
    rotateXDeg:shiftNumeric(layer.rotateXDeg,timeOffset),
    rotateYDeg:shiftNumeric(layer.rotateYDeg,timeOffset),
    translateX:shiftNumeric(layer.translateX,timeOffset),
    translateY:shiftNumeric(layer.translateY,timeOffset),
  } as VisualLayer;

  if(next.kind==='metric'){
    next.progress=shiftNumeric(next.progress,timeOffset);
  }
  if(next.kind==='geo'){
    next.routes=(next.routes??[]).map(route=>({
      ...route,
      progress:shiftNumeric(route.progress,timeOffset),
    }));
  }
  if(next.kind==='timeline'){
    next.playhead=shiftNumeric(next.playhead,timeOffset);
  }

  // The room is now part of one continuous stage. Room-local animation is
  // shifted onto the episode clock, while the stage camera owns travel.
  return next;
}

function pushCameraKeyframe(frames:CameraKeyframe[],frame:CameraKeyframe){
  const existing=frames.findIndex(item=>Math.abs(item.t-frame.t)<0.0001);
  if(existing>=0) frames[existing]=frame;
  else frames.push(frame);
}

function pushNumericKeyframe(frames:NumericKeyframe[],frame:NumericKeyframe){
  const existing=frames.findIndex(item=>Math.abs(item.t-frame.t)<0.0001);
  if(existing>=0) frames[existing]=frame;
  else frames.push(frame);
}

function validateEpisode(input:VirtualProductionEpisode){
  if(input.schema!=='evercraft.fallen.virtual-production.v1') throw new Error('virtual_production_schema_invalid');
  if(!input.id?.trim()) throw new Error('virtual_production_id_missing');
  if(!input.beats?.length) throw new Error('virtual_production_beats_missing');
  if(!input.host?.id?.trim()) throw new Error('virtual_production_host_id_missing');
  if(!input.host?.assetId?.trim()) throw new Error('virtual_production_host_asset_missing');
  if(!input.host?.sourceRefs?.length) throw new Error('virtual_production_host_source_refs_missing');
  if(!input.host?.identityEvidenceRefs?.length) throw new Error('virtual_production_host_identity_evidence_missing');
  if(!['observed','licensed'].includes(input.host.evidenceState)){
    throw new Error('virtual_production_host_evidence_state_invalid');
  }

  for(const beat of input.beats){
    if(!beat.id?.trim()) throw new Error('virtual_production_beat_id_missing');
    if(!Number.isFinite(beat.durationSec)||beat.durationSec<2){
      throw new Error(`virtual_production_beat_duration_invalid:${beat.id}`);
    }
    roomById(beat.roomId);
    if(beat.focusSlotId) slotCenter(beat.roomId,beat.focusSlotId,100,100);
  }
}

export function compileVirtualProductionEpisode(
  input:VirtualProductionEpisode,
):VirtualProductionPlan{
  validateEpisode(input);
  const aspect=input.aspectRatio??'16:9';
  const {width,height}=dimensions(aspect);
  const roomPitch=width;
  const layers:VisualLayer[]=[];
  const cameraFrames:CameraKeyframe[]=[];
  const hostX:NumericKeyframe[]=[];
  const hostY:NumericKeyframe[]=[];
  const hostScale:NumericKeyframe[]=[];
  const hostTrack:VirtualProductionPlan['hostTrack']=[];
  const beatWindows:VirtualProductionBeatWindow[]=[];

  const hostWidth=Math.round(width*clamp(input.host.widthPct??.24,.08,.6));
  const hostHeight=Math.round(height*clamp(input.host.heightPct??.78,.2,1.2));
  const hostBaseY=Math.round(height*clamp(input.host.yPct??.16,-.2,.8));

  let cursor=0;

  input.beats.forEach((beat,index)=>{
    const transition=index===0
      ? null
      : transitionBetween(
          EVERCRAFT_STUDIO_WORLD_V1,
          input.beats[index-1].roomId,
          beat.roomId,
        );

    if(transition) cursor+=transition.durationSec;
    const startSec=cursor;
    const endSec=startSec+beat.durationSec;
    const offsetX=index*roomPitch;
    const cameraMode=beat.cameraMode??'follow_host';
    const entryPct=clamp(beat.hostEntryXPct??.4,.15,.75);
    const exitPct=clamp(beat.hostExitXPct??.62,.25,.88);
    const scale=clamp(beat.hostScale??1,.55,1.6);

    const roomStage=compileStudioRoomStage({
      id:`${input.id}-${beat.id}`,
      roomId:beat.roomId,
      headline:beat.headline,
      subhead:beat.subhead,
      durationSec:beat.durationSec,
      aspectRatio:aspect,
      contents:beat.contents,
    });

    for(const layer of roomStage.layers){
      layers.push(withPrefixAndOffset(layer,`${index}-${beat.id}`,offsetX,index,startSec));
    }

    const hostEntryX=offsetX+(entryPct*width)-(hostWidth/2);
    const hostExitX=offsetX+(exitPct*width)-(hostWidth/2);
    pushNumericKeyframe(hostX,{t:startSec,value:hostEntryX,ease:'ease_in_out'});
    pushNumericKeyframe(hostX,{t:endSec,value:hostExitX,ease:'ease_in_out'});
    pushNumericKeyframe(hostY,{t:startSec,value:hostBaseY,ease:'ease_in_out'});
    pushNumericKeyframe(hostY,{t:endSec,value:hostBaseY,ease:'ease_in_out'});
    pushNumericKeyframe(hostScale,{t:startSec,value:scale,ease:'ease_in_out'});
    pushNumericKeyframe(hostScale,{t:endSec,value:scale,ease:'ease_in_out'});

    hostTrack.push(
      {t:startSec,x:hostEntryX,y:hostBaseY,scale,roomId:beat.roomId},
      {t:endSec,x:hostExitX,y:hostBaseY,scale,roomId:beat.roomId},
    );

    const entryCameraX=offsetX+(entryPct-.5)*width;
    const exitCameraX=offsetX+(exitPct-.5)*width;

    if(cameraMode==='wide_reveal'){
      pushCameraKeyframe(cameraFrames,{
        t:startSec,x:offsetX,y:0,zoom:.94,rotationDeg:0,ease:'ease_in_out'
      });
      pushCameraKeyframe(cameraFrames,{
        t:startSec+beat.durationSec*.68,x:exitCameraX,y:0,zoom:1.025,rotationDeg:0,ease:'ease_in_out'
      });
      pushCameraKeyframe(cameraFrames,{
        t:endSec,x:exitCameraX,y:0,zoom:1.01,rotationDeg:0,ease:'ease_in_out'
      });
    } else if(cameraMode==='screen_push'){
      if(!beat.focusSlotId) throw new Error(`virtual_production_screen_push_focus_missing:${beat.id}`);
      const focus=slotCenter(beat.roomId,beat.focusSlotId,width,height);
      const focusCameraX=offsetX+focus.x-(width/2);
      const focusCameraY=focus.y-(height/2);
      pushCameraKeyframe(cameraFrames,{
        t:startSec,x:entryCameraX,y:0,zoom:1.01,rotationDeg:0,ease:'ease_in_out'
      });
      pushCameraKeyframe(cameraFrames,{
        t:startSec+beat.durationSec*.52,
        x:focusCameraX,y:focusCameraY*.32,zoom:1.16,rotationDeg:0,ease:'ease_in_out'
      });
      pushCameraKeyframe(cameraFrames,{
        t:startSec+beat.durationSec*.82,
        x:focusCameraX,y:focusCameraY*.2,zoom:1.12,rotationDeg:0,ease:'ease_in_out'
      });
      pushCameraKeyframe(cameraFrames,{
        t:endSec,x:exitCameraX,y:0,zoom:1.025,rotationDeg:0,ease:'ease_in_out'
      });
    } else {
      pushCameraKeyframe(cameraFrames,{
        t:startSec,x:entryCameraX,y:0,zoom:1.02,rotationDeg:0,ease:'ease_in_out'
      });
      pushCameraKeyframe(cameraFrames,{
        t:startSec+beat.durationSec*.55,
        x:(entryCameraX+exitCameraX)/2,y:0,zoom:1.055,rotationDeg:0,ease:'ease_in_out'
      });
      pushCameraKeyframe(cameraFrames,{
        t:endSec,x:exitCameraX,y:0,zoom:1.035,rotationDeg:0,ease:'ease_in_out'
      });
    }

    beatWindows.push({
      beatId:beat.id,
      roomId:beat.roomId,
      roomOffsetX:offsetX,
      startSec,
      endSec,
      transitionIn:transition,
      cameraMode,
      focusSlotId:beat.focusSlotId,
    });

    cursor=endSec;
  });

  const hostLayer:MediaLayer={
    id:`virtual-host-${input.host.id}`,
    kind:'media',
    z:999,
    x:0,
    y:0,
    width:hostWidth,
    height:hostHeight,
    sourcePath:`asset://${input.host.assetId}`,
    mediaKind:input.host.mediaKind,
    fit:'contain',
    trimStartSec:input.host.trimStartSec,
    playbackRate:input.host.playbackRate??1,
    loop:input.host.loop??true,
    translateX:hostX,
    translateY:hostY,
    scale:hostScale,
    parallax:1.08,
    evidenceState:input.host.evidenceState,
    sourceRefs:[...input.host.sourceRefs,...input.host.identityEvidenceRefs],
  };
  layers.push(hostLayer);

  const stage:VisualStage={
    schema:'evercraft.fallen.visual-stage.v1',
    id:`${input.id}-continuous-master`,
    width,
    height,
    fps:30,
    durationSec:cursor,
    background:EVERCRAFT_VISUAL_THEME_V1.palette.background,
    theme:EVERCRAFT_VISUAL_THEME_V1,
    camera:{
      keyframes:cameraFrames.sort((a,b)=>a.t-b.t)
    },
    layers,
    createdAt:new Date().toISOString(),
  };

  return {
    schema:'evercraft.fallen.virtual-production-plan.v1',
    id:input.id,
    worldId:EVERCRAFT_STUDIO_WORLD_V1.id,
    worldDigest:studioWorldDigest(EVERCRAFT_STUDIO_WORLD_V1),
    stage,
    beatWindows,
    hostTrack,
    boundaries:{
      continuousWorldSpace:true,
      hostIdentityEvidenceRequired:true,
      syntheticHostIdentityForbidden:true,
      publicationAuthorityGranted:false,
    },
    createdAt:new Date().toISOString(),
  };
}
