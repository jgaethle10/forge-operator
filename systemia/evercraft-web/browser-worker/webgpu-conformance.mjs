import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { prepareNativeBrowserRuntime } from './native-runtime.mjs';

const SOFTWARE_MARKERS=[
  'swiftshader',
  'llvmpipe',
  'lavapipe',
  'software rasterizer',
  'software adapter',
];

const HARDWARE_MARKERS=[
  'nvidia',
  'amd',
  'radeon',
  'intel',
  'apple',
  'qualcomm',
  'adreno',
  'mali',
  'imagination',
  'geforce',
];

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

function cleanInfo(info){
  if(!info||typeof info!=='object') return {};
  const output={};
  for(const key of ['vendor','architecture','device','description','subgroupMinSize','subgroupMaxSize']){
    const value=info[key];
    if(value===undefined||value===null||value==='') continue;
    output[key]=typeof value==='string'?value.slice(0,300):value;
  }
  return output;
}

export function classifyWebGpuAdapter(info={},profile={}){
  const text=JSON.stringify(cleanInfo(info)).toLowerCase();
  const software=Boolean(profile.forcedSoftware)||
    SOFTWARE_MARKERS.some(marker=>text.includes(marker));
  if(software){
    return {
      execution_class:'software_adapter',
      hardware_execution_claim:false,
      reason:profile.forcedSoftware
        ? 'launch_profile_forced_software_adapter'
        : 'adapter_info_reports_software_backend',
    };
  }

  const hardwareSignal=HARDWARE_MARKERS.some(marker=>text.includes(marker));
  if(hardwareSignal){
    return {
      execution_class:'hardware_adapter_reported',
      hardware_execution_claim:true,
      reason:'adapter_info_reports_known_hardware_vendor_or_architecture',
    };
  }

  return {
    execution_class:'adapter_type_unknown',
    hardware_execution_claim:false,
    reason:'adapter_acquired_but_backend_not_safely_classifiable',
  };
}

