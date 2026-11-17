import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHouse,advanceHouse,placeFurniture,removeFurniture} from '../public/living-worlds/house-core.mjs';
import {toHouseEngineWorld} from '../public/living-worlds/house-world-bridge.mjs';
import {toHouseEngineTickInputs,HOUSE_ENGINE_TICK_SCHEMA} from '../public/living-worlds/house-engine-inputs.mjs';
import {decisionContext,parseProposalFromContext,applyProposal} from '../public/living-worlds/agent-proposals.mjs';
import {
  validateWorldDefinition,EvercraftWorldRuntime,replayWorld,verifyWorldSnapshot
} from '../systemia/world-engine/engine.ts';

const at=a=>({x:a.x-4,y:0.9,z:a.y-2.5});

test('real World Engine accepts the generated House 001 scene',()=>{
  const world=toHouseEngineWorld(makeHouse());
  assert.equal(validateWorldDefinition(world),true);
  const runtime=new EvercraftWorldRuntime(world);
  const snapshot=runtime.snapshot();
  assert.equal(verifyWorldSnapshot(snapshot),true);
  assert.equal(snapshot.entities.length,11);
  assert.equal(runtime.entity('resident:mara')?.name,'Mara');
  assert.equal(runtime.entity('furniture:f3')?.collider?.type,'box');
  assert.equal(world.metadata.productionAuthoritative,false);
});

test('real engine applies 20 House ticks, stores visible state, and verifies replay',()=>{
  const house=makeHouse(818);
  const original=toHouseEngineWorld(house);
  const engine=new EvercraftWorldRuntime(original);
  const inputs=[];
  for(let i=1;i<=20;i++){
    const prev=structuredClone(house);
    advanceHouse(house);
    const packet=toHouseEngineTickInputs(prev,house,engine.tick+1);
    assert.equal(packet.schema,HOUSE_ENGINE_TICK_SCHEMA);
    assert.equal(packet.sourceTick,i);
    assert.equal(packet.engineTick,i);
    assert.ok(packet.inputs.every(x=>x.tick===i));
    inputs.push(...packet.inputs);
    const result=engine.step(packet.inputs);
    assert.equal(result.tick,i);
    assert.equal(verifyWorldSnapshot(result),true);
    for(const actor of house.actors){
      const entity=engine.entity('resident:'+actor.id);
      assert.deepEqual(entity.transform.position,at(actor));
      assert.equal(entity.properties.houseState.energy,actor.energy);
      assert.equal(entity.properties.houseState.currentAction,actor.action);
      assert.equal(entity.properties.houseState.coins,actor.coins);
      assert.equal('memories' in entity.properties.houseState,false);
    }
  }
  const proof=replayWorld(original,20,inputs);
  assert.equal(proof.deterministic,true);
  assert.equal(proof.finalSnapshotDigest,engine.snapshot().digest);
  assert.equal(proof.finalTick,20);
  const recovered=new EvercraftWorldRuntime(original);
  assert.equal(recovered.restoreSnapshot(engine.snapshot()).digest,engine.snapshot().digest);
});

test('world furniture edits must go through canonical world-edit transactions, not movement inputs',()=>{
  const previous=makeHouse();
  const edited=structuredClone(previous);
  advanceHouse(edited);
  assert.equal(placeFurniture(edited,'plant',8,5),true);
  assert.throws(()=>toHouseEngineTickInputs(previous,edited,1),/world_edit_required/);
  assert.equal(removeFurniture(edited,8,5),true);
  assert.doesNotThrow(()=>toHouseEngineTickInputs(previous,edited,1));
});

test('validated model intent is observable in the real engine without tool execution',()=>{
  const house=makeHouse();
  const context=decisionContext(house,'sable');
  const text=JSON.stringify({action:'use_object',target_id:'f1',reason:'I want to talk with Mara.'});
  const proposal=parseProposalFromContext(context,text);
  assert.equal(applyProposal(house,proposal),true);
  const engine=new EvercraftWorldRuntime(toHouseEngineWorld(house));
  const before=structuredClone(house);
  advanceHouse(house);
  const packet=toHouseEngineTickInputs(before,house,1);
  const state=engine.step(packet.inputs);
  assert.equal(verifyWorldSnapshot(state),true);
  assert.equal(engine.entity('resident:sable').properties.houseState.targetEntityId,'furniture:f1');
  assert.equal('I want to talk with Mara.' in engine.entity('resident:sable').properties,false);
});
