import crypto from 'node:crypto';
import type { TransformComponent, Vec3, WorldEntity } from './engine.js';
import { normalizeTextureSampler, type TextureSamplerDefinition } from './texture.js';

export interface ColorRGB {
  r:number;
  g:number;
  b:number;
}

export interface ColorRGBA extends ColorRGB {
  a:number;
}

export type MaterialAlphaMode='opaque'|'mask'|'blend';

// Optional scene-directed filmic tone mapping. Omission preserves exact legacy pixels.
// Opt-in physically-motivated direct lighting. No change to legacy scene pixels.
export interface CinematicLightingDefinition {
  shading:'legacy_phong'|'ggx_microfacet';
  localLightFalloff?:'legacy_linear'|'inverse_square';
}

export interface FilmicColorManagement {
  toneMapper:'legacy_linear'|'aces_filmic';
  exposureBiasStops?:number;
}

// Distance fog is scene geometry/lighting context, not an assertion of real weather.
// Opt-in per scene; absence preserves historic visual frame identity.
export interface AtmosphereDefinition {
  color:ColorRGB;
  density:number;
  startDistance?:number;
  heightFalloff?:number;
  referenceHeight?:number;
}

export interface MaterialDefinition {
  id:string;
  model:'pbr'|'unlit';
  baseColor:ColorRGBA;
  metallic?:number;
  roughness?:number;
  emissive?:ColorRGB;
  emissiveIntensity?:number;
  alphaMode?:MaterialAlphaMode;
  alphaCutoff?:number;
  doubleSided?:boolean;
  textureRefs?:{
    baseColor?:string;
    normal?:string;
    orm?:string;
    emissive?:string;
  };
  sampler?:TextureSamplerDefinition;
}

export interface RenderableComponent {
  geometryRef:string;
  materialId:string;
  visible?:boolean;
  castsShadow?:boolean;
  receivesShadow?:boolean;
  layerMask?:number;
}

export type LightComponent =
  | {
      type:'ambient';
      color:ColorRGB;
      intensity:number;
      layerMask?:number;
    }
  | {
      type:'directional';
      color:ColorRGB;
      intensity:number;
      castsShadow?:boolean;
      layerMask?:number;
    }
  | {
      type:'point';
      color:ColorRGB;
      intensity:number;
      range:number;
      castsShadow?:boolean;
      layerMask?:number;
    }
  | {
      type:'spot';
      color:ColorRGB;
      intensity:number;
      range:number;
      innerConeDeg:number;
      outerConeDeg:number;
      castsShadow?:boolean;
      layerMask?:number;
    };

export type CameraProjection =
  | {type:'perspective';fovYDeg:number}
  | {type:'orthographic';orthoHeight:number};

export interface CameraComponent {
  projection:CameraProjection;
  near:number;
  far:number;
  exposure?:number;
  layerMask?:number;
}

export type CameraBlendCurve='linear'|'smoothstep';

export interface CameraTransitionDefinition {
  id:string;
  fromCameraId:string;
  toCameraId:string;
  durationSec:number;
  curve?:CameraBlendCurve;
}

export interface VisualSceneDefinition {
  schema:'evercraft.world-engine.visual-scene.v1';
  materials:MaterialDefinition[];
  initialCameraEntityId:string;
  cameraTransitions?:CameraTransitionDefinition[];
  clearColor?:ColorRGB;
  atmosphere?:AtmosphereDefinition;
  colorManagement?:FilmicColorManagement;
  cinematicLighting?:CinematicLightingDefinition;
}

export interface CameraTransitionRuntime {
  id:string;
  fromCameraId:string;
  toCameraId:string;
  elapsedSec:number;
  durationSec:number;
  curve:CameraBlendCurve;
}

export interface CameraRuntimeState {
  activeCameraId:string;
  transition:CameraTransitionRuntime|null;
}

