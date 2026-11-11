// Real shader-verified native WebGPU turntable for a rights-admitted
// external reference model. Only build-time artist assets; no runtime fetch.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {once} from 'node:events';
import {buildFlyoverScene} from './flyover.mjs';
import {compileGltfScenePlacements,verifyGltfScenePlacements} from './gltf-scene-placements.mjs';
import {renderWebGpuPlanOnPage} from './flyover-pixel-proof.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,EVERCRAFT_WEBGPU_WGSL} from '../world-engine/webgpu.ts';
import {classifyWebGpuAdapter} from '../evercraft-web/browser-worker/webgpu-conformance.mjs';
import {fitAuthoredCamera} from './authored-camera.mjs';

const sha=v=>'sha256:'+crypto.createHash('sha256').update(v).digest('hex');
const PROFILES=[
  {id:'headless-adapter-selection',forcedSoftware:false,args:[
    '--enable-gpu','--enable-unsafe-webgpu','--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests']},
  {id:'swiftshader-webgpu',forcedSoftware:true,args:[
    '--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan',
    '--use-gl=angle','--use-angle=swiftshader','--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader','--disable-vulkan-surface',
    '--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests']}
];
function cameraRotation(p,t){
  const dx=t.x-p.x,dy=t.y-p.y,dz=t.z-p.z,h=Math.hypot(dx,dz);
  return {x:Math.atan2(dy,h)*180/Math.PI,
    y:Math.atan2(-dx,-dz)*180/Math.PI,z:0};
}
function legacyBundleBounds(geometry){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const g of geometry)for(let i=0;i<g.positions.length;i+=3){
    for(let j=0;j<3;j++){
      const value=g.positions[i+j];
      if(value<min[j])min[j]=value;
      if(value>max[j])max[j]=value;
    }
  }
  const middle=min.map((x,j)=>(x+max[j])/2);
  const length=Math.hypot(max[0]-min[0],max[1]-min[1],max[2]-min[2]);
  assert.ok(Number.isFinite(length)&&length>0,'reference_asset_invalid_world_bounds');
  return {min,max,center:{x:middle[0],y:middle[1],z:middle[2]},length};
}
export function buildAuthoredTurntablePlan(gltf,pack,angleRadians,{width=1280,height=720,elevationDeg=19}={}){
  assert.ok(Number.isFinite(angleRadians),'turntable_angle_invalid');
  const placed=compileGltfScenePlacements({gltf,assetPack:pack});
  assert.equal(verifyGltfScenePlacements(placed,pack),true);
  const fit=fitAuthoredCamera(placed.geometries,{angleRadians,width,height,elevationDeg,
    fovYDeg:46,maxHorizontalFraction:.76,maxVerticalFraction:.72});
  const bounds=fit.bounds;
  const world=buildFlyoverScene(0);
  world.world.id='evercraft-licensed-model-turntable-reference';
  for(const entity of world.world.entities){
    if(entity.renderable)entity.renderable.visible=false;
  }
  world.world.entities.push(...placed.entities);
  world.world.visualScene.materials.push(...pack.materialDefinitions);
  world.world.visualScene.clearColor={r:.055,g:.072,b:.105};
  const {position,target,distance}=fit;
  const camera=world.world.entities.find(e=>e.id==='flyover:camera');
  camera.transform.position=position;
  camera.transform.rotationDeg=cameraRotation(position,target);
  camera.camera.projection=fit.projection;
  camera.camera.near=fit.near;
  camera.camera.far=fit.far;
  camera.camera.exposure=1.1;
  const ambient=world.world.entities.find(e=>e.id==='flyover:skyfill');
  ambient.light.intensity=.7;
  ambient.light.color={r:.68,g:.80,b:1};
  const sunlight=world.world.entities.find(e=>e.id==='flyover:sun');
  sunlight.light.intensity=3.0;
  sunlight.light.color={r:1,g:.90,b:.77};
  const engine=new EvercraftWorldRuntime(world.world),state=engine.snapshot();
  const frame=compileVisualFrame(state.worldId,state.tick,state.timeSec,
    engine.definition.visualScene,state.entities,state.cameraRuntime,engine.activeEntityIds);
  const plan=compileWebGpuRenderPlan(frame,placed.geometries,
    {width,height},pack.textureAssets);
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  assert.equal(plan.draws.length,placed.entities.length);
  return {plan,geometry:placed.geometries,textures:pack.textureAssets,bounds,
    cameraFit:fit,placementReceipt:placed.receipt.digest};
}
async function pageServer(){
  const server=http.createServer((req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><meta charset="utf-8"><title>Evercraft authored reference turntable</title>');
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return {server,url:'http://127.0.0.1:'+server.address().port+'/'};
}
export async function captureAuthoredTurntable({
  chromium,gltf,pack,outputDir
}={}){
  assert.ok(chromium&&gltf&&pack&&outputDir,'turntable_inputs_required');
  fs.mkdirSync(outputDir,{recursive:true});
  const loopback=await pageServer(),attempts=[];
  try{
    for(const profile of PROFILES){
      let browser=null;
      try{
        browser=await chromium.launch({headless:true,args:profile.args});
        const page=await browser.newPage({viewport:{width:1280,height:720}});
        await page.goto(loopback.url,{waitUntil:'domcontentloaded'});
        const captures=[];
        const shots=[
          {angle:0,width:1280,height:720,elevationDeg:19},
          {angle:Math.PI/3,width:1280,height:720,elevationDeg:22},
          {angle:Math.PI*2/3,width:1280,height:720,elevationDeg:19},
          {angle:Math.PI/3,width:720,height:1280,elevationDeg:22,portrait:true}
        ];
        for(const [index,shot] of shots.entries()){
          const angle=shot.angle;
          const {plan,geometry,textures,bounds,cameraFit,placementReceipt}=
            buildAuthoredTurntablePlan(gltf,pack,angle,shot);
          const pixels=await renderWebGpuPlanOnPage(
            page,plan,geometry,EVERCRAFT_WEBGPU_WGSL,textures);
          assert.ok(pixels.visiblePixels>10000,'turntable_model_too_sparse:'+index);
          assert.ok(pixels.foregroundBounds?.widthFraction>=.33,
            'turntable_subject_too_small:'+index);
          assert.ok(pixels.foregroundBounds?.widthFraction<=.92,
            'turntable_subject_clipped_horizontally:'+index);
          assert.ok(pixels.foregroundBounds?.heightFraction<=.92,
            'turntable_subject_clipped_vertically:'+index);
          assert.ok(pixels.foregroundBounds?.minX>=1&&
            pixels.foregroundBounds.maxX<plan.width-1&&
            pixels.foregroundBounds.minY>=1&&
            pixels.foregroundBounds.maxY<plan.height-1,
            'turntable_subject_at_frame_boundary:'+index);
          const png=Buffer.from(pixels.png,'base64');
          assert.equal(png.readUInt32BE(0),0x89504e47);
          const file=shot.portrait?'authored-b737-portrait.png':'authored-b737-angle-'+index+'.png';
          fs.writeFileSync(path.join(outputDir,file),png);
          captures.push({
            index,angle_radians:angle,file,sha256:sha(png),
            bytes:png.length,visible_pixels:pixels.visiblePixels,
            mean_luminance:pixels.meanLuminance,
            draw_count:pixels.drawCount,plan_digest:plan.digest,
            placement_receipt_digest:placementReceipt,
            bounds:bounds,texture_count:textures.length,
            camera_distance:cameraFit.distance,camera_projected_bounds:cameraFit.projectedBounds,
            foreground_bounds:pixels.foregroundBounds,
            frame_width:plan.width,frame_height:plan.height,
            adapter_info:pixels.adapterInfo
          });
        }
        const cls=classifyWebGpuAdapter(captures[0].adapter_info,profile);
        const core={
          schema:'evercraft.visual-engine.licensed-aircraft-pixel-proof.v2',
          status:'verified',
          authored_asset_provenance:pack.provenance,
          source_digest:pack.receipt.digest,
          shader_sha256:sha(EVERCRAFT_WEBGPU_WGSL),
          browser_version:browser.version(),
          execution_class:cls.execution_class,
          hardware_execution_claim:cls.hardware_execution_claim,
          software_forced:profile.forcedSoftware,
          profile:profile.id,msaa_samples:4,
          quality_status:'preview_only_no_cinematic_acceptance',
          source_sampling_quality:pack.qualityStatus,
          samples:captures
        };
        const receipt={...core,receipt_hash:sha(JSON.stringify(core))};
        fs.writeFileSync(path.join(outputDir,'authored-pixel-receipt.json'),
          JSON.stringify(receipt,null,2)+'\n');
        return receipt;
      }catch(error){
        attempts.push({profile:profile.id,error:String(error?.stack||error).slice(0,1400)});
        for(let i=0;i<3;i++)fs.rmSync(
          path.join(outputDir,'authored-b737-angle-'+i+'.png'),{force:true});
        fs.rmSync(path.join(outputDir,'authored-b737-portrait.png'),{force:true});
      }finally{if(browser)await browser.close().catch(()=>{});}
    }
    throw new Error('authored_reference_no_valid_webgpu_profile:'+JSON.stringify(attempts));
  }finally{
    await new Promise(resolve=>loopback.server.close(resolve));
  }
}
