/**
 * Native GPU pixel proof for the FALLEN RC13 World Engine scene, synthetic cases only.
 * Uses the exact Evercraft-owned WGSL and existing authored render plans.
 * This script is CI-only proof instrumentation, NOT a second production renderer.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {prepareNativeBrowserRuntime} from './native-runtime.mjs';
import {classifyWebGpuAdapter} from './webgpu-conformance.mjs';
import {extractOwnedShader} from './webgpu-reference-frame.mjs';

const PROFILES=[
  {id:'headless-adapter-selection',forcedSoftware:false,args:[
    '--enable-gpu','--enable-unsafe-webgpu',
    '--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests'
  ]},
  {id:'swiftshader-webgpu',forcedSoftware:true,args:[
    '--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan',
    '--use-gl=angle','--use-angle=swiftshader','--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader','--disable-vulkan-surface',
    '--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests'
  ]}
];
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
const repoRoot=path.resolve(process.env.GITHUB_WORKSPACE||path.join(process.cwd(),'../../..'));
const outputDir=path.resolve(process.env.EVERCRAFT_RC13_PIXEL_OUTPUT||path.join(os.tmpdir(),'evercraft-rc13-native-pixels'));
fs.mkdirSync(outputDir,{recursive:true});
const input=JSON.parse(execFileSync(process.execPath,[
  '--import','tsx',path.join(repoRoot,'systemia/world-engine/fallen-visual-frames.proof.mjs')
],{cwd:process.cwd(),encoding:'utf8',maxBuffer:12*1024*1024}));
if(input.schema!=='evercraft.rc13.gpu-frame-qa-input.v1'||input.frames?.length!==4)throw Error('rc13_gpu_frame_plan_fixture_invalid');
const shader=extractOwnedShader(repoRoot);
const stateDir=process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||
  fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-rc13-pixel-browser-'));
const native=await prepareNativeBrowserRuntime({sourceDir:process.cwd(),stateDir,allowInstall:true});
if(!native.ready)throw Error('rc13_native_browser_unavailable:'+String(native.reason));
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(stateDir,'browsers');
const require=createRequire(path.join(process.cwd(),'package.json'));
const {chromium}=require('playwright');
const server=http.createServer((_request,response)=>{
  response.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'});
  response.end('<!doctype html><meta charset="utf-8"><title>Evercraft RC13 native GPU proof</title><body><main>Native GPU pixel proof. Fictional scene only.</main></body>');
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const address=server.address();
const url='http://127.0.0.1:'+address.port+'/';
const attempts=[];
let verified=null;
try{
  for(const profile of PROFILES){
    let browser=null;
    try{
      browser=await chromium.launch({headless:true,args:profile.args});
      const page=await browser.newPage({viewport:{width:340,height:250}});
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
      const proof=await page.evaluate(async({shaderSource,frames})=>{
        function fail(message){throw Error('rc13_native_gpu_'+message);}
        if(!globalThis.isSecureContext||!navigator.gpu)fail('secure_webgpu_unavailable');
        const adapter=await navigator.gpu.requestAdapter();
        if(!adapter)fail('adapter_unavailable');
        const info=adapter.info||{};
        const adapterInfo={
          vendor:info.vendor||'',architecture:info.architecture||'',
          device:info.device||'',description:info.description||''
        };
        const device=await adapter.requestDevice();
        const module=device.createShaderModule({code:shaderSource});
        const messages=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
        if(messages.length)fail('owned_wgsl_compile_failed:'+messages.map(x=>x.message).join('|'));
        const frameLayout=device.createBindGroupLayout({entries:[
          {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
          {binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}}
        ]});
        const objectLayout=device.createBindGroupLayout({entries:[
          {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
          {binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
          {binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
          {binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
          {binding:4,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
          {binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}}
        ]});
        const layout=device.createPipelineLayout({bindGroupLayouts:[frameLayout,objectLayout]});
        const pipeline=device.createRenderPipeline({
          layout,
          vertex:{module,entryPoint:'vs_main',buffers:[{arrayStride:48,attributes:[
            {shaderLocation:0,offset:0,format:'float32x3'},
            {shaderLocation:1,offset:12,format:'float32x3'},
            {shaderLocation:2,offset:24,format:'float32x2'},
            {shaderLocation:3,offset:32,format:'float32x4'}
          ]}]},
          fragment:{module,entryPoint:'fs_main',targets:[{format:'rgba8unorm'}]},
          primitive:{topology:'triangle-list',frontFace:'ccw',cullMode:'none'},
          depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}
        });
        const sampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
        const texture=device.createTexture({size:[1,1,1],format:'rgba8unorm',
          usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
        device.queue.writeTexture({texture},new Uint8Array([255,255,255,255]),
          {bytesPerRow:4,rowsPerImage:1},[1,1,1]);
        const view=texture.createView();
        const canvas=document.createElement('canvas');
        canvas.width=frames[0].plan.width;canvas.height=frames[0].plan.height;
        canvas.style.width=canvas.width+'px';canvas.style.height=canvas.height+'px';
        document.body.appendChild(canvas);
        const ctx=canvas.getContext('2d');
        function createBuffer(values,usage,min=4){
          const bytes=(values instanceof Float32Array||values instanceof Uint32Array)?values:new Float32Array(values);
          const buffer=device.createBuffer({size:Math.max(min,Math.ceil(bytes.byteLength/4)*4),
            usage:usage|GPUBufferUsage.COPY_DST});
          device.queue.writeBuffer(buffer,0,bytes);return buffer;
        }
        function vertexBuffer(geo){
          const points=[];
          for(let i=0;i<geo.positions.length/3;i++){
            points.push(...geo.positions.slice(3*i,3*i+3),...geo.normals.slice(3*i,3*i+3),
              ...(geo.uvs?.slice(2*i,2*i+2)||[0,0]),1,0,0,1);
          }
          return createBuffer(new Float32Array(points),GPUBufferUsage.VERTEX);
        }
        const rendered=[];
        for(const item of frames){
          const plan=item.plan;
          const width=plan.width,height=plan.height;
          if(width!==320||height!==200||!plan.draws.length)fail('invalid_frame_plan');
          const rowBytes=Math.ceil(width*4/256)*256;
          const color=device.createTexture({size:[width,height,1],format:'rgba8unorm',
            usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
          const depth=device.createTexture({size:[width,height,1],format:'depth24plus',
            usage:GPUTextureUsage.RENDER_ATTACHMENT});
          const readback=device.createBuffer({size:rowBytes*height,
            usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
          const frameBuffer=createBuffer(new Float32Array([
            ...plan.viewProjectionMatrix,...plan.cameraPosition,plan.exposure,0,0,0,0
          ]),GPUBufferUsage.UNIFORM);
          const lightBuffer=createBuffer(new Float32Array([0,0,0,0]),GPUBufferUsage.STORAGE,16);
          const frameBind=device.createBindGroup({layout:frameLayout,entries:[
            {binding:0,resource:{buffer:frameBuffer}},{binding:1,resource:{buffer:lightBuffer}}
          ]});
          const geomById=new Map(item.geometries.map(g=>[g.id,g]));
          const cache=new Map();
          const objectBuffers=[];
          const encoder=device.createCommandEncoder();
          const pass=encoder.beginRenderPass({
            colorAttachments:[{view:color.createView(),clearValue:{
              r:plan.clearColor.r,g:plan.clearColor.g,b:plan.clearColor.b,a:1
            },loadOp:'clear',storeOp:'store'}],
            depthStencilAttachment:{view:depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}
          });
          pass.setPipeline(pipeline);pass.setBindGroup(0,frameBind);
          for(const draw of plan.draws){
            const geo=geomById.get(draw.geometryId);if(!geo)fail('missing_geometry');
            if(!cache.has(draw.geometryId)){
              const vb=vertexBuffer(geo);
              const ib=geo.indices?.length?createBuffer(new Uint32Array(geo.indices),GPUBufferUsage.INDEX):null;
              cache.set(draw.geometryId,{vb,ib});
            }
            const g=cache.get(draw.geometryId);
            const ob=createBuffer(new Float32Array([
              ...draw.modelMatrix,...draw.normalMatrix,...draw.baseColor,
              draw.materialModel,draw.metallic,draw.roughness,draw.alphaCutoff,
              ...draw.emissive,draw.emissiveIntensity,...draw.textureFlags
            ]),GPUBufferUsage.UNIFORM,192);
            objectBuffers.push(ob);
            const bind=device.createBindGroup({layout:objectLayout,entries:[
              {binding:0,resource:{buffer:ob}},{binding:1,resource:sampler},
              {binding:2,resource:view},{binding:3,resource:view},
              {binding:4,resource:view},{binding:5,resource:view}
            ]});
            pass.setBindGroup(1,bind);pass.setVertexBuffer(0,g.vb);
            if(g.ib){pass.setIndexBuffer(g.ib,'uint32');pass.drawIndexed(geo.indices.length,1,0,0,0);}
            else pass.draw(geo.positions.length/3,1,0,0);
          }
          pass.end();
          encoder.copyTextureToBuffer({texture:color},{buffer:readback,bytesPerRow:rowBytes,rowsPerImage:height},[width,height,1]);
          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
          await readback.mapAsync(GPUMapMode.READ);
          const padded=new Uint8Array(readback.getMappedRange().slice(0));
          const pixels=new Uint8ClampedArray(width*height*4);
          for(let y=0;y<height;y++)pixels.set(padded.subarray(y*rowBytes,y*rowBytes+width*4),y*width*4);
          readback.unmap();
          ctx.putImageData(new ImageData(pixels,width,height),0,0);
          const png=canvas.toDataURL('image/png').split(',')[1];
          const sample=(x,y)=>Array.from(pixels.slice((y*width+x)*4,(y*width+x)*4+4));
          const swatches=[sample(100,110),sample(160,100),sample(230,100)];
          rendered.push({sector:item.sector,tick:item.tick,png,swatches,
            pixels:Array.from(pixels),drawCount:plan.draws.length,planDigest:plan.digest});
          for(const v of cache.values()){v.vb.destroy();v.ib?.destroy();}
          for(const b of objectBuffers)b.destroy();
          frameBuffer.destroy();lightBuffer.destroy();color.destroy();depth.destroy();readback.destroy();
        }
        texture.destroy();device.destroy();
        return{adapterInfo,rendered};
      },{shaderSource:shader.source,frames:input.frames});
      const rendered=proof.rendered.map(frame=>{
        const raw=Buffer.from(frame.pixels);
        const png=Buffer.from(frame.png,'base64');
        const name='rc13-'+frame.sector+'-tick'+String(frame.tick).padStart(3,'0')+'.png';
        fs.writeFileSync(path.join(outputDir,name),png);
        return{sector:frame.sector,tick:frame.tick,drawCount:frame.drawCount,
          filename:name,sha256:sha256(png),rawPixelSha256:sha256(raw),
          swatches:frame.swatches,planDigest:frame.planDigest,raw};
      });
      for(const sector of ['response','sports']){
        const [start,end]=rendered.filter(f=>f.sector===sector).sort((a,b)=>a.tick-b.tick);
        if(!start||!end||start.drawCount<3||end.drawCount<3||
           start.rawPixelSha256===end.rawPixelSha256)throw Error('rc13_gpu_frames_did_not_change:'+sector);
        let changed=0;
        for(let i=0;i<start.raw.length;i+=4){
          if(start.raw[i]!==end.raw[i]||start.raw[i+1]!==end.raw[i+1]||start.raw[i+2]!==end.raw[i+2])changed++;
        }
        if(changed<50)throw Error('rc13_gpu_scene_change_not_visible:'+sector+':'+changed);
        start.changedPixelCount=changed;end.changedPixelCount=changed;
      }
      const classification=classifyWebGpuAdapter(proof.adapterInfo,profile);
      verified={
        schema:'evercraft.rc13.native-gpu-pixel-proof.v1',status:'verified',
        caseClass:'synthetic_original_exercise_only',
        nativeShaderPath:shader.source_file,shaderSha256:shader.sha256,
        executionClass:classification.execution_class||classification.executionClass||'adapter_type_unknown',
        hardwareExecutionClaim:classification.hardware_execution_claim===true||classification.hardwareExecutionClaim===true,
        adapterInfo:proof.adapterInfo,launchProfile:profile.id,forcedSoftware:profile.forcedSoftware,
        sourceRightsState:'unverified',publicationAuthority:false,decisionAuthority:false,
        trackingAuthority:false,hydrologyAuthority:false,
        frames:rendered.map(({raw,...rest})=>rest),
        proofScope:'four_real_WebGPU_pixel_readbacks_from_RC13_World_Engine_plans'
      };
      verified.receiptSha256=sha256(JSON.stringify(verified));
      fs.writeFileSync(path.join(outputDir,'rc13-native-pixels-receipt.json'),JSON.stringify(verified,null,2));
      await browser.close();browser=null;
      break;
    }catch(error){
      attempts.push({profile:profile.id,error:String(error?.stack||error).slice(0,1700)});
    }finally{if(browser)await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
if(!verified)throw Error('rc13_no_verified_gpu_pixel_profile:'+JSON.stringify(attempts));
console.log(JSON.stringify({...verified,attempts},null,2));
