import crypto from 'node:crypto';
import { resolveEntityCollisions, type CollisionContact } from './spatial.js';
import { initializeAnimationRuntime, setAnimationParameter, stepAnimationRuntime, validateAnimationComponent, type AnimationParameter, type AnimationRuntimeState, type SkeletalAnimationComponent } from './animation.js';
import { clearNavigationTarget, initializeNavigationAgent, setNavigationTarget, stepNavigationAgent, validateNavigationAgent, validateNavigationMesh, type NavigationAgentComponent, type NavigationAgentRuntime, type NavigationMesh } from './navigation.js';
import type { NavigationObstacleObservation } from './navigation-corridor.js';
import { activateCamera, initializeCameraRuntime, stepCameraRuntime, validateVisualScene, type CameraComponent, type CameraRuntimeState, type LightComponent, type RenderableComponent, type VisualSceneDefinition } from './visual.js';
import { activateAudioListener, clearAudioRuntimeEvents, initializeAudioEmitter, initializeAudioSceneRuntime, pauseAudio, playAudio, seekAudio, stepAudioEmitter, stopAudio, validateAudioScene, type AudioClipDefinition, type AudioEmitterComponent, type AudioEmitterRuntime, type AudioListenerComponent, type AudioSceneDefinition, type AudioSceneRuntime } from './audio.js';

export type Vec3 = { x:number; y:number; z:number };

export interface TransformComponent {
  position:Vec3;
  rotationDeg?:Vec3;
  scale?:Vec3;
}

export interface RigidBodyComponent {
  mass:number;
  velocity?:Vec3;
  acceleration?:Vec3;
  gravityScale?:number;
  linearDamping?:number;
  restitution?:number;
  kinematic?:boolean;
}

export type ColliderComponent =
  | { type:'box'; halfExtents:Vec3; ground?:boolean }
  | { type:'sphere'; radius:number; ground?:boolean };

export type WorldBehavior =
  | { kind:'spin'; degreesPerSecond:Vec3 }
  | { kind:'constant_force'; force:Vec3 }
  | { kind:'oscillate_y'; amplitude:number; frequencyHz:number; phaseRad?:number };

export interface WorldEntity {
  id:string;
  name?:string;
  transform:TransformComponent;
  rigidBody?:RigidBodyComponent;
  collider?:ColliderComponent;
  behaviors?:WorldBehavior[];
  animation?:SkeletalAnimationComponent;
  navigationAgent?:NavigationAgentComponent;
  renderable?:RenderableComponent;
  light?:LightComponent;
  camera?:CameraComponent;
  audioEmitter?:AudioEmitterComponent;
  audioListener?:AudioListenerComponent;
  assetRefs?:string[];
  tags?:string[];
  properties?:Record<string,unknown>;
}

export interface WorldDefinition {
  schema:'evercraft.world-engine.world.v1';
  id:string;
  version:number;
  tickRateHz:number;
  gravity:Vec3;
  ground?:{ enabled:boolean; height:number };
  entities:WorldEntity[];
  navigationMeshes?:NavigationMesh[];
  visualScene?:VisualSceneDefinition;
  audioScene?:AudioSceneDefinition;
  metadata?:Record<string,unknown>;
}

export type WorldInput =
  | { id:string; tick:number; entityId:string; kind:'impulse'; value:Vec3 }
  | { id:string; tick:number; entityId:string; kind:'set_velocity'; value:Vec3 }
  | { id:string; tick:number; entityId:string; kind:'teleport'; value:Vec3 }
  | { id:string; tick:number; entityId:string; kind:'set_animation_parameter'; key:string; value:AnimationParameter }
  | { id:string; tick:number; entityId:string; kind:'set_navigation_target'; value:Vec3 }
  | { id:string; tick:number; entityId:string; kind:'clear_navigation_target' }
  | { id:string; tick:number; kind:'activate_camera'; cameraEntityId:string; transitionId?:string }
  | { id:string; tick:number; kind:'activate_audio_listener'; listenerEntityId:string }
  | { id:string; tick:number; entityId:string; kind:'play_audio' }
  | { id:string; tick:number; entityId:string; kind:'pause_audio' }
  | { id:string; tick:number; entityId:string; kind:'stop_audio' }
  | { id:string; tick:number; entityId:string; kind:'seek_audio'; value:number }
  | { id:string; tick:number; entityId:string; kind:'set_property'; key:string; value:unknown };

