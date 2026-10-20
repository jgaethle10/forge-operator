import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeBattleshipFilmFrame} from './native-format-camera.js';
import {battleshipWorld,battleshipGeometry} from './battleship-scene.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';

test('each format defines its OWN world camera viewport and deliberate frame composition',()=>{
 const a=nativeBattleshipFilmFrame('landscape');
 const b=nativeBattleshipFilmFrame('square');
 const c=nativeBattleshipFilmFrame('portrait');
 assert.deepEqual([a.viewport,b.viewport,c.viewport],
  [{width:640,height:360},{width:480,height:480},{width:360,height:640}]);
 assert.deepEqual([a.aspectRatio,b.aspectRatio,c.aspectRatio],['16:9','1:1','9:16']);
 assert.notEqual(a.take.id,b.take.id);
 assert.notEqual(b.take.id,c.take.id);
 assert.notDeepEqual(a.take.orbit,b.take.orbit);
 assert.notDeepEqual(b.take.orbit,c.take.orbit);
 assert.ok(c.framingIntent.includes('gunhouse'));
 for(const format of [a,b,c]){
  assert.equal(format.nativeGpuFrameRequired,true);
  assert.equal(format.releaseAuthority,false);
  assert.equal(format.take.schema,'evercraft.world-engine.cinematic-camera-take.v1');
  assert.equal(format.take.durationSec,4);
 }
});
test('real canonical World Engine frame compilation differs for native 9:16 and 16:9 shots',()=>{
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const summaries=[];
 for(const format of ['landscape','square','portrait'] as const){
  const profile=nativeBattleshipFilmFrame(format);
  // Shorten only test runtime; production remains 4s/96 frames.
  const take={...profile.take,durationSec:.5};
  const result=buildCinematicCameraSequence({
   world,geometries,take,viewport:profile.viewport
  });
  assert.equal(result.frameCount,13);
  assert.equal(result.boundaries.publicationAuthority,false);
  assert.equal(result.frames[0].renderPlan.viewport.width,profile.viewport.width);
  assert.equal(result.frames[0].renderPlan.viewport.height,profile.viewport.height);
  assert.ok(result.frames[0].renderPlan.draws.length>45);
  summaries.push(result.frames[0].renderPlan.digest);
 }
 assert.equal(new Set(summaries).size,3);
});
test('format selection is fail-closed for unsupported camera formats',()=>{
 assert.throws(()=>nativeBattleshipFilmFrame('anamorphic' as any),/native_film_format_unsupported/);
 assert.throws(()=>nativeBattleshipFilmFrame('' as any),/native_film_format_unsupported/);
});
