import test from 'node:test';
import assert from 'node:assert/strict';
import {EvercraftWorldRuntime,validateWorldDefinition,type WorldDefinition} from './engine.js';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.js';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,EVERCRAFT_WEBGPU_WGSL,EVERCRAFT_SHADOW_DEPTH_WGSL,type GeometryAsset} from './webgpu.js';
const geometry:GeometryAsset={schema:'evercraft.world-engine.geometry.v1',id:'shadow-cube-face',primitive:'triangles',
  positions:[-1,-1,0,1,-1,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,.5,1]};
function world():WorldDefinition{
  return {schema:'evercraft.world-engine.world.v1',id:'real-depth-shadow-test',version:1,tickRateHz:24,gravity:{x:0,y:0,z:0},
    visualScene:{schema:'evercraft.world-engine.visual-scene.v1',initialCameraEntityId:'camera',
      materials:[{id:'metal',model:'pbr',baseColor:{r:.8,g:.8,b:.7,a:1},metallic:.6,roughness:.4}]},
    entities:[
      {id:'camera',transform:{position:{x:0,y:3,z:8}},camera:{
        projection:{type:'perspective',fovYDeg:50},near:.1,far:100}},
      {id:'block',transform:{position:{x:0,y:1,z:0}},renderable:{
        geometryRef:geometry.id,materialId:'metal',castsShadow:true,receivesShadow:false}},
      {id:'floor',transform:{position:{x:0,y:0,z:0}},renderable:{
        geometryRef:geometry.id,materialId:'metal',castsShadow:false,receivesShadow:true}},
      {id:'sun',transform:{position:{x:0,y:8,z:3},rotationDeg:{x:-35,y:20,z:0}},light:{
        type:'directional',color:{r:1,g:.9,b:.7},intensity:2,castsShadow:true}}
    ]
  };
}
const config={directionalLightEntityId:'sun',focus:{x:0,y:1,z:0},halfExtent:12,resolution:512 as const,depthBias:.003};
function compile(w:WorldDefinition){
  const runtime=new EvercraftWorldRuntime(w),snap=runtime.snapshot();
  const frame=compileVisualFrame(snap.worldId,snap.tick,snap.timeSec,w.visualScene!,snap.entities,snap.cameraRuntime!,snap.activeEntityIds);
  return {frame,plan:compileWebGpuRenderPlan(frame,[geometry],{width:640,height:360})};
}
test('opt-out scenes omit shadow from canonical frame and digest-bound render plan',()=>{
  const {frame,plan}=compile(world());
  assert.equal(Object.hasOwn(frame,'directionalShadows'),false);
  assert.equal(Object.hasOwn(plan,'shadow'),false);
  assert.equal(verifyVisualFrameContract(frame),true);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
});
test('real directional light generates a non-identity light-space matrix and caster/receiver flags',()=>{
  const w=world();w.visualScene!.directionalShadows=config;
  const {frame,plan}=compile(w);
  assert.deepEqual(frame.directionalShadows,config);
  assert.equal(plan.shadow?.directionalLightEntityId,'sun');
  assert.equal(plan.shadow?.resolution,512);
  assert.equal(plan.shadow?.depthBias,.003);
  assert.equal(plan.shadow?.lightViewProjectionMatrix.length,16);
  assert.ok(plan.shadow!.lightViewProjectionMatrix.every(Number.isFinite));
  assert.notDeepEqual(plan.shadow!.lightViewProjectionMatrix,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  assert.equal(plan.draws.find(x=>x.entityId==='block')!.castsShadow,true);
  assert.equal(plan.draws.find(x=>x.entityId==='block')!.receivesShadow,false);
  assert.equal(plan.draws.find(x=>x.entityId==='floor')!.castsShadow,false);
  assert.equal(plan.draws.find(x=>x.entityId==='floor')!.receivesShadow,true);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  const tampered=structuredClone(plan);tampered.shadow!.depthBias=.015;
  assert.equal(verifyWebGpuRenderPlan(tampered),false);
});
test('unsupported or missing shadow-casting light fails closed',()=>{
  const w=world();w.visualScene!.directionalShadows={...config,directionalLightEntityId:'absent'};
  assert.throws(()=>compile(w),/webgpu_shadow_directional_light_missing/);
  const v=world();v.visualScene!.directionalShadows={...config,directionalLightEntityId:'camera'};
  assert.throws(()=>compile(v),/webgpu_shadow_directional_light_missing/);
});
test('invalid shadow bounds, bias and resolution reject before rasterization',()=>{
  const cases=[{halfExtent:0},{halfExtent:101},{resolution:128},{resolution:2048},
    {depthBias:0},{depthBias:.1},{depthBias:NaN},
    {focus:{x:Infinity,y:0,z:0}},{directionalLightEntityId:'../invalid'}];
  for(const bad of cases){
    const w=world();(w.visualScene as any).directionalShadows={...config,...bad};
    assert.throws(()=>validateWorldDefinition(w),/visual_(?:invalid_)?shadow/);
  }
});
test('GPU shader exposes real depth comparison and dedicated depth-only vertex pass',()=>{
  assert.match(EVERCRAFT_WEBGPU_WGSL,/var directionalShadow: texture_depth_2d/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/textureSampleCompareLevel/);
  assert.match(EVERCRAFT_WEBGPU_WGSL,/directionalShadowVisibility/);
  assert.match(EVERCRAFT_SHADOW_DEPTH_WGSL,/lightViewProjection\*object\.model/);
  assert.match(EVERCRAFT_SHADOW_DEPTH_WGSL,/@vertex/);
});
