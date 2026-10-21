/**
 * Owned World Engine cinematic pixel canary.
 * Actual WGSL GPU frames -> raw RGBA -> FFmpeg H.264/AAC master.
 * Deliberately SYNTHETIC industrial geometry and original lab-tone audio.
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
import {generateDeterministicTangents} from './fallen-geometry.js';
import type {TextureAsset} from './texture.js';
import {textureAssetDigest} from './texture.js';
import {extractOwnedShader} from '../evercraft-web/browser-worker/webgpu-reference-frame.mjs';
import {prepareNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const worker=path.join(root,'systemia/evercraft-web/browser-worker');
const sha=(value:Buffer|string)=>crypto.createHash('sha256').update(value).digest('hex');
const WIDTH=640, HEIGHT=360, FPS=24, DURATION=2;
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
    renderable:{geometryRef:'owned:cube',materialId:mat}
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
      {id:'sun',transform:{position:{x:-8,y:12,z:1},rotationDeg:{x:32,y:-25,z:0}},
        light:{type:'directional',color:{r:.65,g:.78,b:1},intensity:4.2}},
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
  shader:string,out:string){
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
        const init=await page.evaluate(async({shader,geometries,textures,width,height}:{shader:string;geometries:GeometryAsset[];textures:TextureAsset[];width:number;height:number})=>{
          const adapter=await (navigator as any).gpu?.requestAdapter();
          if(!adapter)return {ok:false,reason:'no_adapter'};
          const device=await adapter.requestDevice();
          const module=device.createShaderModule({code:shader});
          const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error').map(m=>m.message);
          if(errors.length)return {ok:false,reason:errors.join('|')};
          const frameLayout=device.createBindGroupLayout({entries:[
            {binding:0,visibility:3,buffer:{type:'uniform'}},{binding:1,visibility:2,buffer:{type:'read-only-storage'}}]});
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
          // Dedicated synthetic lab runtime; all values come from canonically verified WebGPU plans.
          (window as any).__evercraftCinematic={device,frameLayout,objectLayout,pipeline,buffers,
            fallback,sampler,textureMap,target,depth,width,height};
          return {ok:true};
        },{shader,geometries,textures,width:WIDTH,height:HEIGHT});
        if(init.ok){selected=profile;break;}
        errors.push(profile.name+':'+init.reason);
        await browser.close();browser=null;page=null;
      }catch(error){errors.push(profile.name+':'+String(error));if(browser)await browser.close();browser=null;page=null;}
    }
    if(!page||!selected)throw new Error('gpu_profile_unavailable:'+errors.join(';'));
    const framesFile=path.join(out,'frames.rgba');
    const handle=fs.openSync(framesFile,'wx',0o600);
    const hashes:string[]=[];
    try{
      for(const frame of plans.slice(0,-1)){
        const packet=frame.renderPlan;
        if(!packet?.digest||!packet.draws?.length)throw new Error('empty_gpu_plan');
        const base64=await page.evaluate(async(plan:any)=>{
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
            plan.cinematicLighting?.localLightFalloff==='inverse_square'?1:0,0,0
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
            {binding:0,resource:{buffer:frameBuffer}},{binding:1,resource:{buffer:lightBuffer}}]});
          const encoder=device.createCommandEncoder();
          const pass=encoder.beginRenderPass({
            colorAttachments:[{view:r.target.createView(),clearValue:{...plan.clearColor,a:1},loadOp:'clear',storeOp:'store'}],
            depthStencilAttachment:{view:r.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}
          });
          pass.setPipeline(r.pipeline);pass.setBindGroup(0,frameGroup);
          const objects:any[]=[];
          for(const draw of plan.draws){
            const obj=new Float32Array([
              ...draw.modelMatrix,...draw.normalMatrix,
              ...draw.baseColor,draw.materialModel,draw.metallic,draw.roughness,draw.alphaCutoff,
              ...draw.emissive,draw.emissiveIntensity,...draw.textureFlags
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
          readback.unmap();readback.destroy();frameBuffer.destroy();lightBuffer.destroy();objects.forEach(z=>z.destroy());
          // Browser bytes converted to base64 for an exact raw-video handoff.
          let binary='';
          for(let offset=0;offset<raw.length;offset+=8192){
            binary+=String.fromCharCode(...raw.subarray(offset,offset+8192));
          }
          return btoa(binary);
        },packet);
        const pixels=Buffer.from(base64,'base64');
        if(pixels.length!==WIDTH*HEIGHT*4)throw new Error('unexpected_render_bytes');
        fs.writeSync(handle,pixels);hashes.push(sha(pixels));
      }
    }finally{fs.closeSync(handle)}
    if(new Set(hashes).size<3)throw new Error('rendered_frames_have_no_visible_motion');
    return {framesFile,profile:selected.name,softwareAdapterForced:selected.forcedSoftware,
      frameHashes:hashes,uniqueFrameHashes:new Set(hashes).size};
  }finally{
    if(browser)await browser.close().catch(()=>{});
    await new Promise<void>(resolve=>server.server.close(()=>resolve()));
  }
}
async function main(){
  const out=path.resolve(process.env.CINEMATIC_PROOF_OUTPUT||path.join(os.tmpdir(),'evercraft-cinematic-pixel-proof-'+process.pid));
  if(fs.existsSync(out))throw new Error('output_already_exists');
  fs.mkdirSync(out,{recursive:true,mode:0o700});
  const geometries=industrialGeometry(),textures=industrialTextures(),world=industrialWorld();
  const take:CinematicCameraTake={
    schema:'evercraft.world-engine.cinematic-camera-take.v1',
    id:'orbital-foundry-take-one',cameraEntityId:'cinema-camera',targetEntityId:'reactor',
    durationSec:DURATION,fps:FPS,move:'orbit',ease:'smootherstep',
    orbit:{radius:11,startAngleDeg:-38,endAngleDeg:38,startHeight:3.2,endHeight:4.5},
    startFovYDeg:53,endFovYDeg:43
  };
  const sequence=buildCinematicCameraSequence({
    world,take,geometries,viewport:{width:WIDTH,height:HEIGHT},textures
  });
  const shader=extractOwnedShader(root);
  const raw=await renderGpuFrames(sequence.frames,geometries,textures,shader.source,out);
  const video=path.join(out,'orbital-foundry-synthetic-canary.mp4');
  // The music bed is a synthetic lab signal, not licensed commercial music.
  run('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','rawvideo','-pixel_format','rgba','-video_size',WIDTH+'x'+HEIGHT,
    '-framerate',String(FPS),'-i',raw.framesFile,
    '-f','lavfi','-i','sine=frequency=72:sample_rate=48000:duration='+DURATION,
    '-filter_complex','[1:a]volume=0.075,afade=t=in:st=0:d=0.25,afade=t=out:st=1.5:d=0.5[a]',
    '-map','0:v:0','-map','[a]','-t',String(DURATION),
    '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-movflags','+faststart',video]);
  const measure=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames:format=duration','-of','json',video]));
  const stream=measure.streams?.find((s:any)=>s.codec_type==='video');
  const audio=measure.streams?.find((s:any)=>s.codec_type==='audio');
  if(!stream||stream.codec_name!=='h264'||stream.width!==WIDTH||stream.height!==HEIGHT||
    !audio||audio.codec_name!=='aac'||Number(stream.nb_frames)!==DURATION*FPS){
    throw new Error('cinematic_master_contract_invalid');
  }
  const stills=[];
  for(const [label,time] of [['opening',.12],['middle',.98],['closing',1.85]] as const){
    const filename=path.join(out,label+'.png');
    run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(time),'-i',video,'-frames:v','1',filename]);
    stills.push({label,path:filename,sha256:sha(fs.readFileSync(filename))});
  }
  const receipt={
    schema:'evercraft.world-engine.cinematic-pixel-proof.v1',kind:'synthetic_internal_canary',
    worldDigest:sequence.worldDefinitionDigest,shaderSha256:shader.sha256,
    textureAssetDigests:textures.map(asset=>({id:asset.id,digest:textureAssetDigest(asset)})),
    firstFramePlanDigest:sequence.frames[0].renderPlan.digest,
    lastFramePlanDigest:sequence.frames[sequence.frames.length-2].renderPlan.digest,
    renderProfile:raw.profile,softwareAdapterForced:raw.softwareAdapterForced,
    hardwareExecutionClaim:false,
    exactGpuReadbackFrames:raw.frameHashes.length,
    uniqueRawFrameDigests:raw.uniqueFrameHashes,
    output:{path:video,sha256:sha(fs.readFileSync(video)),width:WIDTH,height:HEIGHT,
      durationSec:DURATION,fps:FPS,codec:'h264',audioCodec:'aac'},
    stills,sourceState:'synthetic_visualization',soundState:'synthetic_test_signal_not_commercial_music',
    visualReviewState:'unreviewed',publicationAuthority:false,paidProductionReady:false,
    claims:['Real owned-WGSL shader pixels rendered from canonical World Engine moving 3D camera frame plans',
      'Not cinematic-photoreal-quality, not an authentic physical event, not a public marketing asset']
  };
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:'rendered_gpu_master',receipt:receipt.output,frames:receipt.exactGpuReadbackFrames,
    uniqueFrames:receipt.uniqueRawFrameDigests,profile:raw.profile,hardwareExecutionClaim:false}));
}
main().catch(e=>{console.error('CINEMATIC_PIXEL_PROOF_FAILED '+String(e?.stack||e));process.exitCode=1});
