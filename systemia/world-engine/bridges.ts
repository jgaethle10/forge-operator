import crypto from 'node:crypto';
import type { WorldDefinition, WorldEntity } from './engine.js';
import {
  geometryAssetDigest,
  validateGeometryAsset,
  type GeometryAsset
} from './webgpu.js';
import { compileVisualFrame, type VisualFrameContract } from './visual.js';
import { compileAudioFrame, type AudioFrameContract } from './audio.js';

type LooseRecord=Record<string,any>;

function stableBridge(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stableBridge);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stableBridge(item)])
    );
  }
  return value;
}

function bridgeDigest(value:unknown){
  return crypto.createHash('sha256')
    .update(JSON.stringify(stableBridge(value)))
    .digest('hex');
}

function vec(x=0,y=0,z=0){ return {x,y,z}; }

export interface FallenGeometryAsset {
  schema:'evercraft.fallen.geometry.v1';
  id:string;
  primitive:'triangles';
  positions:number[];
  normals:number[];
  uvs:number[];
  indices?:number[];
}

export interface FallenGeometryImportReceipt {
  schema:'evercraft.world-engine.fallen-geometry-import.v1';
  sourceAssetId:string;
  sourceDigest:string;
  geometryId:string;
  geometryDigest:string;
  vertexCount:number;
  triangleCount:number;
  tangentGeneration:'deterministic_uv_gram_schmidt_v1';
  generatedTangents:true;
  digest:string;
}

export interface FallenGeometryImportResult {
  geometry:GeometryAsset;
  receipt:FallenGeometryImportReceipt;
}

function normalize3(x:number,y:number,z:number){
  const length=Math.sqrt(x*x+y*y+z*z);
  if(!Number.isFinite(length) || length<=1e-12){
    throw new Error('fallen_geometry_vector_zero');
  }
  return [x/length,y/length,z/length] as [number,number,number];
}

function cross3(
  ax:number,ay:number,az:number,
  bx:number,by:number,bz:number
){
  return [
    ay*bz-az*by,
    az*bx-ax*bz,
    ax*by-ay*bx
  ] as [number,number,number];
}

