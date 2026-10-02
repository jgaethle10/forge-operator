import type { WorldDefinition, WorldEntity } from './engine.js';

type LooseRecord=Record<string,any>;

function vec(x=0,y=0,z=0){ return {x,y,z}; }

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
  entities:Array<{
    id:string;
    transform:WorldEntity['transform'];
    assetRefs:string[];
    tags:string[];
    properties:Record<string,unknown>;
  }>;
}

export function compileRenderFrame(
  snapshot:{worldId:string;tick:number;timeSec:number;entities:any[]},
  cameraId='default'
):WorldRenderFrame{
  return {
    schema:'evercraft.world-engine.render-frame.v1',
    worldId:snapshot.worldId,
    tick:snapshot.tick,
    timeSec:snapshot.timeSec,
    cameraId,
    entities:[...snapshot.entities]
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
      .map(entity=>({
        id:entity.id,
        transform:entity.transform,
        assetRefs:entity.assetRefs || [],
        tags:entity.tags || [],
        properties:entity.properties || {}
      }))
  };
}