export interface RuntimeEntity extends WorldEntity {
  transform:TransformComponent;
  rigidBody?:RigidBodyComponent & {
    velocity:Vec3;
    acceleration:Vec3;
  };
  animationRuntime?:AnimationRuntimeState;
  navigationRuntime?:NavigationAgentRuntime;
  audioRuntime?:AudioEmitterRuntime;
}

export interface WorldSnapshot {
  schema:'evercraft.world-engine.snapshot.v1';
  worldId:string;
  worldVersion:number;
  definitionDigest:string;
  tick:number;
  timeSec:number;
  entities:RuntimeEntity[];
  activeEntityIds:string[];
  cameraRuntime:CameraRuntimeState|null;
  audioSceneRuntime:AudioSceneRuntime|null;
  collisions:CollisionContact[];
  digest:string;
}

export interface ReplayReceipt {
  schema:'evercraft.world-engine.replay-receipt.v1';
  worldId:string;
  requestedTicks:number;
  finalTick:number;
  inputCount:number;
  definitionDigest:string;
  finalSnapshotDigest:string;
  deterministic:boolean;
}

const ZERO:Vec3={x:0,y:0,z:0};

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value === 'object'){
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

function add(a:Vec3,b:Vec3):Vec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
}

function scale(a:Vec3,n:number):Vec3{
  return {x:a.x*n,y:a.y*n,z:a.z*n};
}

function finiteVec3(value:Vec3,label:string){
  for(const axis of ['x','y','z'] as const){
    if(!Number.isFinite(value[axis])) throw new Error(`world_invalid_${label}_${axis}`);
  }
}

export function worldDefinitionDigest(world:WorldDefinition){
  return digest(world);
}

export function worldSnapshotDigest(snapshot:Omit<WorldSnapshot,'digest'>|WorldSnapshot){
  const copy={...(snapshot as WorldSnapshot)} as Record<string,unknown>;
  delete copy.digest;
  return digest(copy);
}

export function sealWorldSnapshot(core:Omit<WorldSnapshot,'digest'>):WorldSnapshot{
  return {...clone(core),digest:worldSnapshotDigest(core)};
}

export function verifyWorldSnapshot(snapshot:WorldSnapshot){
  if(snapshot?.schema!=='evercraft.world-engine.snapshot.v1') return false;
  return typeof snapshot.digest==='string' && snapshot.digest===worldSnapshotDigest(snapshot);
}