async function startLoopbackPage(){
  const server=http.createServer((_request,response)=>{
    response.writeHead(200,{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store',
    });
    response.end('<!doctype html><meta charset="utf-8"><title>Evercraft WebGPU conformance</title><body>Evercraft WebGPU conformance</body>');
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('webgpu_conformance_loopback_address_invalid');
  return {
    server,
    url:`http://127.0.0.1:${address.port}/`,
  };
}

async function closeServer(server){
  if(!server?.listening) return;
  await new Promise((resolve)=>server.close(resolve));
}

async function executeWebGpuProof(page){
  return page.evaluate(async()=>{
    const fail=(code,detail={})=>({ok:false,error:code,...detail});
    if(!globalThis.isSecureContext) return fail('webgpu_secure_context_required');
    if(!navigator.gpu) return fail('webgpu_navigator_gpu_unavailable');

    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter) return fail('webgpu_adapter_unavailable');

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
    let lost=null;
    device.lost.then((info)=>{
      lost={
        reason:String(info?.reason||'unknown'),
        message:String(info?.message||''),
      };
    }).catch(()=>{});

    const inputValues=new Uint32Array([3,5,7,11]);
    const expectedCompute=[10,12,14,18];
    const storage=device.createBuffer({
      size:inputValues.byteLength,
      usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,
    });
    const computeReadback=device.createBuffer({
      size:inputValues.byteLength,
      usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,
    });
    device.queue.writeBuffer(storage,0,inputValues);

    const computeModule=device.createShaderModule({
      code:`
        @group(0) @binding(0) var<storage, read_write> values: array<u32>;

        @compute @workgroup_size(1)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x < 4u) {
            values[id.x] = values[id.x] + 7u;
          }
        }
      `,
    });
    const computeInfo=await computeModule.getCompilationInfo();
    const computeErrors=computeInfo.messages
      .filter(message=>message.type==='error')
      .map(message=>message.message);
    if(computeErrors.length){
      return fail('webgpu_compute_shader_compile_failed',{computeErrors});
    }

    const computePipeline=device.createComputePipeline({
      layout:'auto',
      compute:{module:computeModule,entryPoint:'main'},
    });
    const computeBindGroup=device.createBindGroup({
      layout:computePipeline.getBindGroupLayout(0),
      entries:[{binding:0,resource:{buffer:storage}}],
    });
    const computeEncoder=device.createCommandEncoder();
    const computePass=computeEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0,computeBindGroup);
    computePass.dispatchWorkgroups(4);
    computePass.end();
    computeEncoder.copyBufferToBuffer(
      storage,0,computeReadback,0,inputValues.byteLength
    );
    device.queue.submit([computeEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await computeReadback.mapAsync(GPUMapMode.READ);
    const observedCompute=Array.from(
      new Uint32Array(computeReadback.getMappedRange().slice(0))
    );
    computeReadback.unmap();

    const width=4;
    const height=4;
    const bytesPerRow=256;
    const target=device.createTexture({
      size:[width,height,1],
      format:'rgba8unorm',
      usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC,
    });
    const pixelReadback=device.createBuffer({
      size:bytesPerRow*height,
      usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,
    });

    const renderModule=device.createShaderModule({
      code:`
        @vertex
        fn vs_main(@builtin(vertex_index) vertexIndex:u32) -> @builtin(position) vec4<f32> {
          var positions=array<vec2<f32>,3>(
            vec2<f32>(-1.0,-1.0),
            vec2<f32>(3.0,-1.0),
            vec2<f32>(-1.0,3.0)
          );
          return vec4<f32>(positions[vertexIndex],0.0,1.0);
        }

        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
          return vec4<f32>(0.25,0.5,0.75,1.0);
        }
      `,
    });
    const renderInfo=await renderModule.getCompilationInfo();
    const renderErrors=renderInfo.messages
      .filter(message=>message.type==='error')
      .map(message=>message.message);
    if(renderErrors.length){
      return fail('webgpu_render_shader_compile_failed',{renderErrors});
    }

    const renderPipeline=device.createRenderPipeline({
      layout:'auto',
      vertex:{module:renderModule,entryPoint:'vs_main'},
      fragment:{
        module:renderModule,
        entryPoint:'fs_main',
        targets:[{format:'rgba8unorm'}],
      },
      primitive:{topology:'triangle-list'},
    });

    const renderEncoder=device.createCommandEncoder();
    const renderPass=renderEncoder.beginRenderPass({
      colorAttachments:[{
        view:target.createView(),
        clearValue:{r:0,g:0,b:0,a:1},
        loadOp:'clear',
        storeOp:'store',
      }],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.draw(3,1,0,0);
    renderPass.end();
    renderEncoder.copyTextureToBuffer(
      {texture:target},
      {buffer:pixelReadback,bytesPerRow,rowsPerImage:height},
      [width,height,1],
    );
    device.queue.submit([renderEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await pixelReadback.mapAsync(GPUMapMode.READ);
    const pixels=new Uint8Array(pixelReadback.getMappedRange().slice(0));
    const centerOffset=(2*bytesPerRow)+(2*4);
    const observedPixel=Array.from(pixels.slice(centerOffset,centerOffset+4));
    pixelReadback.unmap();

    const expectedPixel=[64,128,191,255];
    const pixelTolerance=2;
    const pixelVerified=observedPixel.every(
      (value,index)=>Math.abs(value-expectedPixel[index])<=pixelTolerance
    );
    const computeVerified=observedCompute.length===expectedCompute.length &&
      observedCompute.every((value,index)=>value===expectedCompute[index]);

    storage.destroy();
    computeReadback.destroy();
    target.destroy();
    pixelReadback.destroy();
    device.destroy();

    return {
      ok:computeVerified&&pixelVerified,
      secureContext:globalThis.isSecureContext,
      navigatorGpu:true,
      adapterInfo,
      features:Array.from(adapter.features).sort(),
      limits:{
        maxBindGroups:adapter.limits?.maxBindGroups??null,
        maxBufferSize:adapter.limits?.maxBufferSize??null,
        maxTextureDimension2D:adapter.limits?.maxTextureDimension2D??null,
      },
      compute:{
        input:Array.from(inputValues),
        expected:expectedCompute,
        observed:observedCompute,
        verified:computeVerified,
      },
      render:{
        width,
        height,
        format:'rgba8unorm',
        expectedPixel,
        observedPixel,
        tolerance:pixelTolerance,
        verified:pixelVerified,
      },
      deviceLost:lost,
    };
  });
}

async function runProfile(chromium,profile,url){
  let browser=null;
  try{
    browser=await chromium.launch({
      headless:true,
      args:profile.args,
    });
    const context=await browser.newContext({
      viewport:{width:640,height:480},
    });
    const page=await context.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:15_000});
    const proof=await executeWebGpuProof(page);
    const version=browser.version();
    await context.close();
    return {ok:proof.ok===true,proof,browserVersion:version,error:null};
  }catch(error){
    return {
      ok:false,
      proof:null,
      browserVersion:browser?.version?.()||null,
      error:String(error?.message||error).slice(0,2000),
    };
  }finally{
    if(browser){
      try{await browser.close();}catch{}
    }
  }
}

export async function runWebGpuDeviceConformance({
  sourceDir=process.cwd(),
  stateDir=null,
}={}){
  const ownedState=stateDir?null:fs.mkdtempSync(
    path.join(os.tmpdir(),'evercraft-webgpu-device-')
  );
  const state=path.resolve(stateDir||ownedState);
  const loopback=await startLoopbackPage();
  const attempts=[];

  try{
    const prepared=await prepareNativeBrowserRuntime({
      sourceDir,
      stateDir:state,
      allowInstall:true,
    });
    if(prepared.ready!==true){
      throw new Error(`webgpu_browser_runtime_not_ready:${prepared.reason||'unknown'}`);
    }

    process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(state,'browsers');
    const {chromium}=await import('playwright');

    let selected=null;
    for(const profile of PROFILES){
      const result=await runProfile(chromium,profile,loopback.url);
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
      const error=new Error('webgpu_device_conformance_no_executable_profile');
      error.attempts=attempts;
      throw error;
    }

    const info=cleanInfo(selected.result.proof.adapterInfo);
    const classification=classifyWebGpuAdapter(
      info,
      selected.profile
    );
    const core={
      schema:'evercraft.world-engine.webgpu-device-conformance.v1',
      status:'verified',
      execution_class:classification.execution_class,
      hardware_execution_claim:classification.hardware_execution_claim,
      classification_reason:classification.reason,
      launch_profile:selected.profile.id,
      forced_software:selected.profile.forcedSoftware,
      browser_version:selected.result.browserVersion,
      adapter_info:info,
      secure_context:selected.result.proof.secureContext===true,
      navigator_gpu:true,
      device_acquired:true,
      compute:selected.result.proof.compute,
      render:selected.result.proof.render,
      adapter_features:selected.result.proof.features,
      adapter_limits:selected.result.proof.limits,
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
    return {
      ...core,
      receipt_hash:'sha256:'+sha256(core),
    };
  }finally{
    await closeServer(loopback.server).catch(()=>{});
    if(ownedState) fs.rmSync(ownedState,{recursive:true,force:true});
  }
}
