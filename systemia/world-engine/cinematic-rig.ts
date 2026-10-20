import crypto from 'node:crypto';
import type {Vec3,WorldDefinition,WorldEntity} from './engine.js';
import {EvercraftWorldRuntime,worldDefinitionDigest} from './engine.js';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.js';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,type GeometryAsset,type WebGpuRenderPlan} from './webgpu.js';
import type {TextureAsset} from './texture.js';

export type CinematicMove='dolly'|'crane'|'orbit'|'follow';
export type CinematicEase='linear'|'smoothstep'|'smootherstep';

export interface CinematicCameraTake {
  schema:'evercraft.world-engine.cinematic-camera-take.v1';
  id:string;
  cameraEntityId:string;
  targetEntityId:string;
  durationSec:number;
  fps:24|30|60;
  move:CinematicMove;
  ease:CinematicEase;
  // dolly and crane: absolute world positions, not screen-space cards
  startPosition?:Vec3;
  endPosition?:Vec3;
  // orbit: circular motion around the ACTUAL moving target
  orbit?:{radius:number;startAngleDeg:number;endAngleDeg:number;startHeight:number;endHeight:number};
  // follow: camera offset relative to actual simulated target
  follow?:{startOffset:Vec3;endOffset:Vec3};
  lookAtOffset?:Vec3;
  startFovYDeg?:number;
  endFovYDeg?:number;
  rollDeg?:number;
}
export interface CinematicCameraFrame {
  index:number;
  timeSec:number;
  tick:number;
  cameraPosition:Vec3;
  cameraRotationDeg:Vec3;
  lookAt:Vec3;
  fovYDeg:number;
  frameDigest:string;
  renderPlan:WebGpuRenderPlan;
}
export interface CinematicCameraSequence {
  schema:'evercraft.world-engine.cinematic-camera-sequence.v1';
  takeId:string;
  worldId:string;
  worldDefinitionDigest:string;
  fps:number;
  durationSec:number;
  frameCount:number;
  frames:CinematicCameraFrame[];
  boundaries:{
    actualWorldGeometryRequired:true;
    worldSimulationUsesFixedSteps:true;
    webGpuPlansDigestVerified:true;
    renderingNotPerformed:true;
    visualReviewStillRequired:true;
    publicationAuthority:false;
  };
}
const DEG=180/Math.PI;
const rad=Math.PI/180;
const err=(msg:string):never=>{throw new Error('cinematic_camera_'+msg);};
const finite=(n:number,label:string)=>{if(!Number.isFinite(n))err(label+'_not_finite');};
const vec=(v:Vec3|undefined,label:string):Vec3=>{
  if(!v)err(label+'_missing');
  for(const axis of ['x','y','z'] as const)finite(v[axis],label+'_'+axis);
  return {x:v.x,y:v.y,z:v.z};
};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
function lerpVec(a:Vec3,b:Vec3,t:number):Vec3{
  return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)};
}
function easing(e:CinematicEase,t:number){
  if(e==='linear')return t;
  if(e==='smoothstep')return t*t*(3-2*t);
  return t*t*t*(t*(6*t-15)+10);
}
function lookAt(camera:Vec3,target:Vec3,roll=0):Vec3{
  const dx=target.x-camera.x,dy=target.y-camera.y,dz=target.z-camera.z;
  const horizontal=Math.hypot(dx,dz),distance=Math.hypot(dx,dy,dz);
  if(distance<.35)err('camera_too_close_to_target');
  return {
    x:Math.atan2(dy,horizontal)*DEG,
    y:-Math.atan2(dx,-dz)*DEG,
    z:roll
  };
}
function validateTake(world:WorldDefinition,take:CinematicCameraTake){
  if(take?.schema!=='evercraft.world-engine.cinematic-camera-take.v1')err('schema_invalid');
  if(typeof take.id!=='string'||!/^[a-z0-9][a-z0-9-]{2,71}$/.test(take.id))err('id_invalid');
  if(!['dolly','crane','orbit','follow'].includes(take.move))err('move_invalid');
  if(!['linear','smoothstep','smootherstep'].includes(take.ease))err('ease_invalid');
  if(![24,30,60].includes(take.fps))err('fps_invalid');
  finite(take.durationSec,'duration');
  if(take.durationSec<.5||take.durationSec>8)err('duration_out_of_range');
  const count=take.durationSec*take.fps;
  if(!Number.isInteger(count)||count>480)err('frame_count_invalid');
  if(world.tickRateHz%take.fps!==0)err('world_tick_rate_must_divide_fps');
  if(!world.visualScene)err('world_has_no_visual_scene');
  const camera=world.entities.find(x=>x.id===take.cameraEntityId);
  if(!camera?.camera||camera.camera.projection.type!=='perspective')err('perspective_camera_required');
  if(world.visualScene.initialCameraEntityId!==take.cameraEntityId)err('active_camera_id_mismatch');
  const target=world.entities.find(x=>x.id===take.targetEntityId);
  if(!target||!target.renderable)err('visible_world_target_required');
  if(target.renderable.visible===false)err('hidden_target');
  if(take.targetEntityId===take.cameraEntityId)err('self_target_invalid');
  const perspective=camera.camera.projection;
  if(perspective.type!=='perspective')err('perspective_camera_required');
  const startFov=take.startFovYDeg??('fovYDeg' in perspective ? perspective.fovYDeg : err('perspective_camera_required'));
  const endFov=take.endFovYDeg??startFov;
  for(const fov of [startFov,endFov]){
    finite(fov,'fov');
    if(fov<20||fov>100)err('fov_out_of_range');
  }
  finite(take.rollDeg??0,'roll');
  if(Math.abs(take.rollDeg??0)>10)err('excessive_roll');
  if(take.lookAtOffset)vec(take.lookAtOffset,'look_at_offset');
  if(take.move==='dolly'||take.move==='crane'){
    vec(take.startPosition,'start_position');
    vec(take.endPosition,'end_position');
    if(take.orbit||take.follow)err('conflicting_move_parameters');
    if(take.move==='crane'&&Math.abs(take.startPosition!.y-take.endPosition!.y)<.05)err('crane_requires_height_change');
  } else if(take.move==='orbit'){
    if(!take.orbit||take.follow||take.startPosition||take.endPosition)err('orbit_parameters_invalid');
    const o=take.orbit;
    for(const [label,value] of Object.entries(o))finite(value,'orbit_'+label);
    if(o.radius<.5||o.radius>500)err('orbit_radius_out_of_range');
    if(Math.abs(o.endAngleDeg-o.startAngleDeg)>240)err('orbit_sweep_excessive');
    if(Math.abs(o.startHeight)>500||Math.abs(o.endHeight)>500)err('orbit_height_out_of_range');
  } else {
    if(!take.follow||take.orbit||take.startPosition||take.endPosition)err('follow_parameters_invalid');
    vec(take.follow.startOffset,'follow_start_offset');
    vec(take.follow.endOffset,'follow_end_offset');
  }
  return {camera,startFov,endFov,count};
}
function samplePosition(take:CinematicCameraTake,target:Vec3,t:number){
  if(take.move==='orbit'){
    const orbit=take.orbit!;
    const angle=lerp(orbit.startAngleDeg,orbit.endAngleDeg,t)*rad;
    return {
      x:target.x+Math.sin(angle)*orbit.radius,
      y:target.y+lerp(orbit.startHeight,orbit.endHeight,t),
      z:target.z+Math.cos(angle)*orbit.radius
    };
  }
  if(take.move==='follow'){
    const offset=lerpVec(take.follow!.startOffset,take.follow!.endOffset,t);
    return {x:target.x+offset.x,y:target.y+offset.y,z:target.z+offset.z};
  }
  return lerpVec(take.startPosition!,take.endPosition!,t);
}
export function buildCinematicCameraSequence(input:{
  world:WorldDefinition;
  take:CinematicCameraTake;
  geometries:GeometryAsset[];
  viewport:{width:number;height:number};
  textures?:TextureAsset[];
}):CinematicCameraSequence{
  const {world,take}=input;
  const {startFov,endFov,count}=validateTake(world,take);
  const runtime=new EvercraftWorldRuntime(world);
  const frames:CinematicCameraFrame[]=[];
  const stride=world.tickRateHz/take.fps;
  const offset=take.lookAtOffset??{x:0,y:0,z:0};
  for(let index=0;index<=count;index++){
    if(index>0){for(let tick=0;tick<stride;tick++)runtime.step();}
    const snapshot=runtime.snapshot();
    const targetEntity=snapshot.entities.find(entity=>entity.id===take.targetEntityId);
    if(!targetEntity||targetEntity.renderable?.visible===false)err('runtime_target_missing');
    const target={x:targetEntity.transform.position.x+offset.x,
      y:targetEntity.transform.position.y+offset.y,
      z:targetEntity.transform.position.z+offset.z};
    const u=easing(take.ease,index/count);
    const position=samplePosition(take,target,u);
    const rotation=lookAt(position,target,take.rollDeg??0);
    const fovYDeg=lerp(startFov,endFov,u);
    // Do NOT forge a VisualFrame digest. Compile through the canonical
    // World Engine camera and visually authenticated GPU plan mechanisms.
    const entities=snapshot.entities.map((entity):WorldEntity=>
      entity.id!==take.cameraEntityId?entity:{
        ...entity,
        transform:{...entity.transform,position,rotationDeg:rotation},
        camera:{...entity.camera!,projection:{type:'perspective',fovYDeg}}
      }
    );
    const frame=compileVisualFrame(snapshot.worldId,snapshot.tick,snapshot.timeSec,
      runtime.definition.visualScene!,entities,snapshot.cameraRuntime!,snapshot.activeEntityIds);
    if(!verifyVisualFrameContract(frame))err('visual_frame_integrity_failed');
    const renderPlan=compileWebGpuRenderPlan(frame,input.geometries,input.viewport,input.textures??[]);
    if(!verifyWebGpuRenderPlan(renderPlan))err('webgpu_plan_integrity_failed');
    frames.push({
      index,timeSec:snapshot.timeSec,tick:snapshot.tick,
      cameraPosition:position,cameraRotationDeg:rotation,lookAt:target,
      fovYDeg,frameDigest:frame.digest,renderPlan
    });
  }
  return {
    schema:'evercraft.world-engine.cinematic-camera-sequence.v1',
    takeId:take.id,worldId:world.id,worldDefinitionDigest:worldDefinitionDigest(world),
    fps:take.fps,durationSec:take.durationSec,frameCount:frames.length,frames,
    boundaries:{actualWorldGeometryRequired:true,worldSimulationUsesFixedSteps:true,
      webGpuPlansDigestVerified:true,renderingNotPerformed:true,
      visualReviewStillRequired:true,publicationAuthority:false}
  };
}