export function generateDeterministicTangents(
  positions:number[],
  normals:number[],
  uvs:number[],
  indices?:number[]
){
  if(!Array.isArray(positions) || positions.length<9 || positions.length%3!==0){
    throw new Error('fallen_geometry_positions_invalid');
  }
  const vertexCount=positions.length/3;
  if(!Array.isArray(normals) || normals.length!==positions.length){
    throw new Error('fallen_geometry_normals_invalid');
  }
  if(!Array.isArray(uvs) || uvs.length!==vertexCount*2){
    throw new Error('fallen_geometry_uvs_invalid');
  }
  for(const value of [...positions,...normals,...uvs]){
    if(!Number.isFinite(value)) throw new Error('fallen_geometry_non_finite');
  }

  const triangleIndices=indices
    ? [...indices]
    : Array.from({length:vertexCount},(_,index)=>index);
  if(triangleIndices.length<3 || triangleIndices.length%3!==0){
    throw new Error('fallen_geometry_triangles_invalid');
  }
  for(const index of triangleIndices){
    if(!Number.isInteger(index) || index<0 || index>=vertexCount){
      throw new Error('fallen_geometry_index_invalid');
    }
  }

  const tan1=new Float64Array(vertexCount*3);
  const tan2=new Float64Array(vertexCount*3);

  for(let offset=0;offset<triangleIndices.length;offset+=3){
    const i0=triangleIndices[offset];
    const i1=triangleIndices[offset+1];
    const i2=triangleIndices[offset+2];

    const p0=i0*3,p1=i1*3,p2=i2*3;
    const uv0=i0*2,uv1=i1*2,uv2=i2*2;

    const x1=positions[p1]-positions[p0];
    const y1=positions[p1+1]-positions[p0+1];
    const z1=positions[p1+2]-positions[p0+2];
    const x2=positions[p2]-positions[p0];
    const y2=positions[p2+1]-positions[p0+1];
    const z2=positions[p2+2]-positions[p0+2];

    const s1=uvs[uv1]-uvs[uv0];
    const t1=uvs[uv1+1]-uvs[uv0+1];
    const s2=uvs[uv2]-uvs[uv0];
    const t2=uvs[uv2+1]-uvs[uv0+1];
    const denominator=s1*t2-s2*t1;
    if(!Number.isFinite(denominator) || Math.abs(denominator)<=1e-12){
      throw new Error(`fallen_geometry_uv_triangle_degenerate:${offset/3}`);
    }
    const inv=1/denominator;
    const tx=(x1*t2-x2*t1)*inv;
    const ty=(y1*t2-y2*t1)*inv;
    const tz=(z1*t2-z2*t1)*inv;
    const bx=(x2*s1-x1*s2)*inv;
    const by=(y2*s1-y1*s2)*inv;
    const bz=(z2*s1-z1*s2)*inv;

    for(const index of [i0,i1,i2]){
      const base=index*3;
      tan1[base]+=tx;tan1[base+1]+=ty;tan1[base+2]+=tz;
      tan2[base]+=bx;tan2[base+1]+=by;tan2[base+2]+=bz;
    }
  }

  const tangents:number[]=[];
  for(let index=0;index<vertexCount;index++){
    const base=index*3;
    const [nx,ny,nz]=normalize3(
      normals[base],normals[base+1],normals[base+2]
    );
    const dot=nx*tan1[base]+ny*tan1[base+1]+nz*tan1[base+2];
    const [tx,ty,tz]=normalize3(
      tan1[base]-nx*dot,
      tan1[base+1]-ny*dot,
      tan1[base+2]-nz*dot
    );
    const [cx,cy,cz]=cross3(nx,ny,nz,tx,ty,tz);
    const handedness=(cx*tan2[base]+cy*tan2[base+1]+cz*tan2[base+2])<0
      ? -1
      : 1;
    tangents.push(tx,ty,tz,handedness);
  }
  return tangents;
}

export function geometryFromFallenAsset(
  asset:FallenGeometryAsset
):FallenGeometryImportResult{
  if(asset?.schema!=='evercraft.fallen.geometry.v1'){
    throw new Error('fallen_geometry_schema_invalid');
  }
  if(!asset.id?.trim()) throw new Error('fallen_geometry_id_missing');
  if(asset.primitive!=='triangles'){
    throw new Error(`fallen_geometry_primitive_unsupported:${asset.id}`);
  }

  const sourceDigest=bridgeDigest(asset);
  const geometry:GeometryAsset={
    schema:'evercraft.world-engine.geometry.v1',
    id:asset.id,
    primitive:'triangles',
    positions:[...asset.positions],
    normals:[...asset.normals],
    uvs:[...asset.uvs],
    tangents:generateDeterministicTangents(
      asset.positions,
      asset.normals,
      asset.uvs,
      asset.indices
    ),
    ...(asset.indices?{indices:[...asset.indices]}:{})
  };
  validateGeometryAsset(geometry);
  const geometryDigest=geometryAssetDigest(geometry);
  const core={
    schema:'evercraft.world-engine.fallen-geometry-import.v1' as const,
    sourceAssetId:asset.id,
    sourceDigest,
    geometryId:geometry.id,
    geometryDigest,
    vertexCount:geometry.positions.length/3,
    triangleCount:(geometry.indices?.length || geometry.positions.length/3)/3,
    tangentGeneration:'deterministic_uv_gram_schmidt_v1' as const,
    generatedTangents:true as const
  };
  return {
    geometry,
    receipt:{...core,digest:bridgeDigest(core)}
  };
}

