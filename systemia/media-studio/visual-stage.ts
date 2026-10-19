import crypto from 'node:crypto';
import type { VisualTheme } from './visual-theme.js';

export type EaseName = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
export type EvidenceState = 'observed' | 'public_source' | 'licensed' | 'modeled' | 'inferred' | 'synthetic_visualization';

export interface NumericKeyframe {
  t: number;
  value: number;
  ease?: EaseName;
}

export interface CameraKeyframe {
  t: number;
  x: number;
  y: number;
  zoom: number;
  rotationDeg?: number;
  ease?: EaseName;
}

export interface VisualStageCamera {
  keyframes: CameraKeyframe[];
}

export interface BaseLayer {
  id: string;
  kind: string;
  z: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number | NumericKeyframe[];
  scale?: number | NumericKeyframe[];
  rotationDeg?: number | NumericKeyframe[];
  rotateXDeg?: number | NumericKeyframe[];
  rotateYDeg?: number | NumericKeyframe[];
  perspectivePx?: number;
  translateX?: number | NumericKeyframe[];
  translateY?: number | NumericKeyframe[];
  parallax?: number;
  evidenceState?: EvidenceState;
  sourceRefs?: string[];
}

export interface MediaLayer extends BaseLayer {
  kind: 'media';
  sourcePath: string;
  mediaKind: 'image' | 'video';
  fit: 'cover' | 'contain';
  /** Exact source-pixel crop window for product evidence closeups. */
  sourceWindow?: {x:number;y:number;width:number;height:number;sourceWidth:number;sourceHeight:number};
  /** Source-relative camera path. Rects interpolate inside the original media, never within stage coordinates. */
  sourceWindowKeyframes?: Array<{t:number;x:number;y:number;width:number;height:number;ease?:EaseName}>;
  trimStartSec?: number;
  playbackRate?: number;
  loop?: boolean;
}

export interface TextLayer extends BaseLayer {
  kind: 'text';
  text: string;
  fontFamily?: string;
  fontSize: number;
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  maxLines?: number;
}

export interface ShapeLayer extends BaseLayer {
  kind: 'shape';
  shape: 'rect' | 'circle' | 'line';
  strokeWidth?: number;
  radius?: number;
}

export interface GeoPoint {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  evidenceState?: EvidenceState;
  sourceRefs?: string[];
}

export interface GeoRoute {
  id: string;
  points: Array<{ lat: number; lon: number }>;
  evidenceState?: EvidenceState;
  sourceRefs?: string[];
  progress?: number | NumericKeyframe[];
  width?: number;
}

export interface GeoPolygon {
  id: string;
  rings: Array<Array<{ lat:number; lon:number }>>;
  label?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  evidenceState?: EvidenceState;
  sourceRefs?: string[];
}

export interface GeoTerrain {
  id: string;
  sourcePath: string;
  bounds: {
    north:number;
    south:number;
    east:number;
    west:number;
  };
  opacity?: number;
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
  evidenceState?: EvidenceState;
  sourceRefs?: string[];
  sourceSha256?: string;
  rightsState?: string;
}

export interface GeoLayer extends BaseLayer {
  kind: 'geo';
  projection: 'equirectangular' | 'mercator';
  centerLat?: number;
  centerLon?: number;
  zoom?: number;
  fitBounds?: {
    north:number;
    south:number;
    east:number;
    west:number;
    paddingPct?:number;
  };
  points?: GeoPoint[];
  routes?: GeoRoute[];
  polygons?: GeoPolygon[];
  terrains?: GeoTerrain[];
  grid?: boolean;
}

export interface MetricLayer extends BaseLayer {
  kind: 'metric';
  label: string;
  from: number;
  to: number;
  unit?: string;
  decimals?: number;
  progress?: number | NumericKeyframe[];
}

export interface TimelineEvent {
  id: string;
  t: number;
  label: string;
  evidenceState?: EvidenceState;
  sourceRefs?: string[];
}

export interface TimelineLayer extends BaseLayer {
  kind: 'timeline';
  startSec: number;
  endSec: number;
  playhead?: number | NumericKeyframe[];
  events: TimelineEvent[];
}

export interface PhenomenonStreamSample {
  lat: number;
  lon: number;
  colorValue?: number;
  magnitude?: number;
}

export interface PhenomenonStream {
  id: string;
  points: PhenomenonStreamSample[];
  particles?: number;
  speed?: number;
  sourceRefs?: string[];
}

export interface PhenomenonOutline {
  id: string;
  points: Array<{ lat: number; lon: number }>;
}

