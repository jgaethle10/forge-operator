// Real native-browser proof: compressed source image -> browser PNG decode ->
// canonical World Engine texture -> authored glTF mesh/material -> WebGPU plan.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {decodeGltfEmbeddedImagesInPage} from './gltf-image-decoder.mjs';
import {importGltfAssetPack,verifyGltfAssetPack} from './gltf-asset-pack.mjs';
import {buildFlyoverScene} from './flyover.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan} from '../world-engine/webgpu.ts';
import {prepareNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';

const sha=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const WORKER=path.resolve('systemia/evercraft-web/browser-worker');
const requireWorker=createRequire(path.join(WORKER,'package.json'));
const SOURCE_RGBA=[
  255,0,0,255, 0,255,0,255,
  0,0,255,255, 255,255,255,255
];
function crc32(buffer){
  let crc=0xffffffff;
  for(const b of buffer){
    crc^=b;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function pngChunk(type,body){
  const name=Buffer.from(type);
  const n=Buffer.alloc(4);n.writeUInt32BE(body.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([name,body])));
  return Buffer.concat([n,name,body,crc]);
}
function png2x2(){
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  const header=Buffer.alloc(13);header.writeUInt32BE(2,0);
  header.writeUInt32BE(2,4);header[8]=8;header[9]=6;
  const rgba=Buffer.from(SOURCE_RGBA);
  const scan=Buffer.concat([Buffer.from([0]),rgba.subarray(0,8),Buffer.from([0]),rgba.subarray(8)]);
  return Buffer.concat([signature,pngChunk('IHDR',header),
    pngChunk('IDAT',zlib.deflateSync(scan)),pngChunk('IEND',Buffer.alloc(0))]);
}
function fixture(){
  const bytes=[],views=[],accessors=[];
  const append=buffer=>{
    while(bytes.length%4)bytes.push(0);
    const start=bytes.length;bytes.push(...buffer);
    views.push({buffer:0,byteOffset:start,byteLength:buffer.length});
    return views.length-1;
  };
  const float=(values,type,count)=>{
    const b=Buffer.alloc(values.length*4);
    values.forEach((value,i)=>b.writeFloatLE(value,i*4));
    accessors.push({bufferView:append(b),componentType:5126,count:values.length/count,type});
    return accessors.length-1;
  };
  const a=float([-1,-1,0,1,-1,0,1,1,0,-1,1,0],'VEC3',3);
  const b=float([0,0,1,0,0,1,0,0,1,0,0,1],'VEC3',3);
  const c=float([0,0,1,0,1,1,0,1],'VEC2',2);
  const ix=Buffer.alloc(12);[0,1,2,0,2,3].forEach((v,i)=>ix.writeUInt16LE(v,i*2));
  const d=accessors.push({bufferView:append(ix),componentType:5123,count:6,type:'SCALAR'})-1;
  const png=png2x2(),imageView=append(png),binary=Buffer.from(bytes);
  return {
    gltf:{asset:{version:'2.0'},buffers:[{byteLength:binary.length}],bufferViews:views,accessors,
      meshes:[{primitives:[{mode:4,indices:d,material:0,
        attributes:{POSITION:a,NORMAL:b,TEXCOORD_0:c}}]}],
      images:[{mimeType:'image/png',bufferView:imageView}],
      textures:[{source:0}],
      materials:[{pbrMetallicRoughness:{
        baseColorFactor:[1,1,1,1],baseColorTexture:{index:0}
      },normalTexture:{index:0}}]},
    buffers:[binary],png
  };
}
export async function proveNativeGltfImageIntake({stateDir=null}={}){
  const f=fixture();
  const temp=stateDir?null:fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-gltf-image-'));
  const state=path.resolve(stateDir||temp);
  let browser=null;
  try{
    const prepared=await prepareNativeBrowserRuntime({sourceDir:WORKER,stateDir:state,allowInstall:true});
    assert.equal(prepared.ready,true);
    process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(state,'browsers');
    const {chromium}=requireWorker('playwright');
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    await page.goto('about:blank');
    const decoded=await decodeGltfEmbeddedImagesInPage({
      page,gltf:f.gltf,buffers:f.buffers
    });
    assert.deepEqual(decoded[0].rgba,SOURCE_RGBA);
    assert.equal(decoded[0].sourceSha256,sha(f.png));
    await assert.rejects(
      ()=>decodeGltfEmbeddedImagesInPage({
        page,gltf:f.gltf,buffers:f.buffers,maxPixelsPerImage:1
      }),/image_pixel_budget_exceeded/
    );
    const pack=importGltfAssetPack({
      gltf:f.gltf,buffers:f.buffers,decodedImages:decoded,
      assetId:'proof:authored-textured-quad',
      provenance:{
        sourceRef:'evercraft:native-test-generated-png',
        rightsState:'owned',license:'Evercraft-original fixture'
      }
    });
    assert.equal(verifyGltfAssetPack(pack),true);
    const world=buildFlyoverScene(0);
    world.world.visualScene.materials.push(...pack.materialDefinitions);
    world.world.entities.push({
      id:'proof:authored-texture-entity',
      transform:{position:{x:0,y:15,z:-8},rotationDeg:{x:0,y:0,z:0}},
      renderable:{geometryRef:pack.geometries[0].id,
        materialId:pack.materialDefinitions[0].id,layerMask:1}
    });
    const runtime=new EvercraftWorldRuntime(world.world);
    const s=runtime.snapshot();
    const frame=compileVisualFrame(s.worldId,s.tick,s.timeSec,
      runtime.definition.visualScene,s.entities,s.cameraRuntime,runtime.activeEntityIds);
    const plan=compileWebGpuRenderPlan(frame,
      [...world.geometries,...pack.geometries],{width:1280,height:720},pack.textureAssets);
    assert.equal(verifyWebGpuRenderPlan(plan),true);
    const draw=plan.draws.find(d=>d.entityId==='proof:authored-texture-entity');
    assert.deepEqual(draw.textureFlags,[1,0,0,1]);
    const result={
      schema:'evercraft.visual-engine.native-gltf-image-intake-proof.v1',
      status:'verified',backend:'owned_chromium_image_decoder',
      browser_version:browser.version(),
      source_image_sha256:sha(f.png),
      decoded_rgba_sha256:sha(Buffer.from(decoded[0].rgba)),
      pixel_count:decoded[0].width*decoded[0].height,
      geometry_count:pack.geometries.length,
      texture_count:pack.textureAssets.length,
      imported_pack_receipt:pack.receipt.digest,
      webgpu_plan_digest:plan.digest,
      note:'This proves native PNG decode and World Engine render-plan integration, not photorealism or GPU pixel shading.'
    };
    return {...result,receipt_sha256:sha(JSON.stringify(result))};
  }finally{
    if(browser)await browser.close().catch(()=>{});
    if(temp)fs.rmSync(temp,{recursive:true,force:true});
  }
}
if(process.argv[1]&&process.argv[1].endsWith('/gltf-native-image.proof.mjs')){
  try{
    const result=await proveNativeGltfImageIntake({
      stateDir:process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||null
    });
    console.log(JSON.stringify(result,null,2));
  }catch(error){
    console.error(error?.stack||String(error));
    process.exitCode=1;
  }
}
