import test from 'node:test';
import assert from 'node:assert/strict';
import {battleshipWorld,battleshipGeometry,battleshipTake} from './battleship-scene.js';
import {validateWorldDefinition} from './engine.js';
import {validateGeometryAsset} from './webgpu.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';

test('battleship is actual mesh geometry with shaped hull, wave surface, sloped turrets and naval barrels',()=>{
  const assets=battleshipGeometry();
  const ids=assets.map(x=>x.id);
  for(const name of ['owned:battleship-hull','owned:naval-cannon','owned:armored-turret','owned:procedural-sea'])
    assert.ok(ids.includes(name));
  for(const mesh of assets){assert.equal(validateGeometryAsset(mesh),true);assert.ok(mesh.positions.length>=54);}
  assert.ok(assets.find(x=>x.id==='owned:procedural-sea')!.positions.length>30000);
  assert.ok(assets.find(x=>x.id==='owned:battleship-hull')!.positions.length>100);
});
test('ship has readable armament and environmental depth rather than a rotor with a different label',()=>{
  const world=battleshipWorld();
  assert.equal(validateWorldDefinition(world),true);
  assert.ok(world.entities.length>=55);
  assert.equal(world.visualScene?.cinematicLighting?.shading,'ggx_microfacet');
  assert.equal(world.visualScene?.directionalShadows?.directionalLightEntityId,'sun');
  assert.ok(world.entities.filter(x=>x.id.startsWith('turret-')).length>=3);
  assert.ok(world.entities.filter(x=>x.id.startsWith('barrel-')).length>=6);
  assert.ok(world.entities.filter(x=>x.id.startsWith('wake-')).length>=20);
  assert.equal(world.entities.find(x=>x.id==='ocean')?.renderable?.castsShadow,false);
});
test('real GPU frame plans incorporate all battleship meshes and cinematic orbit with hash integrity',()=>{
  const world=battleshipWorld(),geometry=battleshipGeometry();
  const shot={...battleshipTake(),durationSec:.5};
  const a=buildCinematicCameraSequence({
    world,take:shot,geometries:geometry,viewport:{width:640,height:360}});
  assert.equal(a.frameCount,13);
  assert.ok(a.frames.every(x=>x.renderPlan.draws.length>=50));
  assert.ok(a.frames[0].renderPlan.draws.some(x=>x.geometryId==='owned:battleship-hull'));
  assert.ok(a.frames[0].renderPlan.draws.some(x=>x.geometryId==='owned:procedural-sea'));
  assert.ok(a.frames[0].renderPlan.shadow?.lightViewProjectionMatrix.every(Number.isFinite));
  assert.notEqual(a.frames[0].renderPlan.digest,a.frames[12].renderPlan.digest);
  assert.equal(a.boundaries.publicationAuthority,false);
});