export function validateWorldDefinition(world:WorldDefinition){
  if(world?.schema !== 'evercraft.world-engine.world.v1') throw new Error('world_schema_invalid');
  if(!world.id) throw new Error('world_id_missing');
  if(!Number.isInteger(world.version) || world.version < 1) throw new Error('world_version_invalid');
  if(!Number.isFinite(world.tickRateHz) || world.tickRateHz <= 0 || world.tickRateHz > 240){
    throw new Error('world_tick_rate_invalid');
  }
  finiteVec3(world.gravity,'gravity');
  const navigationMeshes=[...(world.navigationMeshes || [])];
  const meshIds=new Set<string>();
  for(const mesh of navigationMeshes){
    validateNavigationMesh(mesh);
    if(meshIds.has(mesh.id)) throw new Error(`world_navigation_mesh_duplicate:${mesh.id}`);
    meshIds.add(mesh.id);
  }
  const hasVisualComponents=(world.entities || []).some(entity=>entity.renderable || entity.light || entity.camera);
  if(world.visualScene){
    validateVisualScene(world.visualScene,world.entities || []);
  }else if(hasVisualComponents){
    throw new Error('world_visual_scene_required');
  }
  const hasAudioComponents=(world.entities || []).some(entity=>entity.audioEmitter || entity.audioListener);
  if(world.audioScene){
    validateAudioScene(world.audioScene,world.entities || []);
  }else if(hasAudioComponents){
    throw new Error('world_audio_scene_required');
  }
  const ids = new Set<string>();
  for(const entity of world.entities || []){
    if(!entity.id) throw new Error('world_entity_id_missing');
    if(ids.has(entity.id)) throw new Error(`world_entity_duplicate:${entity.id}`);
    ids.add(entity.id);
    finiteVec3(entity.transform?.position,`entity_position_${entity.id}`);
    if(entity.transform.rotationDeg) finiteVec3(entity.transform.rotationDeg,`entity_rotation_${entity.id}`);
    if(entity.transform.scale){
      finiteVec3(entity.transform.scale,`entity_scale_${entity.id}`);
      if(entity.transform.scale.x<=0 || entity.transform.scale.y<=0 || entity.transform.scale.z<=0){
        throw new Error(`world_entity_scale_invalid:${entity.id}`);
      }
    }
    if(entity.collider?.type==='sphere'){
      if(!Number.isFinite(entity.collider.radius) || entity.collider.radius<=0){
        throw new Error(`world_entity_sphere_radius_invalid:${entity.id}`);
      }
    }
    if(entity.collider?.type==='box'){
      finiteVec3(entity.collider.halfExtents,`entity_box_half_extents_${entity.id}`);
      if(entity.collider.halfExtents.x<=0 || entity.collider.halfExtents.y<=0 || entity.collider.halfExtents.z<=0){
        throw new Error(`world_entity_box_half_extents_invalid:${entity.id}`);
      }
    }
    if(entity.animation) validateAnimationComponent(entity.animation);
    if(entity.navigationAgent){
      validateNavigationAgent(entity.navigationAgent,navigationMeshes);
      if(!entity.rigidBody || entity.rigidBody.kinematic){
        throw new Error(`world_navigation_agent_requires_dynamic_rigid_body:${entity.id}`);
      }
      if(!entity.collider){
        throw new Error(`world_navigation_agent_requires_collider:${entity.id}`);
      }
    }
    if(entity.rigidBody){
      if(!Number.isFinite(entity.rigidBody.mass) || entity.rigidBody.mass <= 0){
        throw new Error(`world_entity_mass_invalid:${entity.id}`);
      }
      if(entity.rigidBody.velocity) finiteVec3(entity.rigidBody.velocity,`entity_velocity_${entity.id}`);
      if(entity.rigidBody.acceleration) finiteVec3(entity.rigidBody.acceleration,`entity_acceleration_${entity.id}`);
    }
  }
  return true;
}

function runtimeEntity(source:WorldEntity,navigationMeshes:Map<string,NavigationMesh>):RuntimeEntity{
  const entity=clone(source) as RuntimeEntity;
  entity.transform.rotationDeg ||= clone(ZERO);
  entity.transform.scale ||= {x:1,y:1,z:1};
  if(entity.rigidBody){
    entity.rigidBody.velocity ||= clone(ZERO);
    entity.rigidBody.acceleration ||= clone(ZERO);
  }
  if(entity.animation){
    entity.animationRuntime=initializeAnimationRuntime(entity.animation);
  }
  if(entity.navigationAgent){
    const mesh=navigationMeshes.get(entity.navigationAgent.meshId);
    if(!mesh) throw new Error(`world_navigation_mesh_missing:${entity.navigationAgent.meshId}`);
    entity.navigationRuntime=initializeNavigationAgent(entity.navigationAgent,mesh,entity.transform.position);
  }
  if(entity.audioEmitter){
    entity.audioRuntime=initializeAudioEmitter(entity.audioEmitter);
  }
  return entity;
}

function colliderVerticalExtent(entity:RuntimeEntity){
  const collider=entity.collider;
  if(!collider) return 0;
  const scale=entity.transform.scale || {x:1,y:1,z:1};
  if(collider.type==='sphere'){
    return collider.radius*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z));
  }
  return collider.halfExtents.y*Math.abs(scale.y);
}

function colliderBottom(entity:RuntimeEntity){
  return entity.transform.position.y-colliderVerticalExtent(entity);
}

