import test from 'node:test';
import assert from 'node:assert/strict';
import {EvercraftWorldRuntime,validateWorldDefinition,type WorldDefinition} from './engine.js';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.js';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,EVERCRAFT_WEBGPU_WGSL,type GeometryAsset} from './webgpu.js';

const mesh:GeometryAsset={
  schema:'evercraft.world-engine.geometry.v1',id:'metal-test-triangle',primitive:'triangles',
  positions:[-1,-1,0,1,-1,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,.5,1]
};
function world():WorldDefinition{
  return {schema:'evercraft.world-engine.world.v1',id:'ggx-surface-test',version:1,
    tickRateHz:24,gravity:{x:0,y:0,z:0},
    visualScene:{schema:'evercraft.world-engine.visual-scene.v1',initialCameraEntityId:'camera',
      materials:[{id:'metal',model:'pbr',baseColor:{r:.8,g:.5,b:.2,a:1},metallic:.85,roughness:.27}]},
    entities:[
      {id:'camera',transform:{position:{x:0,y:0,z:5}},camera:{
        projection:{type:'perspective',fovYDeg:52},near:.1,far:80}},
      {id:'hero',transform:{position:{x:0,y:0,z:0}},renderable:{geometryRef:mesh.id,materialId:'metal'}},
      {id:'light',transform:{position:{x:2,y:4,z:3}},light:{
        type:'point',color:{r:1,g:.85,b:.6},intensity:5,range:15}}
    ]};
}
function compile(w:WorldDefinition){
  const runtime=new EvercraftWorldRuntime(w),snap=runtime.snapshot();
  const frame=compileVisualFrame(snap.worldId,snap.tick,snap.timeSec,w.visualScene!,
    snap.entities,snap.cameraRuntime!,snap.activeEntityIds);
  return {frame,plan:compileWebGpuRenderPlan(frame,[mesh],{width:640,height:360})};
}
test('legacy lighting leaves frame and plan bytes conceptually unchanged via omitted opt-in property',()=>{
  const {frame,plan}=compile(world());
  assert.equal(Object.hasOwn(frame,'cinematicLighting'),false);
  assert.equal(Object.hasOwn(plan,'cinematicLighting'),false);
  assert.ok(verifyVisualFrameContract(frame));
  assert.ok(verifyWebGpuRenderPlan(plan));
});
test('GGX metal shading and inverse-square attenuation are digest bound and tamper rejected',()=>{
  const w=world();w.visualScene!.cinematicLighting={
    shading:'ggx_microfacet',localLightFalloff:'inverse_square'
  };
  const a=compile(w),b=compile(w),legacy=compile(world());
  assert.deepEqual(a.frame.cinematicLighting,w.visualScene!.cinematicLighting);
  assert.deepEqual(a.plan.cinematicLighting,a.frame.cinematicLighting);
  assert.notEqual(a.plan.digest,legacy.plan.digest);
  assert.equal(a.plan.digest,b.plan.digest);
  assert.ok(verifyWebGpuRenderPlan(a.plan));
  const bad=structuredClone(a.plan);bad.cinematicLighting!.shading='legacy_phong';
  assert.equal(verifyWebGpuRenderPlan(bad),false);
  const badFrame=structuredClone(a.frame);badFrame.cinematicLighting!.localLightFalloff='legacy_linear';
  assert.equal(verifyVisualFrameContract(badFrame),false);
});
test('unsupported shading and falloff combinations reject at scene preflight',()=>{
  for(const spec of [
    {shading:'fake_reflections'},
    {shading:''},
    {shading:'ggx_microfacet',localLightFalloff:'artificial'},
    null
  ]){
    const w=world();(w.visualScene as any).cinematicLighting=spec;
    if(spec===null)continue; // absence/null is a non-opt-in, no cinematic claim
    assert.throws(()=>validateWorldDefinition(w),/visual_cinematic_lighting/);
  }
});
test('owned WGSL implements GGX distribution Schlick geometry Fresnel and inverse-square point falloff',()=>{
  const src=EVERCRAFT_WEBGPU_WGSL;
  assert.match(src,/frame\.lightingParams\.x>0\.5/);
  assert.match(src,/distribution=alpha2/);
  assert.match(src,/geometryV=ndotv/);
  assert.match(src,/fresnel=F0/);
  assert.match(src,/diffuseEnergy=/);
  assert.match(src,/attenuation=\(cutoff\*cutoff\)\/\(1\.0\+dist\*dist\)/);
  assert.match(src,/lightingParams: vec4<f32>/);
  assert.match(src,/if \(modelFlag > 0\.5\)/);
});