export interface PhenomenonLabel {
  label: string;
  lat: number;
  lon: number;
}

export interface PhenomenonLayer extends BaseLayer {
  kind: 'phenomenon';
  title: string;
  subtitle?: string;
  callout?: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  outlines?: PhenomenonOutline[];
  labels?: PhenomenonLabel[];
  motionLabel: string;
  colorEncoding?: {
    label: string;
    min: number;
    max: number;
    unit?: string;
    palette?: string[];
  };
  brightnessEncoding?: {
    label: string;
    min: number;
    max: number;
    unit?: string;
  };
  streamlines: PhenomenonStream[];
  particleDensity?: number;
  trailFraction?: number;
  sourceLabel: string;
  time?: {
    startIso: string;
    endIso: string;
    label?: string;
  };
}

export type VisualLayer =
  | MediaLayer
  | TextLayer
  | ShapeLayer
  | GeoLayer
  | MetricLayer
  | TimelineLayer
  | PhenomenonLayer;

export interface VisualStage {
  schema: 'evercraft.fallen.visual-stage.v1';
  id: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  background: string;
  theme?: VisualTheme;
  camera: VisualStageCamera;
  layers: VisualLayer[];
  createdAt: string;
}

export interface EvaluatedCamera {
  x: number;
  y: number;
  zoom: number;
  rotationDeg: number;
}

export interface EvaluatedLayer extends Omit<BaseLayer, 'opacity' | 'scale' | 'rotationDeg' | 'rotateXDeg' | 'rotateYDeg' | 'translateX' | 'translateY'> {
  opacity: number;
  scale: number;
  rotationDeg: number;
  rotateXDeg: number;
  rotateYDeg: number;
  translateX: number;
  translateY: number;
  raw: VisualLayer;
  metricValue?: number;
  geoRoutes?: Array<GeoRoute & { progressValue: number }>;
  timelinePlayhead?: number;
}

function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

function ease(name:EaseName|undefined,t:number){
  const x=clamp(t,0,1);
  if(name==='ease_in') return x*x;
  if(name==='ease_out') return 1-(1-x)*(1-x);
  if(name==='ease_in_out') return x<0.5 ? 2*x*x : 1-Math.pow(-2*x+2,2)/2;
  return x;
}

function interpolate(a:number,b:number,t:number){
  return a+(b-a)*t;
}

function sorted<T extends {t:number}>(frames:T[]){
  return [...frames].sort((a,b)=>a.t-b.t);
}

export function valueAt(input:number|NumericKeyframe[]|undefined,t:number,fallback:number){
  if(input===undefined) return fallback;
  if(typeof input==='number') return input;
  if(!input.length) return fallback;
  const frames=sorted(input);
  if(t<=frames[0].t) return frames[0].value;
  if(t>=frames[frames.length-1].t) return frames[frames.length-1].value;
  for(let index=1;index<frames.length;index+=1){
    const right=frames[index];
    const left=frames[index-1];
    if(t<=right.t){
      const local=(t-left.t)/(right.t-left.t);
      return interpolate(left.value,right.value,ease(right.ease??left.ease,local));
    }
  }
  return frames[frames.length-1].value;
}

export function cameraAt(camera:VisualStageCamera,t:number):EvaluatedCamera{
  const frames=sorted(camera.keyframes);
  if(!frames.length) return {x:0,y:0,zoom:1,rotationDeg:0};
  if(t<=frames[0].t) return {
    x:frames[0].x,y:frames[0].y,zoom:frames[0].zoom,rotationDeg:frames[0].rotationDeg??0
  };
  if(t>=frames[frames.length-1].t){
    const last=frames[frames.length-1];
    return {x:last.x,y:last.y,zoom:last.zoom,rotationDeg:last.rotationDeg??0};
  }
  for(let index=1;index<frames.length;index+=1){
    const right=frames[index];
    const left=frames[index-1];
    if(t<=right.t){
      const local=ease(right.ease??left.ease,(t-left.t)/(right.t-left.t));
      return {
        x:interpolate(left.x,right.x,local),
        y:interpolate(left.y,right.y,local),
        zoom:interpolate(left.zoom,right.zoom,local),
        rotationDeg:interpolate(left.rotationDeg??0,right.rotationDeg??0,local)
      };
    }
  }
  return {x:0,y:0,zoom:1,rotationDeg:0};
}


