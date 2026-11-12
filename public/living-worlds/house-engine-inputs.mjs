// House 001 -> canonical World Engine tick input bridge.
// Pure adapter: never mutates either house or runs a separate physics simulation.
import {validateHouse} from './house-core.mjs';

export const HOUSE_ENGINE_TICK_SCHEMA='evercraft.living-worlds.engine-tick.v1';
const position=(a)=>({x:a.x-4,y:0.9,z:a.y-2.5});
const snapshot=(a)=>({
  tileX:a.x,tileY:a.y,energy:a.energy,hunger:a.hunger,
  social:a.social,mood:a.mood,coins:a.coins,currentAction:a.action,
  targetEntityId:a.target?'furniture:'+a.target:null,
  goalId:a.goal?.id||null,goalPhase:a.goal?.phase||0,
  goalProgress:a.goal?.progress||0,goalCompleted:a.goal?.completed||0
});
function layoutSignature(house){
  return house.furniture.map(({id,kind,x,y})=>[id,kind,x,y].join(':')).sort().join('|');
}
export function toHouseEngineTickInputs(previous,current,engineTick){
  if(!validateHouse(previous)||!validateHouse(current)||
    previous.schema!==current.schema||previous.tick+1!==current.tick||
    previous.day>current.day||!Number.isSafeInteger(engineTick)||engineTick<1){
    throw Error('house_engine_tick_invalid_source');
  }
  if(layoutSignature(previous)!==layoutSignature(current)){
    throw Error('house_engine_world_edit_required');
  }
  const inputs=[];
  for(let i=0;i<current.actors.length;i++){
    const before=previous.actors[i],after=current.actors[i];
    if(before.id!==after.id)throw Error('house_engine_resident_id_changed');
    const entityId='resident:'+after.id;
    if(before.x!==after.x||before.y!==after.y){
      inputs.push({
        id:'house001:'+current.tick+':'+after.id+':move',
        tick:engineTick,entityId,kind:'teleport',value:position(after)
      });
    }
    inputs.push({
      id:'house001:'+current.tick+':'+after.id+':state',
      tick:engineTick,entityId,kind:'set_property',key:'houseState',value:snapshot(after)
    });
  }
  return {
    schema:HOUSE_ENGINE_TICK_SCHEMA,
    sourceTick:current.tick,
    engineTick,worldId:'living-worlds-house-001',
    furnitureRevisionRequired:false,
    inputs
  };
}
