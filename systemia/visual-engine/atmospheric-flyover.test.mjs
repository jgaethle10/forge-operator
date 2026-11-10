import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtmosphericFlyoverScene} from './atmospheric-flyover.mjs';
import {buildCinematicFlyoverScene} from './cinematic-flyover.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame,verifyVisualFrameContract} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,validateGeometryAsset} from '../world-engine/webgpu.ts';

function compile(t){
  const f=buildAtmosphericFlyoverScene(t);
  const runtime=new EvercraftWorldRuntime(f.world);
  const snapshot=runtime.snapshot();
  for(const geometry of f.geometries) assert.equal(validateGeometryAsset(geometry),true,geometry.id);
  const frame=compileVisualFrame(snapshot.worldId,snapshot.tick,snapshot.timeSec,
    runtime.definition.visualScene,snapshot.entities,snapshot.cameraRuntime,runtime.activeEntityIds);
  assert.equal(verifyVisualFrameContract(frame),true);
  const plan=compileWebGpuRenderPlan(frame,f.geometries,{width:1280,height:720});
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  return {f,frame,plan};
}
test('atmospheric v3 retains v2 as a separate selectable preset',()=>{
  const base=buildCinematicFlyoverScene(0);
  const v3=compile(0);
  assert.equal(base.schema,'evercraft.visual-engine.cinematic-flyover.v2');
  assert.equal(v3.f.schema,'evercraft.visual-engine.atmospheric-flyover.v3');
  assert.equal(v3.f.provenance.realWorldEvidence,false);
  assert.equal(v3.f.provenance.artDirection,'atmospheric-flyover-v3');
  assert.notEqual(base.world.id,v3.f.world.id);
  assert.ok(v3.plan.draws.length>22);
});
test('new atmosphere, aircraft markings and ocean survive native WebGPU planning',()=>{
  const {f,plan}=compile(2);
  for(const name of [
    'atmospheric:open-water','atmospheric:cloudbank-near','atmospheric:cloudbank-distant',
    'atmospheric:cloudbank-high','atmospheric:wingtip-beacon',
    'atmospheric:left-wing-panel','atmospheric:right-wing-panel'
  ]) assert.ok(f.geometries.some(a=>a.id===name),'missing asset '+name);
  for(const id of ['atmospheric:ocean','atmospheric:cloud-near','atmospheric:cloud-high',
    'atmospheric:port','atmospheric:starboard','atmospheric:left-panel']) {
    assert.ok(plan.draws.some(d=>d.entityId===id),'missing draw '+id);
  }
  assert.equal(plan.width,1280);
  assert.equal(plan.height,720);
  assert.equal(plan.lights.length,2);
});
test('frames remain deterministic while camera moves through time',()=>{
  const a=compile(0),b=compile(0),c=compile(4);
  assert.equal(a.plan.digest,b.plan.digest);
  assert.notEqual(a.plan.digest,c.plan.digest);
  assert.deepEqual(a.f.geometries,c.f.geometries);
  assert.notEqual(a.frame.camera.transform.position.x,c.frame.camera.transform.position.x);
});
test('malformed time cannot enter renderer and caller changes cannot mutate source geometry',()=>{
  for(const t of [-1,61,NaN,Infinity]) assert.throws(
    ()=>buildAtmosphericFlyoverScene(t),/atmospheric_time_invalid/
  );
  const f=buildAtmosphericFlyoverScene(2);
  const p=f.geometries.at(-1).positions[0];
  f.geometries.at(-1).positions[0]=123456;
  assert.equal(buildAtmosphericFlyoverScene(2).geometries.at(-1).positions[0],p);
});