export function evaluateStage(stage:VisualStage,t:number){
  const time=clamp(t,0,stage.durationSec);
  const camera=cameraAt(stage.camera,time);
  const layers=stage.layers
    .map((layer):EvaluatedLayer=>{
      const opacity=clamp(valueAt(layer.opacity,time,1),0,1);
      const scale=Math.max(0,valueAt(layer.scale,time,1));
      const rotationDeg=valueAt(layer.rotationDeg,time,0);
      const rotateXDeg=valueAt(layer.rotateXDeg,time,0);
      const rotateYDeg=valueAt(layer.rotateYDeg,time,0);
      const translateX=valueAt(layer.translateX,time,0);
      const translateY=valueAt(layer.translateY,time,0);
      const evaluated:EvaluatedLayer={
        id:layer.id,
        kind:layer.kind,
        z:layer.z,
        x:layer.x,
        y:layer.y,
        width:layer.width,
        height:layer.height,
        evidenceState:layer.evidenceState,
        sourceRefs:layer.sourceRefs,
        opacity,
        scale,
        rotationDeg,
        rotateXDeg,
        rotateYDeg,
        translateX,
        translateY,
        raw:layer
      };
      if(layer.kind==='metric'){
        const progress=clamp(valueAt(layer.progress,time,time/stage.durationSec),0,1);
        evaluated.metricValue=interpolate(layer.from,layer.to,progress);
      }
    if(layer.kind==='geo'){
        evaluated.geoRoutes=(layer.routes??[]).map(route=>({
          ...route,
          progressValue:clamp(valueAt(route.progress,time,time/stage.durationSec),0,1)
        }));
      }
      if(layer.kind==='timeline'){
        evaluated.timelinePlayhead=clamp(valueAt(layer.playhead,time,time/stage.durationSec),0,1);
      }
      return evaluated;
    })
    .filter(layer=>layer.opacity>0)
    .sort((a,b)=>a.z-b.z || a.id.localeCompare(b.id));
  return {time,camera,layers};
}

