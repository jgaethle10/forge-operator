import crypto from 'node:crypto';
import { EVERCRAFT_WEBGPU_WGSL } from './webgpu-shader.js';
export { EVERCRAFT_WEBGPU_WGSL } from './webgpu-shader.js';
import type {
  CameraProjection,
  ColorRGB,
  LightComponent,
  MaterialDefinition,
  VisualFrameContract
} from './visual.js';
import { verifyVisualFrameContract } from './visual.js';
import type { TransformComponent, Vec3 } from './engine.js';

export interface GeometryAsset {
  schema:'evercraft.world-engine.geometry.v1';
  id:string;
  primitive:'triangles';
  positions:number[];
  normals:number[];
  indices?:number[];
}

export interface WebGpuLightPacket {
  entityId:string;
  kind:0|1|2|3;
  color:[number,number,number];
  intensity:number;
  range:number;
  innerCos:number;
  outerCos:number;
  position:[number,number,number];
  direction:[number,number,number];
}

export interface WebGpuDrawCommand {
  entityId:string;
  geometryId:string;
  materialId:string;
  vertexCount:number;
  indexCount:number;
  modelMatrix:number[];
  normalMatrix:number[];
  baseColor:[number,number,number,number];
  metallic:number;
  roughness:number;
  emissive:[number,number,number];
  emissiveIntensity:number;
  materialModel:0|1;
  alphaMode:'opaque'|'mask'|'blend';
  alphaCutoff:number;
  doubleSided:boolean;
  pipelineKey:string;
}

export interface GeometryHotReloadReceipt {
  schema:'evercraft.world-engine.geometry-hot-reload.v1';
  geometryId:string;
  previousDigest:string|null;
  nextDigest:string;
  replaced:boolean;
  digest:string;
}

export interface GeometryHotReloadResult {
  geometries:GeometryAsset[];
  receipt:GeometryHotReloadReceipt;
}

export interface WebGpuRenderPlan {
  schema:'evercraft.world-engine.webgpu-plan.v1';
  worldId:string;
  tick:number;
  timeSec:number;
  sourceVisualFrameDigest:string;
  width:number;
  height:number;
  clearColor:ColorRGB;
  viewMatrix:number[];
  projectionMatrix:number[];
  viewProjectionMatrix:number[];
  cameraPosition:[number,number,number];
  exposure:number;
  lights:WebGpuLightPacket[];
  draws:WebGpuDrawCommand[];
  shadingModel:'evercraft-pbr-lite-v1';
  digest:string;
}

const DEG=Math.PI/180;
const EPS=1e-12;
const MAX_LIGHTS=8;

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function finite(value:number,label:string){
  if(!Number.isFinite(value)) throw new Error(`webgpu_invalid_${label}`);
}

function identity4(){
  return [
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1
  ];
}

function multiply4(a:number[],b:number[]){
  const out=new Array(16).fill(0);
  for(let col=0;col<4;col++){
    for(let row=0;row<4;row++){
      let sum=0;
      for(let k=0;k<4;k++) sum+=a[k*4+row]*b[col*4+k];
      out[col*4+row]=sum;
    }
  }
  return out;
}

function translation4(v:Vec3){
  const out=identity4();
  out[12]=v.x;out[13]=v.y;out[14]=v.z;
  return out;
}

function scale4(v:Vec3){
  return [
    v.x,0,0,0,
    0,v.y,0,0,
    0,0,v.z,0,
    0,0,0,1
  ];
}

function rotationX4(rad:number){
  const c=Math.cos(rad),s=Math.sin(rad);
  return [
    1,0,0,0,
    0,c,s,0,
    0,-s,c,0,
    0,0,0,1
  ];
}

function rotationY4(rad:number){
  const c=Math.cos(rad),s=Math.sin(rad);
  return [
    c,0,-s,0,
    0,1,0,0,
    s,0,c,0,
    0,0,0,1
  ];
}

function rotationZ4(rad:number){
  const c=Math.cos(rad),s=Math.sin(rad);
  return [
    c,s,0,0,
    -s,c,0,0,
    0,0,1,0,
    0,0,0,1
  ];
}

