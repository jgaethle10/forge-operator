import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCinematicFlyoverScene} from './cinematic-flyover.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame,verifyVisualFrameContract} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,validateGeometryAsset} from '../world-engine/webgpu.ts';

function compile(t){
  const fixture=buildCinematicFlyoverScene(t);
  for(const g of fixture.geometries) assert.equal(validateGeometryAsset(g),true,g.id);
  const engine=new EvercraftWorldRuntime(fixture.world);
  const snap=engine.snapshot();
  const frame=compileVisualFrame(snap.worldId,snap.tick,snap.timeSec,
    engine.definition.visualScene,snap.entities,snap.cameraRuntime,engine.activeEntityIds);
  assert.equal(verifyVisualFrameContract(frame),true);
  const plan=compileWebGpuRenderPlan(frame,fixture.geometries,{width:1280,height:720});
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  return {fixture,frame,plan};
}
test('cinematic scene enriches original renderer-neutral geometry',()=>{
  const {fixture,plan}=compile(0);
  assert.equal(fixture.schema,'evercraft.visual-engine.cinematic-flyover.v2');
  assert.equal(fixture.provenance.realWorldEvidence,false);
  assert.ok(fixture.geometries.length>=20);
  assert.ok(plan.draws.length>=20);
  for(const id of ['cinematic:vertical-tail','cinematic:propeller','cinematic:near-island',
    'cinematic:cloud-left','cinematic:canopy-shell']){
    assert.ok(plan.draws.some(d=>d.geometryId===id),'missing draw:'+id);
  }
  assert.equal(plan.width,1280);
  assert.equal(plan.height,720);
});
test('moving camera is not locked at a fixed chase angle',()=>{
  const early=compile(0),late=compile(4),repeat=compile(4);
  assert.equal(late.plan.digest,repeat.plan.digest);
  assert.notEqual(early.plan.digest,late.plan.digest);
  assert.notEqual(early.frame.camera.transform.rotationDeg.y,late.frame.camera.transform.rotationDeg.y);
  assert.notEqual(early.frame.camera.transform.position.x,late.frame.camera.transform.position.x);
  assert.deepEqual(early.fixture.geometries,late.fixture.geometries);
});
test('invalid cinematic time fails closed',()=>{
  for(const t of [-1,61,NaN,Infinity]){
    assert.throws(()=>buildCinematicFlyoverScene(t),/cinematic_flyover_time_invalid/);
  }
});
test('canonical material and geometry identities remain valid',()=>{
  const {fixture}=compile(1);
  const materials=fixture.world.visualScene.materials;
  assert.equal(new Set(materials.map(m=>m.id)).size,materials.length);
  assert.equal(new Set(fixture.geometries.map(g=>g.id)).size,fixture.geometries.length);
  const allIds=new Set(fixture.geometries.map(g=>g.id));
  for(const entity of fixture.world.entities){
    if(entity.renderable) assert.ok(allIds.has(entity.renderable.geometryRef),entity.id);
  }
});
