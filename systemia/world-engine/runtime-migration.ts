import crypto from 'node:crypto';
import {
  EvercraftWorldRuntime,
  sealWorldSnapshot,
  verifyWorldSnapshot,
  worldDefinitionDigest,
  type RuntimeEntity,
  type WorldDefinition,
  type WorldSnapshot
} from './engine.js';

export interface RuntimeMigrationOptions {
  activateNewEntities?:boolean;
}

export interface EntityRuntimeMigrationNote {
  entityId:string;
  status:'migrated'|'added'|'removed';
  preserved:string[];
  reset:string[];
}

export interface WorldRuntimeMigrationReceipt {
  schema:'evercraft.world-engine.runtime-migration-receipt.v1';
  migrationId:string;
  worldId:string;
  fromWorldVersion:number;
  toWorldVersion:number;
  fromDefinitionDigest:string;
  toDefinitionDigest:string;
  sourceSnapshotDigest:string;
  migratedSnapshotDigest:string;
  tick:number;
  timeSec:number;
  activeEntityIds:string[];
  addedEntityIds:string[];
  removedEntityIds:string[];
  entityNotes:EntityRuntimeMigrationNote[];
  cameraRuntimePreserved:boolean;
  audioSceneRuntimePreserved:boolean;
  collisionsReset:true;
  digest:string;
}

export interface WorldRuntimeMigrationResult {
  runtime:EvercraftWorldRuntime;
  snapshot:WorldSnapshot;
  receipt:WorldRuntimeMigrationReceipt;
}

export interface WorldRuntimeMigrationRequest {
  id:string;
  previousDefinition:WorldDefinition;
  nextDefinition:WorldDefinition;
  previousSnapshot:WorldSnapshot;
  options?:RuntimeMigrationOptions;
}

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

function same(a:unknown,b:unknown){
  return digest(a ?? null)===digest(b ?? null);
}

function safeId(value:string){
  const id=String(value||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(id)){
    throw new Error('runtime_migration_id_invalid');
  }
  return id;
}

function bodyContract(entity:any){
  const body=entity?.rigidBody;
  if(!body) return null;
  return {
    mass:body.mass,
    gravityScale:body.gravityScale ?? 1,
    linearDamping:body.linearDamping ?? 0,
    restitution:body.restitution ?? 0,
    kinematic:body.kinematic === true
  };
}

function navigationContract(world:WorldDefinition,entity:any){
  if(!entity?.navigationAgent) return null;
  const mesh=(world.navigationMeshes || []).find(item=>item.id===entity.navigationAgent.meshId) || null;
  return {
    agent:entity.navigationAgent,
    mesh
  };
}

function audioClipContract(world:WorldDefinition,entity:any){
  if(!entity?.audioEmitter) return null;
  const clip=world.audioScene?.clips.find(item=>item.id===entity.audioEmitter!.clipId) || null;
  return {
    emitter:entity.audioEmitter,
    clip
  };
}

function cameraRuntimeCanMigrate(
  nextDefinition:WorldDefinition,
  previousSnapshot:WorldSnapshot
){
  const runtime=previousSnapshot.cameraRuntime;
  if(!runtime) return false;
  if(!nextDefinition.visualScene) return false;

  const cameraIds=new Set(
    nextDefinition.entities
      .filter(entity=>Boolean(entity.camera))
      .map(entity=>entity.id)
  );

  if(!runtime.transition){
    return cameraIds.has(runtime.activeCameraId);
  }

  if(
    !cameraIds.has(runtime.transition.fromCameraId) ||
    !cameraIds.has(runtime.transition.toCameraId)
  ) return false;

  const transition=nextDefinition.visualScene.cameraTransitions
    ?.find(item=>item.id===runtime.transition!.id);

  if(!transition) return false;
  return (
    transition.fromCameraId===runtime.transition.fromCameraId &&
    transition.toCameraId===runtime.transition.toCameraId &&
    transition.durationSec===runtime.transition.durationSec &&
    (transition.curve || 'smoothstep')===runtime.transition.curve
  );
}

function audioSceneRuntimeCanMigrate(
  nextDefinition:WorldDefinition,
  previousSnapshot:WorldSnapshot
){
  const runtime=previousSnapshot.audioSceneRuntime;
  if(!runtime || !nextDefinition.audioScene) return false;
  const listener=nextDefinition.entities.find(
    entity=>entity.id===runtime.activeListenerEntityId
  );
  return Boolean(listener?.audioListener);
}