function colliderHorizontalRadius(entity:RuntimeEntity){
  const collider=entity.collider;
  if(!collider) return 0;
  const scale=entity.transform.scale || {x:1,y:1,z:1};
  if(collider.type==='sphere'){
    return collider.radius*Math.max(
      Math.abs(scale.x),
      Math.abs(scale.z)
    );
  }
  const hx=collider.halfExtents.x*Math.abs(scale.x);
  const hz=collider.halfExtents.z*Math.abs(scale.z);
  return Math.sqrt(hx*hx+hz*hz);
}

export class EvercraftWorldRuntime {
  readonly definition:WorldDefinition;
  readonly definitionDigest:string;
  readonly dt:number;
  private state:Map<string,RuntimeEntity>;
  private navigationMeshes:Map<string,NavigationMesh>;
  private audioClips:Map<string,AudioClipDefinition>;
  private cameraRuntimeState:CameraRuntimeState|null;
  private audioSceneRuntimeState:AudioSceneRuntime|null;
  private activeEntityIdsSet:Set<string>;
  private _tick=0;
  private _collisions:CollisionContact[]=[];

  constructor(definition:WorldDefinition){
    validateWorldDefinition(definition);
    this.definition=clone(definition);
    this.definitionDigest=worldDefinitionDigest(this.definition);
    this.dt=1/this.definition.tickRateHz;
    this.navigationMeshes=new Map(
      [...(this.definition.navigationMeshes || [])]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(mesh=>[mesh.id,clone(mesh)])
    );
    this.cameraRuntimeState=this.definition.visualScene
      ? initializeCameraRuntime(this.definition.visualScene)
      : null;
    this.audioClips=new Map(
      [...(this.definition.audioScene?.clips || [])]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(clip=>[clip.id,clone(clip)])
    );
    this.audioSceneRuntimeState=this.definition.audioScene
      ? initializeAudioSceneRuntime(this.definition.audioScene)
      : null;
    this.state=new Map(
      [...this.definition.entities]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(entity=>[entity.id,runtimeEntity(entity,this.navigationMeshes)])
    );
    this.activeEntityIdsSet=new Set([...this.state.keys()].sort());
  }

  get tick(){
    return this._tick;
  }

  get timeSec(){
    return this._tick*this.dt;
  }

  entity(id:string){
    const found=this.state.get(id);
    return found?clone(found):null;
  }

  get collisions(){
    return clone(this._collisions);
  }

  get activeEntityIds(){
    return [...this.activeEntityIdsSet].sort();
  }

  get cameraRuntime(){
    return this.cameraRuntimeState?clone(this.cameraRuntimeState):null;
  }

  get audioSceneRuntime(){
    return this.audioSceneRuntimeState?clone(this.audioSceneRuntimeState):null;
  }

  setActiveEntityIds(ids:string[]){
    const next=[...new Set(ids)].sort();
    for(const id of next){
      if(!this.state.has(id)) throw new Error(`world_active_entity_missing:${id}`);
    }
    this.activeEntityIdsSet=new Set(next);
    this._collisions=[];
    return this.activeEntityIds;
  }

  private mutateEntity(id:string){
    const found=this.state.get(id);
    if(!found) throw new Error(`world_entity_missing:${id}`);
    return found;
  }

