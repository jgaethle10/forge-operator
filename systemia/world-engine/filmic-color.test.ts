import test from 'node:test';
import assert from 'node:assert/strict';
import type {WorldDefinition} from './engine.js';
import {EvercraftWorldRuntime,validateWorldDefinition} from './engine.js';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.js';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,EVERCRAFT_WEBGPU_WGSL,type GeometryAsset} from './webgpu.js';

const mesh:GeometryAsset={
  schema:'evercraft.world-engine.geometry.v1',id:'simple-cube-face',primitive:'triangles',
  positions:[-1,-1,0,1,-1,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],
  uvs:[0,0,1,0,.5,1]
};
function world():WorldDefinition{
  return {schema:'evercraft.world-engine.world.v1',id:'filmic-proof',version:1,
    tickRateHz:24,gravity:{x:0,y:0,z:0},
    visualScene:{schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'camera',materials:[{id:'mat',model:'pbr',
        baseColor:{r:.8,g:.4,b:.25,a:1},roughness:.4}]},
    entities:[
      {id:'camera',transform:{position:{x:0,y:0,z:4}},camera:{
        projection:{type:'perspective',fovYDeg:50},near:.1,far:100}},
      {id:'asset',transform:{position:{x:0,y:0,z:0}},renderable:{geometryRef:mesh.id,materialId:'mat'}},
      {id:'ambient',transform:{position:{x:0,y:0,z:0}},
        light:{type:'ambient',color:{r:1,g:1,b:1},intensity:1}}
    ]
  };
}
function compile(w:WorldDefinition){
  const runtime=new EvercraftWorldRuntime(w),s=runtime.snapshot();
  const frame=compileVisualFrame(s.worldId,s.tick,s.timeSec,w.visualScene!,s.entities,s.cameraRuntime!);
  return {frame,plan:compileWebGpuRenderPlan(frame,[mesh],{width:640,height:360})};
}
test('legacy scene is exactly opt-out: no filmic property in canonical frame or GPU plan',()=>{
  const {frame,plan}=compile(world());
  assert.equal(Object.hasOwn(frame,'colorManagement'),false);
  assert.equal(Object.hasOwn(plan,'colorManagement'),false);
  assert.equal(verifyVisualFrameContract(frame),true);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
});
test('ACES selection binds to frame and plan digests without changing legacy scenes',()=>{
  const w=world();w.visualScene!.colorManagement={toneMapper:'aces_filmic',exposureBiasStops:-.65};
  const {frame,plan}=compile(w);
  assert.deepEqual(frame.colorManagement,{toneMapper:'aces_filmic',exposureBiasStops:-.65});
  assert.deepEqual(plan.colorManagement,frame.colorManagement);
  assert.notEqual(plan.digest,compile(world()).plan.digest);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  const tampered=structuredClone(plan);
  tampered.colorManagement!.exposureBiasStops=2;
  assert.equal(verifyWebGpuRenderPlan(tampered),false);
});
test('nonfinite or excessive exposure and unknown tone map fail closed',()=>{
  for(const colorManagement of [
    {toneMapper:'not-real'},
    {toneMapper:'aces_filmic',exposureBiasStops:5},
    {toneMapper:'aces_filmic',exposureBiasStops:NaN},
    {toneMapper:'aces_filmic',exposureBiasStops:Infinity}
  ]){
    const w=world();w.visualScene!.colorManagement=colorManagement as any;
    assert.throws(()=>validateWorldDefinition(w),/visual_(?:invalid_)?color_management/);
  }
});
test('film curve is gated in owned fragment shader after atmospheric lighting, not applied to unlit UI',()=>{
  const shader=EVERCRAFT_WEBGPU_WGSL;
  assert.match(shader,/fn applyFilmicGrade/);
  assert.match(shader,/frame\.gradeParams\.x < 0\.5/);
  assert.match(shader,/exp2\(frame\.gradeParams\.y\)/);
  assert.match(shader,/vec4<f32>\(applyFilmicGrade\(applyAtmosphericDepth/);
  const unlit=shader.indexOf('if (modelFlag > 0.5)');
  const tonemapped=shader.indexOf('return vec4<f32>(applyFilmicGrade(');
  assert.ok(unlit>0&&unlit<tonemapped);
});