function copyRuntimeState(
  target:RuntimeEntity,
  source:RuntimeEntity,
  previousDefinition:WorldDefinition,
  nextDefinition:WorldDefinition,
  previousEntity:any,
  nextEntity:any
){
  const preserved:string[]=[];
  const reset:string[]=[];

  const transformCompatible=same(previousEntity.transform,nextEntity.transform);
  if(transformCompatible){
    target.transform=clone(source.transform);
    preserved.push('transform');
  }else{
    reset.push('transform');
  }

  if(same(previousEntity.properties ?? null,nextEntity.properties ?? null)){
    if(source.properties===undefined){
      delete target.properties;
    }else{
      target.properties=clone(source.properties);
    }
    preserved.push('properties');
  }else{
    reset.push('properties');
  }

  if(
    target.rigidBody &&
    source.rigidBody &&
    same(bodyContract(previousEntity),bodyContract(nextEntity))
  ){
    target.rigidBody.velocity=clone(source.rigidBody.velocity);
    target.rigidBody.acceleration=clone(source.rigidBody.acceleration);
    preserved.push('rigidBodyMotion');
  }else if(target.rigidBody || source.rigidBody){
    reset.push('rigidBodyMotion');
  }

  if(
    target.animationRuntime &&
    source.animationRuntime &&
    same(previousEntity.animation ?? null,nextEntity.animation ?? null)
  ){
    target.animationRuntime=clone(source.animationRuntime);
    preserved.push('animationRuntime');
  }else if(target.animationRuntime || source.animationRuntime){
    reset.push('animationRuntime');
  }

  if(
    transformCompatible &&
    target.navigationRuntime &&
    source.navigationRuntime &&
    same(
      navigationContract(previousDefinition,previousEntity),
      navigationContract(nextDefinition,nextEntity)
    )
  ){
    target.navigationRuntime=clone(source.navigationRuntime);
    preserved.push('navigationRuntime');
  }else if(target.navigationRuntime || source.navigationRuntime){
    reset.push('navigationRuntime');
  }

  if(
    target.audioRuntime &&
    source.audioRuntime &&
    same(
      audioClipContract(previousDefinition,previousEntity),
      audioClipContract(nextDefinition,nextEntity)
    )
  ){
    target.audioRuntime=clone(source.audioRuntime);
    preserved.push('audioRuntime');
  }else if(target.audioRuntime || source.audioRuntime){
    reset.push('audioRuntime');
  }

  return {preserved,reset};
}

