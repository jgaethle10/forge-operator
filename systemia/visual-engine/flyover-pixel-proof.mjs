// Real-pixel reference proof for the original Evercraft flyover.
// Uses the exact owned World Engine WGSL and verified WebGPU plan packets.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildFlyoverScene} from './flyover.mjs';
import {EvercraftWorldRuntime} from '../world-engine/engine.ts';
import {compileVisualFrame} from '../world-engine/visual.ts';
import {compileWebGpuRenderPlan,verifyWebGpuRenderPlan,EVERCRAFT_WEBGPU_WGSL} from '../world-engine/webgpu.ts';
import {prepareNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';
import {classifyWebGpuAdapter} from '../evercraft-web/browser-worker/webgpu-conformance.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const BROWSER_WORKER=path.resolve(HERE,'../evercraft-web/browser-worker');
const requireWorker=createRequire(path.join(BROWSER_WORKER,'package.json'));
const TIMES=[0,2,4];
const WIDTH=1280,HEIGHT=720;
const sha=v=>'sha256:'+crypto.createHash('sha256').update(v).digest('hex');
const PROFILES=[
  {id:'headless-adapter-selection',forcedSoftware:false,args:[
    '--enable-gpu','--enable-unsafe-webgpu','--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests'
  ]},
  {id:'swiftshader-webgpu',forcedSoftware:true,args:[
    '--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan',
    '--use-gl=angle','--use-angle=swiftshader','--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader','--disable-vulkan-surface',
    '--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests'
  ]}
];
function compilePlan(t){
  const fixture=buildFlyoverScene(t);
  const runtime=new EvercraftWorldRuntime(fixture.world);
  const snapshot=runtime.snapshot();
  const frame=compileVisualFrame(snapshot.worldId,snapshot.tick,snapshot.timeSec,
    runtime.definition.visualScene,snapshot.entities,snapshot.cameraRuntime,runtime.activeEntityIds);
  const plan=compileWebGpuRenderPlan(frame,fixture.geometries,{width:WIDTH,height:HEIGHT});
  assert.equal(verifyWebGpuRenderPlan(plan),true);
  assert.equal(plan.draws.length,8);
  return {plan,geometry:fixture.geometries};
}
async function loopback(){
  const server=http.createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><meta charset="utf-8"><title>Evercraft flyover pixel proof</title><body>Evercraft flyover pixel proof</body>');
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return {server,url:'http://127.0.0.1:'+server.address().port+'/'};
}

async function execute(page,plan,geometry,shader){
  return page.evaluate(async({plan,geometry,shader})=>{
    if(!globalThis.isSecureContext) throw new Error('flyover_secure_context_required');
    if(!navigator.gpu) throw new Error('flyover_navigator_gpu_unavailable');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter) throw new Error('flyover_gpu_adapter_unavailable');
    let info={};
    try{
      const raw=adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
      info={vendor:raw?.vendor||'',architecture:raw?.architecture||'',device:raw?.device||'',description:raw?.description||''};
    }catch(error){info={error:String(error)}}
    const device=await adapter.requestDevice();
    let destroyed=false;
    const resources=[];
    const track=x=>(resources.push(x),x);
    try{
      const module=device.createShaderModule({code:shader});
      const compilation=await module.getCompilationInfo();
      const errors=compilation.messages.filter(m=>m.type==='error');
      if(errors.length) throw new Error('flyover_wgsl_compilation_failed:'+errors.map(e=>e.message).join('|'));
      const frameLayout=device.createBindGroupLayout({entries:[
        {binding:0,visibility:3,buffer:{type:'uniform'}},
        {binding:1,visibility:2,buffer:{type:'read-only-storage'}}
      ]});
      const objectLayout=device.createBindGroupLayout({entries:[
        {binding:0,visibility:3,buffer:{type:'uniform'}},
        {binding:1,visibility:2,sampler:{type:'filtering'}},
        {binding:2,visibility:2,texture:{sampleType:'float'}},
        {binding:3,visibility:2,texture:{sampleType:'float'}},
        {binding:4,visibility:2,texture:{sampleType:'float'}},
        {binding:5,visibility:2,texture:{sampleType:'float'}}
      ]});
      const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[frameLayout,objectLayout]});
      const pipelines=new Map();
      const pipelineFor=draw=>{
        const key=draw.doubleSided?'double':'back';
        if(pipelines.has(key)) return pipelines.get(key);
        const pipeline=device.createRenderPipeline({
          layout:pipelineLayout,
          vertex:{module,entryPoint:'vs_main',buffers:[{arrayStride:48,attributes:[
            {shaderLocation:0,offset:0,format:'float32x3'},
            {shaderLocation:1,offset:12,format:'float32x3'},
            {shaderLocation:2,offset:24,format:'float32x2'},
            {shaderLocation:3,offset:32,format:'float32x4'}
          ]}]},
          fragment:{module,entryPoint:'fs_main',targets:[{format:'rgba8unorm'}]},
          primitive:{topology:'triangle-list',frontFace:'ccw',cullMode:draw.doubleSided?'none':'back'},
          depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}
        });
        pipelines.set(key,pipeline);return pipeline;
      };
      const createBuffer=(floats,usage)=>{
        const a=new Float32Array(floats);
        const buffer=track(device.createBuffer({size:Math.max(16,a.byteLength),usage:usage|GPUBufferUsage.COPY_DST}));
        device.queue.writeBuffer(buffer,0,a);return buffer;
      };
      const lightValues=[];
      for(const light of plan.lights){
        lightValues.push(light.kind,light.intensity,light.range,light.innerCos);
        lightValues.push(...light.color,light.outerCos);
        lightValues.push(...light.position,0);
        lightValues.push(...light.direction,0);
      }
      if(!lightValues.length) lightValues.push(0,0,0,0);
      const frameBuffer=createBuffer([
        ...plan.viewProjectionMatrix,
        ...plan.cameraPosition,plan.exposure,
        plan.lights.length,0,0,0
      ],GPUBufferUsage.UNIFORM);
      const lightBuffer=createBuffer(lightValues,GPUBufferUsage.STORAGE);
      const frameGroup=device.createBindGroup({layout:frameLayout,entries:[
        {binding:0,resource:{buffer:frameBuffer}},
        {binding:1,resource:{buffer:lightBuffer}}
      ]});
      const texel=(rgba)=>{
        const texture=track(device.createTexture({size:[1,1,1],format:'rgba8unorm',
          usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}));
        device.queue.writeTexture({texture},new Uint8Array(rgba),{bytesPerRow:4,rowsPerImage:1},[1,1,1]);
        return texture.createView();
      };
      const white=texel([255,255,255,255]);
      const orm=texel([255,255,0,255]);
      const black=texel([0,0,0,255]);
      const normal=texel([128,128,255,255]);
      const sampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
      const geom=new Map(geometry.map(a=>[a.id,a]));
      const target=track(device.createTexture({size:[plan.width,plan.height,1],format:'rgba8unorm',
        usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}));
      const depth=track(device.createTexture({size:[plan.width,plan.height,1],format:'depth24plus',
        usage:GPUTextureUsage.RENDER_ATTACHMENT}));
      const rowBytes=Math.ceil(plan.width*4/256)*256;
      const readback=track(device.createBuffer({size:rowBytes*plan.height,
        usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}));
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{
        view:target.createView(),clearValue:{...plan.clearColor,a:1},loadOp:'clear',storeOp:'store'
      }],depthStencilAttachment:{
        view:depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'
      }});
      pass.setBindGroup(0,frameGroup);
      for(const draw of plan.draws){
        if(draw.textureFlags.some(x=>x!==0)) throw new Error('flyover_texture_bindings_not_implemented');
        const asset=geom.get(draw.geometryId);
        if(!asset) throw new Error('flyover_geometry_missing:'+draw.geometryId);
        const packed=[];
        for(let i=0;i<asset.positions.length/3;i++){
          packed.push(...asset.positions.slice(i*3,i*3+3));
          packed.push(...asset.normals.slice(i*3,i*3+3));
          packed.push(asset.uvs?.[i*2]??0,asset.uvs?.[i*2+1]??0);
          packed.push(1,0,0,1);
        }
        const vb=createBuffer(packed,GPUBufferUsage.VERTEX);
        const objectBuffer=createBuffer([
          ...draw.modelMatrix,...draw.normalMatrix,...draw.baseColor,
          draw.materialModel,draw.metallic,draw.roughness,draw.alphaCutoff,
          ...draw.emissive,draw.emissiveIntensity,...draw.textureFlags
        ],GPUBufferUsage.UNIFORM);
        const objectGroup=device.createBindGroup({layout:objectLayout,entries:[
          {binding:0,resource:{buffer:objectBuffer}},
          {binding:1,resource:sampler},
          {binding:2,resource:white},{binding:3,resource:orm},
          {binding:4,resource:black},{binding:5,resource:normal}
        ]});
        pass.setPipeline(pipelineFor(draw));
        pass.setBindGroup(1,objectGroup);
        pass.setVertexBuffer(0,vb);
        if(asset.indices?.length){
          const ib=track(device.createBuffer({size:asset.indices.length*4,
            usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}));
          device.queue.writeBuffer(ib,0,new Uint32Array(asset.indices));
          pass.setIndexBuffer(ib,'uint32');pass.drawIndexed(asset.indices.length,1,0,0,0);
        }else pass.draw(asset.positions.length/3,1,0,0);
      }
      pass.end();
      encoder.copyTextureToBuffer({texture:target},{buffer:readback,bytesPerRow:rowBytes,rowsPerImage:plan.height},
        [plan.width,plan.height,1]);
      device.pushErrorScope('validation');
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      const error=await device.popErrorScope();
      if(error) throw new Error('flyover_gpu_validation:'+error.message);
      await readback.mapAsync(GPUMapMode.READ);
      const mapped=new Uint8Array(readback.getMappedRange());
      const rgba=new Uint8ClampedArray(plan.width*plan.height*4);
      for(let y=0;y<plan.height;y++){
        rgba.set(mapped.subarray(y*rowBytes,y*rowBytes+plan.width*4),y*plan.width*4);
      }
      readback.unmap();
      const clear=Object.values(plan.clearColor).map(v=>Math.round(255*v));
      let visible=0;let dark=0;let bright=0;let colorSum=0;
      for(let i=0;i<rgba.length;i+=4){
        const delta=Math.max(
          Math.abs(rgba[i]-clear[0]),Math.abs(rgba[i+1]-clear[1]),Math.abs(rgba[i+2]-clear[2]));
        if(delta>16) visible++;
        const lum=(rgba[i]+rgba[i+1]+rgba[i+2])/3;
        if(lum<35) dark++;
        if(lum>215) bright++;
        colorSum+=lum;
      }
      const surface=document.createElement('canvas');
      surface.width=plan.width;surface.height=plan.height;
      const ctx=surface.getContext('2d',{willReadFrequently:true});
      ctx.putImageData(new ImageData(rgba,plan.width,plan.height),0,0);
      const png=surface.toDataURL('image/png').split(',')[1];
      return {png,adapterInfo:info,visiblePixels:visible,darkPixels:dark,brightPixels:bright,
        meanLuminance:colorSum/(plan.width*plan.height),drawCount:plan.draws.length,
        width:plan.width,height:plan.height};
    }finally{
      for(const resource of resources) try{resource.destroy()}catch{}
      if(!destroyed) device.destroy();
    }
  },{plan,geometry,shader});
}

