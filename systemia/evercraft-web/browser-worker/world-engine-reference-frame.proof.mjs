import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { prepareNativeBrowserRuntime } from './native-runtime.mjs';
import {
  classifyWebGpuAdapter,
  WEBGPU_LAUNCH_PROFILES,
} from './webgpu-conformance.mjs';

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

const packageFile=path.resolve(
  String(process.env.EVERCRAFT_WORLD_ENGINE_REFERENCE_FRAME_FILE||'')
);
if(!fs.existsSync(packageFile)){
  throw new Error('world_engine_reference_frame_package_missing');
}
const payload=JSON.parse(fs.readFileSync(packageFile,'utf8'));
const moduleFile=path.resolve(
  process.cwd(),
  '../../../systemia/world-engine/webgpu-reference-browser.mjs'
);
if(!fs.existsSync(moduleFile)){
  throw new Error('world_engine_reference_browser_module_missing');
}

const server=http.createServer((request,response)=>{
  if(request.url==='/world-engine-reference-browser.mjs'){
    response.writeHead(200,{
      'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store',
    });
    response.end(fs.readFileSync(moduleFile,'utf8'));
    return;
  }
  response.writeHead(200,{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
  });
  response.end('<!doctype html><meta charset="utf-8"><title>Evercraft World Engine reference frame</title>');
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const address=server.address();
if(!address||typeof address==='string') throw new Error('reference_frame_loopback_invalid');
const url=`http://127.0.0.1:${address.port}/`;

const stateDir=String(process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||'').trim();
const prepared=await prepareNativeBrowserRuntime({
  sourceDir:process.cwd(),
  stateDir:stateDir||undefined,
  allowInstall:true,
});
assert.equal(prepared.ready,true);
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(
  stateDir||process.cwd(),
  stateDir?'browsers':'.never-used'
);

const {chromium}=await import('playwright');
const attempts=[];
let selected=null;

try{
  for(const profile of WEBGPU_LAUNCH_PROFILES){
    let browser=null;
    try{
      browser=await chromium.launch({headless:true,args:profile.args});
      const page=await browser.newPage({viewport:{width:320,height:240}});
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:15_000});
      const result=await page.evaluate(async(payload)=>{
        if(!globalThis.isSecureContext) return {ok:false,error:'secure_context_required'};
        if(!navigator.gpu) return {ok:false,error:'navigator_gpu_unavailable'};
        const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
        if(!adapter) return {ok:false,error:'adapter_unavailable'};
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
          };
        }catch(error){
          adapterInfo={info_error:String(error?.message||error)};
        }
        const device=await adapter.requestDevice();
        try{
          const module=await import('/world-engine-reference-browser.mjs');
          const execution=await module.executeWorldEngineReferenceFrame(device,payload);
          return {ok:execution.verified===true,adapterInfo,execution};
        }finally{
          device.destroy();
        }
      },payload);
      attempts.push({
        profile:profile.id,
        forced_software:profile.forcedSoftware,
        ok:result.ok===true,
        error:result.error||null,
      });
      if(result.ok===true){
        selected={profile,result,browserVersion:browser.version()};
        break;
      }
    }catch(error){
      attempts.push({
        profile:profile.id,
        forced_software:profile.forcedSoftware,
        ok:false,
        error:String(error?.message||error).slice(0,2000),
      });
    }finally{
      if(browser){
        try{await browser.close();}catch{}
      }
    }
  }
}finally{
  await new Promise((resolve)=>server.close(resolve));
}

if(!selected){
  throw new Error('world_engine_reference_frame_no_executable_webgpu_profile:'+JSON.stringify(attempts));
}

const classification=classifyWebGpuAdapter(
  selected.result.adapterInfo,
  selected.profile
);
const execution=selected.result.execution;
assert.equal(execution.verified,true);
assert.equal(execution.center.verified,true);
assert.equal(execution.background.verified,true);
assert.equal(execution.packageDigest,payload.digest);
assert.equal(execution.planDigest,payload.planDigest);
assert.equal(execution.shaderDigest,payload.shaderDigest);

const pngDataUrl=String(execution.pngDataUrl||'');
assert.match(pngDataUrl,/^data:image\/png;base64,/);
const pngBytes=Buffer.from(pngDataUrl.split(',')[1],'base64');
const pngFile=String(
  process.env.EVERCRAFT_WORLD_ENGINE_REFERENCE_FRAME_PNG||
  '/tmp/evercraft-world-engine-reference-frame.png'
);
fs.writeFileSync(pngFile,pngBytes);

const core={
  schema:'evercraft.world-engine.webgpu-reference-frame-receipt.v1',
  status:'verified',
  world_id:payload.worldId,
  world_definition_digest:payload.worldDefinitionDigest,
  snapshot_digest:payload.snapshotDigest,
  visual_frame_digest:payload.visualFrameDigest,
  plan_digest:payload.planDigest,
  shader_digest:payload.shaderDigest,
  package_digest:payload.digest,
  pixel_sha256:execution.pixelSha256,
  png_sha256:sha256(pngBytes),
  width:execution.width,
  height:execution.height,
  draw_count:execution.drawCount,
  light_count:execution.lightCount,
  center:execution.center,
  background:execution.background,
  execution_class:classification.execution_class,
  hardware_execution_claim:classification.hardware_execution_claim,
  classification_reason:classification.reason,
  adapter_info:selected.result.adapterInfo,
  browser_version:selected.browserVersion,
  launch_profile:selected.profile.id,
  forced_software:selected.profile.forcedSoftware,
  attempts,
  native_browser_preflight_receipt:prepared.receipt_hash,
};
const receipt={...core,receipt_hash:'sha256:'+sha256(core)};
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
