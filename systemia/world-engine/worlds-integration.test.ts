import test from 'node:test';
import assert from 'node:assert/strict';
import {EvercraftWorldRuntime,validateWorldDefinition,replayWorld} from './engine.js';
import {initialWorld,applyCommand} from '../../public/worlds/world-core.mjs';
import {toEngineWorld} from '../../public/worlds/world-bridge.mjs';

test('Worlds browser scene produces a valid authoritative World Engine definition',()=>{
 let local=initialWorld();
 local=applyCommand(local,'add tree').world;
 local=applyCommand(local,'plant flower at 4, 2').world;
 const world=toEngineWorld(local);
 assert.equal(validateWorldDefinition(world),true);
 assert.equal(world.version,local.revision);
 assert.equal(world.entities.filter(e=>e.tags?.includes('user_created')).length,2);
 assert.ok(world.entities.some(e=>e.id==='scene:portal'));
 const runtime=new EvercraftWorldRuntime(world);
 const snapshot=runtime.run(30);
 assert.equal(snapshot.tick,30);
 assert.equal(snapshot.worldVersion,local.revision);
 const replay=replayWorld(world,30);
 assert.equal(replay.deterministic,true);
 assert.equal(replay.finalSnapshotDigest,snapshot.digest);
});