function completeTransform(transform:TransformComponent){
  return {
    position:clone(transform.position),
    rotationDeg:clone(transform.rotationDeg || {x:0,y:0,z:0}),
    scale:clone(transform.scale || {x:1,y:1,z:1})
  };
}

export function modelMatrixForTransform(transform:TransformComponent){
  const t=completeTransform(transform);
  const rotation=multiply4(
    multiply4(rotationZ4(t.rotationDeg.z*DEG),rotationY4(t.rotationDeg.y*DEG)),
    rotationX4(t.rotationDeg.x*DEG)
  );
  return multiply4(multiply4(translation4(t.position),rotation),scale4(t.scale));
}

function inverse4(m:number[]){
  const out=new Array(16);
  const a00=m[0],a01=m[1],a02=m[2],a03=m[3];
  const a10=m[4],a11=m[5],a12=m[6],a13=m[7];
  const a20=m[8],a21=m[9],a22=m[10],a23=m[11];
  const a30=m[12],a31=m[13],a32=m[14],a33=m[15];

  const b00=a00*a11-a01*a10;
  const b01=a00*a12-a02*a10;
  const b02=a00*a13-a03*a10;
  const b03=a01*a12-a02*a11;
  const b04=a01*a13-a03*a11;
  const b05=a02*a13-a03*a12;
  const b06=a20*a31-a21*a30;
  const b07=a20*a32-a22*a30;
  const b08=a20*a33-a23*a30;
  const b09=a21*a32-a22*a31;
  const b10=a21*a33-a23*a31;
  const b11=a22*a33-a23*a32;

  let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(Math.abs(det)<=EPS) throw new Error('webgpu_matrix_not_invertible');
  det=1/det;

  out[0]=(a11*b11-a12*b10+a13*b09)*det;
  out[1]=(a02*b10-a01*b11-a03*b09)*det;
  out[2]=(a31*b05-a32*b04+a33*b03)*det;
  out[3]=(a22*b04-a21*b05-a23*b03)*det;
  out[4]=(a12*b08-a10*b11-a13*b07)*det;
  out[5]=(a00*b11-a02*b08+a03*b07)*det;
  out[6]=(a32*b02-a30*b05-a33*b01)*det;
  out[7]=(a20*b05-a22*b02+a23*b01)*det;
  out[8]=(a10*b10-a11*b08+a13*b06)*det;
  out[9]=(a01*b08-a00*b10-a03*b06)*det;
  out[10]=(a30*b04-a31*b02+a33*b00)*det;
  out[11]=(a21*b02-a20*b04-a23*b00)*det;
  out[12]=(a11*b07-a10*b09-a12*b06)*det;
  out[13]=(a00*b09-a01*b07+a02*b06)*det;
  out[14]=(a31*b01-a30*b03-a32*b00)*det;
  out[15]=(a20*b03-a21*b01+a22*b00)*det;
  return out;
}

function transpose4(m:number[]){
  return [
    m[0],m[4],m[8],m[12],
    m[1],m[5],m[9],m[13],
    m[2],m[6],m[10],m[14],
    m[3],m[7],m[11],m[15]
  ];
}

function normalize(v:Vec3):Vec3{
  const length=Math.sqrt(v.x*v.x+v.y*v.y+v.z*v.z);
  if(length<=EPS) return {x:0,y:0,z:-1};
  return {x:v.x/length,y:v.y/length,z:v.z/length};
}

function transformDirection(matrix:number[],v:Vec3){
  return normalize({
    x:matrix[0]*v.x+matrix[4]*v.y+matrix[8]*v.z,
    y:matrix[1]*v.x+matrix[5]*v.y+matrix[9]*v.z,
    z:matrix[2]*v.x+matrix[6]*v.y+matrix[10]*v.z
  });
}

function perspective(projection:Extract<CameraProjection,{type:'perspective'}>,aspect:number,near:number,far:number){
  const f=1/Math.tan(projection.fovYDeg*DEG/2);
  const nf=1/(near-far);
  return [
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,far*nf,-1,
    0,0,near*far*nf,0
  ];
}