export function worldFromFallenStudio(studioWorld:LooseRecord):WorldDefinition{
  if(studioWorld?.schema!=='evercraft.fallen.studio-world.v1'){
    throw new Error('fallen_studio_world_schema_invalid');
  }

  const rooms:Array<LooseRecord>=Array.isArray(studioWorld.rooms)?studioWorld.rooms:[];
  const entities:WorldEntity[]=[];
  for(let index=0;index<rooms.length;index++){
    const room=rooms[index];
    entities.push({
      id:`room:${room.id}`,
      name:room.label || room.id,
      transform:{position:vec(index*24,0,0)},
      collider:{type:'box',halfExtents:vec(10,3,8)},
      assetRefs:room.setPlateAssetId?[room.setPlateAssetId]:[],
      tags:['fallen','studio_room'],
      properties:{
        source_schema:studioWorld.schema,
        room_id:room.id,
        display_slots:room.displaySlots || [],
        camera_anchors:room.cameraAnchors || [],
        canonical:true
      }
    });
  }

  for(const transition of studioWorld.transitions || []){
    const fromIndex=rooms.findIndex(room=>room.id===transition.from);
    const toIndex=rooms.findIndex(room=>room.id===transition.to);
    const midpoint=((Math.max(0,fromIndex)+Math.max(0,toIndex))*24)/2;
    entities.push({
      id:`portal:${transition.from}:${transition.to}`,
      name:`${transition.from} → ${transition.to}`,
      transform:{position:vec(midpoint,1.5,0)},
      tags:['fallen','portal'],
      properties:{
        from:transition.from,
        to:transition.to,
        style:transition.style,
        durationSec:transition.durationSec
      }
    });
  }

  return {
    schema:'evercraft.world-engine.world.v1',
    id:`fallen:${studioWorld.id}`,
    version:Number(studioWorld.version || 1),
    tickRateHz:60,
    gravity:vec(0,-9.81,0),
    ground:{enabled:true,height:0},
    entities,
    metadata:{
      source:'fallen',
      source_schema:studioWorld.schema,
      source_world_id:studioWorld.id,
      source_world_digest:null,
      render_authority:false,
      publication_authority:false
    }
  };
}

export interface WorldstateProjectionInput {
  schema?:string;
  id?:string;
  observations?:Array<{
    id?:string;
    subject_id?:string;
    label?:string;
    evidence_state?:string;
    source_refs?:string[];
    lat?:number;
    lon?:number;
    properties?:Record<string,unknown>;
    [key:string]:unknown;
  }>;
  [key:string]:unknown;
}

function approximateLocalMeters(lat:number,lon:number,originLat:number,originLon:number){
  const metersPerDegreeLat=111_320;
  const metersPerDegreeLon=111_320*Math.cos(originLat*Math.PI/180);
  return {
    x:(lon-originLon)*metersPerDegreeLon,
    y:0,
    z:-(lat-originLat)*metersPerDegreeLat
  };
}

export function projectWorldstateIntoWorld(
  world:WorldDefinition,
  snapshot:WorldstateProjectionInput,
  origin?:{lat:number;lon:number}
):WorldDefinition{
  const observations=Array.isArray(snapshot.observations)?snapshot.observations:[];
  const projected=observations.map((observation,index):WorldEntity=>{
    const hasGeo=Number.isFinite(observation.lat)&&Number.isFinite(observation.lon)&&origin;
    const position=hasGeo
      ? approximateLocalMeters(Number(observation.lat),Number(observation.lon),origin!.lat,origin!.lon)
      : vec(0,0,0);
    return {
      id:`worldstate:${observation.id || observation.subject_id || index}`,
      name:observation.label || observation.subject_id || observation.id || `Observation ${index+1}`,
      transform:{position},
      tags:['worldstate','evidence_projection'],
      properties:{
        evidence_state:observation.evidence_state || 'unknown',
        source_refs:observation.source_refs || [],
        source_snapshot_id:snapshot.id || null,
        geospatial_projection:hasGeo?'local_equirectangular_approximation':'none',
        raw_properties:observation.properties || {}
      }
    };
  });

  return {
    ...world,
    version:world.version+1,
    entities:[...world.entities,...projected]
      .sort((a,b)=>a.id.localeCompare(b.id)),
    metadata:{
      ...(world.metadata || {}),
      worldstate_projection:{
        source_schema:snapshot.schema || null,
        source_snapshot_id:snapshot.id || null,
        observation_count:projected.length,
        origin:origin || null,
        decision_authority:false
      }
    }
  };
}