export interface CameraSample {
  cameraId:string;
  projection:CameraProjection;
  near:number;
  far:number;
  exposure:number;
  layerMask:number;
  transform:TransformComponent;
  blend:null|{
    fromCameraId:string;
    toCameraId:string;
    weight:number;
    curve:CameraBlendCurve;
  };
}

export interface VisualFrameContract {
  schema:'evercraft.world-engine.visual-frame.v1';
  worldId:string;
  tick:number;
  timeSec:number;
  camera:CameraSample;
  clearColor:ColorRGB;
  atmosphere?:AtmosphereDefinition;
  colorManagement?:FilmicColorManagement;
  cinematicLighting?:CinematicLightingDefinition;
  materials:MaterialDefinition[];
  renderables:Array<{
    entityId:string;
    transform:TransformComponent;
    component:RenderableComponent;
  }>;
  lights:Array<{
    entityId:string;
    transform:TransformComponent;
    component:LightComponent;
  }>;
  digest:string;
}

const DEFAULT_LAYER_MASK=0xffffffff;

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
  if(!Number.isFinite(value)) throw new Error(`visual_invalid_${label}`);
}

function unit(value:number,label:string){
  finite(value,label);
  if(value<0 || value>1) throw new Error(`visual_invalid_${label}_range`);
}

function validateColor(color:ColorRGB,label:string,alpha=false){
  unit(color?.r,`${label}_r`);
  unit(color?.g,`${label}_g`);
  unit(color?.b,`${label}_b`);
  if(alpha) unit((color as ColorRGBA)?.a,`${label}_a`);
}

function validateLayerMask(value:number|undefined,label:string){
  if(value===undefined) return;
  if(!Number.isInteger(value) || value<0 || value>0xffffffff){
    throw new Error(`visual_invalid_${label}_layer_mask`);
  }
}

export function validateCinematicLighting(spec:CinematicLightingDefinition){
  if(!spec || !['legacy_phong','ggx_microfacet'].includes(spec.shading)){
    throw new Error('visual_cinematic_lighting_shading_invalid');
  }
  if(spec.localLightFalloff!==undefined &&
     !['legacy_linear','inverse_square'].includes(spec.localLightFalloff)){
    throw new Error('visual_cinematic_lighting_falloff_invalid');
  }
  return true;
}

export function validateColorManagement(grade:FilmicColorManagement){
  if(!grade || !['legacy_linear','aces_filmic'].includes(grade.toneMapper)){
    throw new Error('visual_color_management_mapper_invalid');
  }
  if(grade.exposureBiasStops!==undefined){
    finite(grade.exposureBiasStops,'color_management_exposure_bias');
    if(Math.abs(grade.exposureBiasStops)>4) throw new Error('visual_color_management_exposure_bias_range');
  }
  return true;
}

export function validateAtmosphere(atmosphere:AtmosphereDefinition){
  validateColor(atmosphere?.color,'atmosphere_color');
  finite(atmosphere.density,'atmosphere_density');
  if(atmosphere.density<0||atmosphere.density>1) throw new Error('visual_atmosphere_density_out_of_range');
  if(atmosphere.startDistance!==undefined){
    finite(atmosphere.startDistance,'atmosphere_start_distance');
    if(atmosphere.startDistance<0||atmosphere.startDistance>10000) throw new Error('visual_atmosphere_start_distance_out_of_range');
  }
  if(atmosphere.heightFalloff!==undefined){
    finite(atmosphere.heightFalloff,'atmosphere_height_falloff');
    if(atmosphere.heightFalloff<0||atmosphere.heightFalloff>2) throw new Error('visual_atmosphere_height_falloff_out_of_range');
  }
  if(atmosphere.referenceHeight!==undefined){
    finite(atmosphere.referenceHeight,'atmosphere_reference_height');
    if(Math.abs(atmosphere.referenceHeight)>10000) throw new Error('visual_atmosphere_reference_height_out_of_range');
  }
  return true;
}