export async function runFlyoverPixelProof({
  outputDir=process.env.EVERCRAFT_VISUAL_FRAMES_DIR||path.join(os.tmpdir(),'evercraft-flyover-pixels'),
  stateDir=process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||null
}={}){
  const out=path.resolve(outputDir);
  fs.mkdirSync(out,{recursive:true});
  const ownState=stateDir?null:fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-flyover-browser-'));
  const state=path.resolve(stateDir||ownState);
  const preflight=await prepareNativeBrowserRuntime({sourceDir:BROWSER_WORKER,stateDir:state,allowInstall:true});
  if(!preflight.ready) throw new Error('flyover_browser_preflight_failed:'+(preflight.reason||'unknown'));
  process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(state,'browsers');
  const {chromium}=requireWorker('playwright');
  const server=await loopback();
  const attempts=[];
  try{
    for(const profile of PROFILES){
      let browser;
      try{
        browser=await chromium.launch({headless:true,args:profile.args});
        const page=await browser.newPage({viewport:{width:WIDTH,height:HEIGHT}});
        await page.goto(server.url,{waitUntil:'domcontentloaded'});
        const captures=[];
        for(const t of TIMES){
          const {plan,geometry}=compilePlan(t);
          const pixels=await execute(page,plan,geometry,EVERCRAFT_WEBGPU_WGSL);
          assert.equal(pixels.drawCount,plan.draws.length);
          assert.ok(pixels.visiblePixels>1000,'flyover_frame_nearly_empty:'+t);
          assert.ok(pixels.meanLuminance>4 && pixels.meanLuminance<252,'flyover_luminance_invalid:'+t);
          const png=Buffer.from(pixels.png,'base64');
          assert.equal(png.readUInt32BE(0),0x89504e47);
          const name='flyover-t'+t.toString().padStart(2,'0')+'.png';
          fs.writeFileSync(path.join(out,name),png);
          captures.push({time_sec:t,file:name,sha256:sha(png),bytes:png.length,
            plan_digest:plan.digest,draw_count:pixels.drawCount,
            visible_pixels:pixels.visiblePixels,mean_luminance:pixels.meanLuminance,
            dark_pixels:pixels.darkPixels,bright_pixels:pixels.brightPixels,
            width:pixels.width,height:pixels.height,adapter_info:pixels.adapterInfo});
        }
        assert.equal(new Set(captures.map(x=>x.plan_digest)).size,TIMES.length);
        const cls=classifyWebGpuAdapter(captures[0].adapter_info,profile);
        const core={schema:'evercraft.visual-engine.flyover-pixel-proof.v1',
          status:'verified',shader_sha256:sha(EVERCRAFT_WEBGPU_WGSL),
          browser_version:browser.version(),profile:profile.id,
          execution_class:cls.execution_class,
          hardware_execution_claim:cls.hardware_execution_claim,
          browser_preflight_receipt_hash:preflight.receipt_hash,
          frames:captures};
        const receipt={...core,receipt_hash:sha(JSON.stringify(core))};
        fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
        return receipt;
      }catch(error){
        attempts.push({profile:profile.id,error:String(error?.message||error).slice(0,2000)});
        for(const t of TIMES){
          const file=path.join(out,'flyover-t'+t.toString().padStart(2,'0')+'.png');
          fs.rmSync(file,{force:true});
        }
      }finally{if(browser) await browser.close().catch(()=>{});}
    }
    throw new Error('flyover_no_executable_webgpu_profile:'+JSON.stringify(attempts));
  }finally{
    await new Promise(resolve=>server.server.close(resolve));
    if(ownState) fs.rmSync(ownState,{recursive:true,force:true});
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const receipt=await runFlyoverPixelProof();
    console.log(JSON.stringify(receipt,null,2));
  }catch(error){
    console.error(error?.stack||error);
    process.exitCode=1;
  }
}