export interface WorldRenderFrame {
  schema:'evercraft.world-engine.render-frame.v1';
  worldId:string;
  tick:number;
  timeSec:number;
  cameraId:string;
  visual:VisualFrameContract|null;
  audio:AudioFrameContract|null;
  entities:Array<{
    id:string;
    transform:WorldEntity['transform'];
    assetRefs:string[];
    tags:string[];
    properties:Record<string,unknown>;
    animation:null|{
      stateId:string;
      stateTimeSec:number;
      pose:Array<{
        boneId:string;
        translation:{x:number;y:number;z:number};
        rotationDeg:{x:number;y:number;z:number};
        scale:{x:number;y:number;z:number};
      }>;
      transition:unknown;
      events:unknown[];
    };
    navigation:null|{
      state:string;
      target:{x:number;y:number;z:number}|null;
      waypointIndex:number;
      desiredVelocity:{x:number;y:number;z:number};
      path:unknown;
      replanCount:number;
    };
  }>;
}

export function compileRenderFrame(
  snapshot:{
    worldId:string;
    tick:number;
    timeSec:number;
    entities:any[];
    activeEntityIds?:string[];
    cameraRuntime?:any;
    audioSceneRuntime?:any;
  },
  cameraId='default',
  world?:WorldDefinition
):WorldRenderFrame{
  const visual=world?.visualScene && snapshot.cameraRuntime
    ? compileVisualFrame(
        snapshot.worldId,
        snapshot.tick,
        snapshot.timeSec,
        world.visualScene,
        snapshot.entities,
        snapshot.cameraRuntime,
        snapshot.activeEntityIds
      )
    : null;
  const audio=world?.audioScene && snapshot.audioSceneRuntime
    ? compileAudioFrame(
        snapshot.worldId,
        snapshot.tick,
        snapshot.timeSec,
        world.audioScene,
        snapshot.entities,
        snapshot.audioSceneRuntime,
        snapshot.activeEntityIds
      )
    : null;
  return {
    schema:'evercraft.world-engine.render-frame.v1',
    worldId:snapshot.worldId,
    tick:snapshot.tick,
    timeSec:snapshot.timeSec,
    cameraId:visual?.camera.cameraId || cameraId,
    visual,
    audio,
    entities:[...snapshot.entities]
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
      .map(entity=>({
        id:entity.id,
        transform:entity.transform,
        assetRefs:entity.assetRefs || [],
        tags:entity.tags || [],
        properties:entity.properties || {},
        animation:entity.animationRuntime?{
          stateId:entity.animationRuntime.stateId,
          stateTimeSec:entity.animationRuntime.stateTimeSec,
          pose:entity.animationRuntime.pose || [],
          transition:entity.animationRuntime.transition || null,
          events:entity.animationRuntime.events || []
        }:null,
        navigation:entity.navigationRuntime?{
          state:entity.navigationRuntime.state,
          target:entity.navigationRuntime.target || null,
          waypointIndex:entity.navigationRuntime.waypointIndex || 0,
          desiredVelocity:entity.navigationRuntime.desiredVelocity || {x:0,y:0,z:0},
          path:entity.navigationRuntime.path || null,
          replanCount:entity.navigationRuntime.replanCount || 0
        }:null
      }))
  };
}