export function validateMaterial(material:MaterialDefinition){
  if(!material?.id) throw new Error('visual_material_id_missing');
  if(material.model!=='pbr' && material.model!=='unlit') throw new Error(`visual_material_model_invalid:${material.id}`);
  validateColor(material.baseColor,`material_${material.id}_base_color`,true);

  if(material.model==='pbr'){
    unit(material.metallic ?? 0,`material_${material.id}_metallic`);
    const roughness=material.roughness ?? 1;
    unit(roughness,`material_${material.id}_roughness`);
  }
  if(material.emissive) validateColor(material.emissive,`material_${material.id}_emissive`);
  if(material.emissiveIntensity!==undefined){
    finite(material.emissiveIntensity,`material_${material.id}_emissive_intensity`);
    if(material.emissiveIntensity<0) throw new Error(`visual_material_emissive_intensity_negative:${material.id}`);
  }

  const alphaMode=material.alphaMode || 'opaque';
  if(!['opaque','mask','blend'].includes(alphaMode)) throw new Error(`visual_material_alpha_mode_invalid:${material.id}`);
  if(alphaMode==='mask'){
    unit(material.alphaCutoff ?? .5,`material_${material.id}_alpha_cutoff`);
  }
  if(material.sampler) normalizeTextureSampler(material.sampler);
  return true;
}

export function validateRenderable(component:RenderableComponent,materials:MaterialDefinition[]){
  if(!component?.geometryRef) throw new Error('visual_renderable_geometry_missing');
  if(!component.materialId) throw new Error('visual_renderable_material_missing');
  if(!materials.some(material=>material.id===component.materialId)){
    throw new Error(`visual_renderable_material_unknown:${component.materialId}`);
  }
  validateLayerMask(component.layerMask,'renderable');
  return true;
}

export function validateLight(component:LightComponent){
  if(!component?.type || !['ambient','directional','point','spot'].includes(component.type)){
    throw new Error('visual_light_type_invalid');
  }
  validateColor(component.color,`light_${component.type}_color`);
  finite(component.intensity,`light_${component.type}_intensity`);
  if(component.intensity<0) throw new Error(`visual_light_intensity_negative:${component.type}`);
  validateLayerMask(component.layerMask,'light');

  if(component.type==='point' || component.type==='spot'){
    finite(component.range,`light_${component.type}_range`);
    if(component.range<=0) throw new Error(`visual_light_range_invalid:${component.type}`);
  }
  if(component.type==='spot'){
    finite(component.innerConeDeg,'light_spot_inner');
    finite(component.outerConeDeg,'light_spot_outer');
    if(
      component.innerConeDeg<0 ||
      component.outerConeDeg<=0 ||
      component.innerConeDeg>component.outerConeDeg ||
      component.outerConeDeg>90
    ) throw new Error('visual_light_spot_cone_invalid');
  }
  return true;
}

export function validateCamera(component:CameraComponent){
  if(!component?.projection) throw new Error('visual_camera_projection_missing');
  finite(component.near,'camera_near');
  finite(component.far,'camera_far');
  if(component.near<=0 || component.far<=component.near) throw new Error('visual_camera_clip_invalid');
  validateLayerMask(component.layerMask,'camera');
  if(component.exposure!==undefined){
    finite(component.exposure,'camera_exposure');
    if(component.exposure<=0) throw new Error('visual_camera_exposure_invalid');
  }

  if(component.projection.type==='perspective'){
    finite(component.projection.fovYDeg,'camera_fov');
    if(component.projection.fovYDeg<=1 || component.projection.fovYDeg>=179){
      throw new Error('visual_camera_fov_invalid');
    }
  }else if(component.projection.type==='orthographic'){
    finite(component.projection.orthoHeight,'camera_ortho_height');
    if(component.projection.orthoHeight<=0) throw new Error('visual_camera_ortho_height_invalid');
  }else{
    throw new Error('visual_camera_projection_type_invalid');
  }
  return true;
}

