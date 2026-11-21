import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlyoverScene} from './flyover.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame,verifyVisualFrameContract} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,validateGeometryAsset,verifyWebGpuRenderPlan} from '../world-engine/webgpu.ts';

function renderPlan(timeSec){
  const fixture=buildFlyoverScene(timeSec);
  for(const geometry of fixture.geometries) assert.equal(validateGeometryAsset(geometry),true);
  const runtime=new EvercraftWorldRuntime(fixture.world);
  const snapshot=runtime.snapshot();
  const frame=compileVisualFrame(
    snapshot.worldId,snapshot.tick,snapshot.timeSec,
    runtime.definition.visualScene,snapshot.entities,
    snapshot.cameraRuntime,runtime.activeEntityIds
  );
  assert.equal(verifyVisualFrameContract(frame),true);
  const plan=compileWebGpuRenderPlan(
    frame,fixture.geometries,
    {width:fixture.renderTarget.width,height:fixture.renderTarget.height}
  );
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  return {fixture,frame,plan};
}
test('flyover compiles into an authenticated 16:9 WebGPU render plan',()=>{
  const {frame,plan}=renderPlan(0);
  assert.equal(plan.width,1280);
  assert.equal(plan.height,720);
  assert.equal(plan.sourceVisualFrameDigest,frame.digest);
  assert.equal(plan.shadingModel,'evercraft-pbr-lite-v1');
  assert.equal(plan.draws.length,8);
  assert.equal(plan.lights.length,2);
  assert.ok(plan.draws.some(draw=>draw.geometryId==='flyover:fuselage'));
  assert.ok(plan.draws.some(draw=>draw.geometryId==='flyover:sea'));
});
test('camera and moving aircraft produce distinct repeatable plans',()=>{
  const first=renderPlan(0);
  const again=renderPlan(0);
  const late=renderPlan(4);
  assert.equal(first.plan.digest,again.plan.digest);
  assert.notEqual(first.plan.digest,late.plan.digest);
  assert.deepEqual(first.fixture.geometries,late.fixture.geometries);
  assert.notEqual(first.frame.camera.transform.position.z,late.frame.camera.transform.position.z);
});
test('WebGPU plan digest rejects tampering',()=>{
  const plan=renderPlan(1).plan;
  const forged=structuredClone(plan);
  forged.draws[0].metallic=1;
  assert.equal(verifyWebGpuRenderPlan(forged),false);
});