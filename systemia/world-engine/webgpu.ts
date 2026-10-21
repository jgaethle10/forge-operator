import crypto from 'node:crypto';
import type {
  CameraProjection,
  AtmosphereDefinition,
  FilmicColorManagement,
  CinematicLightingDefinition,
  ColorRGB,
  LightComponent,
  MaterialDefinition,
  VisualFrameContract
} from './visual.js';
import { verifyVisualFrameContract } from './visual.js';
import type { TransformComponent, Vec3 } from './engine.js';
import {
  applyTextureHotReload,
  normalizeTextureSampler,
  planTextureResidency,
  textureAssetDigest,
  textureSamplerKey,
  validateTextureAsset,
  type NormalizedTextureSampler,
  type TextureAsset,
  type TextureResidencyPlan
} from './texture.js';

export interface GeometryAsset {
  schema:'evercraft.world-engine.geometry.v1';
  id:string;
  primitive:'triangles';
  positions:number[];
  normals:number[];
  uvs?:number[];
  tangents?:number[];
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
  sampler:NormalizedTextureSampler;
  textureRefs:{
    baseColor:string|null;
    orm:string|null;
    emissive:string|null;
    normal:string|null;
  };
  textureFlags:[number,number,number,number];
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
  atmosphere?:AtmosphereDefinition;
  colorManagement?:FilmicColorManagement;
  cinematicLighting?:CinematicLightingDefinition;
  viewMatrix:number[];
  projectionMatrix:number[];
  viewProjectionMatrix:number[];
  cameraPosition:[number,number,number];
  exposure:number;
  lights:WebGpuLightPacket[];
  requiredTextureIds:string[];
  textures:Array<{
    id:string;
    digest:string;
    width:number;
    height:number;
    format:'rgba8unorm'|'rgba8unorm-srgb';
    bytes:number;
  }>;
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
  if(geometry.uvs){
    const vertices=geometry.positions.length/3;
    if(geometry.uvs.length!==vertices*2){
      throw new Error(`webgpu_geometry_uvs_invalid:${geometry.id}`);
    }
    for(const value of geometry.uvs) finite(value,`geometry_${geometry.id}_uv`);
  }
  if(geometry.tangents){
    const vertices=geometry.positions.length/3;
    if(!geometry.uvs) throw new Error(`webgpu_geometry_tangents_require_uvs:${geometry.id}`);
    if(geometry.tangents.length!==vertices*4){
      throw new Error(`webgpu_geometry_tangents_invalid:${geometry.id}`);
    }
    for(let i=0;i<vertices;i++){
      const x=geometry.tangents[i*4];
      const y=geometry.tangents[i*4+1];
      const z=geometry.tangents[i*4+2];
      const handedness=geometry.tangents[i*4+3];
      finite(x,`geometry_${geometry.id}_tangent`);
      finite(y,`geometry_${geometry.id}_tangent`);
      finite(z,`geometry_${geometry.id}_tangent`);
      finite(handedness,`geometry_${geometry.id}_tangent_handedness`);
      if(Math.sqrt(x*x+y*y+z*z)<=EPS){
        throw new Error(`webgpu_geometry_tangent_zero:${geometry.id}`);
      }
      if(handedness!==1 && handedness!==-1){
        throw new Error(`webgpu_geometry_tangent_handedness_invalid:${geometry.id}`);
      }
    }
  }
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

function materialPacket(
  material:MaterialDefinition,
  geometry:GeometryAsset,
  textureMap:Map<string,TextureAsset>
){
  const refs={
    baseColor:material.textureRefs?.baseColor || null,
    orm:material.textureRefs?.orm || null,
    emissive:material.textureRefs?.emissive || null,
    normal:material.textureRefs?.normal || null
  };
  const referenced=[refs.baseColor,refs.orm,refs.emissive,refs.normal]
    .filter((value):value is string=>Boolean(value));

  if(referenced.length && !geometry.uvs){
    throw new Error(`webgpu_texture_uvs_required:${geometry.id}`);
  }
  if(refs.normal && material.model!=='pbr'){
    throw new Error(`webgpu_normal_map_requires_pbr:${material.id}`);
  }
  if(refs.normal && !geometry.tangents){
    throw new Error(`webgpu_normal_map_tangents_required:${material.id}`);
  }
  for(const id of referenced){
    if(!textureMap.has(id)) throw new Error(`webgpu_texture_missing:${id}`);
  }
  if(refs.normal && textureMap.get(refs.normal)?.format!=='rgba8unorm'){
    throw new Error(`webgpu_normal_map_format_must_be_linear:${refs.normal}`);
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
      material.emissive?.r ?? (refs.emissive?1:0),
      material.emissive?.g ?? (refs.emissive?1:0),
      material.emissive?.b ?? (refs.emissive?1:0)
    ] as [number,number,number],
    emissiveIntensity:material.emissiveIntensity ?? 0,
    materialModel:(material.model==='unlit'?1:0) as 0|1,
    alphaMode:material.alphaMode || 'opaque',
    alphaCutoff:material.alphaMode==='mask'?(material.alphaCutoff ?? .5):-1,
    doubleSided:material.doubleSided===true,
    sampler:normalizeTextureSampler(material.sampler),
    textureRefs:refs,
    textureFlags:[
      refs.baseColor?1:0,
      refs.orm?1:0,
      refs.emissive?1:0,
      refs.normal?1:0
    ] as [number,number,number,number]
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
  viewport:{width:number;height:number},
  textures:TextureAsset[]=[]
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

  const textureMap=new Map<string,TextureAsset>();
  for(const texture of textures){
    validateTextureAsset(texture);
    if(textureMap.has(texture.id)) throw new Error(`webgpu_texture_duplicate:${texture.id}`);
    textureMap.set(texture.id,clone(texture));
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
      const packet=materialPacket(material,geometry,textureMap);
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
          packet.doubleSided?'double':'back',
          textureSamplerKey(packet.sampler)
        ].join(':')
      };
    });

  const requiredTextureIds=[...new Set(
    draws.flatMap(draw=>[
      draw.textureRefs.baseColor,
      draw.textureRefs.orm,
      draw.textureRefs.emissive,
      draw.textureRefs.normal
    ].filter((value):value is string=>Boolean(value)))
  )].sort();

  const texturePackets=requiredTextureIds.map(id=>{
    const texture=textureMap.get(id);
    if(!texture) throw new Error(`webgpu_texture_missing:${id}`);
    return {
      id,
      digest:textureAssetDigest(texture),
      width:texture.width,
      height:texture.height,
      format:texture.format,
      bytes:texture.width*texture.height*4
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
    ...(frame.atmosphere?{atmosphere:clone(frame.atmosphere)}:{}),
    ...(frame.colorManagement?{colorManagement:clone(frame.colorManagement)}:{}),
    ...(frame.cinematicLighting?{cinematicLighting:clone(frame.cinematicLighting)}:{}),
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
    requiredTextureIds,
    textures:texturePackets,
    draws,
    shadingModel:'evercraft-pbr-lite-v1' as const
  };
  return {...core,digest:digest(core)};
}

export function verifyWebGpuRenderPlan(plan:WebGpuRenderPlan){
  if(plan?.schema!=='evercraft.world-engine.webgpu-plan.v1') return false;
  const {digest:claimed,...core}=plan;
  return typeof claimed==='string' && claimed===digest(core);
}

function floats(values:number[]){
  return new Float32Array(values);
}

function packGeometry(geometry:GeometryAsset){
  const vertices=geometry.positions.length/3;
  const data=new Float32Array(vertices*12);
  for(let i=0;i<vertices;i++){
    data[i*12]=geometry.positions[i*3];
    data[i*12+1]=geometry.positions[i*3+1];
    data[i*12+2]=geometry.positions[i*3+2];
    data[i*12+3]=geometry.normals[i*3];
    data[i*12+4]=geometry.normals[i*3+1];
    data[i*12+5]=geometry.normals[i*3+2];
    data[i*12+6]=geometry.uvs?.[i*2] ?? 0;
    data[i*12+7]=geometry.uvs?.[i*2+1] ?? 0;
    data[i*12+8]=geometry.tangents?.[i*4] ?? 1;
    data[i*12+9]=geometry.tangents?.[i*4+1] ?? 0;
    data[i*12+10]=geometry.tangents?.[i*4+2] ?? 0;
    data[i*12+11]=geometry.tangents?.[i*4+3] ?? 1;
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
    draw.emissive[0],draw.emissive[1],draw.emissive[2],draw.emissiveIntensity,
    ...draw.textureFlags
  ]);
}