function orthographic(projection:Extract<CameraProjection,{type:'orthographic'}>,aspect:number,near:number,far:number){
  const top=projection.orthoHeight/2;
  const bottom=-top;
  const right=top*aspect;
  const left=-right;
  const lr=1/(right-left);
  const bt=1/(top-bottom);
  const nf=1/(near-far);
  return [
    2*lr,0,0,0,
    0,2*bt,0,0,
    0,0,nf,0,
    -(right+left)*lr,-(top+bottom)*bt,near*nf,1
  ];
}

export function geometryAssetDigest(geometry:GeometryAsset){
  validateGeometryAsset(geometry);
  return digest(geometry);
}

export function applyGeometryHotReload(
  current:GeometryAsset[],
  next:GeometryAsset
):GeometryHotReloadResult{
  validateGeometryAsset(next);
  const seen=new Set<string>();
  for(const geometry of current){
    validateGeometryAsset(geometry);
    if(seen.has(geometry.id)) throw new Error(`webgpu_geometry_duplicate:${geometry.id}`);
    seen.add(geometry.id);
  }

  const previous=current.find(geometry=>geometry.id===next.id) || null;
  const previousDigest=previous?geometryAssetDigest(previous):null;
  const nextDigest=geometryAssetDigest(next);
  const geometries=[
    ...current.filter(geometry=>geometry.id!==next.id).map(clone),
    clone(next)
  ].sort((a,b)=>a.id.localeCompare(b.id));

  const core={
    schema:'evercraft.world-engine.geometry-hot-reload.v1' as const,
    geometryId:next.id,
    previousDigest,
    nextDigest,
    replaced:Boolean(previous)
  };
  return {
    geometries,
    receipt:{...core,digest:digest(core)}
  };
}

export function validateGeometryAsset(geometry:GeometryAsset){
  if(geometry?.schema!=='evercraft.world-engine.geometry.v1') throw new Error('webgpu_geometry_schema_invalid');
  if(!geometry.id) throw new Error('webgpu_geometry_id_missing');
  if(geometry.primitive!=='triangles') throw new Error(`webgpu_geometry_primitive_unsupported:${geometry.id}`);
  if(!Array.isArray(geometry.positions) || geometry.positions.length<9 || geometry.positions.length%3!==0){
    throw new Error(`webgpu_geometry_positions_invalid:${geometry.id}`);
  }
  if(!Array.isArray(geometry.normals) || geometry.normals.length!==geometry.positions.length){
    throw new Error(`webgpu_geometry_normals_invalid:${geometry.id}`);
  }
  for(const value of [...geometry.positions,...geometry.normals]) finite(value,`geometry_${geometry.id}_value`);
  if(geometry.indices){
    if(geometry.indices.length<3 || geometry.indices.length%3!==0){
      throw new Error(`webgpu_geometry_indices_invalid:${geometry.id}`);
    }
    const vertices=geometry.positions.length/3;
    for(const index of geometry.indices){
      if(!Number.isInteger(index) || index<0 || index>=vertices){
        throw new Error(`webgpu_geometry_index_invalid:${geometry.id}`);
      }
    }
  }else if((geometry.positions.length/3)%3!==0){
    throw new Error(`webgpu_geometry_triangle_vertices_invalid:${geometry.id}`);
  }
  return true;
}

function materialPacket(material:MaterialDefinition){
  if(material.textureRefs && Object.values(material.textureRefs).some(Boolean)){
    throw new Error(`webgpu_textures_not_yet_supported:${material.id}`);
  }
  return {
    baseColor:[
      material.baseColor.r,
      material.baseColor.g,
      material.baseColor.b,
      material.baseColor.a
    ] as [number,number,number,number],
    metallic:material.model==='pbr'?(material.metallic ?? 0):0,
    roughness:material.model==='pbr'?(material.roughness ?? 1):1,
    emissive:[
      material.emissive?.r ?? 0,
      material.emissive?.g ?? 0,
      material.emissive?.b ?? 0
    ] as [number,number,number],
    emissiveIntensity:material.emissiveIntensity ?? 0,
    materialModel:(material.model==='unlit'?1:0) as 0|1,
    alphaMode:material.alphaMode || 'opaque',
    alphaCutoff:material.alphaMode==='mask'?(material.alphaCutoff ?? .5):-1,
    doubleSided:material.doubleSided===true
  };
}

function lightKind(light:LightComponent):0|1|2|3{
  if(light.type==='ambient') return 0;
  if(light.type==='directional') return 1;
  if(light.type==='point') return 2;
  return 3;
}