export function migrateWorldRuntime(
  request:WorldRuntimeMigrationRequest
):WorldRuntimeMigrationResult{
  const migrationId=safeId(request.id);
  const previousDefinition=clone(request.previousDefinition);
  const nextDefinition=clone(request.nextDefinition);
  const previousSnapshot=clone(request.previousSnapshot);
  const activateNewEntities=request.options?.activateNewEntities!==false;

  if(!verifyWorldSnapshot(previousSnapshot)){
    throw new Error('runtime_migration_source_snapshot_digest_invalid');
  }
  if(previousDefinition.id!==nextDefinition.id){
    throw new Error('runtime_migration_world_id_mismatch');
  }
  if(previousSnapshot.worldId!==previousDefinition.id){
    throw new Error('runtime_migration_snapshot_world_mismatch');
  }

  const previousDigest=worldDefinitionDigest(previousDefinition);
  if(previousSnapshot.definitionDigest!==previousDigest){
    throw new Error('runtime_migration_source_definition_digest_mismatch');
  }
  if(previousSnapshot.worldVersion!==previousDefinition.version){
    throw new Error('runtime_migration_source_version_mismatch');
  }
  if(nextDefinition.version<=previousDefinition.version){
    throw new Error('runtime_migration_target_version_not_advanced');
  }
  if(nextDefinition.tickRateHz!==previousDefinition.tickRateHz){
    throw new Error('runtime_migration_tick_rate_change_unsupported');
  }

  const nextRuntime=new EvercraftWorldRuntime(nextDefinition);
  const baseline=nextRuntime.snapshot();
  const previousById=new Map(previousSnapshot.entities.map(entity=>[entity.id,entity]));
  const previousDefinitionById=new Map(previousDefinition.entities.map(entity=>[entity.id,entity]));
  const nextDefinitionById=new Map(nextDefinition.entities.map(entity=>[entity.id,entity]));
  const migratedEntities=baseline.entities.map(entity=>clone(entity));
  const migratedById=new Map(migratedEntities.map(entity=>[entity.id,entity]));

  const notes:EntityRuntimeMigrationNote[]=[];
  const previousIds=new Set(previousDefinition.entities.map(entity=>entity.id));
  const nextIds=new Set(nextDefinition.entities.map(entity=>entity.id));

  for(const entityId of [...nextIds].sort()){
    const target=migratedById.get(entityId)!;
    const source=previousById.get(entityId);
    const previousEntity=previousDefinitionById.get(entityId);
    const nextEntity=nextDefinitionById.get(entityId)!;

    if(!source || !previousEntity){
      notes.push({
        entityId,
        status:'added',
        preserved:[],
        reset:['allRuntimeState']
      });
      continue;
    }

    const state=copyRuntimeState(
      target,
      source,
      previousDefinition,
      nextDefinition,
      previousEntity,
      nextEntity
    );
    notes.push({
      entityId,
      status:'migrated',
      preserved:state.preserved.sort(),
      reset:state.reset.sort()
    });
  }

  const removed=[...previousIds]
    .filter(id=>!nextIds.has(id))
    .sort();
  for(const entityId of removed){
    notes.push({
      entityId,
      status:'removed',
      preserved:[],
      reset:['entityRemoved']
    });
  }

  const added=[...nextIds]
    .filter(id=>!previousIds.has(id))
    .sort();

  const active=new Set<string>();
  for(const id of previousSnapshot.activeEntityIds){
    if(nextIds.has(id)) active.add(id);
  }
  if(activateNewEntities){
    for(const id of added) active.add(id);
  }

  const cameraRuntimePreserved=cameraRuntimeCanMigrate(
    nextDefinition,
    previousSnapshot
  );
  const audioSceneRuntimePreserved=audioSceneRuntimeCanMigrate(
    nextDefinition,
    previousSnapshot
  );

  const migratedCore:Omit<WorldSnapshot,'digest'>={
    schema:'evercraft.world-engine.snapshot.v1',
    worldId:nextDefinition.id,
    worldVersion:nextDefinition.version,
    definitionDigest:nextRuntime.definitionDigest,
    tick:previousSnapshot.tick,
    timeSec:Number((previousSnapshot.tick*nextRuntime.dt).toFixed(9)),
    entities:[...migratedById.values()].sort((a,b)=>a.id.localeCompare(b.id)),
    activeEntityIds:[...active].sort(),
    cameraRuntime:cameraRuntimePreserved
      ? clone(previousSnapshot.cameraRuntime)
      : nextRuntime.cameraRuntime,
    audioSceneRuntime:audioSceneRuntimePreserved
      ? clone(previousSnapshot.audioSceneRuntime)
      : nextRuntime.audioSceneRuntime,
    collisions:[]
  };

  const migratedSnapshot=sealWorldSnapshot(migratedCore);
  const restored=nextRuntime.restoreSnapshot(migratedSnapshot);

  const receiptCore={
    schema:'evercraft.world-engine.runtime-migration-receipt.v1' as const,
    migrationId,
    worldId:nextDefinition.id,
    fromWorldVersion:previousDefinition.version,
    toWorldVersion:nextDefinition.version,
    fromDefinitionDigest:previousDigest,
    toDefinitionDigest:nextRuntime.definitionDigest,
    sourceSnapshotDigest:previousSnapshot.digest,
    migratedSnapshotDigest:restored.digest,
    tick:restored.tick,
    timeSec:restored.timeSec,
    activeEntityIds:clone(restored.activeEntityIds),
    addedEntityIds:added,
    removedEntityIds:removed,
    entityNotes:notes.sort((a,b)=>a.entityId.localeCompare(b.entityId)),
    cameraRuntimePreserved,
    audioSceneRuntimePreserved,
    collisionsReset:true as const
  };

  return {
    runtime:nextRuntime,
    snapshot:restored,
    receipt:{...receiptCore,digest:digest(receiptCore)}
  };
}

export function verifyWorldRuntimeMigrationReceipt(
  receipt:WorldRuntimeMigrationReceipt
){
  if(receipt?.schema!=='evercraft.world-engine.runtime-migration-receipt.v1'){
    return false;
  }
  const {digest:claimed,...core}=receipt;
  return typeof claimed==='string' && claimed===digest(core);
}
