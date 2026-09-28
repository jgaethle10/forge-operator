import crypto from 'node:crypto';
import type {
  EvidenceState,
  GeoPoint,
  GeoRoute,
  TimelineEvent,
  VisualLayer,
  VisualStage,
} from './visual-stage.js';
import { EVERCRAFT_VISUAL_THEME_V1 } from './visual-theme.js';

export type StudioRoomId =
  | 'lobby'
  | 'global_ops'
  | 'product_gallery'
  | 'research_lab'
  | 'field_bay'
  | 'proof_room'
  | 'observation_deck';

export type StudioTransitionStyle =
  | 'dolly_through_portal'
  | 'match_display'
  | 'corridor_dolly'
  | 'service_elevator'
  | 'evidence_match_cut'
  | 'lift_and_reveal';

export interface NormalizedRect {
  x:number;
  y:number;
  width:number;
  height:number;
}

export interface StudioDisplaySlot {
  id:string;
  rect:NormalizedRect;
  z:number;
  rotateXDeg?:number;
  rotateYDeg?:number;
  parallax?:number;
  purpose:string[];
}

export interface StudioCameraAnchor {
  id:string;
  x:number;
  y:number;
  zoom:number;
  rotationDeg?:number;
}

export interface StudioRoom {
  id:StudioRoomId;
  label:string;
  setPlateAssetId:string;
  cameraAnchors:StudioCameraAnchor[];
  defaultAnchorId:string;
  pushAnchorId?:string;
  displaySlots:StudioDisplaySlot[];
}

export interface StudioTransition {
  from:StudioRoomId;
  to:StudioRoomId;
  style:StudioTransitionStyle;
  durationSec:number;
}

export interface StudioWorld {
  schema:'evercraft.fallen.studio-world.v1';
  id:string;
  version:number;
  rooms:StudioRoom[];
  transitions:StudioTransition[];
  createdAt:string;
}

export type StudioDisplayContent =
  | {
      slotId:string;
      kind:'media';
      assetId:string;
      mediaKind:'image'|'video';
      fit?:'cover'|'contain';
      evidenceState?:EvidenceState;
      sourceRefs?:string[];
      trimStartSec?:number;
      playbackRate?:number;
    }
  | {
      slotId:string;
      kind:'geo';
      projection?:'equirectangular'|'mercator';
      centerLat?:number;
      centerLon?:number;
      zoom?:number;
      grid?:boolean;
      points?:GeoPoint[];
      routes?:GeoRoute[];
      evidenceState?:EvidenceState;
      sourceRefs?:string[];
    }
  | {
      slotId:string;
      kind:'metric';
      label:string;
      value:number;
      unit?:string;
      decimals?:number;
      evidenceState?:EvidenceState;
      sourceRefs?:string[];
    }
  | {
      slotId:string;
      kind:'timeline';
      startSec:number;
      endSec:number;
      events:TimelineEvent[];
      evidenceState?:EvidenceState;
      sourceRefs?:string[];
    }
  | {
      slotId:string;
      kind:'text';
      text:string;
      fontSize?:number;
      fontWeight?:number;
      evidenceState?:EvidenceState;
      sourceRefs?:string[];
    };

export interface StudioRoomStageInput {
  id:string;
  roomId:StudioRoomId;
  headline:string;
  subhead?:string;
  durationSec?:number;
  aspectRatio?:'16:9'|'9:16';
  contents:StudioDisplayContent[];
}

export interface StudioJourneyStop extends StudioRoomStageInput {
  transitionFromPrevious?:StudioTransitionStyle;
}

export interface StudioJourney {
  schema:'evercraft.fallen.studio-journey.v1';
  id:string;
  worldId:string;
  worldDigest:string;
  stages:Array<{
    roomId:StudioRoomId;
    transitionIn:StudioTransition|null;
    stage:VisualStage;
  }>;
  createdAt:string;
}

function room(
  id:StudioRoomId,
  label:string,
  setPlateAssetId:string,
  displaySlots:StudioDisplaySlot[],
  anchors:StudioCameraAnchor[]=[
    {id:'wide',x:0,y:0,zoom:1},
    {id:'push',x:.018,y:.008,zoom:1.055},
  ],
):StudioRoom{
  return {
    id,label,setPlateAssetId,
    cameraAnchors:anchors,
    defaultAnchorId:'wide',
    pushAnchorId:'push',
    displaySlots
  };
}