function frameUniformData(plan:WebGpuRenderPlan){
  const fog=plan.atmosphere;
  return floats([
    ...plan.viewProjectionMatrix,
    plan.cameraPosition[0],plan.cameraPosition[1],plan.cameraPosition[2],plan.exposure,
    plan.lights.length,0,0,0,
    fog?.color.r??0,fog?.color.g??0,fog?.color.b??0,fog?.density??0,
    fog?.startDistance??0,fog?.heightFalloff??0,fog?.referenceHeight??0,0,
    plan.colorManagement?.toneMapper==='aces_filmic'?1:0,
    plan.colorManagement?.exposureBiasStops??0,0,0,
    plan.cinematicLighting?.shading==='ggx_microfacet'?1:0,
    plan.cinematicLighting?.localLightFalloff==='inverse_square'?1:0,
    0,0
  ]);
}

export const EVERCRAFT_WEBGPU_WGSL=`
struct FrameUniforms {
  viewProjection: mat4x4<f32>,
  cameraExposure: vec4<f32>,
  lightMeta: vec4<f32>,
  fogColorDensity: vec4<f32>,
  fogParams: vec4<f32>,
  gradeParams: vec4<f32>,
  lightingParams: vec4<f32>,
};

struct ObjectUniforms {
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
  baseColor: vec4<f32>,
  material: vec4<f32>,
  emissive: vec4<f32>,
  textureFlags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> lightData: array<vec4<f32>>;
@group(1) @binding(0) var<uniform> object: ObjectUniforms;
@group(1) @binding(1) var materialSampler: sampler;
@group(1) @binding(2) var baseColorTexture: texture_2d<f32>;
@group(1) @binding(3) var ormTexture: texture_2d<f32>;
@group(1) @binding(4) var emissiveTexture: texture_2d<f32>;
@group(1) @binding(5) var normalTexture: texture_2d<f32>;

struct VertexIn {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) tangent: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) tangent: vec4<f32>,
};

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let world = object.model * vec4<f32>(input.position, 1.0);
  out.position = frame.viewProjection * world;
  out.worldPosition = world.xyz;
  out.normal = normalize((object.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz);
  out.uv = input.uv;
  out.tangent = vec4(
    normalize((object.normalMatrix * vec4<f32>(input.tangent.xyz, 0.0)).xyz),
    input.tangent.w
  );
  return out;
}

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

// Actual world-space distance attenuation, not a 2D texture placed over a shot.
// Density=0 is the pre-existing visual behavior. Unlit interface materials
// bypass this intentionally so UI labels and product screenshots remain clear.
fn applyAtmosphericDepth(lit: vec3<f32>, worldPosition: vec3<f32>) -> vec3<f32> {
  let density = frame.fogColorDensity.w;
  if (density <= 0.0) { return lit; }
  let distance = max(length(frame.cameraExposure.xyz - worldPosition) - frame.fogParams.x, 0.0);
  let midpointAltitude = 0.5 * (frame.cameraExposure.y + worldPosition.y);
  let altitude = max(midpointAltitude - frame.fogParams.z, 0.0);
  let effectiveDensity = density * exp(-frame.fogParams.y * altitude);
  let transmittance = clamp(exp(-effectiveDensity * distance), 0.0, 1.0);
  return mix(frame.fogColorDensity.rgb, lit, transmittance);
}

// Compact ACES approximation: bounded highlights with gentle shoulder roll-off.
fn applyFilmicGrade(linearColor: vec3<f32>) -> vec3<f32> {
  if (frame.gradeParams.x < 0.5) { return linearColor; }
  let x=max(linearColor * exp2(frame.gradeParams.y),vec3<f32>(0.0));
  let numerator=x*(2.51*x+vec3<f32>(0.03));
  let denominator=x*(2.43*x+vec3<f32>(0.59))+vec3<f32>(0.14);
  return clamp(numerator/denominator,vec3<f32>(0.0),vec3<f32>(1.0));
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  var base = object.baseColor;
  let modelFlag = object.material.x;
  var metallic = saturate(object.material.y);
  var roughness = clamp(object.material.z, 0.04, 1.0);
  let alphaCutoff = object.material.w;

  if (object.textureFlags.x > 0.5) {
    base *= textureSample(baseColorTexture, materialSampler, input.uv);
  }

  var ao = 1.0;
  if (object.textureFlags.y > 0.5) {
    let orm = textureSample(ormTexture, materialSampler, input.uv);
    ao = saturate(orm.r);
    roughness = clamp(roughness * orm.g, 0.04, 1.0);
    metallic = saturate(metallic * orm.b);
  }

  if (alphaCutoff >= 0.0 && base.a < alphaCutoff) {
    discard;
  }

  var emissive = object.emissive.rgb * object.emissive.a;
  if (object.textureFlags.z > 0.5) {
    emissive *= textureSample(emissiveTexture, materialSampler, input.uv).rgb;
  }

  if (modelFlag > 0.5) {
    return vec4<f32>((base.rgb + emissive) * frame.cameraExposure.w, base.a);
  }

  var N = normalize(input.normal);
  if (object.textureFlags.w > 0.5) {
    let sampledNormal = textureSample(normalTexture, materialSampler, input.uv).xyz * 2.0 - vec3<f32>(1.0);
    let T = normalize(input.tangent.xyz - N * dot(N, input.tangent.xyz));
    let B = normalize(cross(N, T)) * input.tangent.w;
    N = normalize(T * sampledNormal.x + B * sampledNormal.y + N * sampledNormal.z);
  }
  let V = normalize(frame.cameraExposure.xyz - input.worldPosition);
  var lighting = vec3<f32>(0.0);
  var specular = vec3<f32>(0.0);
  var ggxDirect = vec3<f32>(0.0);
  var ggxAmbient = vec3<f32>(0.0);
  let ndotv = max(dot(N,V),0.001);
  let lightCount = u32(frame.lightMeta.x);

  for (var i:u32=0u; i<lightCount; i=i+1u) {
    let offset=i*4u;
    let head=lightData[offset];
    let colorOuter=lightData[offset+1u];
    let pos=lightData[offset+2u].xyz;
    let direction=normalize(lightData[offset+3u].xyz);
    let kind=u32(head.x+0.5);
    let intensity=head.y;
    let range=head.z;
    let innerCos=head.w;
    let color=colorOuter.rgb;
    let outerCos=colorOuter.w;

    if (kind==0u) {
      if (frame.lightingParams.x > 0.5) {
        ggxAmbient += color*intensity*ao;
      } else {
        lighting += color*intensity*ao;
      }
      continue;
    }

    var L=vec3<f32>(0.0);
    var attenuation=1.0;

    if (kind==1u) {
      L=normalize(-direction);
    } else {
      let delta=pos-input.worldPosition;
      let dist=length(delta);
      if (dist<=0.00001 || dist>=range) {
        continue;
      }
      L=delta/dist;
      if (frame.lightingParams.y > 0.5) {
        // Squared inverse-distance falloff with smooth finite source range.
        let normalizedDistance=dist/range;
        let cutoff=max(1.0-pow(normalizedDistance,4.0),0.0);
        attenuation=(cutoff*cutoff)/(1.0+dist*dist);
      } else {
        attenuation=saturate(1.0-dist/range);
      }
      if (kind==3u) {
        let cone=dot(direction,-L);
        let coneWidth=max(innerCos-outerCos,0.00001);
        attenuation*=saturate((cone-outerCos)/coneWidth);
      }
    }

    let ndotl=max(dot(N,L),0.0);
    if (frame.lightingParams.x>0.5) {
      if (ndotl>0.0) {
        let H=normalize(L+V);
        let ndoth=max(dot(N,H),0.0);
        let vdoth=max(dot(V,H),0.0);
        let alpha=roughness*roughness;
        let alpha2=alpha*alpha;
        let t=ndoth*ndoth*(alpha2-1.0)+1.0;
        let distribution=alpha2/max(3.14159265*t*t,0.000001);
        let k=pow(roughness+1.0,2.0)/8.0;
        let geometryV=ndotv/max(ndotv*(1.0-k)+k,0.00001);
        let geometryL=ndotl/max(ndotl*(1.0-k)+k,0.00001);
        let F0=mix(vec3<f32>(0.04),base.rgb,metallic);
        let fresnel=F0+(vec3<f32>(1.0)-F0)*pow(1.0-vdoth,5.0);
        let microfacet=distribution*geometryV*geometryL*fresnel/max(4.0*ndotv*ndotl,0.001);
        let diffuseEnergy=(vec3<f32>(1.0)-fresnel)*(1.0-metallic);
        let diffuseBrdf=diffuseEnergy*base.rgb/3.14159265;
        ggxDirect += (diffuseBrdf+microfacet)*color*intensity*ndotl*attenuation*ao;
      }
      continue;
    }
    lighting += color*intensity*ndotl*attenuation;

    if (ndotl>0.0) {
      let H=normalize(L+V);
      let shininess=mix(128.0,4.0,roughness);
      let spec=pow(max(dot(N,H),0.0),shininess);
      let dielectric=vec3<f32>(0.04);
      let f0=mix(dielectric,base.rgb,metallic);
      specular += f0*spec*intensity*attenuation;
    }
  }

  var color=vec3<f32>(0.0);
  if (frame.lightingParams.x>0.5) {
    // Ambient is a bounded fill, NOT a claim of environment-map reflections.
    let metallicAmbientScale=mix(1.0,0.18,metallic);
    let ambient=base.rgb*ggxAmbient*metallicAmbientScale;
    color=(ambient+ggxDirect+emissive)*frame.cameraExposure.w;
  } else {
    let diffuse=base.rgb*lighting*mix(1.0,0.25,metallic);
    color=(diffuse+specular+emissive)*frame.cameraExposure.w;
  }
  return vec4<f32>(applyFilmicGrade(applyAtmosphericDepth(color,input.worldPosition)),base.a);
}
`;

