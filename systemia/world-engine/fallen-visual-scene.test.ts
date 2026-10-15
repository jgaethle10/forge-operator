import test from 'node:test';
import assert from 'node:assert/strict';
import {importFallenVisualCase} from './fallen-visual-case.mjs';
import {sceneFromFallenVisualHandoff,verifyFallenVisualSceneReceipt} from './fallen-visual-scene.mjs';
import {EvercraftWorldRuntime,validateWorldDefinition} from './engine.js';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.js';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,validateGeometryAsset} from './webgpu.js';

const response=()=>({
  schema:'fallen.visual-case.v1',sector:'response',title:'Fictional Flood Command',
  source:{reference:'original synthetic Evercraft exercise',timestamp:'',evidence:'synthetic'},
  assets:[
    {id:'H1',name:'Care Center',kind:'care',x:182,y:220,source:'exercise',priority:'high'},
    {id:'B1',name:'Bridge',kind:'bridge',x:430,y:320,source:'exercise',priority:'medium'}
  ]
});
const sports=()=>({
  schema:'fallen.visual-case.v1',sector:'sports',title:'Original Route Play',
  source:{reference:'original synthetic Evercraft schematic',timestamp:'',evidence:'synthetic'},
  players:[
    {id:'X',side:'offense',color:'#f2cc86',route:[[200,200],[330,206],[470,270],[620,275]]},
    {id:'QB',side:'offense',color:'#ffddaa',route:[[190,320],[240,318]]}
  ],
  defense:[{id:'CB1',x:415,y:178}]
});
function frame(projection){
  const runtime=new EvercraftWorldRuntime(projection.world);
  const snapshot=runtime.snapshot();
  return compileVisualFrame(snapshot.worldId,snapshot.tick,snapshot.timeSec,
    runtime.definition.visualScene!,snapshot.entities,snapshot.cameraRuntime!,snapshot.activeEntityIds);
}
test('response JSON compiles into real World Engine visual scene and valid WebGPU plan',()=>{
  const handoff=importFallenVisualCase(response());
  const projection=sceneFromFallenVisualHandoff(handoff);
  assert.equal(validateWorldDefinition(projection.world),true);
  assert.equal(validateGeometryAsset(projection.geometryAssets[0]),true);
  assert.equal(verifyFallenVisualSceneReceipt(projection.receipt,projection.world,projection.geometryAssets),true);
  const visual=frame(projection);
  assert.equal(verifyVisualFrameContract(visual),true);
  assert.equal(visual.renderables.length,3);
  const plan=compileWebGpuRenderPlan(visual,projection.geometryAssets,{width:900,height:600});
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  assert.equal(plan.draws.length,3);
  assert.ok(plan.draws.some(draw=>draw.entityId==='rc13:facility:H1'));
  assert.equal(projection.world.metadata.geospatial_authority,false);
  assert.equal(projection.world.metadata.physically_validated,false);
});

test('sports routes compile to actual visible geometry with deterministic orientation',()=>{
  const handoff=importFallenVisualCase(sports());
  const a=sceneFromFallenVisualHandoff(handoff);
  const b=sceneFromFallenVisualHandoff(handoff);
  assert.deepEqual(a,b);
  const frameA=frame(a);
  assert.equal(verifyVisualFrameContract(frameA),true);
  const plan=compileWebGpuRenderPlan(frameA,a.geometryAssets,{width:900,height:600});
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  assert.equal(plan.draws.length,1+3+1+1+1+1); // board, three X segments, QB segment, X/QB markers, defender
  assert.ok(plan.draws.some(draw=>draw.entityId==='rc13:route:X:2'));
  assert.equal(a.world.metadata.tracking_authority,false);
  assert.equal(a.world.metadata.scene_units,'abstract_schematic_not_meters');
});

test('tampering with scene geometry or release flag fails projection receipt',()=>{
  const original=sceneFromFallenVisualHandoff(importFallenVisualCase(response()));
  const changed=structuredClone(original.world);
  changed.entities[1].transform.position.x=25;
  assert.equal(verifyFallenVisualSceneReceipt(original.receipt,changed,original.geometryAssets),false);
  const wrong=structuredClone(original.world);
  wrong.metadata.publication_authority=true;
  assert.equal(verifyFallenVisualSceneReceipt(original.receipt,wrong,original.geometryAssets),false);
  const geo=structuredClone(original.geometryAssets);
  geo[0].positions[0]=900;
  assert.equal(verifyFallenVisualSceneReceipt(original.receipt,original.world,geo),false);
});

test('rejects unsealed or forged-authority upstream evidence',()=>{
  const good=importFallenVisualCase(response());
  const corrupt=structuredClone(good);
  corrupt.nodes[0].position.u=7;
  assert.throws(()=>sceneFromFallenVisualHandoff(corrupt),/handoff_unverified/);
  const upgraded=structuredClone(good);
  upgraded.claims.decision_authority=true;
  assert.throws(()=>sceneFromFallenVisualHandoff(upgraded),/handoff_unverified/);
});

test('world runtime yields reproducible non-physical visual snapshots',()=>{
  const a=sceneFromFallenVisualHandoff(importFallenVisualCase(response()));
  const runtime1=new EvercraftWorldRuntime(a.world);
  const runtime2=new EvercraftWorldRuntime(a.world);
  runtime1.run(20);runtime2.run(20);
  assert.equal(runtime1.snapshot().digest,runtime2.snapshot().digest);
  assert.equal(runtime1.definition.gravity.y,0);
  assert.equal(runtime1.definition.entities.some(e=>Boolean(e.rigidBody)),false);
});