export const EVERCRAFT_STUDIO_WORLD_V1:StudioWorld={
  schema:'evercraft.fallen.studio-world.v1',
  id:'evercraft-hq-v1',
  version:1,
  rooms:[
    room('lobby','EVERCRAFT HQ','evercraft-hq-lobby-v1',[
      {id:'welcome-wall',rect:{x:.18,y:.19,width:.64,height:.5},z:3,parallax:1.03,purpose:['week_open','company_identity','hero_reel']},
      {id:'week-strip',rect:{x:.12,y:.76,width:.76,height:.1},z:5,parallax:1.12,purpose:['week_metrics','episode_title']}
    ]),
    room('global_ops','GLOBAL OPERATIONS','evercraft-hq-global-ops-v1',[
      {id:'subject-wall',rect:{x:.045,y:.2,width:.37,height:.56},z:3,rotateYDeg:-4,parallax:.94,purpose:['real_media','ships','aircraft','weather','infrastructure']},
      {id:'world-wall',rect:{x:.46,y:.13,width:.49,height:.64},z:4,rotateYDeg:4,parallax:1.07,purpose:['map','routes','tracks','world_data']},
      {id:'ops-strip',rect:{x:.07,y:.82,width:.86,height:.11},z:7,parallax:1.15,purpose:['timeline','metrics','source_state']}
    ]),
    room('product_gallery','PRODUCT GALLERY','evercraft-hq-product-gallery-v1',[
      {id:'hero-product',rect:{x:.08,y:.18,width:.56,height:.62},z:3,rotateYDeg:-3,parallax:.97,purpose:['product_capture','workflow','demo']},
      {id:'proof-panel',rect:{x:.68,y:.24,width:.26,height:.45},z:5,rotateYDeg:4,parallax:1.08,purpose:['report','results','metrics']},
      {id:'product-strip',rect:{x:.12,y:.82,width:.76,height:.1},z:7,parallax:1.15,purpose:['cta','product_summary']}
    ]),
    room('research_lab','RESEARCH LAB','evercraft-hq-research-lab-v1',[
      {id:'evidence-wall',rect:{x:.08,y:.16,width:.47,height:.58},z:3,rotateYDeg:-3,parallax:.95,purpose:['source_media','papers','evidence','timeline']},
      {id:'model-table',rect:{x:.58,y:.29,width:.34,height:.42},z:5,rotateXDeg:4,rotateYDeg:4,parallax:1.1,purpose:['models','science','simulation','data']},
      {id:'lab-strip',rect:{x:.1,y:.8,width:.8,height:.11},z:7,parallax:1.16,purpose:['findings','uncertainty','metrics']}
    ]),
    room('field_bay','FIELD BAY','evercraft-hq-field-bay-v1',[
      {id:'field-feed',rect:{x:.06,y:.18,width:.54,height:.58},z:3,rotateYDeg:-3,parallax:.94,purpose:['field_video','eps','drones','robotics','missions']},
      {id:'telemetry-wall',rect:{x:.63,y:.2,width:.31,height:.52},z:5,rotateYDeg:4,parallax:1.08,purpose:['map','telemetry','status','metrics']},
      {id:'field-strip',rect:{x:.08,y:.81,width:.84,height:.1},z:7,parallax:1.15,purpose:['mission_state','location','receipt']}
    ]),
    room('proof_room','PROOF ROOM','evercraft-hq-proof-room-v1',[
      {id:'receipt-wall',rect:{x:.09,y:.16,width:.5,height:.61},z:3,rotateYDeg:-3,parallax:.96,purpose:['receipts','screenshots','source_docs','tests']},
      {id:'verification-panel',rect:{x:.63,y:.21,width:.29,height:.5},z:5,rotateYDeg:4,parallax:1.08,purpose:['status','provenance','quality','admission']},
      {id:'proof-timeline',rect:{x:.1,y:.82,width:.8,height:.1},z:7,parallax:1.15,purpose:['timeline','build_history']}
    ]),
    room('observation_deck','OBSERVATION DECK','evercraft-hq-observation-deck-v1',[
      {id:'horizon-wall',rect:{x:.07,y:.16,width:.86,height:.58},z:3,parallax:.98,purpose:['week_summary','world_view','next_frontier']},
      {id:'next-motion',rect:{x:.16,y:.79,width:.68,height:.12},z:7,parallax:1.15,purpose:['next_week','closing','cta']}
    ])
  ],
  transitions:[
    {from:'lobby',to:'global_ops',style:'dolly_through_portal',durationSec:1.2},
    {from:'global_ops',to:'product_gallery',style:'match_display',durationSec:.9},
    {from:'product_gallery',to:'research_lab',style:'corridor_dolly',durationSec:1.1},
    {from:'research_lab',to:'field_bay',style:'service_elevator',durationSec:1.1},
    {from:'field_bay',to:'proof_room',style:'evidence_match_cut',durationSec:.75},
    {from:'proof_room',to:'observation_deck',style:'lift_and_reveal',durationSec:1.35}
  ],
  createdAt:'2026-09-27T00:00:00.000Z'
};

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([key])=>key!=='createdAt')
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