  private applyInput(input:WorldInput){
    if(input.kind==='activate_camera'){
      if(!this.definition.visualScene || !this.cameraRuntimeState){
        throw new Error('world_visual_camera_runtime_missing');
      }
      const target=this.state.get(input.cameraEntityId);
      if(!target?.camera) throw new Error(`world_camera_entity_missing:${input.cameraEntityId}`);
      this.cameraRuntimeState=activateCamera(
        this.definition.visualScene,
        this.cameraRuntimeState,
        input.cameraEntityId,
        input.transitionId
      );
      return;
    }
    if(input.kind==='activate_audio_listener'){
      if(!this.definition.audioScene || !this.audioSceneRuntimeState){
        throw new Error('world_audio_scene_runtime_missing');
      }
      this.audioSceneRuntimeState=activateAudioListener(
        this.audioSceneRuntimeState,
        input.listenerEntityId,
        [...this.state.values()]
      );
      return;
    }
    const entity=this.mutateEntity(input.entityId);
    if(input.kind==='teleport'){
      finiteVec3(input.value,'teleport');
      entity.transform.position=clone(input.value);
      return;
    }
    if(input.kind==='set_property'){
      entity.properties ||= {};
      entity.properties[input.key]=clone(input.value);
      return;
    }
    if(input.kind==='play_audio' || input.kind==='pause_audio' || input.kind==='stop_audio' || input.kind==='seek_audio'){
      if(!entity.audioEmitter || !entity.audioRuntime){
        throw new Error(`world_entity_audio_missing:${entity.id}`);
      }
      if(input.kind==='play_audio'){
        playAudio(entity.audioEmitter,entity.audioRuntime);
      }else if(input.kind==='pause_audio'){
        pauseAudio(entity.audioEmitter,entity.audioRuntime);
      }else if(input.kind==='stop_audio'){
        stopAudio(entity.audioEmitter,entity.audioRuntime);
      }else{
        const clip=this.audioClips.get(entity.audioEmitter.clipId);
        if(!clip) throw new Error(`world_audio_clip_missing:${entity.audioEmitter.clipId}`);
        seekAudio(entity.audioEmitter,entity.audioRuntime,clip,input.value);
      }
      return;
    }
    if(input.kind==='set_animation_parameter'){
      if(!entity.animation || !entity.animationRuntime){
        throw new Error(`world_entity_animation_missing:${entity.id}`);
      }
      setAnimationParameter(entity.animationRuntime,input.key,input.value);
      return;
    }
    if(input.kind==='set_navigation_target'){
      if(!entity.navigationAgent || !entity.navigationRuntime){
        throw new Error(`world_entity_navigation_missing:${entity.id}`);
      }
      const mesh=this.navigationMeshes.get(entity.navigationAgent.meshId);
      if(!mesh) throw new Error(`world_navigation_mesh_missing:${entity.navigationAgent.meshId}`);
      entity.navigationRuntime=setNavigationTarget(
        entity.navigationAgent,
        entity.navigationRuntime,
        mesh,
        entity.transform.position,
        input.value
      );
      return;
    }
    if(input.kind==='clear_navigation_target'){
      if(!entity.navigationRuntime) throw new Error(`world_entity_navigation_missing:${entity.id}`);
      entity.navigationRuntime=clearNavigationTarget(entity.navigationRuntime);
      if(entity.rigidBody){
        entity.rigidBody.velocity.x=0;
        entity.rigidBody.velocity.z=0;
      }
      return;
    }
    if(!entity.rigidBody) throw new Error(`world_entity_not_dynamic:${entity.id}`);
    if(input.kind==='set_velocity'){
      finiteVec3(input.value,'set_velocity');
      entity.rigidBody.velocity=clone(input.value);
      return;
    }
    finiteVec3(input.value,'impulse');
    const invMass=1/entity.rigidBody.mass;
    entity.rigidBody.velocity=add(entity.rigidBody.velocity,scale(input.value,invMass));
  }

  private applyBehaviors(entity:RuntimeEntity,nextTime:number){
    for(const behavior of entity.behaviors || []){
      if(behavior.kind==='spin'){
        const rot=entity.transform.rotationDeg || clone(ZERO);
        entity.transform.rotationDeg=add(rot,scale(behavior.degreesPerSecond,this.dt));
      }else if(behavior.kind==='constant_force' && entity.rigidBody && !entity.rigidBody.kinematic){
        entity.rigidBody.acceleration=add(
          entity.rigidBody.acceleration,
          scale(behavior.force,1/entity.rigidBody.mass)
        );
      }else if(behavior.kind==='oscillate_y'){
        const base=Number(entity.properties?.oscillationBaseY ?? entity.transform.position.y);
        entity.properties ||= {};
        if(entity.properties.oscillationBaseY === undefined) entity.properties.oscillationBaseY=base;
        entity.transform.position.y=base + behavior.amplitude*Math.sin(
          Math.PI*2*behavior.frequencyHz*nextTime + (behavior.phaseRad || 0)
        );
      }
    }
  }

