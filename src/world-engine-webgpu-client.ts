import { EVERCRAFT_WEBGPU_WGSL } from '../systemia/world-engine/webgpu-shader.js';
import type {
  GeometryAsset,
  WebGpuDrawCommand,
  WebGpuRenderPlan,
} from '../systemia/world-engine/webgpu.js';

function clone<T>(value:T):T{
  return structuredClone(value);
}

function validateGeometry(geometry:GeometryAsset){
  if(geometry?.schema!=='evercraft.world-engine.geometry.v1'){
    throw new Error('world_engine_webgpu_client_geometry_schema_invalid');
  }
  if(!geometry.id) throw new Error('world_engine_webgpu_client_geometry_id_missing');
  if(geometry.primitive!=='triangles'){
    throw new Error(`world_engine_webgpu_client_geometry_primitive_unsupported:${geometry.id}`);
  }
  if(
    !Array.isArray(geometry.positions)||
    geometry.positions.length<9||
    geometry.positions.length%3!==0
  ){
    throw new Error(`world_engine_webgpu_client_geometry_positions_invalid:${geometry.id}`);
  }
  if(
    !Array.isArray(geometry.normals)||
    geometry.normals.length!==geometry.positions.length
  ){
    throw new Error(`world_engine_webgpu_client_geometry_normals_invalid:${geometry.id}`);
  }
  if(geometry.indices){
    const vertexCount=geometry.positions.length/3;
    if(geometry.indices.length<3||geometry.indices.length%3!==0){
      throw new Error(`world_engine_webgpu_client_geometry_indices_invalid:${geometry.id}`);
    }
    for(const index of geometry.indices){
      if(!Number.isInteger(index)||index<0||index>=vertexCount){
        throw new Error(`world_engine_webgpu_client_geometry_index_invalid:${geometry.id}`);
      }
    }
  }
}

export function validateWorldEngineWebGpuClientPayload(
  plan:WebGpuRenderPlan,
  geometries:GeometryAsset[],
){
  if(plan?.schema!=='evercraft.world-engine.webgpu-plan.v1'){
    throw new Error('world_engine_webgpu_client_plan_schema_invalid');
  }
  if(
    !Number.isInteger(plan.width)||
    !Number.isInteger(plan.height)||
    plan.width<1||
    plan.height<1
  ){
    throw new Error('world_engine_webgpu_client_viewport_invalid');
  }

  const geometryIds=new Set<string>();
  for(const geometry of geometries){
    validateGeometry(geometry);
    if(geometryIds.has(geometry.id)){
      throw new Error(`world_engine_webgpu_client_geometry_duplicate:${geometry.id}`);
    }
    geometryIds.add(geometry.id);
  }

  for(const draw of plan.draws){
    if(!geometryIds.has(draw.geometryId)){
      throw new Error(`world_engine_webgpu_client_geometry_missing:${draw.geometryId}`);
    }
  }
  return true;
}

function floats(values:number[]){
  return new Float32Array(values);
}

function packGeometry(geometry:GeometryAsset){
  const vertices=geometry.positions.length/3;
  const data=new Float32Array(vertices*6);
  for(let i=0;i<vertices;i+=1){
    data[i*6]=geometry.positions[i*3];
    data[i*6+1]=geometry.positions[i*3+1];
    data[i*6+2]=geometry.positions[i*3+2];
    data[i*6+3]=geometry.normals[i*3];
    data[i*6+4]=geometry.normals[i*3+1];
    data[i*6+5]=geometry.normals[i*3+2];
  }
  return data;
}

function lightStorageData(plan:WebGpuRenderPlan){
  const values:number[]=[];
  for(const light of plan.lights){
    values.push(light.kind,light.intensity,light.range,light.innerCos);
    values.push(light.color[0],light.color[1],light.color[2],light.outerCos);
    values.push(light.position[0],light.position[1],light.position[2],0);
    values.push(light.direction[0],light.direction[1],light.direction[2],0);
  }
  if(!values.length) values.push(0,0,0,0);
  return floats(values);
}

function frameUniformData(plan:WebGpuRenderPlan){
  return floats([
    ...plan.viewProjectionMatrix,
    plan.cameraPosition[0],
    plan.cameraPosition[1],
    plan.cameraPosition[2],
    plan.exposure,
    plan.lights.length,
    0,0,0,
  ]);
}

function objectUniformData(draw:WebGpuDrawCommand){
  return floats([
    ...draw.modelMatrix,
    ...draw.normalMatrix,
    ...draw.baseColor,
    draw.materialModel,
    draw.metallic,
    draw.roughness,
    draw.alphaCutoff,
    draw.emissive[0],
    draw.emissive[1],
    draw.emissive[2],
    draw.emissiveIntensity,
  ]);
}