export function studioWorldDigest(world:StudioWorld){
  return crypto.createHash('sha256').update(JSON.stringify(stable(world))).digest('hex');
}

function dimensions(aspect:'16:9'|'9:16'='16:9'){
  return aspect==='9:16'?{width:1080,height:1920}:{width:1920,height:1080};
}

function px(rect:NormalizedRect,width:number,height:number){
  return {
    x:Math.round(rect.x*width),
    y:Math.round(rect.y*height),
    width:Math.round(rect.width*width),
    height:Math.round(rect.height*height)
  };
}

function getRoom(world:StudioWorld,id:StudioRoomId){
  const found=world.rooms.find(item=>item.id===id);
  if(!found) throw new Error(`studio_room_missing:${id}`);
  return found;
}

function getSlot(room:StudioRoom,id:string){
  const found=room.displaySlots.find(item=>item.id===id);
  if(!found) throw new Error(`studio_slot_missing:${room.id}:${id}`);
  return found;
}

function sourceState(content:StudioDisplayContent){
  return {
    evidenceState:content.evidenceState,
    sourceRefs:content.sourceRefs
  };
}

function layerForContent(
  content:StudioDisplayContent,
  slot:StudioDisplaySlot,
  width:number,
  height:number,
  durationSec:number,
  index:number,
):VisualLayer{
  const rect=px(slot.rect,width,height);
  const common={
    id:`studio-content-${index}-${slot.id}`,
    z:slot.z,
    ...rect,
    parallax:slot.parallax??1.05,
    rotateXDeg:slot.rotateXDeg,
    rotateYDeg:slot.rotateYDeg,
    opacity:[
      {t:Math.min(durationSec*.15,.6)+index*.04,value:0},
      {t:Math.min(durationSec*.28,1.3)+index*.05,value:1,ease:'ease_out' as const}
    ],
    ...sourceState(content)
  };

  if(content.kind==='media'){
    return {
      ...common,
      kind:'media',
      sourcePath:`asset://${content.assetId}`,
      mediaKind:content.mediaKind,
      fit:content.fit??'cover',
      trimStartSec:content.trimStartSec,
      playbackRate:content.playbackRate
    };
  }
  if(content.kind==='geo'){
    return {
      ...common,
      kind:'geo',
      projection:content.projection??'mercator',
      centerLat:content.centerLat??0,
      centerLon:content.centerLon??0,
      zoom:content.zoom??1,
      grid:content.grid??true,
      points:content.points,
      routes:(content.routes??[]).map(route=>({
        ...route,
        progress:route.progress??[
          {t:durationSec*.28,value:0},
          {t:durationSec*.82,value:1,ease:'ease_in_out'}
        ]
      }))
    };
  }
  if(content.kind==='metric'){
    return {
      ...common,
      kind:'metric',
      label:content.label,
      from:0,
      to:content.value,
      unit:content.unit,
      decimals:content.decimals??0,
      progress:[
        {t:durationSec*.25,value:0},
        {t:durationSec*.58,value:1,ease:'ease_out'}
      ]
    };
  }
  if(content.kind==='timeline'){
    return {
      ...common,
      kind:'timeline',
      startSec:content.startSec,
      endSec:content.endSec,
      events:content.events,
      playhead:[
        {t:durationSec*.25,value:0},
        {t:durationSec*.9,value:1,ease:'linear'}
      ]
    };
  }
  return {
    ...common,
    kind:'text',
    text:content.text,
    fontSize:content.fontSize??Math.round(Math.min(rect.width,rect.height)*.09),
    fontWeight:content.fontWeight??600
  };
}

function anchor(room:StudioRoom,id:string|undefined){
  const target=id??room.defaultAnchorId;
  const found=room.cameraAnchors.find(item=>item.id===target);
  if(!found) throw new Error(`studio_camera_anchor_missing:${room.id}:${target}`);
  return found;
}