  private integrate(entity:RuntimeEntity){
    const body=entity.rigidBody;
    if(!body || body.kinematic) return;
    const gravity=scale(this.definition.gravity,body.gravityScale ?? 1);
    const acceleration=add(body.acceleration,gravity);
    body.velocity=add(body.velocity,scale(acceleration,this.dt));
    const damping=Math.max(0,Math.min(1,body.linearDamping ?? 0));
    body.velocity=scale(body.velocity,Math.max(0,1-damping*this.dt));
    entity.transform.position=add(entity.transform.position,scale(body.velocity,this.dt));
    body.acceleration=clone(ZERO);

    if(this.definition.ground?.enabled && colliderBottom(entity) < this.definition.ground.height){
      const extent=colliderVerticalExtent(entity);
      entity.transform.position.y=this.definition.ground.height+extent;
      if(body.velocity.y < 0){
        body.velocity.y=-body.velocity.y*Math.max(0,Math.min(1,body.restitution ?? 0));
        if(Math.abs(body.velocity.y) < 1e-10) body.velocity.y=0;
      }
    }
  }

  step(inputs:WorldInput[]=[]){
    const targetTick=this._tick+1;
    for(const entity of this.state.values()){
      if(entity.audioRuntime) clearAudioRuntimeEvents(entity.audioRuntime);
    }
    for(const input of [...inputs]
      .filter(item=>item.tick===targetTick)
      .sort((a,b)=>a.id.localeCompare(b.id))){
      this.applyInput(input);
    }

    const nextTime=targetTick*this.dt;
    if(this.cameraRuntimeState){
      this.cameraRuntimeState=stepCameraRuntime(this.cameraRuntimeState,this.dt);
    }
    const ordered=[...this.state.values()]
      .filter(entity=>this.activeEntityIdsSet.has(entity.id))
      .sort((a,b)=>a.id.localeCompare(b.id));

    const navigationObstacles:NavigationObstacleObservation[]=ordered
      .filter(entity=>Boolean(entity.collider))
      .map(entity=>({
        id:entity.id,
        position:clone(entity.transform.position),
        velocity:clone(entity.rigidBody?.velocity || ZERO),
        radius:colliderHorizontalRadius(entity),
        verticalRadius:colliderVerticalExtent(entity)
      }));

    for(const entity of ordered){
      this.applyBehaviors(entity,nextTime);
      if(entity.navigationAgent && entity.navigationRuntime){
        const mesh=this.navigationMeshes.get(entity.navigationAgent.meshId);
        if(!mesh) throw new Error(`world_navigation_mesh_missing:${entity.navigationAgent.meshId}`);
        entity.navigationRuntime=stepNavigationAgent(
          entity.navigationAgent,
          entity.navigationRuntime,
          entity.transform.position,
          this.dt,
          mesh,
          {
            selfId:entity.id,
            selfRadius:colliderHorizontalRadius(entity),
            selfVerticalRadius:colliderVerticalExtent(entity),
            obstacles:navigationObstacles
          }
        );
        if(entity.rigidBody){
          entity.rigidBody.velocity.x=entity.navigationRuntime.desiredVelocity.x;
          entity.rigidBody.velocity.z=entity.navigationRuntime.desiredVelocity.z;
        }
        if(
          entity.navigationAgent.animationMovingParameter &&
          entity.animationRuntime
        ){
          setAnimationParameter(
            entity.animationRuntime,
            entity.navigationAgent.animationMovingParameter,
            entity.navigationRuntime.state==='moving'
          );
        }
      }
      if(entity.animation && entity.animationRuntime){
        entity.animationRuntime=stepAnimationRuntime(entity.animation,entity.animationRuntime,this.dt);
      }
      if(entity.audioEmitter && entity.audioRuntime){
        const clip=this.audioClips.get(entity.audioEmitter.clipId);
        if(!clip) throw new Error(`world_audio_clip_missing:${entity.audioEmitter.clipId}`);
        stepAudioEmitter(entity.audioEmitter,entity.audioRuntime,clip,this.dt);
      }
      this.integrate(entity);
    }
    this._collisions=resolveEntityCollisions(ordered);
    this._tick=targetTick;
    return this.snapshot();
  }

  run(ticks:number,inputs:WorldInput[]=[]){
    if(!Number.isInteger(ticks) || ticks<0) throw new Error('world_run_ticks_invalid');
    let snapshot=this.snapshot();
    for(let i=0;i<ticks;i++) snapshot=this.step(inputs);
    return snapshot;
  }