interface CachedGeometry {
  vertexBuffer:any;
  indexBuffer:any|null;
  vertexCount:number;
  indexCount:number;
}

export class WorldEngineWebGpuClient {
  private geometryCache=new Map<string,CachedGeometry>();
  private geometries=new Map<string,GeometryAsset>();
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
  private readonly shaderModule:any;
  private readonly frameLayout:any;
  private readonly objectLayout:any;
  private readonly pipelineLayout:any;

  private constructor(
    private readonly canvas:HTMLCanvasElement,
    private readonly device:any,
    private readonly context:any,
    private readonly format:string,
    geometries:GeometryAsset[],
  ){
    this.shaderModule=device.createShaderModule({
      label:'Evercraft World Engine browser WGSL',
      code:EVERCRAFT_WEBGPU_WGSL,
    });
    this.frameLayout=device.createBindGroupLayout({
      entries:[
        {binding:0,visibility:3,buffer:{type:'uniform'}},
        {binding:1,visibility:2,buffer:{type:'read-only-storage'}},
      ],
    });
    this.objectLayout=device.createBindGroupLayout({
      entries:[{binding:0,visibility:3,buffer:{type:'uniform'}}],
    });
    this.pipelineLayout=device.createPipelineLayout({
      bindGroupLayouts:[this.frameLayout,this.objectLayout],
    });
    this.replaceGeometries(geometries);
  }

  static isSupported(){
    return Boolean((globalThis as any).navigator?.gpu);
  }