function lightPacket(row:VisualFrameContract['lights'][number]):WebGpuLightPacket{
  const light=row.component;
  const matrix=modelMatrixForTransform(row.transform);
  const direction=transformDirection(matrix,{x:0,y:0,z:-1});
  return {
    entityId:row.entityId,
    kind:lightKind(light),
    color:[light.color.r,light.color.g,light.color.b],
    intensity:light.intensity,
    range:light.type==='point'||light.type==='spot'?light.range:0,
    innerCos:light.type==='spot'?Math.cos(light.innerConeDeg*DEG):1,
    outerCos:light.type==='spot'?Math.cos(light.outerConeDeg*DEG):1,
    position:[
      row.transform.position.x,
      row.transform.position.y,
      row.transform.position.z
    ],
    direction:[direction.x,direction.y,direction.z]
  };
}

export function compileWebGpuRenderPlan(
  frame:VisualFrameContract,
  geometries:GeometryAsset[],
  viewport:{width:number;height:number}
):WebGpuRenderPlan{
  if(frame?.schema!=='evercraft.world-engine.visual-frame.v1') throw new Error('webgpu_visual_frame_schema_invalid');
  if(!verifyVisualFrameContract(frame)) throw new Error('webgpu_visual_frame_digest_invalid');
  if(!Number.isInteger(viewport.width)||viewport.width<1||!Number.isInteger(viewport.height)||viewport.height<1){
    throw new Error('webgpu_viewport_invalid');
  }
  if(frame.lights.length>MAX_LIGHTS) throw new Error(`webgpu_light_limit_exceeded:${frame.lights.length}`);

  const geometryMap=new Map<string,GeometryAsset>();
  for(const geometry of geometries){
    validateGeometryAsset(geometry);
    if(geometryMap.has(geometry.id)) throw new Error(`webgpu_geometry_duplicate:${geometry.id}`);
    geometryMap.set(geometry.id,clone(geometry));
  }

  const materialMap=new Map(frame.materials.map(material=>[material.id,material]));
  const cameraWorld=modelMatrixForTransform(frame.camera.transform);
  const viewMatrix=inverse4(cameraWorld);
  const aspect=viewport.width/viewport.height;
  const projectionMatrix=frame.camera.projection.type==='perspective'
    ? perspective(frame.camera.projection,aspect,frame.camera.near,frame.camera.far)
    : orthographic(frame.camera.projection,aspect,frame.camera.near,frame.camera.far);
  const viewProjectionMatrix=multiply4(projectionMatrix,viewMatrix);

  const draws=[...frame.renderables]
    .sort((a,b)=>a.entityId.localeCompare(b.entityId))
    .map(row=>{
      const geometry=geometryMap.get(row.component.geometryRef);
      if(!geometry) throw new Error(`webgpu_geometry_missing:${row.component.geometryRef}`);
      const material=materialMap.get(row.component.materialId);
      if(!material) throw new Error(`webgpu_material_missing:${row.component.materialId}`);
      const model=modelMatrixForTransform(row.transform);
      const normal=transpose4(inverse4(model));
      const packet=materialPacket(material);
      return {
        entityId:row.entityId,
        geometryId:geometry.id,
        materialId:material.id,
        vertexCount:geometry.positions.length/3,
        indexCount:geometry.indices?.length || 0,
        modelMatrix:model,
        normalMatrix:normal,
        ...packet,
        pipelineKey:[
          packet.materialModel,
          packet.alphaMode,
          packet.doubleSided?'double':'back'
        ].join(':')
      };
    });

  const core={
    schema:'evercraft.world-engine.webgpu-plan.v1' as const,
    worldId:frame.worldId,
    tick:frame.tick,
    timeSec:frame.timeSec,
    sourceVisualFrameDigest:frame.digest,
    width:viewport.width,
    height:viewport.height,
    clearColor:clone(frame.clearColor),
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix,
    cameraPosition:[
      frame.camera.transform.position.x,
      frame.camera.transform.position.y,
      frame.camera.transform.position.z
    ] as [number,number,number],
    exposure:frame.camera.exposure,
    lights:[...frame.lights].sort((a,b)=>a.entityId.localeCompare(b.entityId)).map(lightPacket),
    draws,
    shadingModel:'evercraft-pbr-lite-v1' as const
  };
  return {...core,digest:digest(core)};
}

