import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDataConstellationScene} from './data-constellation-scene.js';
import {validateGeometryAsset} from './webgpu.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';

test('Original data constellation has deterministic, meaningful 3D geometry and no borrowed data',()=>{
  const a=makeDataConstellationScene(),b=makeDataConstellationScene();
  assert.deepEqual(a,b);
  assert.equal(a.world.schema,'evercraft.world-engine.world.v1');
  assert.equal(a.receipt.nodeCount,75);
  assert.ok(a.receipt.linkCount>60);
  assert.equal(a.world.metadata?.publication_authority,false);
  assert.equal(a.world.metadata?.real_relationships,false);
  assert.equal(a.receipt.publicationAuthority,false);
  assert.equal(a.receipt.customerReady,false);
  assert.equal(a.geometries.length,2);
  for(const mesh of a.geometries)assert.equal(validateGeometryAsset(mesh),true);
  const ids=a.world.entities.map(x=>x.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(a.world.visualScene?.materials.length,8);
});
test('Original cinematic material/camera coverage uses actual lights without over-limit',()=>{
  const {world,take}=makeDataConstellationScene();
  assert.equal(take.cameraEntityId,'cinema-camera');
  assert.equal(take.targetEntityId,'knowledge-core');
  assert.equal(take.fps,24);
  const lights=world.entities.filter(e=>e.light);
  assert.equal(lights.length,5);
  const nodeInstances=world.entities.filter(e=>e.id.includes('-signal-'));
  assert.equal(nodeInstances.length,75);
  assert.ok(nodeInstances.some(e=>e.transform.position.x< -3));
  assert.ok(nodeInstances.some(e=>e.transform.position.x> 3));
  assert.ok(world.entities.some(e=>e.id==='knowledge-core'));
});
test('World Engine builds real digest-verified camera and GPU render plans from authored constellation',()=>{
  const {world,take,geometries}=makeDataConstellationScene();
  const s=buildCinematicCameraSequence({world,take,geometries,viewport:{width:640,height:360}});
  assert.equal(s.frameCount,97);
  assert.equal(s.boundaries.publicationAuthority,false);
  const frames=[s.frames[0],s.frames[48],s.frames[95]];
  assert.ok(frames.every(f=>f.renderPlan.draws.length>=150));
  assert.ok(frames.every(f=>f.renderPlan.lights.length===5));
  assert.ok(frames.every(f=>f.renderPlan.digest.length===64));
  assert.notEqual(frames[0].renderPlan.digest,frames[48].renderPlan.digest);
  assert.notEqual(frames[48].renderPlan.digest,frames[95].renderPlan.digest);
});
