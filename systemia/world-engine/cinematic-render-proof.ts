/**
 * Owned World Engine cinematic pixel canary.
 * Actual WGSL GPU frames -> raw RGBA -> FFmpeg H.264/AAC master.
 * Deliberately SYNTHETIC industrial geometry and original authored synth sound.
 * No public product or physical-world footage claims. No publication.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildCinematicCameraSequence,type CinematicCameraTake} from './cinematic-rig.js';
import type {WorldDefinition} from './engine.js';
import type {GeometryAsset} from './webgpu.js';
import {makeTorusGeometry} from './procedural-geometry.js';
import {makeBrushedMetalTextures} from './brushed-metal.js';
import {renderKineticSoundscape} from '../media-studio/kinetic-soundscape.mjs';
import {battleshipWorld,battleshipGeometry,battleshipTake} from './battleship-scene.js';
import {fourVesselProxyWorld,fourVesselProxyTake} from './four-vessel-proxy-scene.js';
import {historicSilhouetteWorld,historicSilhouetteTake,battleVesselGeometry} from './battle-vessel-silhouettes.js';
import {makeBattleMotionDemo} from './battle-motion-demo.js';
import {makeBattleEnvironmentFx} from './battle-environment-fx.js';
import {attachAnimatedOcean,makeAnimatedOceanGrid,OCEAN_WAVE_GEOMETRY_ID,OCEAN_WAVE_AMPLITUDE} from './animated-ocean.js';
import {CINEMATIC_SKY_WGSL,cinematicSkyCameraUniform,skyShaderSha256} from './native-sky.js';
import {organicFoamGeometry,ORGANIC_FOAM_PREFIX} from './organic-wake-geometry.js';
import {attachCinematicFxToWorld,cinematicFxGeometry} from './cinematic-environment-fx.js';
import {makeNativeBattleshipSequence,composeNativeBattleshipCamera,type NativeFilmFormat} from './native-format-camera.js';
import {auditSequenceHeroFraming} from './shot-composition.js';
import {directWorldEngineShot,type DirectorShotType} from './shot-director.js';
import {generateDeterministicTangents} from './fallen-geometry.js';
import type {TextureAsset} from './texture.js';
import {textureAssetDigest} from './texture.js';
import {extractOwnedShader} from '../evercraft-web/browser-worker/webgpu-reference-frame.mjs';
import {prepareNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const worker=path.join(root,'systemia/evercraft-web/browser-worker');
const sha=(value:Buffer|string)=>crypto.createHash('sha256').update(value).digest('hex');
const requestedFormat=process.env.CINEMATIC_FORMAT||'wide';
if(!['wide','square','vertical'].includes(requestedFormat))throw Error('cinematic_native_format_invalid');
const nativeFormat=requestedFormat as NativeFilmFormat;
const nativeViewport=composeNativeBattleshipCamera(nativeFormat).viewport;
const WIDTH=['battleship','denmark_strait_formation','denmark_strait_silhouettes'].includes(process.env.CINEMATIC_SCENE||'')?nativeViewport.width:640;
const HEIGHT=['battleship','denmark_strait_formation','denmark_strait_silhouettes'].includes(process.env.CINEMATIC_SCENE||'')?nativeViewport.height:360;
const FPS=24,DURATION=4;
function cube():GeometryAsset{
  const q=[
    {n:[0,0,1],v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},
    {n:[0,0,-1],v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]},
    {n:[1,0,0],v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},
    {n:[-1,0,0],v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},
    {n:[0,1,0],v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},
    {n:[0,-1,0],v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]}
  ];
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
  for(const face of q){
    for(const i of [0,1,2,0,2,3]){
      positions.push(...face.v[i]);normals.push(...face.n);
      uvs.push(...[[0,0],[1,0],[1,1],[0,1]][i]);
    }
  }
  return {schema:'evercraft.world-engine.geometry.v1',id:'owned:cube',
    primitive:'triangles',positions,normals,uvs};
}
const METAL_TEXTURE_PREFIX='owned:industrial-brushed-steel';
function industrialTextures():TextureAsset[]{
  const steel=makeBrushedMetalTextures({
    idPrefix:METAL_TEXTURE_PREFIX,size:64,grainStrength:.25,
    baseBrightness:.9,roughness:.31,metallic:.94
  });
  return [steel.baseColor,steel.orm,steel.normal];
}
function industrialGeometry(){
  return [cube(),makeTorusGeometry({id:'owned:outer-rotor',majorRadius:1.32,tubeRadius:.22}),
    makeTorusGeometry({id:'owned:inner-rotor',majorRadius:.77,tubeRadius:.16,radialSegments:32,tubularSegments:8})]
    .map(geometry=>({
      ...geometry,
      tangents:generateDeterministicTangents(geometry.positions,geometry.normals,geometry.uvs??[])
    }));
}
function industrialWorld():WorldDefinition{
  const material=(id:string,color:[number,number,number],metallic=.2,roughness=.55)=>({
    id,model:'pbr' as const,baseColor:{r:color[0],g:color[1],b:color[2],a:1},metallic,roughness
  });
  const box=(id:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:string)=>({
    id,transform:{position:{x,y,z},scale:{x:sx,y:sy,z:sz}},
    renderable:{geometryRef:'owned:cube',materialId:mat,
      castsShadow:!['floor','platform'].includes(id),receivesShadow:true}
  });
  return {
    schema:'evercraft.world-engine.world.v1',id:'world:cinematic-fabric-synthetic',
    version:1,tickRateHz:120,gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'cinema-camera',
      clearColor:{r:.018,g:.038,b:.085},
      atmosphere:{color:{r:.14,g:.25,b:.38},density:.048,startDistance:4,heightFalloff:.065,referenceHeight:0},
      colorManagement:{toneMapper:'aces_filmic',exposureBiasStops:0.35},
      cinematicLighting:{shading:'ggx_microfacet',localLightFalloff:'inverse_square'},
      directionalShadows:{directionalLightEntityId:'sun',focus:{x:0,y:1.2,z:0},halfExtent:14,resolution:256,depthBias:.003,softnessTexels:2},
      materials:[
        material('floor',[.08,.14,.20],.25,.85),
        {...material('structure',[.29,.42,.54],.68,.35),
          textureRefs:{baseColor:METAL_TEXTURE_PREFIX+'/base',
            orm:METAL_TEXTURE_PREFIX+'/orm',
            normal:METAL_TEXTURE_PREFIX+'/normal'}},
        material('accent',[.86,.40,.12],.45,.28),
        material('dark',[.12,.17,.24],.4,.6),
        {...material('core',[.96,.59,.19],.8,.29),
          textureRefs:{baseColor:METAL_TEXTURE_PREFIX+'/base',
            orm:METAL_TEXTURE_PREFIX+'/orm',
            normal:METAL_TEXTURE_PREFIX+'/normal'}}
      ]
    },
    entities:[
      {id:'cinema-camera',transform:{position:{x:0,y:5,z:12}},
        camera:{projection:{type:'perspective',fovYDeg:52},near:.1,far:160,exposure:1.2}},
      box('floor',0,-.3,0,24,.25,24,'floor'),
      box('platform',0,.25,0,4,.5,4,'structure'),
      box('front-rail',0,.4,5,7,.14,.17,'accent'),
      box('rear-rail',0,.4,-5,7,.14,.17,'accent'),
      box('left-pillar',-4,2,-4,.9,2,.9,'dark'),
      box('right-pillar',4,2,-4,.9,2,.9,'dark'),
      box('left-pillar-front',-4,1.5,4,.7,1.5,.7,'structure'),
      box('right-pillar-front',4,1.5,4,.7,1.5,.7,'structure'),
      box('sky-bridge',0,4,-4,5,.25,.3,'accent'),
      box('distance-a',-9,3,-10,1.3,3,1.3,'structure'),
      box('distance-b',9,4,-12,1.2,4,1.2,'structure'),
      box('distance-c',0,5,-17,1.9,5,1.9,'dark'),
      {id:'reactor',transform:{position:{x:0,y:2,z:0},rotationDeg:{x:34,y:0,z:22}},
        behaviors:[{kind:'spin',degreesPerSecond:{x:6,y:34,z:12}}],
        renderable:{geometryRef:'owned:outer-rotor',materialId:'core'}},
      {id:'inner-rotor',transform:{position:{x:0,y:2,z:0},rotationDeg:{x:15,y:12,z:-33}},
        behaviors:[{kind:'spin',degreesPerSecond:{x:-12,y:-55,z:22}}],
        renderable:{geometryRef:'owned:inner-rotor',materialId:'accent'}},
      box('reactor-spindle',0,2,0,.28,1.4,.28,'dark'),
      box('cradle-left',-1.75,1.2,0,.22,1.2,.28,'structure'),
      box('cradle-right',1.75,1.2,0,.22,1.2,.28,'structure'),
      box('cradle-front',0,.65,1.7,1.8,.2,.22,'accent'),
      box('cradle-back',0,.65,-1.7,1.8,.2,.22,'accent'),
      box('reactor-backplate',0,2,-2.2,2.4,2.15,.12,'dark'),
      box('light-frame-top',0,4.4,0,2.8,.08,.08,'accent'),
      box('light-frame-left',-2.8,2.2,0,.08,2.15,.08,'structure'),
      box('light-frame-right',2.8,2.2,0,.08,2.15,.08,'structure'),
      {id:'ambient',transform:{position:{x:0,y:0,z:0}},
        light:{type:'ambient',color:{r:.35,g:.52,b:.72},intensity:2.2}},
      {id:'sun',transform:{position:{x:-8,y:12,z:1},rotationDeg:{x:-35,y:-25,z:0}},
        light:{type:'directional',color:{r:.65,g:.78,b:1},intensity:4.2,castsShadow:true}},
      {id:'warm',transform:{position:{x:2,y:4,z:3}},
        light:{type:'point',color:{r:1,g:.48,b:.14},intensity:95,range:12}},
      {id:'rim',transform:{position:{x:-4,y:6,z:-2}},
        light:{type:'point',color:{r:.24,g:.58,b:1},intensity:85,range:15}}
    ]
  };
}
function run(binary:string,args:string[]){
  const r=spawnSync(binary,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  if(r.error||r.status!==0)throw new Error(binary+'_failed:'+String(r.stderr||r.error||r.status).slice(-1600));
  return r.stdout;
}
async function loopback(){
  const server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>World Engine GPU lab</title>')});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const addr=server.address();
  if(!addr||typeof addr==='string')throw new Error('loopback_invalid');
  return {server,url:'http://127.0.0.1:'+addr.port+'/'};
}
async function renderGpuFrames(plans:ReturnType<typeof buildCinematicCameraSequence>['frames'],geometries:GeometryAsset[],textures:TextureAsset[],
  shader:string,shadowShader:string,out:string,skyShader:string|null=null){
  const prepared=await prepareNativeBrowserRuntime({
    sourceDir:worker,stateDir:process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||path.join(out,'native-browser'),
    allowInstall:true
  } as any);
  if(prepared.ready!==true)throw new Error('native_browser_unavailable:'+prepared.reason);
  process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(process.env.EVERCRAFT_NATIVE_BROWSER_STATE_DIR||path.join(out,'native-browser'),'browsers');
  const require=createRequire(path.join(worker,'package.json'));
  const {chromium}=require('playwright') as {chromium:any};
  const server=await loopback();
  const profiles=[
    {name:'headless-adapter',forcedSoftware:false,args:['--enable-gpu','--enable-unsafe-webgpu','--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests']},
    {name:'swiftshader',forcedSoftware:true,args:['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-gl=angle','--use-angle=swiftshader','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface','--enable-dawn-features=allow_unsafe_apis','--use-gpu-in-tests']}
  ];
  let browser:any=null,page:any=null,selected:any=null;
  try{
    const errors:string[]=[];
    for(const profile of profiles){
      try{
        browser=await chromium.launch({headless:true,args:profile.args});
        const context=await browser.newContext({viewport:{width:WIDTH,height:HEIGHT}});
        page=await context.newPage();
        // tsx/esbuild annotates inline page.evaluate closures with __name().
        // The browser runs serialized callbacks without Node's module helpers.
        // Install only this inert name decorator in the isolated loopback lab.
        await page.addInitScript({content:"globalThis.__name=(fn,name)=>fn;"});
        await page.goto(server.url,{waitUntil:'domcontentloaded'});
        const init=await page.evaluate(async({shader,shadowShader,skyShader,geometries,textures,width,height,shadowResolution}:{shader:string;shadowShader:string;skyShader:string|null;geometries:GeometryAsset[];textures:TextureAsset[];width:number;height:number;shadowResolution:number})=>{
          const adapter=await (navigator as any).gpu?.requestAdapter();
          if(!adapter)return {ok:false,reason:'no_adapter'};
          const device=await adapter.requestDevice();
          const module=device.createShaderModule({code:shader});
          const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error').map(m=>m.message);
          if(errors.length)return {ok:false,reason:errors.join('|')};
          const frameLayout=device.createBindGroupLayout({entries:[
            {binding:0,visibility:3,buffer:{type:'uniform'}},
            {binding:1,visibility:2,buffer:{type:'read-only-storage'}},
            {binding:2,visibility:2,texture:{sampleType:'depth'}},
            {binding:3,visibility:2,sampler:{type:'comparison'}}
          ]});
          const objectLayout=device.createBindGroupLayout({entries:[
            {binding:0,visibility:3,buffer:{type:'uniform'}},
            {binding:1,visibility:2,sampler:{type:'filtering'}},
            {binding:2,visibility:2,texture:{sampleType:'float'}},
            {binding:3,visibility:2,texture:{sampleType:'float'}},
            {binding:4,visibility:2,texture:{sampleType:'float'}},
            {binding:5,visibility:2,texture:{sampleType:'float'}}
          ]});
          const pipeline=device.createRenderPipeline({
            layout:device.createPipelineLayout({bindGroupLayouts:[frameLayout,objectLayout]}),
            vertex:{module,entryPoint:'vs_main',buffers:[{arrayStride:48,attributes:[
              {shaderLocation:0,offset:0,format:'float32x3'},
              {shaderLocation:1,offset:12,format:'float32x3'},
              {shaderLocation:2,offset:24,format:'float32x2'},
              {shaderLocation:3,offset:32,format:'float32x4'}]}]},
            fragment:{module,entryPoint:'fs_main',targets:[{format:'rgba8unorm'}]},
            primitive:{topology:'triangle-list',frontFace:'ccw',cullMode:'none'},
            depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}
          });
          // Native alpha-composited smoke: genuine GPU fragment blending with
          // depth testing, depth writes OFF. Opaque legacy shots retain exact
          // original pipeline and draw order.
          const transparentPipeline=device.createRenderPipeline({
            layout:device.createPipelineLayout({bindGroupLayouts:[frameLayout,objectLayout]}),
            vertex:{module,entryPoint:'vs_main',buffers:[{arrayStride:48,attributes:[
              {shaderLocation:0,offset:0,format:'float32x3'},
              {shaderLocation:1,offset:12,format:'float32x3'},
              {shaderLocation:2,offset:24,format:'float32x2'},
              {shaderLocation:3,offset:32,format:'float32x4'}]}]},
            fragment:{module,entryPoint:'fs_main',targets:[{format:'rgba8unorm',
              blend:{
                color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
                alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}
              }}]},
            primitive:{topology:'triangle-list',frontFace:'ccw',cullMode:'none'},
            depthStencil:{format:'depth24plus',depthWriteEnabled:false,depthCompare:'less'}
          });
          // Optional source-authored GPU sky pass, dormant for legacy shots.
          let skyPipeline:any=null,skyLayout:any=null;
          if(skyShader){
            const skyModule=device.createShaderModule({code:skyShader});
            const skyErrors=(await skyModule.getCompilationInfo()).messages
              .filter((m:any)=>m.type==='error').map((m:any)=>m.message);
            if(skyErrors.length)return {ok:false,reason:'sky_shader:'+skyErrors.join('|')};
            skyLayout=device.createBindGroupLayout({entries:[
              {binding:0,visibility:3,buffer:{type:'uniform'}}
            ]});
            skyPipeline=device.createRenderPipeline({
              layout:device.createPipelineLayout({bindGroupLayouts:[skyLayout]}),
              vertex:{module:skyModule,entryPoint:'vs_sky'},
              fragment:{module:skyModule,entryPoint:'fs_sky',targets:[{format:'rgba8unorm'}]},
              primitive:{topology:'triangle-list',cullMode:'none'}
            });
          }
          const shadowModule=device.createShaderModule({code:shadowShader});
          const shadowErrors=(await shadowModule.getCompilationInfo()).messages
            .filter(m=>m.type==='error').map(m=>m.message);
          if(shadowErrors.length)return {ok:false,reason:'shadow_shader:'+shadowErrors.join('|')};
          const shadowLayout=device.createBindGroupLayout({entries:[
            {binding:0,visibility:1,buffer:{type:'uniform'}}
          ]});
          const shadowPipeline=device.createRenderPipeline({
            layout:device.createPipelineLayout({bindGroupLayouts:[shadowLayout]}),
            vertex:{module:shadowModule,entryPoint:'vs_main',buffers:[{
              arrayStride:48,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]
            }]},
            primitive:{topology:'triangle-list',cullMode:'none'},
            depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}
          });
          const buffers=new Map<string,any>();
          for(const geometry of geometries){
            const output:number[]=[];
            for(let i=0;i<geometry.positions.length/3;i++){
              output.push(...geometry.positions.slice(i*3,i*3+3),
                ...geometry.normals.slice(i*3,i*3+3),
                ...(geometry.uvs?.slice(i*2,i*2+2)??[0,0]),1,0,0,1);
            }
            const vertices=new Float32Array(output);
            const vb=device.createBuffer({size:vertices.byteLength,
              usage:(globalThis as any).GPUBufferUsage.VERTEX|(globalThis as any).GPUBufferUsage.COPY_DST});
            device.queue.writeBuffer(vb,0,vertices);buffers.set(geometry.id,vb);
          }
          const pixel=(rgba:number[])=>{
            const texture=device.createTexture({size:[1,1,1],format:'rgba8unorm',
              usage:(globalThis as any).GPUTextureUsage.TEXTURE_BINDING|(globalThis as any).GPUTextureUsage.COPY_DST});
            device.queue.writeTexture({texture},new Uint8Array(rgba),{bytesPerRow:4,rowsPerImage:1},[1,1,1]);
            return texture;
          };
          const fallback=[
            pixel([255,255,255,255]),
            pixel([255,255,255,255]),
            pixel([0,0,0,255]),
            pixel([128,128,255,255])
          ];
          const sampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
          const textureMap=new Map<string,any>();
          for(const asset of textures){
            if(asset.width%64!==0||asset.height<1)throw Error('unsafe_browser_texture_stride');
            const texture=device.createTexture({
              size:[asset.width,asset.height,1],format:asset.format,
              usage:(globalThis as any).GPUTextureUsage.TEXTURE_BINDING|(globalThis as any).GPUTextureUsage.COPY_DST
            });
            device.queue.writeTexture({texture},new Uint8Array(asset.data),
              {bytesPerRow:asset.width*4,rowsPerImage:asset.height},[asset.width,asset.height,1]);
            textureMap.set(asset.id,texture);
          }
          const target=device.createTexture({size:[width,height,1],format:'rgba8unorm',
            usage:(globalThis as any).GPUTextureUsage.RENDER_ATTACHMENT|(globalThis as any).GPUTextureUsage.COPY_SRC});
          const depth=device.createTexture({size:[width,height,1],format:'depth24plus',usage:(globalThis as any).GPUTextureUsage.RENDER_ATTACHMENT});
          const shadowTexture=device.createTexture({
            size:[shadowResolution,shadowResolution,1],format:'depth32float',
            usage:(globalThis as any).GPUTextureUsage.RENDER_ATTACHMENT|(globalThis as any).GPUTextureUsage.TEXTURE_BINDING
          });
          const shadowSampler=device.createSampler({compare:'less-equal'});
          // Dedicated synthetic lab runtime; all values come from canonically verified WebGPU plans.
          (window as any).__evercraftCinematic={device,frameLayout,objectLayout,pipeline,transparentPipeline,buffers,
            fallback,sampler,textureMap,target,depth,width,height,shadowTexture,shadowSampler,shadowLayout,shadowPipeline,skyPipeline,skyLayout};
          return {ok:true};
        },{shader,shadowShader,skyShader,geometries,textures,width:WIDTH,height:HEIGHT,
          shadowResolution:plans[0].renderPlan.shadow?.resolution??1});
        if(init.ok){selected=profile;break;}
        errors.push(profile.name+':'+init.reason);
        await browser.close();browser=null;page=null;
      }catch(error){errors.push(profile.name+':'+String(error));if(browser)await browser.close();browser=null;page=null;}
    }
    if(!page||!selected)throw new Error('gpu_profile_unavailable:'+errors.join(';'));
    const framesFile=path.join(out,'frames.rgba');
    const handle=fs.openSync(framesFile,'wx',0o600);
    const hashes:string[]=[];
    let counterfactualChangedPixels=0;
    let filterChangedPixels=0;
    let skyCounterfactualChangedPixels=0;
    try{
      for(const frame of plans.slice(0,-1)){
        const packet=frame.renderPlan;
        if(!packet?.digest||!packet.draws?.length)throw new Error('empty_gpu_plan');
        const skyFrame=skyShader?Array.from(cinematicSkyCameraUniform(packet)):null;
        const renderFrame=async (submittedPlan:any,showSky=true)=>page.evaluate(async({plan,skyValues}:{plan:any;skyValues:number[]|null})=>{
          const r=(window as any).__evercraftCinematic;
          const {device}=r;
          const fog=plan.atmosphere;
          const frameData=new Float32Array([
            ...plan.viewProjectionMatrix,
            ...plan.cameraPosition,plan.exposure,
            plan.lights.length,0,0,0,
            fog?.color.r??0,fog?.color.g??0,fog?.color.b??0,fog?.density??0,
            fog?.startDistance??0,fog?.heightFalloff??0,fog?.referenceHeight??0,0,
            plan.colorManagement?.toneMapper==='aces_filmic'?1:0,
            plan.colorManagement?.exposureBiasStops??0,0,0,
            plan.cinematicLighting?.shading==='ggx_microfacet'?1:0,
            plan.cinematicLighting?.localLightFalloff==='inverse_square'?1:0,0,0,
            ...(plan.shadow?.lightViewProjectionMatrix??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
            plan.shadow?.lightIndex??0,plan.shadow?1:0,plan.shadow?.depthBias??0,plan.shadow?.softnessTexels??0
          ]);
          const frameBuffer=device.createBuffer({size:frameData.byteLength,usage:(globalThis as any).GPUBufferUsage.UNIFORM|(globalThis as any).GPUBufferUsage.COPY_DST});
          device.queue.writeBuffer(frameBuffer,0,frameData);
          const lightValues:number[]=[];
          for(const l of plan.lights){
            lightValues.push(l.kind,l.intensity,l.range,l.innerCos,
              ...l.color,l.outerCos,...l.position,0,...l.direction,0);
          }
          if(!lightValues.length)lightValues.push(0,0,0,0);
          const ls=new Float32Array(lightValues);
          const lightBuffer=device.createBuffer({size:ls.byteLength,usage:(globalThis as any).GPUBufferUsage.STORAGE|(globalThis as any).GPUBufferUsage.COPY_DST});
          device.queue.writeBuffer(lightBuffer,0,ls);
          const frameGroup=device.createBindGroup({layout:r.frameLayout,entries:[
            {binding:0,resource:{buffer:frameBuffer}},{binding:1,resource:{buffer:lightBuffer}},
            {binding:2,resource:r.shadowTexture.createView()},{binding:3,resource:r.shadowSampler}]});
          const encoder=device.createCommandEncoder();
          const shadowObjects:any[]=[];
          if(plan.shadow){
            const shadowPass=encoder.beginRenderPass({
              colorAttachments:[],depthStencilAttachment:{
                view:r.shadowTexture.createView(),
                depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'
              }
            });
            shadowPass.setPipeline(r.shadowPipeline);
            for(const draw of plan.draws){
              if(!draw.castsShadow||draw.alphaMode!=='opaque')continue;
              const bytes=new Float32Array([...plan.shadow.lightViewProjectionMatrix,...draw.modelMatrix]);
              const buffer=device.createBuffer({size:bytes.byteLength,
                usage:(globalThis as any).GPUBufferUsage.UNIFORM|(globalThis as any).GPUBufferUsage.COPY_DST});
              device.queue.writeBuffer(buffer,0,bytes);
              const bind=device.createBindGroup({layout:r.shadowLayout,entries:[{binding:0,resource:{buffer}}]});
              const vb=r.buffers.get(draw.geometryId);
              if(!vb)throw Error('missing_shadow_caster_geometry:'+draw.geometryId);
              shadowObjects.push(buffer);shadowPass.setBindGroup(0,bind);
              shadowPass.setVertexBuffer(0,vb);shadowPass.draw(draw.vertexCount,1,0,0);
            }
            shadowPass.end();
          }
          // Fullscreen sky renders to the same original GPU color target, behind
          // the opaque and alpha-blended geometry, without any stock sky pixels.
          let skyBuffer:any=null;
          if(r.skyPipeline&&skyValues){
            if(skyValues.length!==20||skyValues.some((x:number)=>!Number.isFinite(x)))
              throw Error('sky_camera_uniform_invalid');
            const data=new Float32Array(skyValues);
            skyBuffer=device.createBuffer({size:data.byteLength,
              usage:(globalThis as any).GPUBufferUsage.UNIFORM|(globalThis as any).GPUBufferUsage.COPY_DST});
            device.queue.writeBuffer(skyBuffer,0,data);
            const skyGroup=device.createBindGroup({layout:r.skyLayout,entries:[
              {binding:0,resource:{buffer:skyBuffer}}]});
            const skyPass=encoder.beginRenderPass({colorAttachments:[{
              view:r.target.createView(),clearValue:{...plan.clearColor,a:1},
              loadOp:'clear',storeOp:'store'}]});
            skyPass.setPipeline(r.skyPipeline);
            skyPass.setBindGroup(0,skyGroup);
            skyPass.draw(3,1,0,0);
            skyPass.end();
          }
          const pass=encoder.beginRenderPass({
            colorAttachments:[{view:r.target.createView(),clearValue:{...plan.clearColor,a:1},
              loadOp:r.skyPipeline&&skyValues?'load':'clear',storeOp:'store'}],
            depthStencilAttachment:{view:r.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}
          });
          pass.setPipeline(r.pipeline);pass.setBindGroup(0,frameGroup);
          const objects:any[]=[];
          // Two actual render passes within one depth-tested scene: first
          // opaque objects, then semitransparent meshes, back-to-front.
          const opaque=plan.draws.filter((d:any)=>d.alphaMode!=='blend');
          const transparent=plan.draws.filter((d:any)=>d.alphaMode==='blend');
          const distanceSquared=(d:any)=>{
            const m=d.modelMatrix,p=plan.cameraPosition;
            return (m[12]-p[0])**2+(m[13]-p[1])**2+(m[14]-p[2])**2;
          };
          transparent.sort((a:any,b:any)=>distanceSquared(b)-distanceSquared(a));
          let blending=false;
          for(const draw of [...opaque,...transparent]){
            if(draw.alphaMode==='blend'&&!blending){
              pass.setPipeline(r.transparentPipeline);blending=true;
            }
            const obj=new Float32Array([
              ...draw.modelMatrix,...draw.normalMatrix,
              ...draw.baseColor,draw.materialModel,draw.metallic,draw.roughness,draw.alphaCutoff,
              ...draw.emissive,draw.emissiveIntensity,...draw.textureFlags,
              draw.receivesShadow?1:0,
              draw.geometryId==='owned:evercraft-dynamic-ocean-grid'?1:0,
              draw.geometryId==='owned:evercraft-dynamic-ocean-grid'?plan.timeSec:
                draw.geometryId.startsWith('owned:fx-organic-foam-')?-2:0,
              draw.geometryId==='owned:evercraft-dynamic-ocean-grid'?0.80:
                draw.geometryId.startsWith('owned:fx-organic-foam-')?plan.timeSec:0
            ]);
            const buffer=device.createBuffer({size:obj.byteLength,usage:(globalThis as any).GPUBufferUsage.UNIFORM|(globalThis as any).GPUBufferUsage.COPY_DST});
            device.queue.writeBuffer(buffer,0,obj);
            const assetView=(ref:string|null,index:number)=>{
              if(!ref)return r.fallback[index].createView();
              const texture=r.textureMap.get(ref);
              if(!texture)throw Error('missing_real_texture:'+ref);
              return texture.createView();
            };
            const group=device.createBindGroup({layout:r.objectLayout,entries:[
              {binding:0,resource:{buffer}},{binding:1,resource:r.sampler},
              {binding:2,resource:assetView(draw.textureRefs.baseColor,0)},
              {binding:3,resource:assetView(draw.textureRefs.orm,1)},
              {binding:4,resource:assetView(draw.textureRefs.emissive,2)},
              {binding:5,resource:assetView(draw.textureRefs.normal,3)}]});
            const mesh=r.buffers.get(draw.geometryId);
            if(!mesh)throw Error('missing_real_geometry_buffer:'+draw.geometryId);
            objects.push(buffer);pass.setBindGroup(1,group);pass.setVertexBuffer(0,mesh);pass.draw(draw.vertexCount,1,0,0);
          }
          pass.end();
          const rowBytes=r.width*4,bytesPerRow=Math.ceil(rowBytes/256)*256;
          const readback=device.createBuffer({size:bytesPerRow*r.height,usage:(globalThis as any).GPUBufferUsage.COPY_DST|(globalThis as any).GPUBufferUsage.MAP_READ});
          encoder.copyTextureToBuffer({texture:r.target},
            {buffer:readback,bytesPerRow,rowsPerImage:r.height},[r.width,r.height,1]);
          device.queue.submit([encoder.finish()]);
          await readback.mapAsync((globalThis as any).GPUMapMode.READ);
          const padded=new Uint8Array(readback.getMappedRange().slice(0));
          const raw=new Uint8Array(rowBytes*r.height);
          for(let y=0;y<r.height;y++)raw.set(padded.subarray(y*bytesPerRow,y*bytesPerRow+rowBytes),y*rowBytes);
          readback.unmap();readback.destroy();frameBuffer.destroy();lightBuffer.destroy();if(skyBuffer)skyBuffer.destroy();objects.forEach(z=>z.destroy());shadowObjects.forEach(z=>z.destroy());
          // Browser bytes converted to base64 for an exact raw-video handoff.
          let binary='';
          for(let offset=0;offset<raw.length;offset+=8192){
            binary+=String.fromCharCode(...raw.subarray(offset,offset+8192));
          }
          return btoa(binary);
        },{plan:submittedPlan,skyValues:showSky?skyFrame:null});
        const base64=await renderFrame(packet);
        const pixels=Buffer.from(base64,'base64');
        if(frame.index===0&&skyShader){
          const previous=Buffer.from(await renderFrame(packet,false),'base64');
          if(previous.length!==pixels.length)throw Error('sky_counterfactual_invalid');
          fs.writeFileSync(path.join(out,'sky-disabled-first-frame.rgba'),previous,{flag:'wx',mode:0o600});
          for(let i=0;i<pixels.length;i+=4){
            if(Math.abs(pixels[i]-previous[i])>8||
               Math.abs(pixels[i+1]-previous[i+1])>8||
               Math.abs(pixels[i+2]-previous[i+2])>8)skyCounterfactualChangedPixels++;
          }
          if(skyCounterfactualChangedPixels<500)throw Error('sky_pass_has_no_observable_original_gpu_pixels');
        }
        if(frame.index===0 && packet.shadow){
          // Render EXACTLY the same geometry, camera and lights, with ONLY
          // directional shadow sampling disabled. This is a visual counterfactual,
          // not a canonically signed camera plan or an independently real scene.
          const noShadow=Buffer.from(await renderFrame({...packet,shadow:undefined}),'base64');
          if(noShadow.length!==pixels.length)throw new Error('shadow_counterfactual_size_invalid');
          fs.writeFileSync(path.join(out,'shadow-disabled-first-frame.rgba'),noShadow,{flag:'wx',mode:0o600});
          for(let i=0;i<pixels.length;i+=4){
            if(Math.abs(pixels[i]-noShadow[i])>8 ||
              Math.abs(pixels[i+1]-noShadow[i+1])>8 ||
              Math.abs(pixels[i+2]-noShadow[i+2])>8) counterfactualChangedPixels++;
          }
          if(counterfactualChangedPixels<300)throw new Error('shadow_pass_has_no_observable_pixel_occlusion');
          const unfiltered=Buffer.from(await renderFrame({
            ...packet,shadow:{...packet.shadow,softnessTexels:0}
          }),'base64');
          if(unfiltered.length!==pixels.length)throw new Error('shadow_filter_counterfactual_size_invalid');
          fs.writeFileSync(path.join(out,'shadow-hard-first-frame.rgba'),unfiltered,{flag:'wx',mode:0o600});
          for(let i=0;i<pixels.length;i+=4){
            if(Math.abs(pixels[i]-unfiltered[i])>2 ||
              Math.abs(pixels[i+1]-unfiltered[i+1])>2 ||
              Math.abs(pixels[i+2]-unfiltered[i+2])>2) filterChangedPixels++;
          }
          // Record truth even when the filter's visual effect is imperceptible.
        }
        if(pixels.length!==WIDTH*HEIGHT*4)throw new Error('unexpected_render_bytes');
        fs.writeSync(handle,pixels);hashes.push(sha(pixels));
      }
    }finally{fs.closeSync(handle)}
    if(new Set(hashes).size<3)throw new Error('rendered_frames_have_no_visible_motion');
    return {framesFile,profile:selected.name,softwareAdapterForced:selected.forcedSoftware,
      frameHashes:hashes,uniqueFrameHashes:new Set(hashes).size,counterfactualChangedPixels,
      filterChangedPixels,skyCounterfactualChangedPixels};
  }finally{
    if(browser)await browser.close().catch(()=>{});
    await new Promise<void>(resolve=>server.server.close(()=>resolve()));
  }
}
async function main(){
  const out=path.resolve(process.env.CINEMATIC_PROOF_OUTPUT||path.join(os.tmpdir(),'evercraft-cinematic-pixel-proof-'+process.pid));
  if(fs.existsSync(out))throw new Error('output_already_exists');
  fs.mkdirSync(out,{recursive:true,mode:0o700});
  const isFormation=process.env.CINEMATIC_SCENE==='denmark_strait_formation';
  const isSilhouette=process.env.CINEMATIC_SCENE==='denmark_strait_silhouettes';
  const isBattleship=process.env.CINEMATIC_SCENE==='battleship'||isFormation||isSilhouette;
  const useFx=process.env.BATTLE_FX==='1';
  const organicWake=process.env.BATTLE_ORGANIC_WAKE==='1';
  if(organicWake&&!useFx)throw Error('organic_wake_requires_environmental_fx');
  const useSky=process.env.BATTLE_SKY==='1';
  if(useSky&&!isSilhouette)throw Error('native_sky_requires_distinct_vessel_scene');
  const useAnimatedOcean=process.env.BATTLE_ANIMATED_OCEAN==='1';
  if(useAnimatedOcean&&!isSilhouette)throw Error('animated_ocean_requires_naval_silhouette_scene');
  if(useFx&&!isSilhouette)throw Error('cinematic_environment_fx_requires_naval_geometry');
  const originalWorld=isSilhouette?historicSilhouetteWorld():isFormation?fourVesselProxyWorld():isBattleship?battleshipWorld():industrialWorld();
  const actorRig=isSilhouette&&(process.env.BATTLE_MOTION==='1'||useFx)
    ?makeBattleMotionDemo(originalWorld):undefined;
  const fxRig=useFx?makeBattleEnvironmentFx():undefined;
  const stagedWorld=fxRig?attachCinematicFxToWorld(originalWorld,actorRig!,fxRig,{organicWake}):originalWorld;
  const world=useAnimatedOcean?attachAnimatedOcean(stagedWorld):stagedWorld;
  const geometries=useAnimatedOcean?[...battleVesselGeometry(),...(useFx?cinematicFxGeometry():[]),
      ...(organicWake?organicFoamGeometry():[]),makeAnimatedOceanGrid()]
    :useFx?[...battleVesselGeometry(),...cinematicFxGeometry(),...(organicWake?organicFoamGeometry():[])]
    :isSilhouette?battleVesselGeometry():isBattleship?battleshipGeometry():industrialGeometry();
  const textures=isBattleship?[]:industrialTextures();
  const rotorTake:CinematicCameraTake={
    schema:'evercraft.world-engine.cinematic-camera-take.v1',
    id:'orbital-foundry-take-one',cameraEntityId:'cinema-camera',targetEntityId:'reactor',
    durationSec:DURATION,fps:FPS,move:'orbit',ease:'smootherstep',
    orbit:{radius:11,startAngleDeg:-52,endAngleDeg:58,startHeight:2.6,endHeight:5.2},
    startFovYDeg:51,endFovYDeg:43
  };
  const native= isBattleship&&!isFormation&&!isSilhouette ? makeNativeBattleshipSequence({
    world,geometries,textures,format:nativeFormat,
    ...(process.env.CINEMATIC_SHOT_ID?{overrideTake:composeNativeBattleshipCamera(nativeFormat).cameraTake}:{})
  }):null;
  const shotType=process.env.CINEMATIC_SHOT_ID||'';
  if(shotType&&!['hero_full','detail_closeup','title_safe'].includes(shotType))
    throw new Error('cinematic_director_shot_unsupported');
  if(shotType&&!isBattleship)throw new Error('cinematic_director_requires_battleship_scene');
  const director=shotType?directWorldEngineShot({
    world,geometries,textures,viewport:{width:WIDTH,height:HEIGHT},
    take:composeNativeBattleshipCamera(nativeFormat).cameraTake,
    intent:shotType as DirectorShotType,
    hero:{id:'ship-hero',entityIds:['ship-hull','bridge-house','mast-main']},
    detail:{id:'gun-turret-detail',entityIds:['turret-fore-a','barrel-fore-a-port','barrel-fore-a-starboard']},
    detailTargetEntityId:'turret-fore-a'
  }):null;
  const sequence=director?.sequence??native?.sequence??buildCinematicCameraSequence({
    world,take:isSilhouette?historicSilhouetteTake((process.env.BATTLE_CAMERA||'formation') as 'formation'|'bismarck_hero'):isFormation?fourVesselProxyTake():rotorTake,geometries,viewport:{width:WIDTH,height:HEIGHT},textures,
    ...(actorRig?{actorRig}:{}),
    ...(fxRig?{fxRig}:{})
  });
  if(!director&&native?.review.some(r=>r.visibleSubjectLandmarks<6))
    throw Error('battleship_native_subject_composition_failed');
  const actualGeometryFraming=native?auditSequenceHeroFraming({
    frames:sequence.frames,geometries,
    subject:director?.receipt.intent==='detail_closeup'
      ?{id:'gun-turret-detail',
        entityIds:['turret-fore-a','barrel-fore-a-port','barrel-fore-a-starboard'],
        minVisibleFraction:.5}
      :{id:'battleship-hero',
        entityIds:['ship-hull','bridge-house','mast-main'],minVisibleFraction:.75}
  }):null;
  if(actualGeometryFraming?.frameSamples.some(sample=>
    sample.framingStatus==='subject_offscreen'))
    throw Error('battleship_true_geometry_offscreen');
  const shader=extractOwnedShader(root);
  const worldShaderSource=fs.readFileSync(path.join(root,'systemia/world-engine/webgpu.ts'),'utf8');
  const shadowSource=worldShaderSource.match(/export const EVERCRAFT_SHADOW_DEPTH_WGSL=`([\s\S]*?)`;/);
  if(!shadowSource)throw new Error('owned_shadow_shader_missing');
  const raw=await renderGpuFrames(sequence.frames,geometries,textures,shader.source,shadowSource[1],out,useSky?CINEMATIC_SKY_WGSL:null);
  const video=path.join(out,isSilhouette?'denmark-strait-class-silhouettes-gpu.mp4':isFormation?'denmark-strait-four-vessel-gpu-proxy.mp4':isBattleship?'battleship-world-engine-trial.mp4':'orbital-foundry-synthetic-canary.mp4');
  let soundReceipt:ReturnType<typeof renderKineticSoundscape>['receipt']|null=null;
  if(isBattleship){
    // The founder rejected the synthetic sound. Ship footage gets NO invented
    // motors, explosions, fake sea recording or score.
    run('ffmpeg',['-hide_banner','-loglevel','error','-y',
      '-f','rawvideo','-pixel_format','rgba','-video_size',WIDTH+'x'+HEIGHT,
      '-framerate',String(FPS),'-i',raw.framesFile,
      '-an','-t',String(DURATION),'-c:v','libx264','-preset','medium',
      '-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',video]);
  }else{
  // Original unlicensed-by-others mechanical soundtrack for this synthetic scene.
    const sound=renderKineticSoundscape({
    durationSec:DURATION,sampleRate:48000,movement:'orbit',
    seed:'evercraft-foundry-original-kinetic-film-v1',
    impacts:[{at:.34,power:.6},{at:2.08,power:.8},{at:3.18,power:1}]
  });
    soundReceipt=sound.receipt;
  const soundFile=path.join(out,'kinetic-original-soundscape.wav');
  fs.writeFileSync(soundFile,sound.wav,{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(out,'soundscape-receipt.json'),JSON.stringify(sound.receipt,null,2)+'\n',
    {flag:'wx',mode:0o600});
  run('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-i',soundFile,
    '-filter_complex','[0:a]showwavespic=s=960x256:scale=sqrt:colors=white[wave]',
    '-map','[wave]','-frames:v','1',path.join(out,'soundscape-waveform.png')]);
  run('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','rawvideo','-pixel_format','rgba','-video_size',WIDTH+'x'+HEIGHT,
    '-framerate',String(FPS),'-i',raw.framesFile,
    '-i',soundFile,
    '-filter_complex','[1:a]highpass=f=28,lowpass=f=15000,acompressor=threshold=0.22:ratio=1.8:attack=12:release=110,alimiter=limit=0.89:level=false[a]',
    '-map','0:v:0','-map','[a]','-t',String(DURATION),
    '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-movflags','+faststart',video]);
  }
  run('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','rawvideo','-pixel_format','rgba','-video_size',WIDTH+'x'+HEIGHT,
    '-i',path.join(out,'shadow-disabled-first-frame.rgba'),
    '-frames:v','1',path.join(out,'shadow-disabled-first-frame.png')]);
  run('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','rawvideo','-pixel_format','rgba','-video_size',WIDTH+'x'+HEIGHT,
    '-i',raw.framesFile,
    '-frames:v','1',path.join(out,'shadow-enabled-first-frame.png')]);
  run('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','rawvideo','-pixel_format','rgba','-video_size',WIDTH+'x'+HEIGHT,
    '-i',path.join(out,'shadow-hard-first-frame.rgba'),
    '-frames:v','1',path.join(out,'shadow-hard-first-frame.png')]);
  const measure=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,channels,sample_rate:format=duration','-of','json',video]));
  const stream=measure.streams?.find((s:any)=>s.codec_type==='video');
  const audio=measure.streams?.find((s:any)=>s.codec_type==='audio');
  if(!stream||stream.codec_name!=='h264'||stream.width!==WIDTH||stream.height!==HEIGHT||
    Number(stream.nb_frames)!==DURATION*FPS||
    (isBattleship?Boolean(audio):(!audio||audio.codec_name!=='aac'||audio.channels!==2||audio.sample_rate!=='48000'))){
    throw new Error('cinematic_master_contract_invalid');
  }
  const stills=[];
  for(const [label,time] of [['opening',.22],['middle',2.06],['closing',3.74]] as const){
    const filename=path.join(out,label+'.png');
    run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(time),'-i',video,'-frames:v','1',filename]);
    stills.push({label,path:filename,sha256:sha(fs.readFileSync(filename))});
  }
  const receipt={
    schema:'evercraft.world-engine.cinematic-pixel-proof.v1',kind:'synthetic_internal_canary',
    worldDigest:sequence.worldDefinitionDigest,shaderSha256:shader.sha256,
    shadowShaderSha256:sha(shadowSource[1]),shadowState:'depth_occlusion_real_gpu',
    ...(useSky?{proceduralSky:{source:'original_camera_ray_webgpu_fullscreen_pass',
      shaderSha256:skyShaderSha256(),worldSpaceCameraRay:true,
      actualGpuPixelCounterfactualChangedPixels:raw.skyCounterfactualChangedPixels,
      legacySceneOptInOnly:true,historicalWeatherAuthenticated:false,
      physicallyScatteredAtmosphere:false,publicationAuthority:false}}:{}),
    textureAssetDigests:textures.map(asset=>({id:asset.id,digest:textureAssetDigest(asset)})),
    ...(sequence.actorRigProof?{actorMotion:{...sequence.actorRigProof,
      firstAnimatedFrameDigest:sequence.frames[0].actorMotionDigest,
      lastAnimatedFrameDigest:sequence.frames[sequence.frames.length-2].actorMotionDigest,
      actualVerifiedGpuPlanSamples:[sequence.frames[0].renderPlan.digest,
        sequence.frames[Math.floor(sequence.frames.length/2)].renderPlan.digest,
        sequence.frames[sequence.frames.length-2].renderPlan.digest],
      historicalTrajectoriesAuthenticated:false,
      rigidBodyPhysicsExecuted:false,
      humanCreativeReviewRequired:true}}:{}),
    ...(sequence.fxRigProof?{environmentalFx:{...sequence.fxRigProof,
      firstFrameDigest:sequence.frames[0].environmentalFxDigest,
      lastFrameDigest:sequence.frames[sequence.frames.length-2].environmentalFxDigest,
      activeParticleSamples:[sequence.frames[0].activeFxParticles,
        sequence.frames[Math.floor(sequence.frames.length/2)].activeFxParticles,
        sequence.frames[sequence.frames.length-2].activeFxParticles],
      realGpuParticleDrawsAtMiddle:sequence.frames[Math.floor(sequence.frames.length/2)].renderPlan.draws.filter(d=>d.entityId.startsWith('vfx-')).length,
      realGpuTransparentParticlesAtMiddle:sequence.frames[Math.floor(sequence.frames.length/2)].renderPlan.draws.filter(d=>d.entityId.startsWith('vfx-')&&d.alphaMode==='blend').length,
      separateDepthTestedAlphaBlendPipeline:true,
      originalWebGpuMeshes:true,fluidDynamicsVerified:false,
      photorealisticSmokeVerified:false,historicallyVerifiedWeather:false,
      publicationAuthority:false}}:{}),
    ...(organicWake?{organicWake:{
      source:'original_non_chevron_3d_curved_alpha_foam_patches',
      sourceGeometryPrefix:ORGANIC_FOAM_PREFIX,
      originalGeometryVariants:organicFoamGeometry().length,
      nativeWgslFeatheredAlphaAndNoise:true,
      centeredOnNativeWaveSurface:useAnimatedOcean,
      movingActorWakeSources:sequence.actorRigProof?.actorCount??0,
      realGpuFoamDrawsAtMiddle:sequence.frames[Math.floor(sequence.frames.length/2)].renderPlan.draws.filter(
        d=>d.geometryId.startsWith(ORGANIC_FOAM_PREFIX)).length,
      hasOldChevronDraws:sequence.frames[Math.floor(sequence.frames.length/2)].renderPlan.draws.some(
        d=>d.geometryId==='owned:fx-cinematic-wake-crest'),
      fluidDynamicsOrHistoricalWeatherVerified:false,publicationAuthority:false
    }}:{}),
    ...(useAnimatedOcean?{animatedOcean:{
      geometryRef:OCEAN_WAVE_GEOMETRY_ID,
      originalNativeWgslVertexDeformation:true,
      analyticalTimeDependentNormal:true,
      amplitude:OCEAN_WAVE_AMPLITUDE,
      vertexCount:makeAnimatedOceanGrid().positions.length/3,
      firstPhaseSec:sequence.frames[0].timeSec,
      lastRenderedPhaseSec:sequence.frames[sequence.frames.length-2].timeSec,
      physicsOrCFDVerified:false,
      historicalWeatherVerified:false,
      publicationAuthority:false
    }}:{}),
    firstFramePlanDigest:sequence.frames[0].renderPlan.digest,
    lastFramePlanDigest:sequence.frames[sequence.frames.length-2].renderPlan.digest,
    renderProfile:raw.profile,softwareAdapterForced:raw.softwareAdapterForced,
    hardwareExecutionClaim:false,
    exactGpuReadbackFrames:raw.frameHashes.length,
    uniqueRawFrameDigests:raw.uniqueFrameHashes,
    shadowCounterfactualChangedPixels:raw.counterfactualChangedPixels,
    shadowFilterChangedPixels:raw.filterChangedPixels,
    output:{path:video,sha256:sha(fs.readFileSync(video)),width:WIDTH,height:HEIGHT,
      durationSec:DURATION,fps:FPS,codec:'h264',audioCodec:isBattleship?null:'aac'},
    stills,sourceState:'synthetic_visualization',
    sceneType:isSilhouette?'procedural_four_distinct_ship_classes_not_full_reconstruction':isFormation?'procedural_four_vessel_illustrative_not_historical_tracks':isBattleship?'procedural_battleship':'procedural_industrial_rotor',
    ...(native?{nativeFormat:{
      format:native.spec.format,
      viewport:native.spec.viewport,
      cameraSource:native.spec.cameraSource,
      original3dFrames:true,
      cropApplied:false,
      sceneWorldDigest:sequence.worldDefinitionDigest,
      landmarkAudits:director?[]:native.review,
      actualGeometryFraming,
      opticalAutoFit:director?.receipt.fullHeroAutoFit??native.autoFit,
      ...(director?{shotDirector:director.receipt}:{}),
      humanCreativeReviewRequired:true,
      publicationAuthority:false
    }}:{}),
    soundState:isBattleship?'silent_at_founder_direction_no_sound_invented':'original_multilayer_synthetic_soundscape_not_recorded_foley_or_commercial_score',
    soundReceipt,
    visualReviewState:'unreviewed',publicationAuthority:false,paidProductionReady:false,
    claims:['Real owned-WGSL shader pixels rendered from canonical World Engine moving 3D camera frame plans',
      ...(isFormation?['Four distinct staged naval actors are genuine GPU-mesh entities but their geometry, courses and distance are artistic placeholders']:[]),
      ...(isSilhouette?['Four separately authored original silhouette assemblies use researched turret counts; no photogrammetry, verified scale, 1941 positioning or battle simulation']:[]),
      ...(useFx?['Procedural 3D moving wake, spray and exhaust actors in true GPU scene; particles are stylized illustration, not fluid or volumetric simulation']:[]),
      ...(useAnimatedOcean?['Native WebGPU vertex shader deforming actual water mesh with time-varying waves and computed normals; no physical weather/CFD claim']:[]),
      ...(useSky?['Original native GPU sky fragment shader reconstructs real world camera rays; no sky image, HDRI, authentic historical weather or atmospheric physics']:[]),
      ...(organicWake?['Original deterministic non-chevron curved 3D foam geometry, following actual prior keyframe paths at source time-varying ocean height, not fluid simulation']:[]),
      'Not cinematic-photoreal-quality, not an authentic physical event, not a public marketing asset']
  };
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:'rendered_gpu_master',receipt:receipt.output,frames:receipt.exactGpuReadbackFrames,
    uniqueFrames:receipt.uniqueRawFrameDigests,soundSha256:soundReceipt?.sha256??null,
    shadowChangedPixels:receipt.shadowCounterfactualChangedPixels,
    pcfChangedPixels:receipt.shadowFilterChangedPixels,
    profile:raw.profile,hardwareExecutionClaim:false}));
}
main().catch(e=>{console.error('CINEMATIC_PIXEL_PROOF_FAILED '+String(e?.stack||e));process.exitCode=1});