function floats(values:number[]){
  return new Float32Array(values);
}

function packGeometry(geometry:GeometryAsset){
  const vertices=geometry.positions.length/3;
  const data=new Float32Array(vertices*6);
  for(let i=0;i<vertices;i++){
    data[i*6]=geometry.positions[i*3];
    data[i*6+1]=geometry.positions[i*3+1];
    data[i*6+2]=geometry.positions[i*3+2];
    data[i*6+3]=geometry.normals[i*3];
    data[i*6+4]=geometry.normals[i*3+1];
    data[i*6+5]=geometry.normals[i*3+2];
  }
  return data;
}

function lightStorageData(lights:WebGpuLightPacket[]){
  const values:number[]=[];
  for(const light of lights){
    values.push(light.kind,light.intensity,light.range,light.innerCos);
    values.push(light.color[0],light.color[1],light.color[2],light.outerCos);
    values.push(light.position[0],light.position[1],light.position[2],0);
    values.push(light.direction[0],light.direction[1],light.direction[2],0);
  }
  if(!values.length) values.push(0,0,0,0);
  return floats(values);
}

function objectUniformData(draw:WebGpuDrawCommand){
  return floats([
    ...draw.modelMatrix,
    ...draw.normalMatrix,
    ...draw.baseColor,
    draw.materialModel,draw.metallic,draw.roughness,draw.alphaCutoff,
    draw.emissive[0],draw.emissive[1],draw.emissive[2],draw.emissiveIntensity
  ]);
}

function frameUniformData(plan:WebGpuRenderPlan){
  return floats([
    ...plan.viewProjectionMatrix,
    plan.cameraPosition[0],plan.cameraPosition[1],plan.cameraPosition[2],plan.exposure,
    plan.lights.length,0,0,0
  ]);
}



interface CachedGeometry {
  vertexBuffer:any;
  indexBuffer:any|null;
  vertexCount:number;
  indexCount:number;
}

export class EvercraftWebGpuRenderer {
  private geometryCache=new Map<string,CachedGeometry>();
  private pipelineCache=new Map<string,any>();
  private objectUniforms=new Map<string,any>();
  private frameBuffer:any|null=null;
  private lightBuffer:any|null=null;
  private frameBindGroup:any|null=null;
  private frameBufferSize=0;
  private lightBufferSize=0;
  private depthTexture:any|null=null;
  private depthWidth=0;
  private depthHeight=0;
  private shaderModule:any;
  private frameLayout:any;
  private objectLayout:any;
  private pipelineLayout:any;

  private constructor(
    private readonly canvas:HTMLCanvasElement,
    private readonly device:any,
    private readonly context:any,
    private readonly format:string,
    private readonly geometries:Map<string,GeometryAsset>
  ){
    this.shaderModule=device.createShaderModule({
      label:'Evercraft World Engine v9 WGSL',
      code:EVERCRAFT_WEBGPU_WGSL
    });
    this.frameLayout=device.createBindGroupLayout({
      entries:[
        {binding:0,visibility:3,buffer:{type:'uniform'}},
        {binding:1,visibility:2,buffer:{type:'read-only-storage'}}
      ]
    });
    this.objectLayout=device.createBindGroupLayout({
      entries:[{binding:0,visibility:3,buffer:{type:'uniform'}}]
    });
    this.pipelineLayout=device.createPipelineLayout({
      bindGroupLayouts:[this.frameLayout,this.objectLayout]
    });
  }

