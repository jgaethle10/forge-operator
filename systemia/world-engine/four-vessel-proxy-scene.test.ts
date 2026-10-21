import test from 'node:test';
import assert from 'node:assert/strict';
import {fourVesselProxyWorld,fourVesselProxyTake,DENMARK_STRAIT_PROXY_ACTORS} from './four-vessel-proxy-scene.js';
import {battleshipWorld} from './battleship-scene.js';
import {validateWorldDefinition,worldDefinitionDigest} from './engine.js';
test('four source-authored vessel actors become distinct actual 3D entities without cloning the ocean',()=>{
 const world=fourVesselProxyWorld();
 validateWorldDefinition(world);
 assert.equal(DENMARK_STRAIT_PROXY_ACTORS.length,4);
 assert.equal(new Set(world.entities.map(x=>x.id)).size,world.entities.length);
 assert.equal(world.entities.filter(x=>x.id==='ocean').length,1);
 assert.equal(world.entities.filter(x=>x.id==='ship-hull').length,1);
 for(const actor of DENMARK_STRAIT_PROXY_ACTORS.slice(1)){
  const hull=world.entities.find(x=>x.id===actor.id+'-ship-hull');
  const turret=world.entities.find(x=>x.id===actor.id+'-turret-fore-a');
  assert.ok(hull?.renderable&&turret?.renderable);
  assert.deepEqual(hull.transform.position,actor.center);
  assert.equal(hull.transform.rotationDeg?.y,actor.headingDeg);
  assert.equal(hull.transform.scale?.x,actor.scale);
  assert.ok(hull.tags?.includes('not_reconstructed_history'));
 }
 assert.equal(world.metadata?.detailedVesselModelsVerified,false);
 assert.equal(world.metadata?.realHistoricalTracksUsed,false);
 assert.equal(world.metadata?.publicReleaseAllowed,false);
 assert.ok(world.entities.filter(e=>e.renderable).length>battleshipWorld().entities.filter(e=>e.renderable).length*2);
});
test('formation staging is deterministic and uses a real 4s camera take',()=>{
 const a=fourVesselProxyWorld(),b=fourVesselProxyWorld();
 assert.equal(worldDefinitionDigest(a),worldDefinitionDigest(b));
 const take=fourVesselProxyTake();
 assert.equal(take.targetEntityId,'ship-hull');
 assert.equal(take.durationSec,4);
 assert.equal(take.fps,24);
 assert.equal(take.move,'orbit');
});