export function compileStudioRoomStage(
  input:StudioRoomStageInput,
  world:StudioWorld=EVERCRAFT_STUDIO_WORLD_V1,
):VisualStage{
  const roomDef=getRoom(world,input.roomId);
  const durationSec=Math.max(4,Math.min(120,input.durationSec??12));
  const {width,height}=dimensions(input.aspectRatio);
  const start=anchor(roomDef,roomDef.defaultAnchorId);
  const push=anchor(roomDef,roomDef.pushAnchorId??roomDef.defaultAnchorId);
  const contentLayers=input.contents.map((content,index)=>{
    const slot=getSlot(roomDef,content.slotId);
    return layerForContent(content,slot,width,height,durationSec,index);
  });

  const layers:VisualLayer[]=[
    {
      id:'studio-set-plate',
      kind:'media',
      z:0,
      x:0,y:0,width,height,
      sourcePath:`asset://${roomDef.setPlateAssetId}`,
      mediaKind:'image',
      fit:'cover',
      parallax:.52,
      scale:[
        {t:0,value:1.025},
        {t:durationSec,value:1.075,ease:'ease_in_out'}
      ]
    },
    ...contentLayers,
    {
      id:'studio-room-label',
      kind:'text',
      z:20,
      x:Math.round(width*.045),
      y:Math.round(height*.045),
      width:Math.round(width*.38),
      height:Math.round(height*.05),
      text:`EVERCRAFT // ${roomDef.label}`,
      fontSize:Math.round(height*.018),
      fontWeight:700,
      letterSpacing:2,
      opacity:[{t:0,value:0},{t:.35,value:.78,ease:'ease_out'}],
      parallax:1.25
    },
    {
      id:'studio-headline',
      kind:'text',
      z:21,
      x:Math.round(width*.045),
      y:Math.round(height*.095),
      width:Math.round(width*.78),
      height:Math.round(height*.09),
      text:input.headline,
      fontSize:Math.round(height*(input.aspectRatio==='9:16'?.035:.046)),
      fontWeight:700,
      letterSpacing:.5,
      translateY:[{t:0,value:18},{t:.55,value:0,ease:'ease_out'}],
      opacity:[{t:0,value:0},{t:.35,value:1,ease:'ease_out'}],
      parallax:1.24
    }
  ];

  if(input.subhead){
    layers.push({
      id:'studio-subhead',
      kind:'text',
      z:21,
      x:Math.round(width*.048),
      y:Math.round(height*.17),
      width:Math.round(width*.68),
      height:Math.round(height*.05),
      text:input.subhead,
      fontSize:Math.round(height*(input.aspectRatio==='9:16'?.014:.021)),
      fontWeight:500,
      opacity:[{t:.25,value:0},{t:.8,value:.8,ease:'ease_out'}],
      parallax:1.22
    });
  }

  return {
    schema:'evercraft.fallen.visual-stage.v1',
    id:input.id,
    width,height,fps:30,durationSec,
    background:EVERCRAFT_VISUAL_THEME_V1.palette.background,
    theme:EVERCRAFT_VISUAL_THEME_V1,
    camera:{
      keyframes:[
        {t:0,x:start.x*width,y:start.y*height,zoom:start.zoom,rotationDeg:start.rotationDeg??0},
        {t:durationSec*.7,x:push.x*width,y:push.y*height,zoom:push.zoom,rotationDeg:push.rotationDeg??0,ease:'ease_in_out'},
        {t:durationSec,x:push.x*width*.7,y:push.y*height*.7,zoom:Math.max(1,push.zoom-.012),rotationDeg:push.rotationDeg??0,ease:'ease_in_out'}
      ]
    },
    layers,
    createdAt:new Date().toISOString()
  };
}

export function transitionBetween(
  world:StudioWorld,
  from:StudioRoomId,
  to:StudioRoomId,
){
  const direct=world.transitions.find(item=>item.from===from&&item.to===to);
  if(direct) return direct;
  const reverse=world.transitions.find(item=>item.from===to&&item.to===from);
  if(reverse) return {...reverse,from,to};
  throw new Error(`studio_transition_missing:${from}:${to}`);
}

export function compileStudioJourney(input:{
  id:string;
  stops:StudioJourneyStop[];
  world?:StudioWorld;
}):StudioJourney{
  const world=input.world??EVERCRAFT_STUDIO_WORLD_V1;
  if(!input.id?.trim()) throw new Error('studio_journey_id_missing');
  if(!input.stops.length) throw new Error('studio_journey_stops_missing');

  const stages=input.stops.map((stop,index)=>{
    const previous=input.stops[index-1];
    const canonical=index===0?null:transitionBetween(world,previous.roomId,stop.roomId);
    const transitionIn=canonical&&stop.transitionFromPrevious
      ? {...canonical,style:stop.transitionFromPrevious}
      : canonical;
    return {
      roomId:stop.roomId,
      transitionIn,
      stage:compileStudioRoomStage(stop,world)
    };
  });

  return {
    schema:'evercraft.fallen.studio-journey.v1',
    id:input.id,
    worldId:world.id,
    worldDigest:studioWorldDigest(world),
    stages,
    createdAt:new Date().toISOString()
  };
}