  static async create(canvas:HTMLCanvasElement,geometries:GeometryAsset[]){
    const nav=(globalThis as any).navigator;
    if(!nav?.gpu) throw new Error('webgpu_unavailable');
    const adapter=await nav.gpu.requestAdapter();
    if(!adapter) throw new Error('webgpu_adapter_unavailable');
    const device=await adapter.requestDevice();
    const context=canvas.getContext('webgpu') as any;
    if(!context) throw new Error('webgpu_canvas_context_unavailable');
    const format=nav.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'premultiplied'});

    const map=new Map<string,GeometryAsset>();
    for(const geometry of geometries){
      validateGeometryAsset(geometry);
      if(map.has(geometry.id)) throw new Error(`webgpu_geometry_duplicate:${geometry.id}`);
      map.set(geometry.id,clone(geometry));
    }
    return new EvercraftWebGpuRenderer(canvas,device,context,format,map);
  }

  private ensureDepth(width:number,height:number){
    if(this.depthTexture && this.depthWidth===width && this.depthHeight===height) return;
    this.depthTexture?.destroy?.();
    const usage=(globalThis as any).GPUTextureUsage;
    this.depthTexture=this.device.createTexture({
      size:[width,height,1],
      format:'depth24plus',
      usage:usage.RENDER_ATTACHMENT
    });
    this.depthWidth=width;
    this.depthHeight=height;
  }

  private ensureGeometry(id:string){
    const existing=this.geometryCache.get(id);
    if(existing) return existing;
    const geometry=this.geometries.get(id);
    if(!geometry) throw new Error(`webgpu_geometry_missing:${id}`);
    const usage=(globalThis as any).GPUBufferUsage;
    const vertexData=packGeometry(geometry);
    const vertexBuffer=this.device.createBuffer({
      size:Math.max(4,vertexData.byteLength),
      usage:usage.VERTEX|usage.COPY_DST
    });
    this.device.queue.writeBuffer(vertexBuffer,0,vertexData);

    let indexBuffer:any|null=null;
    if(geometry.indices?.length){
      const indices=new Uint32Array(geometry.indices);
      indexBuffer=this.device.createBuffer({
        size:Math.max(4,indices.byteLength),
        usage:usage.INDEX|usage.COPY_DST
      });
      this.device.queue.writeBuffer(indexBuffer,0,indices);
    }

    const cached={
      vertexBuffer,
      indexBuffer,
      vertexCount:geometry.positions.length/3,
      indexCount:geometry.indices?.length || 0
    };
    this.geometryCache.set(id,cached);
    return cached;
  }

  private ensureBuffer(current:any|null,currentSize:number,required:number,usageFlags:number){
    if(current && currentSize>=required) return {buffer:current,size:currentSize,replaced:false};
    current?.destroy?.();
    const size=Math.max(16,Math.ceil(required/16)*16);
    const buffer=this.device.createBuffer({size,usage:usageFlags});
    return {buffer,size,replaced:true};
  }

  private pipeline(draw:WebGpuDrawCommand){
    const existing=this.pipelineCache.get(draw.pipelineKey);
    if(existing) return existing;
    const blend=draw.alphaMode==='blend'
      ? {
          color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
          alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}
        }
      : undefined;
    const pipeline=this.device.createRenderPipeline({
      layout:this.pipelineLayout,
      vertex:{
        module:this.shaderModule,
        entryPoint:'vs_main',
        buffers:[{
          arrayStride:24,
          attributes:[
            {shaderLocation:0,offset:0,format:'float32x3'},
            {shaderLocation:1,offset:12,format:'float32x3'}
          ]
        }]
      },
      fragment:{
        module:this.shaderModule,
        entryPoint:'fs_main',
        targets:[{format:this.format,blend}]
      },
      primitive:{
        topology:'triangle-list',
        frontFace:'ccw',
        cullMode:draw.doubleSided?'none':'back'
      },
      depthStencil:{
        format:'depth24plus',
        depthWriteEnabled:draw.alphaMode!=='blend',
        depthCompare:'less'
      }
    });
    this.pipelineCache.set(draw.pipelineKey,pipeline);
    return pipeline;
  }

  hotReloadGeometry(geometry:GeometryAsset){
    const current=[...this.geometries.values()].map(clone);
    const result=applyGeometryHotReload(current,geometry);
    this.geometries.clear();
    for(const item of result.geometries) this.geometries.set(item.id,clone(item));

    const cached=this.geometryCache.get(geometry.id);
    if(cached){
      cached.vertexBuffer?.destroy?.();
      cached.indexBuffer?.destroy?.();
      this.geometryCache.delete(geometry.id);
    }
    return clone(result.receipt);
  }

  render(plan:WebGpuRenderPlan){
    if(plan?.schema!=='evercraft.world-engine.webgpu-plan.v1') throw new Error('webgpu_plan_schema_invalid');
    if(plan.width<1||plan.height<1) throw new Error('webgpu_plan_viewport_invalid');
    if(this.canvas.width!==plan.width) this.canvas.width=plan.width;
    if(this.canvas.height!==plan.height) this.canvas.height=plan.height;
    this.ensureDepth(plan.width,plan.height);

    const usage=(globalThis as any).GPUBufferUsage;
    const frameData=frameUniformData(plan);
    const lightData=lightStorageData(plan.lights);

    const frameResult=this.ensureBuffer(
      this.frameBuffer,
      this.frameBufferSize,
      frameData.byteLength,
      usage.UNIFORM|usage.COPY_DST
    );
    this.frameBuffer=frameResult.buffer;
    this.frameBufferSize=frameResult.size;

    const lightResult=this.ensureBuffer(
      this.lightBuffer,
      this.lightBufferSize,
      lightData.byteLength,
      usage.STORAGE|usage.COPY_DST
    );
    this.lightBuffer=lightResult.buffer;
    this.lightBufferSize=lightResult.size;

    this.device.queue.writeBuffer(this.frameBuffer,0,frameData);
    this.device.queue.writeBuffer(this.lightBuffer,0,lightData);

    if(frameResult.replaced || lightResult.replaced || !this.frameBindGroup){
      this.frameBindGroup=this.device.createBindGroup({
        layout:this.frameLayout,
        entries:[
          {binding:0,resource:{buffer:this.frameBuffer}},
          {binding:1,resource:{buffer:this.lightBuffer}}
        ]
      });
    }

    const encoder=this.device.createCommandEncoder({label:'Evercraft World Engine frame'});
    const pass=encoder.beginRenderPass({
      colorAttachments:[{
        view:this.context.getCurrentTexture().createView(),
        clearValue:{
          r:plan.clearColor.r,
          g:plan.clearColor.g,
          b:plan.clearColor.b,
          a:1
        },
        loadOp:'clear',
        storeOp:'store'
      }],
      depthStencilAttachment:{
        view:this.depthTexture.createView(),
        depthClearValue:1,
        depthLoadOp:'clear',
        depthStoreOp:'store'
      }
    });

    pass.setBindGroup(0,this.frameBindGroup);

    for(const draw of plan.draws){
      const geometry=this.ensureGeometry(draw.geometryId);
      const pipeline=this.pipeline(draw);
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0,geometry.vertexBuffer);
      if(geometry.indexBuffer) pass.setIndexBuffer(geometry.indexBuffer,'uint32');

      const objectData=objectUniformData(draw);
      let objectBuffer=this.objectUniforms.get(draw.entityId);
      if(!objectBuffer){
        objectBuffer=this.device.createBuffer({
          size:Math.ceil(objectData.byteLength/16)*16,
          usage:usage.UNIFORM|usage.COPY_DST
        });
        this.objectUniforms.set(draw.entityId,objectBuffer);
      }
      this.device.queue.writeBuffer(objectBuffer,0,objectData);
      const objectBindGroup=this.device.createBindGroup({
        layout:this.objectLayout,
        entries:[{binding:0,resource:{buffer:objectBuffer}}]
      });
      pass.setBindGroup(1,objectBindGroup);

      if(geometry.indexBuffer){
        pass.drawIndexed(geometry.indexCount,1,0,0,0);
      }else{
        pass.draw(geometry.vertexCount,1,0,0);
      }
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return {
      schema:'evercraft.world-engine.webgpu-submit-receipt.v1' as const,
      planDigest:plan.digest,
      tick:plan.tick,
      drawCount:plan.draws.length,
      lightCount:plan.lights.length,
      backend:'webgpu' as const
    };
  }

  dispose(){
    for(const geometry of this.geometryCache.values()){
      geometry.vertexBuffer?.destroy?.();
      geometry.indexBuffer?.destroy?.();
    }
    for(const buffer of this.objectUniforms.values()) buffer?.destroy?.();
    this.frameBuffer?.destroy?.();
    this.lightBuffer?.destroy?.();
    this.depthTexture?.destroy?.();
    this.geometryCache.clear();
    this.objectUniforms.clear();
    this.pipelineCache.clear();
  }
}
