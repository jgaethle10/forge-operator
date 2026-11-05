// Read-only House 001 scene projection into the existing Evercraft World Engine V1 contract.
// This is scene data, not an authoritative World Engine runtime or a 3D renderer.
import {WIDTH,HEIGHT,KINDS,room,validateHouse} from './house-core.mjs';

export const HOUSE_ENGINE_BRIDGE_SCHEMA='evercraft.living-worlds.world-bridge.v1';
const vec=(x,y,z)=>({x,y,z});
const FURNITURE_EXTENTS=Object.freeze({
  bed:[0.44,0.27,0.42], fridge:[0.40,0.75,0.39], sofa:[0.47,0.35,0.42],
  desk:[0.45,0.39,0.34], plant:[0.24,0.41,0.24], table:[0.43,0.38,0.40]
});
// Grid coordinates map to X/Z positions, retaining local tile coordinates in properties.
function at(x,y,height=0){return vec(x-(WIDTH-1)/2,height,y-(HEIGHT-1)/2);}
export function toHouseEngineWorld(house){
  if(!validateHouse(house))throw Error('house_bridge_invalid_source');
  const entities=[
    {
      id:'house:floor',
      name:'House 001 floor',
      transform:{position:vec(0,0,0)},
      tags:['living-worlds','house-001','floor','static','projection_only'],
      properties:{widthTiles:WIDTH,heightTiles:HEIGHT,tileSizeMeters:1}
    },
    ...house.furniture.map(f=>{
      const [hx,hy,hz]=FURNITURE_EXTENTS[f.kind];
      return {
        id:'furniture:'+f.id,
        name:KINDS[f.kind].label,
        transform:{position:at(f.x,f.y,hy)},
        collider:{type:'box',halfExtents:vec(hx,hy,hz)},
        tags:['living-worlds','house-001','furniture','static',f.kind],
        properties:{sourceId:f.id,tileX:f.x,tileY:f.y,room:room(f.x,f.y),
          objectKind:f.kind,generatedGeometry:false}
      };
    }),
    ...house.actors.map(a=>({
      id:'resident:'+a.id,
      name:a.name,
      transform:{position:at(a.x,a.y,0.9)},
      tags:['living-worlds','house-001','resident','synthetic_agent','projection_only'],
      properties:{sourceId:a.id,tileX:a.x,tileY:a.y,
        room:room(a.x,a.y),trait:a.trait,aspiration:a.wish,
        mood:a.mood,energy:a.energy,hunger:a.hunger,social:a.social,
        currentAction:a.action,coins:a.coins,
        targetEntityId:a.target?'furniture:'+a.target:null,
        source:'rules_or_validated_local_model'}
    }))
  ];
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'living-worlds-house-001',
    version:Math.max(1,house.tick+house.nextEventId),
    tickRateHz:60,
    gravity:vec(0,-9.81,0),
    ground:{enabled:true,height:0},
    entities,
    metadata:{producer:HOUSE_ENGINE_BRIDGE_SCHEMA,
      sourceSchema:house.schema,sourceTick:house.tick,sourceDay:house.day,
      sourceTimeMinutes:house.minute,
      projectionOnly:true,productionAuthoritative:false,
      noRenderableGeometry:true,noSharedServer:true,
      exportedMemories:false}
  };
}
