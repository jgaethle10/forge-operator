import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHouse,advanceHouse,placeFurniture,removeFurniture,gift} from '../public/living-worlds/house-core.mjs';
import {HOUSE_ENGINE_BRIDGE_SCHEMA,toHouseEngineWorld} from '../public/living-worlds/house-world-bridge.mjs';

test('House 001 exports the canonical V1 definition envelope and grounded entity identities',()=>{
  const house=makeHouse();
  const projected=toHouseEngineWorld(house);
  assert.equal(projected.schema,'evercraft.world-engine.world.v1');
  assert.equal(projected.id,'living-worlds-house-001');
  assert.equal(projected.tickRateHz,60);
  assert.equal(projected.gravity.y,-9.81);
  assert.equal(projected.metadata.producer,HOUSE_ENGINE_BRIDGE_SCHEMA);
  assert.equal(projected.metadata.productionAuthoritative,false);
  assert.equal(projected.metadata.exportedMemories,false);
  assert.equal(projected.entities.length,1+house.furniture.length+house.actors.length);
  const ids=projected.entities.map(e=>e.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(projected.entities.find(e=>e.id==='resident:mara'));
  assert.ok(projected.entities.find(e=>e.id==='furniture:f1'));
});
test('furniture layout and 2D resident movement project to stable 3D coordinates',()=>{
  const house=makeHouse(818);
  const before=toHouseEngineWorld(house);
  assert.deepEqual(before.entities.find(e=>e.id==='furniture:f1').transform.position,{x:-3,y:0.35,z:-1.5});
  const added=placeFurniture(house,'plant',8,5);
  assert.equal(added,true);
  advanceHouse(house);
  const after=toHouseEngineWorld(house);
  const plant=after.entities.find(e=>e.id==='furniture:f7');
  assert.deepEqual(plant.transform.position,{x:4,y:0.41,z:2.5});
  assert.equal(after.metadata.sourceTick,1);
  assert.equal(after.entities.find(e=>e.id==='resident:mara').properties.tileX,house.actors[0].x);
  assert.equal(after.entities.find(e=>e.id==='resident:mara').properties.tileY,house.actors[0].y);
  assert.ok(after.version>before.version);
  assert.equal(removeFurniture(house,8,5),true);
  assert.equal(toHouseEngineWorld(house).entities.some(e=>e.id==='furniture:f7'),false);
});
test('model and spectator events stay local, and source snapshot is not mutated by projection',()=>{
  const house=makeHouse();
  gift(house,'mara');
  house.actors[0].memories.push('Private narrative memory that should not be exported');
  const before=JSON.stringify(house);
  const world=toHouseEngineWorld(house);
  assert.equal(JSON.stringify(house),before);
  assert.equal(JSON.stringify(world).includes('Private narrative memory'),false);
  assert.equal(JSON.stringify(world).includes('"events"'),false);
  assert.equal(world.entities.find(e=>e.id==='resident:mara').properties.coins,house.actors[0].coins);
});
test('tampered house cannot become an engine world',()=>{
  const house=makeHouse();
  assert.throws(()=>toHouseEngineWorld({...house,actors:[]}),/house_bridge_invalid_source/);
  assert.throws(()=>toHouseEngineWorld({...house,furniture:[...house.furniture,{id:'f99',kind:'gun',x:8,y:5}]}),/house_bridge_invalid_source/);
});