interface CachedGeometry {
  vertexBuffer:any;
  indexBuffer:any|null;
  vertexCount:number;
  indexCount:number;
}

interface CachedTexture {
  texture:any;
  view:any;
  digest:string;
  bytes:number;
}

export class EvercraftWebGpuRenderer {
  private geometryCache=new Map<string,CachedGeometry>();
  private textureCache=new Map<string,CachedTexture>();
  private samplerCache=new Map<string,any>();
  private fallbackTextures=new Map<string,CachedTexture>();
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
    private readonly geometries:Map<string,GeometryAsset>,
    private readonly textures:Map<string,TextureAsset>,
    private readonly textureBudgetBytes:number
  ){
    this.shaderModule=device.createShaderModule({
      label:'Evercraft World Engine atmospheric depth WGSL',
      code:EVERCRAFT_WEBGPU_WGSL
    });
    this.frameLayout=device.createBindGroupLayout({
      entries:[
        {binding:0,visibility:3,buffer:{type:'uniform'}},
        {binding:1,visibility:2,buffer:{type:'read-only-storage'}}
      ]
    });
    this.objectLayout=device.createBindGroupLayout({
      entries:[
        {binding:0,visibility:3,buffer:{type:'uniform'}},
        {binding:1,visibility:2,sampler:{type:'filtering'}},
        {binding:2,visibility:2,texture:{sampleType:'float'}},
        {binding:3,visibility:2,texture:{sampleType:'float'}},
        {binding:4,visibility:2,texture:{sampleType:'float'}},
        {binding:5,visibility:2,texture:{sampleType:'float'}}
      ]
    });
    this.pipelineLayout=device.createPipelineLayout({
      bindGroupLayouts:[this.frameLayout,this.objectLayout]
    });
  }

  static async create(
    canvas:HTMLCanvasElement,
    geometries:GeometryAsset[],
    textures:TextureAsset[]=[],
    textureBudgetBytes=256*1024*1024
  ){
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
    const textureMap=new Map<string,TextureAsset>();
    for(const texture of textures){
      validateTextureAsset(texture);
      if(textureMap.has(texture.id)) throw new Error(`webgpu_texture_duplicate:${texture.id}`);
      textureMap.set(texture.id,clone(texture));
    }
    if(!Number.isInteger(textureBudgetBytes) || textureBudgetBytes<0){
      throw new Error('webgpu_texture_budget_invalid');
    }
    return new EvercraftWebGpuRenderer(
      canvas,
      device,
      context,
      format,
      map,
      textureMap,
      textureBudgetBytes
    );
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

  private ensureTexture(id:string,expectedDigest:string){
    const asset=this.textures.get(id);
    if(!asset) throw new Error(`webgpu_texture_missing:${id}`);
    const actualDigest=textureAssetDigest(asset);
    if(actualDigest!==expectedDigest){
      throw new Error(`webgpu_texture_digest_mismatch:${id}`);
    }

    const existing=this.textureCache.get(id);
    if(existing?.digest===actualDigest) return existing;
    if(existing){
      existing.texture?.destroy?.();
      this.textureCache.delete(id);
    }

    const usage=(globalThis as any).GPUTextureUsage;
    const texture=this.device.createTexture({
      size:[asset.width,asset.height,1],
      format:asset.format,
      usage:usage.TEXTURE_BINDING|usage.COPY_DST
    });
    this.device.queue.writeTexture(
      {texture},
      new Uint8Array(asset.data),
      {bytesPerRow:asset.width*4,rowsPerImage:asset.height},
      [asset.width,asset.height,1]
    );
    const cached={
      texture,
      view:texture.createView(),
      digest:actualDigest,
      bytes:asset.width*asset.height*4
    };
    this.textureCache.set(id,cached);
    return cached;
  }

  private fallbackTexture(kind:'white'|'orm'|'black'|'normal'){
    const existing=this.fallbackTextures.get(kind);
    if(existing) return existing;
    const rgba=kind==='white'
      ? [255,255,255,255]
      : kind==='orm'
        ? [255,255,0,255]
        : kind==='normal'
          ? [128,128,255,255]
          : [0,0,0,255];
    const usage=(globalThis as any).GPUTextureUsage;
    const texture=this.device.createTexture({
      size:[1,1,1],
      format:'rgba8unorm',
      usage:usage.TEXTURE_BINDING|usage.COPY_DST
    });
    this.device.queue.writeTexture(
      {texture},
      new Uint8Array(rgba),
      {bytesPerRow:4,rowsPerImage:1},
      [1,1,1]
    );
    const cached={
      texture,
      view:texture.createView(),
      digest:`fallback:${kind}`,
      bytes:4
    };
    this.fallbackTextures.set(kind,cached);
    return cached;
  }

  private sampler(definition:NormalizedTextureSampler){
    const key=textureSamplerKey(definition);
    const existing=this.samplerCache.get(key);
    if(existing) return existing;
    const sampler=this.device.createSampler({
      addressModeU:definition.addressModeU,
      addressModeV:definition.addressModeV,
      magFilter:definition.magFilter,
      minFilter:definition.minFilter
    });
    this.samplerCache.set(key,sampler);
    return sampler;
  }

  private applyTextureResidency(plan:WebGpuRenderPlan):TextureResidencyPlan{
    const residency=planTextureResidency(
      [...this.textureCache.keys()],
      plan.requiredTextureIds,
      [...this.textures.values()],
      this.textureBudgetBytes
    );
    for(const id of residency.evictTextureIds){
      const cached=this.textureCache.get(id);
      cached?.texture?.destroy?.();
      this.textureCache.delete(id);
    }
    const meta=new Map(plan.textures.map(row=>[row.id,row]));
    for(const id of residency.requiredTextureIds){
      const row=meta.get(id);
      if(!row) throw new Error(`webgpu_plan_texture_metadata_missing:${id}`);
      this.ensureTexture(id,row.digest);
    }
    return residency;
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
          arrayStride:48,
          attributes:[
            {shaderLocation:0,offset:0,format:'float32x3'},
            {shaderLocation:1,offset:12,format:'float32x3'},
            {shaderLocation:2,offset:24,format:'float32x2'},
            {shaderLocation:3,offset:32,format:'float32x4'}
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

  hotReloadTexture(texture:TextureAsset){
    const current=[...this.textures.values()].map(clone);
    const result=applyTextureHotReload(current,texture);
    this.textures.clear();
    for(const item of result.textures) this.textures.set(item.id,clone(item));

    const cached=this.textureCache.get(texture.id);
    if(cached){
      cached.texture?.destroy?.();
      this.textureCache.delete(texture.id);
    }
    return clone(result.receipt);
  }

  render(plan:WebGpuRenderPlan){
    if(plan?.schema!=='evercraft.world-engine.webgpu-plan.v1') throw new Error('webgpu_plan_schema_invalid');
    if(!verifyWebGpuRenderPlan(plan)) throw new Error('webgpu_plan_digest_invalid');
    if(plan.width<1||plan.height<1) throw new Error('webgpu_plan_viewport_invalid');
    if(this.canvas.width!==plan.width) this.canvas.width=plan.width;
    if(this.canvas.height!==plan.height) this.canvas.height=plan.height;
    this.ensureDepth(plan.width,plan.height);
    const textureResidency=this.applyTextureResidency(plan);

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
      const baseColorView=draw.textureRefs.baseColor
        ? this.textureCache.get(draw.textureRefs.baseColor)?.view
        : this.fallbackTexture('white').view;
      const ormView=draw.textureRefs.orm
        ? this.textureCache.get(draw.textureRefs.orm)?.view
        : this.fallbackTexture('orm').view;
      const emissiveView=draw.textureRefs.emissive
        ? this.textureCache.get(draw.textureRefs.emissive)?.view
        : this.fallbackTexture('black').view;
      const normalView=draw.textureRefs.normal
        ? this.textureCache.get(draw.textureRefs.normal)?.view
        : this.fallbackTexture('normal').view;
      if(!baseColorView || !ormView || !emissiveView || !normalView){
        throw new Error(`webgpu_texture_not_resident:${draw.entityId}`);
      }
      const objectBindGroup=this.device.createBindGroup({
        layout:this.objectLayout,
        entries:[
          {binding:0,resource:{buffer:objectBuffer}},
          {binding:1,resource:this.sampler(draw.sampler)},
          {binding:2,resource:baseColorView},
          {binding:3,resource:ormView},
          {binding:4,resource:emissiveView},
          {binding:5,resource:normalView}
        ]
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
      textureResidencyDigest:textureResidency.digest,
      residentTextureIds:textureResidency.requiredTextureIds,
      textureBytes:textureResidency.totalResidentBytes,
      backend:'webgpu' as const
    };
  }

  dispose(){
    for(const geometry of this.geometryCache.values()){
      geometry.vertexBuffer?.destroy?.();
      geometry.indexBuffer?.destroy?.();
    }
    for(const texture of this.textureCache.values()) texture.texture?.destroy?.();
    for(const texture of this.fallbackTextures.values()) texture.texture?.destroy?.();
    for(const buffer of this.objectUniforms.values()) buffer?.destroy?.();
    this.frameBuffer?.destroy?.();
    this.lightBuffer?.destroy?.();
    this.depthTexture?.destroy?.();
    this.geometryCache.clear();
    this.textureCache.clear();
    this.fallbackTextures.clear();
    this.samplerCache.clear();
    this.objectUniforms.clear();
    this.pipelineCache.clear();
  }
}