export function validateVisualScene(scene:VisualSceneDefinition,entities:WorldEntity[]){
  if(scene?.schema!=='evercraft.world-engine.visual-scene.v1') throw new Error('visual_scene_schema_invalid');

  const materialIds=new Set<string>();
  for(const material of scene.materials || []){
    validateMaterial(material);
    if(materialIds.has(material.id)) throw new Error(`visual_material_duplicate:${material.id}`);
    materialIds.add(material.id);
  }

  const entityMap=new Map(entities.map(entity=>[entity.id,entity]));
  const cameraIds=new Set(
    entities.filter(entity=>Boolean(entity.camera)).map(entity=>entity.id)
  );
  if(!cameraIds.has(scene.initialCameraEntityId)){
    throw new Error(`visual_initial_camera_missing:${scene.initialCameraEntityId}`);
  }

  for(const entity of entities){
    if(entity.renderable) validateRenderable(entity.renderable,scene.materials || []);
    if(entity.light) validateLight(entity.light);
    if(entity.camera) validateCamera(entity.camera);
  }

  const transitionIds=new Set<string>();
  for(const transition of scene.cameraTransitions || []){
    if(!transition.id) throw new Error('visual_camera_transition_id_missing');
    if(transitionIds.has(transition.id)) throw new Error(`visual_camera_transition_duplicate:${transition.id}`);
    transitionIds.add(transition.id);
    if(!cameraIds.has(transition.fromCameraId)){
      throw new Error(`visual_camera_transition_from_missing:${transition.id}:${transition.fromCameraId}`);
    }
    if(!cameraIds.has(transition.toCameraId)){
      throw new Error(`visual_camera_transition_to_missing:${transition.id}:${transition.toCameraId}`);
    }
    if(transition.fromCameraId===transition.toCameraId){
      throw new Error(`visual_camera_transition_self:${transition.id}`);
    }
    const fromCamera=entityMap.get(transition.fromCameraId)?.camera;
    const toCamera=entityMap.get(transition.toCameraId)?.camera;
    if(fromCamera?.projection.type!==toCamera?.projection.type){
      throw new Error(`visual_camera_transition_projection_mismatch:${transition.id}`);
    }
    finite(transition.durationSec,`camera_transition_${transition.id}_duration`);
    if(transition.durationSec<0) throw new Error(`visual_camera_transition_duration_invalid:${transition.id}`);
    if(transition.curve && !['linear','smoothstep'].includes(transition.curve)){
      throw new Error(`visual_camera_transition_curve_invalid:${transition.id}`);
    }
  }

  if(scene.clearColor) validateColor(scene.clearColor,'scene_clear_color');
  if(scene.atmosphere) validateAtmosphere(scene.atmosphere);
  if(scene.colorManagement) validateColorManagement(scene.colorManagement);
  if(scene.cinematicLighting) validateCinematicLighting(scene.cinematicLighting);
  if(!entityMap.size) throw new Error('visual_scene_entities_missing');
  return true;
}

export function initializeCameraRuntime(scene:VisualSceneDefinition):CameraRuntimeState{
  return {
    activeCameraId:scene.initialCameraEntityId,
    transition:null
  };
}

export function activateCamera(
  scene:VisualSceneDefinition,
  runtime:CameraRuntimeState,
  cameraId:string,
  transitionId?:string
):CameraRuntimeState{
  if(runtime.activeCameraId===cameraId && !runtime.transition) return clone(runtime);

  const next=clone(runtime);
  const transition=transitionId
    ? (scene.cameraTransitions || []).find(item=>item.id===transitionId)
    : (scene.cameraTransitions || [])
        .filter(item=>item.fromCameraId===runtime.activeCameraId && item.toCameraId===cameraId)
        .sort((a,b)=>a.id.localeCompare(b.id))[0];

  if(transitionId && !transition){
    throw new Error(`visual_camera_transition_missing:${transitionId}`);
  }
  if(transition && (transition.fromCameraId!==runtime.activeCameraId || transition.toCameraId!==cameraId)){
    throw new Error(`visual_camera_transition_mismatch:${transition.id}`);
  }

  if(!transition || transition.durationSec===0){
    next.activeCameraId=cameraId;
    next.transition=null;
    return next;
  }

  next.transition={
    id:transition.id,
    fromCameraId:transition.fromCameraId,
    toCameraId:transition.toCameraId,
    elapsedSec:0,
    durationSec:transition.durationSec,
    curve:transition.curve || 'smoothstep'
  };
  return next;
}