export function stageDigest(stage:VisualStage){
  const normalized={...stage,createdAt:undefined};
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function validateStage(stage:VisualStage){
  const errors:string[]=[];
  if(stage.schema!=='evercraft.fallen.visual-stage.v1') errors.push('schema_invalid');
  if(!stage.id?.trim()) errors.push('stage_id_missing');
  if(!Number.isFinite(stage.width)||stage.width<=0) errors.push('width_invalid');
  if(!Number.isFinite(stage.height)||stage.height<=0) errors.push('height_invalid');
  if(!Number.isFinite(stage.fps)||stage.fps<=0||stage.fps>120) errors.push('fps_invalid');
  if(!Number.isFinite(stage.durationSec)||stage.durationSec<=0) errors.push('duration_invalid');
  if(!stage.camera?.keyframes?.length) errors.push('camera_keyframes_missing');
  const ids=new Set<string>();
  for(const layer of stage.layers??[]){
    if(ids.has(layer.id)) errors.push(`duplicate_layer_id:${layer.id}`);
    ids.add(layer.id);
    if(!Number.isFinite(layer.z)) errors.push(`layer_z_invalid:${layer.id}`);
    if(layer.kind==='media' && !layer.sourcePath) errors.push(`media_source_missing:${layer.id}`);
    if(layer.kind==='media'&&layer.sourceWindow){
      const win=layer.sourceWindow;
      const values=[win.x,win.y,win.width,win.height,win.sourceWidth,win.sourceHeight,layer.width,layer.height];
      const aspect=(win.width/win.height)/(layer.width/layer.height);
      if(!values.every(Number.isFinite)||win.x<0||win.y<0||
         win.width<=0||win.height<=0||win.sourceWidth<=0||win.sourceHeight<=0||
         layer.width<=0||layer.height<=0||
         win.x+win.width>win.sourceWidth+1e-5||
         win.y+win.height>win.sourceHeight+1e-5||
         !Number.isFinite(aspect)||Math.abs(aspect-1)>.005){
        errors.push(`media_source_window_invalid:${layer.id}`);
      }
    }
    if(layer.kind==='media'&&layer.sourceWindowKeyframes!==undefined){
      const frames=layer.sourceWindowKeyframes;
      const win=layer.sourceWindow;
      if(!win||!Array.isArray(frames)||frames.length<2||frames.length>12){
        errors.push(`media_source_camera_invalid:${layer.id}`);
      }else{
        const eps=1e-4;
        const ratio=layer.width/layer.height;
        let previous=-1;
        for(const frame of frames){
          const vals=[frame.t,frame.x,frame.y,frame.width,frame.height];
          if(!vals.every(Number.isFinite)||frame.t<=previous||frame.t<0||
            frame.t>stage.durationSec||frame.x<0||frame.y<0||
            frame.width<=0||frame.height<=0||
            frame.x+frame.width>win.sourceWidth+eps||
            frame.y+frame.height>win.sourceHeight+eps||
            Math.abs(frame.width/frame.height/ratio-1)>.005||
            (frame.ease!==undefined&&!['linear','ease_in','ease_out','ease_in_out'].includes(frame.ease))){
            errors.push(`media_source_camera_keyframe_invalid:${layer.id}`);
            break;
          }
          previous=frame.t;
        }
        if(Math.abs(frames[0].t)>eps||
          Math.abs(frames[frames.length-1].t-stage.durationSec)>eps||
          (Math.abs(frames[0].x-win.x)>eps||Math.abs(frames[0].y-win.y)>eps||
           Math.abs(frames[0].width-win.width)>eps||Math.abs(frames[0].height-win.height)>eps)){
          errors.push(`media_source_camera_endpoints_invalid:${layer.id}`);
        }
      }
    }
    if(layer.kind==='geo'){
      if(layer.fitBounds){
        const b=layer.fitBounds;
        if(
          !Number.isFinite(b.north)||!Number.isFinite(b.south)||
          !Number.isFinite(b.east)||!Number.isFinite(b.west)||
          b.north<=b.south||b.north>90||b.south<-90||
          b.east>180||b.east<-180||b.west>180||b.west<-180||
          (b.paddingPct!==undefined && (!Number.isFinite(b.paddingPct)||b.paddingPct<0||b.paddingPct>=.45))
        ) errors.push(`geo_fit_bounds_invalid:${layer.id}`);
      }
      for(const terrain of layer.terrains??[]){
        if(!terrain.id?.trim()) errors.push(`geo_terrain_id_missing:${layer.id}`);
        if(!terrain.sourcePath?.trim()) errors.push(`geo_terrain_source_missing:${terrain.id||layer.id}`);
        const b=terrain.bounds;
        if(
          !b || !Number.isFinite(b.north)||!Number.isFinite(b.south)||
          !Number.isFinite(b.east)||!Number.isFinite(b.west)||
          b.north<=b.south||b.north>90||b.south<-90||
          b.east>180||b.east<-180||b.west>180||b.west<-180
        ) errors.push(`geo_terrain_bounds_invalid:${terrain.id||layer.id}`);
        if(!(terrain.sourceRefs?.length)) errors.push(`geo_terrain_provenance_missing:${terrain.id||layer.id}`);
        if(terrain.sourceSha256 && !/^[a-f0-9]{64}$/i.test(terrain.sourceSha256)){
          errors.push(`geo_terrain_digest_invalid:${terrain.id||layer.id}`);
        }
        if(terrain.opacity!==undefined && (!Number.isFinite(terrain.opacity)||terrain.opacity<0||terrain.opacity>1)){
          errors.push(`geo_terrain_opacity_invalid:${terrain.id||layer.id}`);
        }
      }
      for(const polygon of layer.polygons??[]){
        if(!polygon.id?.trim()) errors.push(`geo_polygon_id_missing:${layer.id}`);
        if(!Array.isArray(polygon.rings)||!polygon.rings.length) errors.push(`geo_polygon_rings_missing:${polygon.id||layer.id}`);
        for(const ring of polygon.rings??[]){
          if(!Array.isArray(ring)||ring.length<3) errors.push(`geo_polygon_ring_invalid:${polygon.id||layer.id}`);
          for(const point of ring??[]){
            if(!Number.isFinite(point?.lat)||point.lat<-90||point.lat>90||!Number.isFinite(point?.lon)||point.lon<-180||point.lon>180){
              errors.push(`geo_polygon_coordinate_invalid:${polygon.id||layer.id}`);
              break;
            }
          }
        }
        if(polygon.evidenceState && ['modeled','inferred','synthetic_visualization'].includes(polygon.evidenceState) && !(polygon.sourceRefs?.length)){
          errors.push(`geo_polygon_provenance_missing:${polygon.id||layer.id}`);
        }
      }
    }
    if(layer.evidenceState && ['modeled','inferred','synthetic_visualization'].includes(layer.evidenceState) && !(layer.sourceRefs?.length)){
      errors.push(`evidence_state_without_source_ref:${layer.id}`);
    }
  }
  return {
    schema:'evercraft.fallen.visual-stage-validation.v1' as const,
    status:errors.length?('rejected' as const):('accepted' as const),
    errors,
    digest:stageDigest(stage)
  };
}
