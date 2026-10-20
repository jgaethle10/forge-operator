import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { prepareNativeBrowserRuntime } from './native-runtime.mjs';
import { classifyWebGpuAdapter } from './webgpu-conformance.mjs';

const PROFILES=[
  {
    id:'headless-adapter-selection',
    forcedSoftware:false,
    args:[
      '--enable-gpu',
      '--enable-unsafe-webgpu',
      '--enable-dawn-features=allow_unsafe_apis',
      '--use-gpu-in-tests',
    ],
  },
  {
    id:'swiftshader-webgpu',
    forcedSoftware:true,
    args:[
      '--enable-unsafe-webgpu',
      '--enable-unsafe-swiftshader',
      '--enable-features=Vulkan',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--use-vulkan=swiftshader',
      '--use-webgpu-adapter=swiftshader',
      '--disable-vulkan-surface',
      '--enable-dawn-features=allow_unsafe_apis',
      '--use-gpu-in-tests',
    ],
  },
];

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function sha256(value){
  return crypto.createHash('sha256')
    .update(typeof value==='string'?value:JSON.stringify(stable(value)))
    .digest('hex');
}

export function extractOwnedShader(repoRoot){
  const file=path.join(repoRoot,'systemia','world-engine','webgpu.ts');
  const source=fs.readFileSync(file,'utf8');
  const match=source.match(/export const EVERCRAFT_WEBGPU_WGSL=\`([\s\S]*?)\`;\s*\n/);
  if(!match) throw new Error('world_engine_owned_wgsl_not_found');
  return {
    source:match[1],
    source_file:'systemia/world-engine/webgpu.ts',
    sha256:'sha256:'+sha256(match[1]),
  };
}

async function startLoopbackPage(){
  const server=http.createServer((_request,response)=>{
    response.writeHead(200,{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store',
    });
    response.end('<!doctype html><meta charset="utf-8"><title>Evercraft World Engine reference frame</title><body>Evercraft World Engine reference frame</body>');
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('reference_frame_loopback_invalid');
  return {server,url:`http://127.0.0.1:${address.port}/`};
}

async function closeServer(server){
  if(!server?.listening) return;
  await new Promise(resolve=>server.close(resolve));
}

async function loadPlaywright(sourceDir){
  const require=createRequire(path.join(sourceDir,'package.json'));
  return require('playwright');
}

async function executeReferenceFrame(page,shaderSource){
  return page.evaluate(async({shaderSource})=>{
    const fail=(error,detail={})=>({ok:false,error,...detail});
    if(!globalThis.isSecureContext) return fail('reference_frame_secure_context_required');
    if(!navigator.gpu) return fail('reference_frame_navigator_gpu_unavailable');

    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter) return fail('reference_frame_adapter_unavailable');

    let adapterInfo={};
    try{
      const raw=adapter.info || (
        typeof adapter.requestAdapterInfo==='function'
          ? await adapter.requestAdapterInfo()
          : {}
      );
      adapterInfo={
        vendor:raw?.vendor||'',
        architecture:raw?.architecture||'',
        device:raw?.device||'',
        description:raw?.description||'',
        subgroupMinSize:raw?.subgroupMinSize,
        subgroupMaxSize:raw?.subgroupMaxSize,
      };
    }catch(error){
      adapterInfo={info_error:String(error?.message||error)};
    }

    const device=await adapter.requestDevice();
    const module=device.createShaderModule({code:shaderSource});
    const compilation=await module.getCompilationInfo();
    const shaderErrors=compilation.messages
      .filter(message=>message.type==='error')
      .map(message=>message.message);
    if(shaderErrors.length){
      device.destroy();
      return fail('reference_frame_owned_shader_compile_failed',{shaderErrors});
    }

    const frameLayout=device.createBindGroupLayout({
      entries:[
        {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
        {binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},
      ],
    });
    const objectLayout=device.createBindGroupLayout({
      entries:[
        {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
        {binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
        {binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
        {binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
        {binding:4,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
        {binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
      ],
    });
    const pipelineLayout=device.createPipelineLayout({
      bindGroupLayouts:[frameLayout,objectLayout],
    });
    const pipeline=device.createRenderPipeline({
      layout:pipelineLayout,
      vertex:{
        module,
        entryPoint:'vs_main',
        buffers:[{
          arrayStride:48,
          attributes:[
            {shaderLocation:0,offset:0,format:'float32x3'},
            {shaderLocation:1,offset:12,format:'float32x3'},
            {shaderLocation:2,offset:24,format:'float32x2'},
            {shaderLocation:3,offset:32,format:'float32x4'},
          ],
        }],
      },
      fragment:{
        module,
        entryPoint:'fs_main',
        targets:[{format:'rgba8unorm'}],
      },
      primitive:{topology:'triangle-list',frontFace:'ccw',cullMode:'back'},
      depthStencil:{
        format:'depth24plus',
        depthWriteEnabled:true,
        depthCompare:'less',
      },
    });

    const vertexData=new Float32Array([
      -1,-1,0, 0,0,1, 0,0, 1,0,0,1,
       3,-1,0, 0,0,1, 2,0, 1,0,0,1,
      -1, 3,0, 0,0,1, 0,2, 1,0,0,1,
    ]);
    const vertexBuffer=device.createBuffer({
      size:vertexData.byteLength,
      usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer,0,vertexData);

    const frameValues=new Float32Array([
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      0,0,0,1,
      0,0,1,1,
      1,0,0,0,
      0,0,0,0,
      0,0,0,0,
      0,0,0,0,
      0,0,0,0,
    ]);
    const frameBuffer=device.createBuffer({
      size:frameValues.byteLength,
      usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(frameBuffer,0,frameValues);

    const lightValues=new Float32Array([
      0,1,0,1,
      1,1,1,1,
      0,0,0,0,
      0,0,-1,0,
    ]);
    const lightBuffer=device.createBuffer({
      size:64,
      usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(lightBuffer,0,lightValues);

    const objectValues=new Float32Array([
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      0,0,0,1,
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      0,0,0,1,
      1,1,1,1,
      0,0,1,-1,
      0,0,0,0,
      1,0,0,0,
    ]);
    const objectBuffer=device.createBuffer({
      size:192,
      usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(objectBuffer,0,objectValues);

    const createPixelTexture=(rgba)=>{
      const texture=device.createTexture({
        size:[1,1,1],
        format:'rgba8unorm',
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture(
        {texture},
        new Uint8Array(rgba),
        {bytesPerRow:4,rowsPerImage:1},
        [1,1,1],
      );
      return texture;
    };

    const baseTexture=createPixelTexture([64,128,192,255]);
    const ormTexture=createPixelTexture([255,255,0,255]);
    const emissiveTexture=createPixelTexture([0,0,0,255]);
    const normalTexture=createPixelTexture([128,128,255,255]);
    const sampler=device.createSampler({
      addressModeU:'repeat',
      addressModeV:'repeat',
      magFilter:'linear',
      minFilter:'linear',
    });

    const frameBindGroup=device.createBindGroup({
      layout:frameLayout,
      entries:[
        {binding:0,resource:{buffer:frameBuffer}},
        {binding:1,resource:{buffer:lightBuffer}},
      ],
    });
    const objectBindGroup=device.createBindGroup({
      layout:objectLayout,
      entries:[
        {binding:0,resource:{buffer:objectBuffer}},
        {binding:1,resource:sampler},
        {binding:2,resource:baseTexture.createView()},
        {binding:3,resource:ormTexture.createView()},
        {binding:4,resource:emissiveTexture.createView()},
        {binding:5,resource:normalTexture.createView()},
      ],
    });

    const width=4;
    const height=4;
    const bytesPerRow=256;
    const target=device.createTexture({
      size:[width,height,1],
      format:'rgba8unorm',
      usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC,
    });
    const depth=device.createTexture({
      size:[width,height,1],
      format:'depth24plus',
      usage:GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const readback=device.createBuffer({
      size:bytesPerRow*height,
      usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,
    });

    const encoder=device.createCommandEncoder();
    const pass=encoder.beginRenderPass({
      colorAttachments:[{
        view:target.createView(),
        clearValue:{r:0,g:0,b:0,a:1},
        loadOp:'clear',
        storeOp:'store',
      }],
      depthStencilAttachment:{
        view:depth.createView(),
        depthClearValue:1,
        depthLoadOp:'clear',
        depthStoreOp:'store',
      },
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0,frameBindGroup);
    pass.setBindGroup(1,objectBindGroup);
    pass.setVertexBuffer(0,vertexBuffer);
    pass.draw(3,1,0,0);
    pass.end();
    encoder.copyTextureToBuffer(
      {texture:target},
      {buffer:readback,bytesPerRow,rowsPerImage:height},
      [width,height,1],
    );
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await readback.mapAsync(GPUMapMode.READ);
    const pixels=new Uint8Array(readback.getMappedRange().slice(0));
    const centerOffset=(2*bytesPerRow)+(2*4);
    const observedPixel=Array.from(pixels.slice(centerOffset,centerOffset+4));
    readback.unmap();

    const expectedPixel=[64,128,192,255];
    const tolerance=2;
    const originalVerified=observedPixel.every(
      (value,index)=>Math.abs(value-expectedPixel[index])<=tolerance
    );

    // A second REAL GPU draw with distance fog on the same PBR triangle.
    // The first draw above is the backward-compatible no-fog pixel baseline.
    const fogValues=frameValues.slice();
    fogValues.set([1,0,0,1],24); // red atmosphere, density 1 / world unit
    fogValues.set([0,0,0,0],28); // no start threshold, no height falloff
    device.queue.writeBuffer(frameBuffer,0,fogValues);
    const fogReadback=device.createBuffer({
      size:bytesPerRow*height,
      usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,
    });
    const fogEncoder=device.createCommandEncoder();
    const fogPass=fogEncoder.beginRenderPass({
      colorAttachments:[{
        view:target.createView(),
        clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store',
      }],
      depthStencilAttachment:{
        view:depth.createView(),depthClearValue:1,
        depthLoadOp:'clear',depthStoreOp:'store',
      },
    });
    fogPass.setPipeline(pipeline);
    fogPass.setBindGroup(0,frameBindGroup);
    fogPass.setBindGroup(1,objectBindGroup);
    fogPass.setVertexBuffer(0,vertexBuffer);
    fogPass.draw(3,1,0,0);
    fogPass.end();
    fogEncoder.copyTextureToBuffer(
      {texture:target},
      {buffer:fogReadback,bytesPerRow,rowsPerImage:height},
      [width,height,1],
    );
    device.queue.submit([fogEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await fogReadback.mapAsync(GPUMapMode.READ);
    const fogPixels=new Uint8Array(fogReadback.getMappedRange().slice(0));
    const fogObservedPixel=Array.from(fogPixels.slice(centerOffset,centerOffset+4));
    fogReadback.unmap();
    const fogVerified=fogObservedPixel[0]>observedPixel[0]+20
      && fogObservedPixel[1]<observedPixel[1]-20
      && fogObservedPixel[2]<observedPixel[2]-20
      && fogObservedPixel[3]===255;
    const verified=originalVerified && fogVerified;

    vertexBuffer.destroy();
    fogReadback.destroy();
    frameBuffer.destroy();
    lightBuffer.destroy();
    objectBuffer.destroy();
    baseTexture.destroy();
    ormTexture.destroy();
    emissiveTexture.destroy();
    normalTexture.destroy();
    target.destroy();
    depth.destroy();
    readback.destroy();
    device.destroy();

    return {
      ok:verified,
      secureContext:globalThis.isSecureContext,
      adapterInfo,
      observedPixel,
      expectedPixel,
      fogObservedPixel,
      fogVerified,
      tolerance,
      verified,
      width,
      height,
      format:'rgba8unorm',
    };
  },{shaderSource});
}

async function runProfile(chromium,profile,url,shaderSource){
  let browser=null;
  try{
    browser=await chromium.launch({headless:true,args:profile.args});
    const context=await browser.newContext({viewport:{width:640,height:480}});
    const page=await context.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:15_000});
    const proof=await executeReferenceFrame(page,shaderSource);
    const version=browser.version();
    await context.close();
    return {ok:proof.ok===true,proof,browserVersion:version,error:null};
  }catch(error){
    return {
      ok:false,
      proof:null,
      browserVersion:browser?.version?.()||null,
      error:String(error?.message||error).slice(0,3000),
    };
  }finally{
    if(browser){
      try{await browser.close();}catch{}
    }
  }
}

export async function runWorldEngineReferenceFrameConformance({
  repoRoot=path.resolve(process.cwd(),'../../..'),
  sourceDir=process.cwd(),
  stateDir=null,
}={}){
  const root=path.resolve(repoRoot);
  const browserRoot=path.resolve(sourceDir);
  const ownedState=stateDir?null:fs.mkdtempSync(
    path.join(os.tmpdir(),'evercraft-world-reference-frame-')
  );
  const state=path.resolve(stateDir||ownedState);
  const shader=extractOwnedShader(root);
  const loopback=await startLoopbackPage();
  const attempts=[];

  try{
    const prepared=await prepareNativeBrowserRuntime({
      sourceDir:browserRoot,
      stateDir:state,
      allowInstall:true,
    });
    if(prepared.ready!==true){
      throw new Error(`reference_frame_browser_runtime_not_ready:${prepared.reason||'unknown'}`);
    }

    process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(state,'browsers');
    const {chromium}=await loadPlaywright(browserRoot);

    let selected=null;
    for(const profile of PROFILES){
      const result=await runProfile(
        chromium,
        profile,
        loopback.url,
        shader.source
      );
      attempts.push({
        profile:profile.id,
        forced_software:profile.forcedSoftware,
        ok:result.ok,
        error:result.error,
        browser_version:result.browserVersion,
        proof:result.proof,
      });
      if(result.ok){
        selected={profile,result};
        break;
      }
    }

    if(!selected){
      const error=new Error('reference_frame_no_executable_webgpu_profile');
      error.attempts=attempts;
      throw error;
    }

    const classification=classifyWebGpuAdapter(
      selected.result.proof.adapterInfo,
      selected.profile
    );
    const core={
      schema:'evercraft.world-engine.reference-frame-conformance.v1',
      status:'verified',
      shader_source_file:shader.source_file,
      shader_sha256:shader.sha256,
      launch_profile:selected.profile.id,
      forced_software:selected.profile.forcedSoftware,
      browser_version:selected.result.browserVersion,
      execution_class:classification.execution_class,
      hardware_execution_claim:classification.hardware_execution_claim,
      classification_reason:classification.reason,
      adapter_info:selected.result.proof.adapterInfo,
      expected_pixel:selected.result.proof.expectedPixel,
      observed_pixel:selected.result.proof.observedPixel,
      pixel_tolerance:selected.result.proof.tolerance,
      pixel_verified:selected.result.proof.verified,
      atmosphere_pixel_verified:selected.result.proof.fogVerified,
      atmosphere_pixel:selected.result.proof.fogObservedPixel,
      render_size:{
        width:selected.result.proof.width,
        height:selected.result.proof.height,
      },
      format:selected.result.proof.format,
      browser_runtime:{
        mode:prepared.mode,
        chromium_version:prepared.chromium_version,
        preflight_receipt_hash:prepared.receipt_hash,
        sudo_used:prepared.sudo_used,
        system_package_manager_used:prepared.system_package_manager_used,
      },
      attempts:attempts.map(attempt=>({
        profile:attempt.profile,
        forced_software:attempt.forced_software,
        ok:attempt.ok,
        error:attempt.error,
      })),
    };

    return {...core,receipt_hash:'sha256:'+sha256(core)};
  }finally{
    await closeServer(loopback.server).catch(()=>{});
    if(ownedState) fs.rmSync(ownedState,{recursive:true,force:true});
  }
}
