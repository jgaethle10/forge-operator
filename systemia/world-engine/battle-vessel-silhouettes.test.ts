import test from 'node:test';
import assert from 'node:assert/strict';
import {battleVesselGeometry,historicSilhouetteWorld,historicSilhouetteTake,VESSELS} from './battle-vessel-silhouettes.js';
import {validateWorldDefinition,worldDefinitionDigest} from './engine.js';
test('four distinct original hulls and main battery arrangements are genuine World Engine geometry',()=>{
 const scene=historicSilhouetteWorld();
 validateWorldDefinition(scene);
 assert.equal(VESSELS.length,4);
 assert.equal(new Set(scene.entities.map(e=>e.id)).size,scene.entities.length);
 assert.equal(scene.entities.filter(e=>e.id==='ocean').length,1);
 const hulls=battleVesselGeometry().filter(g=>g.id.startsWith('owned:battle-vessel-')&&g.id.endsWith('-hull'));
 assert.equal(hulls.length,4);
 assert.equal(new Set(hulls.map(g=>g.positions.join(','))).size,4);
 for(const v of VESSELS){
  assert.ok(scene.entities.some(e=>e.id===v.id+'-ship-hull'));
  const guns=scene.entities.filter(e=>e.id.startsWith(v.id+'-barrel-'));
  const turrets=scene.entities.filter(e=>e.id.startsWith(v.id+'-turret-'));
  assert.equal(guns.length,v.turrets.reduce((n,t)=>n+t.guns,0));
  assert.equal(turrets.length,v.turrets.length);
  assert.ok(scene.entities.some(e=>e.id===v.id+'-bridge-tower'));
  assert.ok(scene.entities.some(e=>e.id===v.id+'-radar-crossbar'));
 }
 assert.equal(scene.entities.filter(e=>e.id==='hood-barrel-A-0').length,1);
 assert.equal(scene.entities.filter(e=>e.id.startsWith('prince-of-wales-barrel-')).length,10);
 assert.equal(scene.entities.filter(e=>e.id.startsWith('bismarck-barrel-')).length,8);
 assert.equal(scene.entities.filter(e=>e.id.startsWith('prinz-eugen-barrel-')).length,8);
});
test('silhouette world declares historical limits and preserves release denial',()=>{
 const a=historicSilhouetteWorld(),b=historicSilhouetteWorld();
 assert.equal(worldDefinitionDigest(a),worldDefinitionDigest(b));
 assert.equal(a.metadata?.historicallyAuthenticatedPositions,false);
 assert.equal(a.metadata?.actorMotionImplemented,false);
 assert.equal(a.metadata?.commercialPublicationAuthorized,false);
 assert.ok(a.visualScene?.directionalShadows);
 assert.deepEqual(a.entities.find(e=>e.id==='ocean')?.transform.scale,{x:4,y:1,z:4});
 const shot=historicSilhouetteTake();
 assert.equal(shot.durationSec,4);
 assert.equal(shot.fps,24);
 assert.equal(shot.targetEntityId,'hood-ship-hull');
 const close=historicSilhouetteTake('bismarck_hero');
 assert.equal(close.targetEntityId,'bismarck-ship-hull');
 assert.ok(close.orbit.radius<shot.orbit.radius);
 assert.throws(()=>historicSilhouetteTake('invalid_profile' as 'formation'),/historic_camera_profile_unapproved/);
});