  restoreSnapshot(snapshot:WorldSnapshot){
    if(snapshot?.schema!=='evercraft.world-engine.snapshot.v1'){
      throw new Error('world_snapshot_schema_invalid');
    }
    if(snapshot.worldId!==this.definition.id){
      throw new Error('world_snapshot_world_mismatch');
    }
    if(snapshot.worldVersion!==this.definition.version){
      throw new Error('world_snapshot_version_mismatch');
    }
    if(snapshot.definitionDigest!==this.definitionDigest){
      throw new Error('world_snapshot_definition_digest_mismatch');
    }
    if(!Number.isInteger(snapshot.tick) || snapshot.tick<0){
      throw new Error('world_snapshot_tick_invalid');
    }
    const expectedTime=Number((snapshot.tick*this.dt).toFixed(9));
    if(snapshot.timeSec!==expectedTime){
      throw new Error('world_snapshot_time_mismatch');
    }
    if(!verifyWorldSnapshot(snapshot)){
      throw new Error('world_snapshot_digest_invalid');
    }

    const definitionIds=[...this.definition.entities].map(entity=>entity.id).sort();
    const snapshotIds=[...snapshot.entities].map(entity=>entity.id).sort();
    if(snapshotIds.length!==new Set(snapshotIds).size){
      throw new Error('world_snapshot_entity_duplicate');
    }
    if(
      definitionIds.length!==snapshotIds.length ||
      definitionIds.some((id,index)=>id!==snapshotIds[index])
    ){
      throw new Error('world_snapshot_entity_set_mismatch');
    }

    const active=[...new Set(snapshot.activeEntityIds)].sort();
    for(const id of active){
      if(!snapshotIds.includes(id)) throw new Error(`world_snapshot_active_entity_missing:${id}`);
    }

    if(Boolean(this.definition.visualScene)!==Boolean(snapshot.cameraRuntime)){
      throw new Error('world_snapshot_camera_runtime_mismatch');
    }
    if(Boolean(this.definition.audioScene)!==Boolean(snapshot.audioSceneRuntime)){
      throw new Error('world_snapshot_audio_runtime_mismatch');
    }

    this.state=new Map(
      [...snapshot.entities]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(entity=>[entity.id,clone(entity)])
    );
    this.activeEntityIdsSet=new Set(active);
    this.cameraRuntimeState=snapshot.cameraRuntime?clone(snapshot.cameraRuntime):null;
    this.audioSceneRuntimeState=snapshot.audioSceneRuntime?clone(snapshot.audioSceneRuntime):null;
    this._collisions=clone(snapshot.collisions);
    this._tick=snapshot.tick;

    const restored=this.snapshot();
    if(restored.digest!==snapshot.digest){
      throw new Error('world_snapshot_restore_digest_mismatch');
    }
    return restored;
  }

  snapshot():WorldSnapshot{
    const core={
      schema:'evercraft.world-engine.snapshot.v1' as const,
      worldId:this.definition.id,
      worldVersion:this.definition.version,
      definitionDigest:this.definitionDigest,
      tick:this._tick,
      timeSec:Number(this.timeSec.toFixed(9)),
      entities:[...this.state.values()]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(entity=>clone(entity)),
      activeEntityIds:this.activeEntityIds,
      cameraRuntime:this.cameraRuntime,
      audioSceneRuntime:this.audioSceneRuntime,
      collisions:clone(this._collisions)
    };
    return sealWorldSnapshot(core);
  }
}

export function replayWorld(definition:WorldDefinition,ticks:number,inputs:WorldInput[]=[]):ReplayReceipt{
  const first=new EvercraftWorldRuntime(definition).run(ticks,inputs);
  const second=new EvercraftWorldRuntime(definition).run(ticks,inputs);
  return {
    schema:'evercraft.world-engine.replay-receipt.v1',
    worldId:definition.id,
    requestedTicks:ticks,
    finalTick:first.tick,
    inputCount:inputs.length,
    definitionDigest:first.definitionDigest,
    finalSnapshotDigest:first.digest,
    deterministic:first.digest===second.digest
  };
}