  static async create(canvas:HTMLCanvasElement,geometries:GeometryAsset[]){
    const nav=(globalThis as any).navigator;
    if(!nav?.gpu) throw new Error('world_engine_webgpu_client_unavailable');
    const adapter=await nav.gpu.requestAdapter();
    if(!adapter) throw new Error('world_engine_webgpu_client_adapter_unavailable');
    const device=await adapter.requestDevice();
    const context=canvas.getContext('webgpu') as any;
    if(!context) throw new Error('world_engine_webgpu_client_context_unavailable');
    const format=nav.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'premultiplied'});
    return new WorldEngineWebGpuClient(canvas,device,context,format,geometries);
  }

  replaceGeometries(geometries:GeometryAsset[]){
    const probePlan={
      schema:'evercraft.world-engine.webgpu-plan.v1',
      width:1,
      height:1,
      draws:[],
    } as WebGpuRenderPlan;
    validateWorldEngineWebGpuClientPayload(probePlan,geometries);

    for(const geometry of this.geometryCache.values()){
      geometry.vertexBuffer?.destroy?.();
      geometry.indexBuffer?.destroy?.();
    }
    this.geometryCache.clear();
    this.geometries.clear();
    for(const geometry of geometries){
      this.geometries.set(geometry.id,clone(geometry));
    }
  }

  private ensureDepth(width:number,height:number){
    if(this.depthTexture&&this.depthWidth===width&&this.depthHeight===height) return;
    this.depthTexture?.destroy?.();
    const usage=(globalThis as any).GPUTextureUsage;
    this.depthTexture=this.device.createTexture({
      size:[width,height,1],
      format:'depth24plus',
      usage:usage.RENDER_ATTACHMENT,
    });
    this.depthWidth=width;
    this.depthHeight=height;
  }

  private ensureGeometry(id:string){
    const cached=this.geometryCache.get(id);
    if(cached) return cached;
    const geometry=this.geometries.get(id);
    if(!geometry) throw new Error(`world_engine_webgpu_client_geometry_missing:${id}`);

    const usage=(globalThis as any).GPUBufferUsage;
    const vertexData=packGeometry(geometry);
    const vertexBuffer=this.device.createBuffer({
      size:Math.max(4,vertexData.byteLength),
      usage:usage.VERTEX|usage.COPY_DST,
    });
    this.device.queue.writeBuffer(vertexBuffer,0,vertexData);

    let indexBuffer:any|null=null;
    if(geometry.indices?.length){
      const indices=new Uint32Array(geometry.indices);
      indexBuffer=this.device.createBuffer({
        size:Math.max(4,indices.byteLength),
        usage:usage.INDEX|usage.COPY_DST,
      });
      this.device.queue.writeBuffer(indexBuffer,0,indices);
    }

    const next={
      vertexBuffer,
      indexBuffer,
      vertexCount:geometry.positions.length/3,
      indexCount:geometry.indices?.length??0,
    };
    this.geometryCache.set(id,next);
    return next;
  }

  private ensureBuffer(
    current:any|null,
    currentSize:number,
    required:number,
    usageFlags:number,
  ){
    if(current&&currentSize>=required){
      return {buffer:current,size:currentSize,replaced:false};
    }
    current?.destroy?.();
    const size=Math.max(16,Math.ceil(required/16)*16);
    return {
      buffer:this.device.createBuffer({size,usage:usageFlags}),
      size,
      replaced:true,
    };
  }

  private pipeline(draw:WebGpuDrawCommand){
    const cached=this.pipelineCache.get(draw.pipelineKey);
    if(cached) return cached;
    const blend=draw.alphaMode==='blend'
      ? {
          color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
          alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},
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
            {shaderLocation:1,offset:12,format:'float32x3'},
          ],
        }],
      },
      fragment:{
        module:this.shaderModule,
        entryPoint:'fs_main',
        targets:[{format:this.format,blend}],
      },
      primitive:{
        topology:'triangle-list',
        frontFace:'ccw',
        cullMode:draw.doubleSided?'none':'back',
      },
      depthStencil:{
        format:'depth24plus',
        depthWriteEnabled:draw.alphaMode!=='blend',
        depthCompare:'less',
      },
    });
    this.pipelineCache.set(draw.pipelineKey,pipeline);
    return pipeline;
  }

  render(plan:WebGpuRenderPlan){
    validateWorldEngineWebGpuClientPayload(plan,[...this.geometries.values()]);
    if(this.canvas.width!==plan.width) this.canvas.width=plan.width;
    if(this.canvas.height!==plan.height) this.canvas.height=plan.height;
    this.ensureDepth(plan.width,plan.height);

    const usage=(globalThis as any).GPUBufferUsage;
    const frameData=frameUniformData(plan);
    const lightData=lightStorageData(plan);

    const frameResult=this.ensureBuffer(
      this.frameBuffer,
      this.frameBufferSize,
      frameData.byteLength,
      usage.UNIFORM|usage.COPY_DST,
    );
    this.frameBuffer=frameResult.buffer;
    this.frameBufferSize=frameResult.size;

    const lightResult=this.ensureBuffer(
      this.lightBuffer,
      this.lightBufferSize,
      lightData.byteLength,
      usage.STORAGE|usage.COPY_DST,
    );
    this.lightBuffer=lightResult.buffer;
    this.lightBufferSize=lightResult.size;

    this.device.queue.writeBuffer(this.frameBuffer,0,frameData);
    this.device.queue.writeBuffer(this.lightBuffer,0,lightData);

    if(frameResult.replaced||lightResult.replaced||!this.frameBindGroup){
      this.frameBindGroup=this.device.createBindGroup({
        layout:this.frameLayout,
        entries:[
          {binding:0,resource:{buffer:this.frameBuffer}},
          {binding:1,resource:{buffer:this.lightBuffer}},
        ],
      });
    }

    const encoder=this.device.createCommandEncoder({
      label:'Evercraft World Engine browser frame',
    });
    const pass=encoder.beginRenderPass({
      colorAttachments:[{
        view:this.context.getCurrentTexture().createView(),
        clearValue:{
          r:plan.clearColor.r,
          g:plan.clearColor.g,
          b:plan.clearColor.b,
          a:1,
        },
        loadOp:'clear',
        storeOp:'store',
      }],
      depthStencilAttachment:{
        view:this.depthTexture.createView(),
        depthClearValue:1,
        depthLoadOp:'clear',
        depthStoreOp:'store',
      },
    });
    pass.setBindGroup(0,this.frameBindGroup);

    for(const draw of plan.draws){
      const geometry=this.ensureGeometry(draw.geometryId);
      pass.setPipeline(this.pipeline(draw));
      pass.setVertexBuffer(0,geometry.vertexBuffer);
      if(geometry.indexBuffer) pass.setIndexBuffer(geometry.indexBuffer,'uint32');

      const objectData=objectUniformData(draw);
      let objectBuffer=this.objectUniforms.get(draw.entityId);
      if(!objectBuffer){
        objectBuffer=this.device.createBuffer({
          size:Math.ceil(objectData.byteLength/16)*16,
          usage:usage.UNIFORM|usage.COPY_DST,
        });
        this.objectUniforms.set(draw.entityId,objectBuffer);
      }
      this.device.queue.writeBuffer(objectBuffer,0,objectData);
      const objectBindGroup=this.device.createBindGroup({
        layout:this.objectLayout,
        entries:[{binding:0,resource:{buffer:objectBuffer}}],
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
      schema:'evercraft.world-engine.webgpu-browser-submit.v1' as const,
      planDigest:plan.digest,
      tick:plan.tick,
      drawCount:plan.draws.length,
      lightCount:plan.lights.length,
      backend:'webgpu' as const,
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
