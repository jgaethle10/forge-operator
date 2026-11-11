import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {importGltfAssetPack,parseGlbV2,selectGltfLod,verifyGltfAssetPack} from './gltf-asset-pack.mjs';
import {buildFlyoverScene} from './flyover.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan} from '../world-engine/webgpu.ts';

const sha=b=>'sha256:'+crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
  const bytes=[],views=[],accessors=[];
  const append=b=>{while(bytes.length%4)bytes.push(0);const start=bytes.length;
    bytes.push(...b);views.push({buffer:0,byteOffset:start,byteLength:b.length});return views.length-1;};
  const floats=(arr,type,components)=>{const b=Buffer.alloc(arr.length*4);
    arr.forEach((v,i)=>b.writeFloatLE(v,i*4));
    accessors.push({bufferView:append(b),componentType:5126,count:arr.length/components,type});
    return accessors.length-1;};
  const p=floats([-1,-1,0,1,-1,0,1,1,0,-1,1,0],'VEC3',3);
  const n=floats([0,0,1,0,0,1,0,0,1,0,0,1],'VEC3',3);
  const uv=floats([0,0,1,0,1,1,0,1],'VEC2',2);
  const t=floats([1,0,0,1,1,0,0,1,1,0,0,1,1,0,0,1],'VEC4',4);
  const ix=Buffer.alloc(12);[0,1,2,0,2,3].forEach((v,i)=>ix.writeUInt16LE(v,i*2));
  accessors.push({bufferView:append(ix),componentType:5123,count:6,type:'SCALAR'});
  const image=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),iv=append(image);
  const buf=Buffer.from(bytes);
  const primitive={attributes:{POSITION:p,NORMAL:n,TEXCOORD_0:uv,TANGENT:t},
    indices:4,mode:4,material:0};
  const gltf={
    asset:{version:'2.0'},buffers:[{byteLength:buf.length}],bufferViews:views,
    accessors,meshes:[{primitives:[primitive]},{primitives:[structuredClone(primitive)]}],
    images:[{bufferView:iv,mimeType:'image/png'}],textures:[{source:0}],
    materials:[{pbrMetallicRoughness:{
      baseColorFactor:[.7,.8,.9,1],metallicFactor:.65,roughnessFactor:.4,
      baseColorTexture:{index:0},metallicRoughnessTexture:{index:0}
    },normalTexture:{index:0},occlusionTexture:{index:0},
      emissiveFactor:[.1,.1,.1],emissiveTexture:{index:0}}]
  };
  return {gltf,buffers:[buf],
    decodedImages:{0:{width:2,height:2,
      rgba:[200,210,220,255,120,130,140,255,80,90,100,255,255,255,255,255],
      sourceSha256:sha(image)}},
    assetId:'test:film-aircraft',
    provenance:{sourceRef:'fallen:original:aircraft',rightsState:'owned',license:'Evercraft-owned'},
    lods:[{level:0,meshIndex:0,minDistance:0},{level:1,meshIndex:1,minDistance:35}]};
}
test('glTF pack maps indexed geometry, normals, PBR texture channels and audited LOD',()=>{
  const pack=importGltfAssetPack(fixture());
  assert.equal(pack.geometries.length,2);
  assert.equal(pack.totalVertices,8);
  assert.equal(pack.totalTriangles,4);
  assert.deepEqual(pack.geometries[0].tangents.slice(0,4),[1,0,0,1]);
  assert.equal(pack.materialDefinitions[0].metallic,.65);
  assert.equal(pack.materialDefinitions[0].roughness,.4);
  assert.equal(pack.textureAssets.length,4);
  const orm=pack.textureAssets.find(t=>t.id===pack.materialDefinitions[0].textureRefs.orm);
  assert.deepEqual(orm.data.slice(0,4),[200,210,220,255]);
  assert.equal(pack.receipt.images.length,1);
  assert.equal(verifyGltfAssetPack(pack),true);
  assert.equal(selectGltfLod(pack,34.99).meshIndex,0);
  assert.equal(selectGltfLod(pack,35).meshIndex,1);
  assert.throws(()=>selectGltfLod(pack,-1),/lod_select_distance_invalid/);
});
test('GLB bytes parse with strict header and length',()=>{
  const f=fixture(),json=Buffer.from(JSON.stringify(f.gltf));
  const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const bin=Buffer.concat([f.buffers[0],Buffer.alloc((4-f.buffers[0].length%4)%4)]);
  const b=Buffer.alloc(12+8+padded.length+8+bin.length);
  b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);
  b.writeUInt32LE(padded.length,12);b.writeUInt32LE(0x4e4f534a,16);
  padded.copy(b,20);const off=20+padded.length;
  b.writeUInt32LE(bin.length,off);b.writeUInt32LE(0x004e4942,off+4);bin.copy(b,off+8);
  const extracted=parseGlbV2(b);
  assert.equal(extracted.gltf.asset.version,'2.0');
  assert.equal(verifyGltfAssetPack(importGltfAssetPack({...f,...extracted})),true);
  b.writeUInt32LE(3,4);assert.throws(()=>parseGlbV2(b),/glb_version_unsupported/);
});
test('authored textured asset compiles into canonical World Engine WebGPU plan',()=>{
  const pack=importGltfAssetPack(fixture()),base=buildFlyoverScene(0);
  base.world.visualScene.materials.push(...pack.materialDefinitions);
  base.world.entities.push({id:'test:imported-panel',
    transform:{position:{x:0,y:15,z:-10},rotationDeg:{x:0,y:0,z:0}},
    renderable:{geometryRef:pack.geometries[0].id,
      materialId:pack.materialDefinitions[0].id,layerMask:1}});
  const runtime=new EvercraftWorldRuntime(base.world),s=runtime.snapshot();
  const frame=compileVisualFrame(s.worldId,s.tick,s.timeSec,
    runtime.definition.visualScene,s.entities,s.cameraRuntime,runtime.activeEntityIds);
  const plan=compileWebGpuRenderPlan(frame,[...base.geometries,...pack.geometries],
    {width:1280,height:720},pack.textureAssets);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  const draw=plan.draws.find(x=>x.entityId==='test:imported-panel');
  assert.deepEqual(draw.textureFlags,[1,1,1,1]);
  assert.equal(plan.requiredTextureIds.length,4);
});
test('unlicensed, malformed and unsupported content is rejected',()=>{
  for(const mutate of [
    f=>{f.provenance.rightsState='restricted';},
    f=>{f.gltf.asset.version='1.0';},
    f=>{f.gltf.extensionsUsed=['KHR_mesh_quantization'];},
    f=>{f.gltf.meshes[0].primitives[0].mode=5;},
    f=>{f.gltf.accessors[0].byteOffset=1e9;},
    f=>{f.gltf.accessors[0].sparse={count:1};},
    f=>{f.gltf.materials[0].normalTexture.texCoord=1;},
    f=>{f.decodedImages[0].sourceSha256='sha256:fake';},
    f=>{f.gltf.images[0]={uri:'https://example.com/photo.png'};},
    f=>{f.lods[1].minDistance=0;}
  ]){
    const f=fixture();mutate(f);assert.throws(()=>importGltfAssetPack(f));
  }
  const f=fixture();
  assert.throws(()=>importGltfAssetPack({...f,maxVertices:7}),/vertex_budget_exceeded/);
  assert.throws(()=>importGltfAssetPack({...f,maxTextureBytes:4}),/texture_budget_exceeded/);
});
test('asset receipts reject subsequent pixel, geometry and material tampering',()=>{
  for(const change of [
    x=>x.geometries[0].positions[0]+=1,
    x=>x.textureAssets[0].data[0]=1,
    x=>x.materialDefinitions[0].roughness=.9
  ]){
    const p=importGltfAssetPack(fixture());change(p);
    assert.equal(verifyGltfAssetPack(p),false);
  }
});

test('mipmapped sampler is rejected unless explicitly admitted as degraded preview',()=>{
  const f=fixture();
  f.gltf.samplers=[{minFilter:9987,magFilter:9729,wrapS:10497,wrapT:10497}];
  f.gltf.textures[0].sampler=0;
  assert.throws(()=>importGltfAssetPack(f),
    /sampler_mipmaps_require_explicit_preview_downgrade/);
  const pack=importGltfAssetPack({...f,allowBaseLevelMipmapSampling:true});
  assert.equal(pack.qualityStatus,'preview_degraded');
  assert.deepEqual(pack.samplerDowngrades,[{
    texture_index:0,source_min_filter:9987,
    applied_min_filter:'linear',policy:'mipmap_base_level_only_preview'
  }]);
  assert.equal(verifyGltfAssetPack(pack),true);
});
