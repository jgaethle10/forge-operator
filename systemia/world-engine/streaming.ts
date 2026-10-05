import crypto from 'node:crypto';
import { EvercraftWorldRuntime, type Vec3, type WorldDefinition } from './engine.js';
import { WorldEntityStore } from './entity-store.js';

export interface SceneBounds {
  min:Vec3;
  max:Vec3;
}

export interface SceneChunk {
  id:string;
  bounds:SceneBounds;
  entityIds:string[];
  preloadRadius:number;
  dependencies?:string[];
  priority?:number;
}

export interface SceneManifest {
  schema:'evercraft.world-engine.scene-manifest.v1';
  worldId:string;
  chunks:SceneChunk[];
}

export interface SceneStreamPlan {
  schema:'evercraft.world-engine.scene-stream-plan.v1';
  worldId:string;
  focus:Vec3;
  load:string[];
  keep:string[];
  unload:string[];
  activeAfter:string[];
  activeEntityIds:string[];
  globalEntityIds:string[];
  digest:string;
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

function finiteVec3(value:Vec3,label:string){
  for(const axis of ['x','y','z'] as const){
    if(!Number.isFinite(value?.[axis])) throw new Error(`scene_stream_invalid_${label}_${axis}`);
  }
}

function distanceToBounds(point:Vec3,bounds:SceneBounds){
  const dx=Math.max(bounds.min.x-point.x,0,point.x-bounds.max.x);
  const dy=Math.max(bounds.min.y-point.y,0,point.y-bounds.max.y);
  const dz=Math.max(bounds.min.z-point.z,0,point.z-bounds.max.z);
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

function sortedUnique(values:string[]){
  return [...new Set(values)].sort();
}

export function validateSceneManifest(world:WorldDefinition,manifest:SceneManifest){
  if(manifest?.schema!=='evercraft.world-engine.scene-manifest.v1'){
    throw new Error('scene_stream_manifest_schema_invalid');
  }
  if(manifest.worldId!==world.id) throw new Error('scene_stream_world_mismatch');

  const store=new WorldEntityStore(world.entities);
  const chunks=new Map<string,SceneChunk>();
  const entityOwners=new Map<string,string>();

  for(const chunk of manifest.chunks || []){
    if(!chunk.id) throw new Error('scene_stream_chunk_id_missing');
    if(chunks.has(chunk.id)) throw new Error(`scene_stream_chunk_duplicate:${chunk.id}`);
    finiteVec3(chunk.bounds?.min,`chunk_min_${chunk.id}`);
    finiteVec3(chunk.bounds?.max,`chunk_max_${chunk.id}`);
    if(
      chunk.bounds.min.x>chunk.bounds.max.x ||
      chunk.bounds.min.y>chunk.bounds.max.y ||
      chunk.bounds.min.z>chunk.bounds.max.z
    ) throw new Error(`scene_stream_chunk_bounds_invalid:${chunk.id}`);
    if(!Number.isFinite(chunk.preloadRadius) || chunk.preloadRadius<0){
      throw new Error(`scene_stream_preload_radius_invalid:${chunk.id}`);
    }

    for(const entityId of sortedUnique(chunk.entityIds || [])){
      if(!store.has(entityId)) throw new Error(`scene_stream_entity_missing:${chunk.id}:${entityId}`);
      const owner=entityOwners.get(entityId);
      if(owner && owner!==chunk.id){
        throw new Error(`scene_stream_entity_multi_chunk:${entityId}:${owner}:${chunk.id}`);
      }
      entityOwners.set(entityId,chunk.id);
    }
    chunks.set(chunk.id,chunk);
  }

  for(const chunk of chunks.values()){
    for(const dependency of sortedUnique(chunk.dependencies || [])){
      if(!chunks.has(dependency)){
        throw new Error(`scene_stream_dependency_missing:${chunk.id}:${dependency}`);
      }
      if(dependency===chunk.id){
        throw new Error(`scene_stream_self_dependency:${chunk.id}`);
      }
    }
  }

  return true;
}

export class SceneStreamController {
  private readonly world:WorldDefinition;
  private readonly manifest:SceneManifest;
  private readonly chunks:Map<string,SceneChunk>;
  private readonly globalEntityIds:string[];
  private active=new Set<string>();

  constructor(world:WorldDefinition,manifest:SceneManifest){
    validateSceneManifest(world,manifest);
    this.world=structuredClone(world);
    this.manifest=structuredClone(manifest);
    this.chunks=new Map(
      [...this.manifest.chunks]
        .sort((a,b)=>a.id.localeCompare(b.id))
        .map(chunk=>[chunk.id,chunk])
    );

    const assigned=new Set(
      [...this.chunks.values()].flatMap(chunk=>chunk.entityIds || [])
    );
    this.globalEntityIds=this.world.entities
      .map(entity=>entity.id)
      .filter(id=>!assigned.has(id))
      .sort();
  }

  get activeChunks(){
    return [...this.active].sort();
  }

  private expandDependencies(seed:Set<string>){
    const desired=new Set(seed);
    const visit=(id:string,path:Set<string>)=>{
      if(path.has(id)) return;
      const nextPath=new Set(path);
      nextPath.add(id);
      const chunk=this.chunks.get(id);
      if(!chunk) return;
      for(const dependency of sortedUnique(chunk.dependencies || [])){
        desired.add(dependency);
        visit(dependency,nextPath);
      }
    };
    for(const id of [...desired].sort()) visit(id,new Set());
    return desired;
  }

  preview(focus:Vec3,pinnedChunkIds:string[]=[]):SceneStreamPlan{
    finiteVec3(focus,'focus');

    const desiredSeed=new Set<string>();
    for(const chunk of [...this.chunks.values()].sort((a,b)=>
      (b.priority || 0)-(a.priority || 0) || a.id.localeCompare(b.id)
    )){
      if(distanceToBounds(focus,chunk.bounds)<=chunk.preloadRadius){
        desiredSeed.add(chunk.id);
      }
    }

    for(const id of sortedUnique(pinnedChunkIds)){
      if(!this.chunks.has(id)) throw new Error(`scene_stream_pin_missing:${id}`);
      desiredSeed.add(id);
    }

    const desired=this.expandDependencies(desiredSeed);
    const activeBefore=new Set(this.active);
    const activeAfter=[...desired].sort();
    const load=activeAfter.filter(id=>!activeBefore.has(id));
    const keep=activeAfter.filter(id=>activeBefore.has(id));
    const unload=[...activeBefore].filter(id=>!desired.has(id)).sort();

    const sceneEntityIds=activeAfter.flatMap(id=>this.chunks.get(id)?.entityIds || []);
    const activeEntityIds=sortedUnique([...this.globalEntityIds,...sceneEntityIds]);
    const core={
      schema:'evercraft.world-engine.scene-stream-plan.v1' as const,
      worldId:this.world.id,
      focus:structuredClone(focus),
      load,
      keep,
      unload,
      activeAfter,
      activeEntityIds,
      globalEntityIds:[...this.globalEntityIds]
    };
    return {...core,digest:digest(core)};
  }

  transition(focus:Vec3,pinnedChunkIds:string[]=[]){
    const plan=this.preview(focus,pinnedChunkIds);
    this.active=new Set(plan.activeAfter);
    return plan;
  }

  apply(runtime:EvercraftWorldRuntime,plan:SceneStreamPlan){
    if(plan.worldId!==this.world.id) throw new Error('scene_stream_plan_world_mismatch');
    runtime.setActiveEntityIds(plan.activeEntityIds);
    return runtime.snapshot();
  }
}