export function stepCameraRuntime(runtime:CameraRuntimeState,dt:number):CameraRuntimeState{
  if(!Number.isFinite(dt) || dt<0) throw new Error('visual_camera_dt_invalid');
  const next=clone(runtime);
  if(!next.transition) return next;
  next.transition.elapsedSec=Math.min(
    next.transition.durationSec,
    next.transition.elapsedSec+dt
  );
  if(next.transition.elapsedSec>=next.transition.durationSec-1e-12){
    next.activeCameraId=next.transition.toCameraId;
    next.transition=null;
  }
  return next;
}

function blendWeight(transition:CameraTransitionRuntime|null){
  if(!transition) return 1;
  if(transition.durationSec<=0) return 1;
  const t=Math.max(0,Math.min(1,transition.elapsedSec/transition.durationSec));
  return transition.curve==='linear'?t:t*t*(3-2*t);
}

function lerp(a:number,b:number,t:number){
  return a+(b-a)*t;
}

function angleDelta(a:number,b:number){
  let value=((b-a+180)%360+360)%360-180;
  if(Math.abs(value+180)<1e-12) value=180;
  return value;
}

function blendVec(a:Vec3,b:Vec3,t:number):Vec3{
  return {
    x:lerp(a.x,b.x,t),
    y:lerp(a.y,b.y,t),
    z:lerp(a.z,b.z,t)
  };
}

function blendRotation(a:Vec3,b:Vec3,t:number):Vec3{
  return {
    x:a.x+angleDelta(a.x,b.x)*t,
    y:a.y+angleDelta(a.y,b.y)*t,
    z:a.z+angleDelta(a.z,b.z)*t
  };
}

function completeTransform(transform:TransformComponent){
  return {
    position:clone(transform.position),
    rotationDeg:clone(transform.rotationDeg || {x:0,y:0,z:0}),
    scale:clone(transform.scale || {x:1,y:1,z:1})
  };
}

function cameraSample(entity:WorldEntity,blend:CameraSample['blend']):CameraSample{
  if(!entity.camera) throw new Error(`visual_camera_component_missing:${entity.id}`);
  return {
    cameraId:entity.id,
    projection:clone(entity.camera.projection),
    near:entity.camera.near,
    far:entity.camera.far,
    exposure:entity.camera.exposure ?? 1,
    layerMask:entity.camera.layerMask ?? DEFAULT_LAYER_MASK,
    transform:completeTransform(entity.transform),
    blend
  };
}

