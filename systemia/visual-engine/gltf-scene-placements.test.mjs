import test from 'node:test';
import assert from 'node:assert/strict';
import {importGltfAssetPack} from './gltf-asset-pack.mjs';
import {compileGltfScenePlacements,verifyGltfScenePlacements} from './gltf-scene-placements.mjs';
import {buildFlyoverScene} from './flyover.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan} from '../world-engine/webgpu.ts';

function fixture(){
  const bytes=[],views=[],accessors=[];
  const f=(nums,type,dimension)=>{
    while(bytes.length%4)bytes.push(0);
    const offset=bytes.length,buf=Buffer.alloc(nums.length*4);
    nums.forEach((v,i)=>buf.writeFloatLE(v,i*4));
    bytes.push(...buf);
    views.push({buffer:0,byteOffset:offset,byteLength:buf.length});
    accessors.push({bufferView:views.length-1,componentType:5126,
      count:nums.length/dimension,type});
    return accessors.length-1;
  };
  const p=f([0,0,0,1,0,0,0,1,0],'VEC3',3);
  const n=f([0,0,1,0,0,1,0,0,1],'VEC3',3);
  const uv=f([0,0,1,0,0,1],'VEC2',2);
  const b=Buffer.from(bytes);
  const gltf={asset:{version:'2.0'},buffers:[{byteLength:b.length}],
    bufferViews:views,accessors,
    meshes:[{primitives:[{attributes:{POSITION:p,NORMAL:n,TEXCOORD_0:uv},
      mode:4}]}],
    nodes:[{translation:[2,0,0],children:[1]},
      {mesh:0,translation:[1,0,0],rotation:[0,0,0,1]}],
    scenes:[{nodes:[0]}],scene:0};
  const pack=importGltfAssetPack({gltf,buffers:[b],
    assetId:'test:authored-nodes',
    provenance:{sourceRef:'fallen:authored-node-fixture',rightsState:'owned',
      license:'Evercraft original fixture'}});
  return {gltf,pack};
}
test('glTF nested nodes preserve translations in baked canonical geometry',()=>{
  const {gltf,pack}=fixture();
  const placed=compileGltfScenePlacements({gltf,assetPack:pack});
  assert.equal(placed.entities.length,1);
  assert.equal(placed.geometries.length,1);
  assert.deepEqual(placed.geometries[0].positions.slice(0,3),[3,0,0]);
  assert.deepEqual(placed.geometries[0].positions.slice(3,6),[4,0,0]);
  assert.equal(placed.receipt.geometry[0].node_path.join('/'),'0/1');
  assert.equal(verifyGltfScenePlacements(placed,pack),true);
});
test('reflection flips triangle winding and tangent handedness',()=>{
  const {gltf,pack}=fixture();
  gltf.nodes[1].scale=[-2,1,1];
  const placed=compileGltfScenePlacements({gltf,assetPack:pack});
  assert.deepEqual(placed.geometries[0].indices,[0,2,1]);
  assert.deepEqual(placed.geometries[0].positions.slice(3,6),[1,0,0]);
  assert.equal(placed.geometries[0].tangents[3],-1);
});
test('authored node transform and materials compile to World Engine WebGPU plan',()=>{
  const {gltf,pack}=fixture(),placed=compileGltfScenePlacements({gltf,assetPack:pack});
  const base=buildFlyoverScene(0);
  base.world.visualScene.materials.push(...pack.materialDefinitions);
  base.world.entities.push(...placed.entities);
  const runtime=new EvercraftWorldRuntime(base.world),s=runtime.snapshot();
  const frame=compileVisualFrame(s.worldId,s.tick,s.timeSec,
    runtime.definition.visualScene,s.entities,s.cameraRuntime,runtime.activeEntityIds);
  const plan=compileWebGpuRenderPlan(frame,
    [...base.geometries,...placed.geometries],{width:1280,height:720},pack.textureAssets);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  assert.ok(plan.draws.some(d=>d.geometryId===placed.geometries[0].id));
});
test('node cycles, shared parents, unsupported features and invalid transforms fail closed',()=>{
  for(const mutate of [
    g=>{g.nodes[1].children=[0];},
    g=>{g.scenes[0].nodes=[0,1];},
    g=>{g.nodes[1].skin=0;},
    g=>{g.nodes[1].scale=[0,1,1];},
    g=>{g.nodes[1].matrix=[1,2,3];},
    g=>{g.nodes[1].rotation=[0,0,0,0];},
    g=>{g.nodes[0].children=[100];}
  ]){
    const {gltf,pack}=fixture();mutate(gltf);
    assert.throws(()=>compileGltfScenePlacements({gltf,assetPack:pack}));
  }
});
test('placement receipts fail if scene geometry or material binding is altered',()=>{
  const {gltf,pack}=fixture(),out=compileGltfScenePlacements({gltf,assetPack:pack});
  out.geometries[0].positions[0]+=4;
  assert.equal(verifyGltfScenePlacements(out,pack),false);
  const fresh=compileGltfScenePlacements({gltf,assetPack:pack});
  fresh.entities[0].renderable.materialId='malicious:replacement';
  assert.equal(verifyGltfScenePlacements(fresh,pack),false);
});
