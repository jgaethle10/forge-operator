// Owned, reproducible artist-authored aircraft reference canary.
// Upstream CC BY 4.0 model fetched only in CI, pinned by Git blob + commit.
// There is no upstream dependency in the deployed Evercraft runtime.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseGlbV2,importGltfAssetPack,verifyGltfAssetPack} from './gltf-asset-pack.mjs';
import {decodeGltfEmbeddedImagesInPage} from './gltf-image-decoder.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan} from '../world-engine/webgpu.ts';
import {buildFlyoverScene} from './flyover.mjs';
import {prepareNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';

const MODEL_BLOB='c2c8f8292766a0b682918d4841c6dc4de4b18f1f';
const SOURCE_REV='91d835e8e851b2317fe79af291c9fed6153fd525';
const SOURCE='https://github.com/amvlab/aircraft-models';
const SOURCE_PATH='models/B737_nologo.glb';
const WORKER=path.resolve('systemia/evercraft-web/browser-worker');
const requireWorker=createRequire(path.join(WORKER,'package.json'));
const sha256=b=>'sha256:'+crypto.createHash('sha256').update(b).digest('hex');
const blobSha=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const CHECK=(truth,error)=>{if(!truth)throw new Error('licensed_aircraft_'+error);};
function renderPlan(pack) {
  const scene=buildFlyoverScene(0);
  scene.world.visualScene.materials.push(...pack.materialDefinitions);
  const selected=pack.lods[0];
  for(let i=0;i<selected.primitives.length;i++) {
    const primitive=selected.primitives[i];
    scene.world.entities.push({
      id:'reference:licensed-b737-mesh-'+i,
      transform:{position:{x:0,y:15,z:-12},rotationDeg:{x:0,y:0,z:0}},
      renderable:{geometryRef:primitive.geometryId,
        materialId:primitive.materialId,layerMask:1}
    });
  }
  const runtime=new EvercraftWorldRuntime(scene.world),s=runtime.snapshot();
  const frame=compileVisualFrame(s.worldId,s.tick,s.timeSec,
    runtime.definition.visualScene,s.entities,s.cameraRuntime,runtime.activeEntityIds);
  const plan=compileWebGpuRenderPlan(frame,
    [...scene.geometries,...pack.geometries],{width:1280,height:720},pack.textureAssets);
  CHECK(verifyWebGpuRenderPlan(plan),'render_plan_digest_invalid');
  const refs=plan.draws.filter(d=>d.entityId.startsWith('reference:licensed-b737-mesh-'));
  CHECK(refs.length===selected.primitives.length,'missing_draw_commands');
  return {digest:plan.digest,draws:refs.length,
    texturedDraws:refs.filter(x=>x.textureFlags.some(Boolean)).length};
}
export async function proveLicensedAircraftCanary({
  modelFile=process.env.EVERCRAFT_REFERENCE_AIRCRAFT_PATH,
  licenseFile=process.env.EVERCRAFT_REFERENCE_AIRCRAFT_LICENSE,
  stateDir=process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||null,
  outputFile=process.env.EVERCRAFT_REFERENCE_AIRCRAFT_RECEIPT||null
}={}) {
  CHECK(modelFile&&licenseFile,'paths_required');
  const bytes=fs.readFileSync(modelFile);
  const license=fs.readFileSync(licenseFile,'utf8');
  CHECK(blobSha(bytes)===MODEL_BLOB,'model_source_hash_mismatch');
  CHECK(/Creative Commons Attribution 4\.0 International/.test(license) &&
    /Copyright \(c\) 2026 amvlab/.test(license),'source_license_invalid');
  const {gltf,buffers}=parseGlbV2(bytes);
  const audit={
    schema:'evercraft.visual-engine.licensed-reference-audit.v1',
    source_repo:SOURCE,
    source_commit:SOURCE_REV,
    source_file:SOURCE_PATH,
    source_blob_sha1:MODEL_BLOB,
    source_sha256:sha256(bytes),
    license:'CC BY 4.0',
    credit:'amvlab (2026)',
    license_url:'https://creativecommons.org/licenses/by/4.0/',
    attribution_required:true,
    usage:'engineering reference only; not Evercraft-original art',
    gltf_version:gltf.asset?.version,
    mesh_count:gltf.meshes?.length||0,
    primitive_count:(gltf.meshes||[]).reduce((s,m)=>s+(m.primitives?.length||0),0),
    vertex_count:(gltf.meshes||[]).flatMap(m=>m.primitives||[]).reduce((s,p)=>
      s+(gltf.accessors?.[p.attributes?.POSITION]?.count||0),0),
    material_count:gltf.materials?.length||0,
    image_count:gltf.images?.length||0,
    nodes_count:gltf.nodes?.length||0,
    skin_count:gltf.skins?.length||0,
    animation_count:gltf.animations?.length||0,
    extensions_used:gltf.extensionsUsed||[],
    transforms_not_baked:true
  };
  console.log('SOURCE_AUDIT',JSON.stringify(audit));
  const ownState=stateDir?null:fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-aircraft-canary-'));
  const state=path.resolve(stateDir||ownState);
  let browser=null;
  try{
    const runtime=await prepareNativeBrowserRuntime({
      sourceDir:WORKER,stateDir:state,allowInstall:true
    });
    CHECK(runtime.ready===true,'browser_preflight_failed');
    process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(state,'browsers');
    const {chromium}=requireWorker('playwright');
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    await page.goto('about:blank');
    const decodedImages=await decodeGltfEmbeddedImagesInPage({
      page,gltf,buffers,maxImages:32,
      maxPixelsPerImage:4*1024*1024,maxTotalRgbaBytes:96*1024*1024
    });
    const pack=importGltfAssetPack({
      gltf,buffers,decodedImages,
      assetId:'reference:amvlab-b737-logo-free',
      provenance:{
        sourceRef:SOURCE+'/blob/'+SOURCE_REV+'/'+SOURCE_PATH,
        rightsState:'licensed',
        license:'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        attribution:'2026 amvlab'
      },
      maxTextureBytes:96*1024*1024,maxVertices:750000
    });
    CHECK(verifyGltfAssetPack(pack),'import_receipt_invalid');
    const plan=renderPlan(pack);
    const receipt={
      ...audit,status:'verified',
      imported_geometry_count:pack.geometries.length,
      imported_material_count:pack.materialDefinitions.length,
      imported_texture_count:pack.textureAssets.length,
      imported_vertices:pack.totalVertices,
      imported_triangles:pack.totalTriangles,
      decoded_texture_bytes:pack.totalTextureBytes,
      world_engine_render_plan:plan,
      asset_pack_receipt_digest:pack.receipt.digest,
      browser_version:browser.version(),
      blocking_limitations:[
        'real_pbr_pixel_render_not_yet_proven',
        'gltf_scene_node_transforms_not_applied',
        'visual_quality_not_accepted'
      ]
    };
    receipt.digest=sha256(JSON.stringify(receipt));
    if(outputFile){
      fs.mkdirSync(path.dirname(outputFile),{recursive:true});
      fs.writeFileSync(outputFile,JSON.stringify(receipt,null,2)+'\n');
    }
    return receipt;
  }finally{
    if(browser)await browser.close().catch(()=>{});
    if(ownState)fs.rmSync(ownState,{recursive:true,force:true});
  }
}
if(process.argv[1]?.endsWith('/licensed-aircraft-canary.mjs')){
  proveLicensedAircraftCanary().then(r=>console.log(JSON.stringify(r,null,2)))
    .catch(e=>{console.error('REFERENCE_ASSET_BLOCKED',e?.stack||String(e));process.exitCode=1;});
}