export function sampleCamera(
  entities:WorldEntity[],
  runtime:CameraRuntimeState
):CameraSample{
  const byId=new Map(entities.map(entity=>[entity.id,entity]));
  if(!runtime.transition){
    const active=byId.get(runtime.activeCameraId);
    if(!active) throw new Error(`visual_camera_entity_missing:${runtime.activeCameraId}`);
    return cameraSample(active,null);
  }

  const source=byId.get(runtime.transition.fromCameraId);
  const target=byId.get(runtime.transition.toCameraId);
  if(!source) throw new Error(`visual_camera_entity_missing:${runtime.transition.fromCameraId}`);
  if(!target) throw new Error(`visual_camera_entity_missing:${runtime.transition.toCameraId}`);
  if(!source.camera || !target.camera) throw new Error('visual_camera_component_missing');
  const weight=Number(blendWeight(runtime.transition).toFixed(9));
  const sourceTransform=completeTransform(source.transform);
  const targetTransform=completeTransform(target.transform);

  let projection:CameraProjection;
  if(source.camera.projection.type==='perspective' && target.camera.projection.type==='perspective'){
    projection={
      type:'perspective',
      fovYDeg:lerp(source.camera.projection.fovYDeg,target.camera.projection.fovYDeg,weight)
    };
  }else if(source.camera.projection.type==='orthographic' && target.camera.projection.type==='orthographic'){
    projection={
      type:'orthographic',
      orthoHeight:lerp(source.camera.projection.orthoHeight,target.camera.projection.orthoHeight,weight)
    };
  }else{
    throw new Error(`visual_camera_projection_blend_invalid:${runtime.transition.id}`);
  }

  return {
    cameraId:target.id,
    projection,
    near:lerp(source.camera.near,target.camera.near,weight),
    far:lerp(source.camera.far,target.camera.far,weight),
    exposure:lerp(source.camera.exposure ?? 1,target.camera.exposure ?? 1,weight),
    layerMask:target.camera.layerMask ?? DEFAULT_LAYER_MASK,
    transform:{
      position:blendVec(sourceTransform.position,targetTransform.position,weight),
      rotationDeg:blendRotation(sourceTransform.rotationDeg,targetTransform.rotationDeg,weight),
      scale:blendVec(sourceTransform.scale,targetTransform.scale,weight)
    },
    blend:{
      fromCameraId:runtime.transition.fromCameraId,
      toCameraId:runtime.transition.toCameraId,
      weight,
      curve:runtime.transition.curve
    }
  };
}

export function verifyVisualFrameContract(frame:VisualFrameContract){
  if(frame?.schema!=='evercraft.world-engine.visual-frame.v1') return false;
  const {digest:claimed,...core}=frame;
  return typeof claimed==='string' && claimed===digest(core);
}

export function compileVisualFrame(
  worldId:string,
  tick:number,
  timeSec:number,
  scene:VisualSceneDefinition,
  entities:WorldEntity[],
  cameraRuntime:CameraRuntimeState,
  activeEntityIds?:string[]
):VisualFrameContract{
  const active=activeEntityIds?new Set(activeEntityIds):null;
  const ordered=[...entities].sort((a,b)=>a.id.localeCompare(b.id));
  const camera=sampleCamera(ordered,cameraRuntime);
  const cameraMask=camera.layerMask;

  const renderables=ordered
    .filter(entity=>!active || active.has(entity.id))
    .filter(entity=>entity.renderable && entity.renderable.visible!==false)
    .filter(entity=>((entity.renderable!.layerMask ?? DEFAULT_LAYER_MASK)&cameraMask)!==0)
    .map(entity=>({
      entityId:entity.id,
      transform:clone(entity.transform),
      component:clone(entity.renderable!)
    }));

  const lights=ordered
    .filter(entity=>!active || active.has(entity.id))
    .filter(entity=>Boolean(entity.light))
    .filter(entity=>((entity.light!.layerMask ?? DEFAULT_LAYER_MASK)&cameraMask)!==0)
    .map(entity=>({
      entityId:entity.id,
      transform:clone(entity.transform),
      component:clone(entity.light!)
    }));

  const core={
    schema:'evercraft.world-engine.visual-frame.v1' as const,
    worldId,
    tick,
    timeSec,
    camera,
    clearColor:clone(scene.clearColor || {r:0,g:0,b:0}),
    ...(scene.atmosphere?{atmosphere:clone(scene.atmosphere)}:{}),
    ...(scene.colorManagement?{colorManagement:clone(scene.colorManagement)}:{}),
    ...(scene.cinematicLighting?{cinematicLighting:clone(scene.cinematicLighting)}:{}),
    materials:[...(scene.materials || [])].sort((a,b)=>a.id.localeCompare(b.id)).map(clone),
    renderables,
    lights
  };
  return {...core,digest:digest(core)};
}
