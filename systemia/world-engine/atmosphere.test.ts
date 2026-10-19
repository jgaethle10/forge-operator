import test from 'node:test';
import assert from 'node:assert/strict';
import {EvercraftWorldRuntime, validateWorldDefinition, type WorldDefinition} from './engine.js';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.js';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,EVERCRAFT_WEBGPU_WGSL, type GeometryAsset} from './webgpu.js';

const triangle:GeometryAsset={
  schema:'evercraft.world-engine.geometry.v1',id:'atmosphere-triangle',primitive:'triangles',
  positions:[-1,-1,0,1,-1,0,0,1,0],
  normals:[0,0,1,0,0,1,0,0,1],
  uvs:[0,0,1,0,.5,1]
};
function world():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',id:'atmosphere-proof',version:1,
    tickRateHz:30,gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',initialCameraEntityId:'cam',
      clearColor:{r:.01,g:.03,b:.06},
      materials:[{id:'hero',model:'pbr',baseColor:{r:.7,g:.8,b:.9,a:1},
        metallic:.2,roughness:.4}]
    },
    entities:[
      {id:'cam',transform:{position:{x:0,y:2,z:6}},camera:{
        projection:{type:'perspective',fovYDeg:55},near:.1,far:300,exposure:1.2}},
      {id:'hero',transform:{position:{x:0,y:0,z:0}},
        renderable:{geometryRef:'atmosphere-triangle',materialId:'hero'}},
      {id:'ambient',transform:{position:{x:0,y:0,z:0}},
        light:{type:'ambient',color:{r:1,g:1,b:1},intensity:.75}}
    ]
  };
}
function renderContract(definition:WorldDefinition){
  const runtime=new EvercraftWorldRuntime(definition);
  const shot=runtime.snapshot();
  const frame=compileVisualFrame(shot.worldId,shot.tick,shot.timeSec,
    runtime.definition.visualScene!,shot.entities,shot.cameraRuntime!,shot.activeEntityIds);
  const plan=compileWebGpuRenderPlan(frame,[triangle],{width:1280,height:720});
  return {frame,plan};
}
test('legacy scenes do not opt into fog and preserve receipt structure',()=>{
  const {frame,plan}=renderContract(world());
  assert.equal(Object.hasOwn(frame,'atmosphere'),false);
  assert.equal(Object.hasOwn(plan,'atmosphere'),false);
  assert.equal(verifyVisualFrameContract(frame),true);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
});
test('a world-space fog scene binds its declared optics to digest-verified WebGPU frames',()=>{
  const model=world();
  model.visualScene!.atmosphere={
    color:{r:.69,g:.74,b:.78},density:.08,
    startDistance:2,heightFalloff:.14,referenceHeight:0
  };
  const a=renderContract(model),b=renderContract(model);
  assert.deepEqual(a.frame.atmosphere,model.visualScene!.atmosphere);
  assert.deepEqual(a.plan.atmosphere,model.visualScene!.atmosphere);
  assert.equal(a.frame.digest,b.frame.digest);
  assert.equal(a.plan.digest,b.plan.digest);
  assert.equal(a.plan.sourceVisualFrameDigest,a.frame.digest);
  assert.equal(verifyWebGpuRenderPlan(a.plan),true);
  assert.notEqual(a.plan.digest,renderContract(world()).plan.digest);
  const forged=structuredClone(a.frame);
  forged.atmosphere!.density=.9;
  assert.equal(verifyVisualFrameContract(forged),false);
  assert.throws(()=>compileWebGpuRenderPlan(forged,[triangle],{width:1280,height:720}),/digest_invalid/);
  const forgedPlan=structuredClone(a.plan);
  forgedPlan.atmosphere!.color.b=0;
  assert.equal(verifyWebGpuRenderPlan(forgedPlan),false);
});
test('atmosphere controls reject nonfinite color, unsafe density, falloff and distances',()=>{
  const bads=[
    {density:1.1}, {density:-.01}, {density:NaN},
    {startDistance:-1}, {startDistance:10001},
    {heightFalloff:-.2}, {heightFalloff:2.1},
    {referenceHeight:10001}, {referenceHeight:Infinity},
    {color:{r:1.2,g:0,b:0}}
  ];
  for(const bad of bads){
    const model=world();
    model.visualScene!.atmosphere={color:{r:.5,g:.5,b:.5},density:.1,...bad};
    assert.throws(()=>validateWorldDefinition(model),/atmosphere/);
  }
});
test('zero-density fog remains valid but is opt-in and never inferred from clear color',()=>{
  const model=world();
  model.visualScene!.atmosphere={color:{r:1,g:0,b:0},density:0};
  const {frame,plan}=renderContract(model);
  assert.equal(frame.atmosphere?.density,0);
  assert.equal(plan.atmosphere?.density,0);
  assert.deepEqual(plan.clearColor,{r:.01,g:.03,b:.06});
});
test('shader applies exponential world-space fog only to lit surfaces, leaving unlit UI clear',()=>{
  assert.match(EVERCRAFT_WEBGPU_WGSL,/fn applyAtmosphericDepth/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/exp\(-effectiveDensity \* distance\)/);
  const ui=EVERCRAFT_WEBGPU_WGSL.indexOf('if (modelFlag > 0.5)');
  const fog=EVERCRAFT_WEBGPU_WGSL.indexOf('applyAtmosphericDepth(color,input.worldPosition)');
  assert.ok(ui>0&&fog>ui);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/fogColorDensity: vec4<f32>/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/fogParams: vec4<f32>/);
});
