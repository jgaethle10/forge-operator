import crypto from 'node:crypto';

import {
  validateWorldForgeProject,
  worldForgeDigest,
  type Vec3 as ForgeVec3,
  type Euler3,
  type WorldForgeAssetRef,
  type WorldForgeEditableMesh,
  type WorldForgeMaterial,
  type WorldForgeNode,
  type WorldForgeProject,
} from './world-forge.js';
import {
  validateWorldDefinition,
  worldDefinitionDigest,
  type TransformComponent,
  type Vec3 as EngineVec3,
  type WorldDefinition,
  type WorldEntity,
} from '../world-engine/engine.js';
import {
  createWorldAssetManifest,
  type WorldAssetManifest,
  type WorldAssetRecord,
} from '../world-engine/studio-edit.js';
import type {
  CameraComponent,
  LightComponent,
  MaterialDefinition,
} from '../world-engine/visual.js';
import type { GeometryAsset } from '../world-engine/webgpu.js';

export interface WorldForgeWorldEngineBridgeReceipt {
  schema:'evercraft.fallen.world-forge-world-engine-bridge-receipt.v1';
  projectId:string;
  projectVersion:number;
  projectDigest:string;
  worldId:string;
  worldVersion:number;
  worldDigest:string;
  assetManifestDigest:string;
  geometryAssetDigests:Array<{id:string;sha256:string}>;
  nodeEntityMap:Array<{nodeId:string;entityId:string}>;
  materialMap:Array<{worldForgeMaterialId:string;worldEngineMaterialId:string}>;
  assetMap:Array<{worldForgeAssetId:string;worldEngineAssetId:string}>;
  coordinateSystem:{
    source:'right_handed_z_up';
    target:'right_handed_y_up';
    mapping:'x=x,y=z,z=-y';
  };
  warnings:string[];
  blockers:string[];
  runtimeReady:true;
  webGpuReady:boolean;
  visualParity:'exact'|'approximate'|'blocked';
  boundaries:{
    publicationAuthorityGranted:false;
    productionRenderAuthorityGranted:false;
    simulationAuthorityGranted:false;
    restrictedAssetsRenderable:false;
  };
  digest:string;
}

export interface WorldForgeWorldEngineBridgeResult {
  schema:'evercraft.fallen.world-forge-world-engine-bridge.v1';
  world:WorldDefinition;
  assets:WorldAssetManifest;
  geometries:GeometryAsset[];
  receipt:WorldForgeWorldEngineBridgeReceipt;
}

type Mat3=[
  number,number,number,
  number,number,number,
  number,number,number,
];

const DEG=Math.PI/180;
const RAD=180/Math.PI;

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([key])=>key!=='createdAt'&&key!=='updatedAt'&&key!=='digest')
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function sha256(value:unknown){
  return crypto.createHash('sha256').update(
    typeof value==='string'?value:JSON.stringify(stable(value)),
  ).digest('hex');
}

function safeEngineId(prefix:string,value:string){
  const normalized=String(value||'')
    .replace(/[^a-zA-Z0-9._:-]+/g,'_')
    .replace(/^([^a-zA-Z0-9])/, 'x$1')
    .slice(0,120);
  const candidate=`${prefix}:${normalized}`;
  if(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(candidate)) return candidate;
  return `${prefix}:${sha256(value).slice(0,24)}`;
}

function finite(value:number,label:string){
  if(!Number.isFinite(value)) throw new Error(`world_forge_world_engine_nonfinite:${label}`);
  return value;
}

function cleanZero(value:number){
  return Object.is(value,-0)||Math.abs(value)<1e-12?0:value;
}

function sub(a:ForgeVec3,b:ForgeVec3):ForgeVec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}

function cross(a:ForgeVec3,b:ForgeVec3):ForgeVec3{
  return {
    x:a.y*b.z-a.z*b.y,
    y:a.z*b.x-a.x*b.z,
    z:a.x*b.y-a.y*b.x,
  };
}

function normalize(v:ForgeVec3):ForgeVec3{
  const length=Math.hypot(v.x,v.y,v.z);
  if(length<=1e-12) throw new Error('world_forge_world_engine_zero_vector');
  return {x:v.x/length,y:v.y/length,z:v.z/length};
}

export function worldForgeVectorToWorldEngine(
  value:ForgeVec3,
  unitScaleMeters=1,
):EngineVec3{
  finite(unitScaleMeters,'unit_scale');
  if(unitScaleMeters<=0) throw new Error('world_forge_world_engine_unit_scale_invalid');
  return {
    x:cleanZero(finite(value.x,'vector_x')*unitScaleMeters),
    y:cleanZero(finite(value.z,'vector_z')*unitScaleMeters),
    z:cleanZero(-finite(value.y,'vector_y')*unitScaleMeters),
  };
}

export function worldEngineVectorToWorldForge(
  value:EngineVec3,
  unitScaleMeters=1,
):ForgeVec3{
  finite(unitScaleMeters,'unit_scale');
  if(unitScaleMeters<=0) throw new Error('world_forge_world_engine_unit_scale_invalid');
  return {
    x:cleanZero(finite(value.x,'engine_vector_x')/unitScaleMeters),
    y:cleanZero(-finite(value.z,'engine_vector_z')/unitScaleMeters),
    z:cleanZero(finite(value.y,'engine_vector_y')/unitScaleMeters),
  };
}

export function worldForgeDirectionToWorldEngine(value:ForgeVec3):EngineVec3{
  return {
    x:cleanZero(finite(value.x,'direction_x')),
    y:cleanZero(finite(value.z,'direction_z')),
    z:cleanZero(-finite(value.y,'direction_y')),
  };
}

function mat3Multiply(a:Mat3,b:Mat3):Mat3{
  const out=new Array<number>(9).fill(0);
  for(let r=0;r<3;r+=1){
    for(let c=0;c<3;c+=1){
      out[r*3+c]=
        a[r*3+0]*b[0*3+c]+
        a[r*3+1]*b[1*3+c]+
        a[r*3+2]*b[2*3+c];
    }
  }
  return out as Mat3;
}

function mat3Transpose(m:Mat3):Mat3{
  return [
    m[0],m[3],m[6],
    m[1],m[4],m[7],
    m[2],m[5],m[8],
  ];
}

function forgeEulerMatrix(rotation:Euler3):Mat3{
  const x=rotation.x*DEG;
  const y=rotation.y*DEG;
  const z=rotation.z*DEG;
  const cx=Math.cos(x),sx=Math.sin(x);
  const cy=Math.cos(y),sy=Math.sin(y);
  const cz=Math.cos(z),sz=Math.sin(z);

  const rx:Mat3=[
    1,0,0,
    0,cx,-sx,
    0,sx,cx,
  ];
  const ry:Mat3=[
    cy,0,sy,
    0,1,0,
    -sy,0,cy,
  ];
  const rz:Mat3=[
    cz,-sz,0,
    sz,cz,0,
    0,0,1,
  ];
  return mat3Multiply(mat3Multiply(rz,ry),rx);
}

const FORGE_TO_ENGINE_BASIS:Mat3=[
  1,0,0,
  0,0,1,
  0,-1,0,
];

function forgeRotationMatrixToEngine(matrix:Mat3){
  return mat3Multiply(
    mat3Multiply(FORGE_TO_ENGINE_BASIS,matrix),
    mat3Transpose(FORGE_TO_ENGINE_BASIS),
  );
}

function normalizeDeg(value:number){
  let result=value%360;
  if(result>180) result-=360;
  if(result<=-180) result+=360;
  if(Math.abs(result)<1e-10) return 0;
  return Number(result.toFixed(9));
}

function eulerFromRzRyRx(matrix:Mat3):Euler3{
  const sy=-matrix[6];
  const y=Math.asin(Math.max(-1,Math.min(1,sy)));
  const cy=Math.cos(y);

  let x:number;
  let z:number;
  if(Math.abs(cy)>1e-7){
    x=Math.atan2(matrix[7],matrix[8]);
    z=Math.atan2(matrix[3],matrix[0]);
  }else{
    x=0;
    z=Math.atan2(-matrix[1],matrix[4]);
  }

  return {
    x:normalizeDeg(x*RAD),
    y:normalizeDeg(y*RAD),
    z:normalizeDeg(z*RAD),
  };
}

export function worldForgeEulerToWorldEngine(rotation:Euler3):Euler3{
  return eulerFromRzRyRx(
    forgeRotationMatrixToEngine(forgeEulerMatrix(rotation)),
  );
}

export function worldEngineEulerToWorldForge(rotation:Euler3):Euler3{
  const engineMatrix=forgeEulerMatrix(rotation);
  const forgeMatrix=mat3Multiply(
    mat3Multiply(mat3Transpose(FORGE_TO_ENGINE_BASIS),engineMatrix),
    FORGE_TO_ENGINE_BASIS,
  );
  return eulerFromRzRyRx(forgeMatrix);
}

function cameraLookAtMatrix(node:WorldForgeNode):Mat3|null{
  if(node.kind!=='camera'||!node.camera?.lookAt) return null;
  const eye=node.transform.position;
  const forward=normalize(sub(node.camera.lookAt,eye));
  let right=cross(forward,{x:0,y:0,z:1});
  if(Math.hypot(right.x,right.y,right.z)<=1e-7){
    right=cross(forward,{x:0,y:1,z:0});
  }
  right=normalize(right);
  const up=normalize(cross(right,forward));
  const back={x:-forward.x,y:-forward.y,z:-forward.z};

  return [
    right.x,up.x,back.x,
    right.y,up.y,back.y,
    right.z,up.z,back.z,
  ];
}

function engineTransform(node:WorldForgeNode,unitScaleMeters:number):TransformComponent{
  const cameraMatrix=cameraLookAtMatrix(node);
  const rotationDeg=cameraMatrix
    ? eulerFromRzRyRx(forgeRotationMatrixToEngine(cameraMatrix))
    : worldForgeEulerToWorldEngine(node.transform.rotationDeg);

  return {
    position:worldForgeVectorToWorldEngine(node.transform.position,unitScaleMeters),
    rotationDeg,
    scale:{
      x:node.transform.scale.x,
      y:node.transform.scale.z,
      z:node.transform.scale.y,
    },
  };
}

function cubeMesh():WorldForgeEditableMesh{
  return {
    vertices:[
      {x:-.5,y:-.5,z:-.5},
      {x:.5,y:-.5,z:-.5},
      {x:.5,y:.5,z:-.5},
      {x:-.5,y:.5,z:-.5},
      {x:-.5,y:-.5,z:.5},
      {x:.5,y:-.5,z:.5},
      {x:.5,y:.5,z:.5},
      {x:-.5,y:.5,z:.5},
    ],
    faces:[
      [0,3,2,1],
      [4,5,6,7],
      [0,1,5,4],
      [1,2,6,5],
      [2,3,7,6],
      [3,0,4,7],
    ],
  };
}

function planeMesh():WorldForgeEditableMesh{
  return {
    vertices:[
      {x:-.5,y:-.5,z:0},
      {x:.5,y:-.5,z:0},
      {x:.5,y:.5,z:0},
      {x:-.5,y:.5,z:0},
    ],
    faces:[[0,1,2,3]],
  };
}

function geometrySource(node:WorldForgeNode){
  if(node.geometry?.kind==='editable_mesh') return node.geometry.mesh;
  if(node.geometry?.kind==='primitive'){
    if(node.geometry.primitive==='cube') return cubeMesh();
    if(node.geometry.primitive==='plane') return planeMesh();
    throw new Error(`world_forge_world_engine_primitive_requires_mesh_compiler:${node.id}:${node.geometry.primitive}`);
  }
  return null;
}

function geometryAssetFromMesh(
  id:string,
  mesh:WorldForgeEditableMesh,
  unitScaleMeters:number,
):GeometryAsset{
  const positions:number[]=[];
  const normals:number[]=[];

  for(let faceIndex=0;faceIndex<mesh.faces.length;faceIndex+=1){
    const face=mesh.faces[faceIndex];
    if(face.length<3) throw new Error(`world_forge_world_engine_face_invalid:${id}:${faceIndex}`);
    const a=mesh.vertices[face[0]];
    const b=mesh.vertices[face[1]];
    const c=mesh.vertices[face[2]];
    if(!a||!b||!c) throw new Error(`world_forge_world_engine_face_vertex_missing:${id}:${faceIndex}`);
    const normalForge=normalize(cross(sub(b,a),sub(c,a)));
    const normal=worldForgeDirectionToWorldEngine(normalForge);

    for(let i=1;i<face.length-1;i+=1){
      const triangle=[face[0],face[i],face[i+1]];
      for(const vertexIndex of triangle){
        const vertex=mesh.vertices[vertexIndex];
        if(!vertex) throw new Error(`world_forge_world_engine_vertex_missing:${id}:${vertexIndex}`);
        const converted=worldForgeVectorToWorldEngine(vertex,unitScaleMeters);
        positions.push(converted.x,converted.y,converted.z);
        normals.push(normal.x,normal.y,normal.z);
      }
    }
  }

  return {
    schema:'evercraft.world-engine.geometry.v1',
    id,
    primitive:'triangles',
    positions,
    normals,
  };
}

function materialIdFor(sourceId:string){
  return safeEngineId('wfmat',sourceId);
}

function assetIdFor(sourceId:string){
  return safeEngineId('wfasset',sourceId);
}

function worldAssetKind(asset:WorldForgeAssetRef):WorldAssetRecord['kind']{
  if(asset.kind==='mesh') return 'geometry';
  if(asset.kind==='texture') return 'texture';
  if(asset.kind==='image') return 'image';
  if(asset.kind==='video') return 'video';
  if(asset.kind==='audio') return 'audio';
  if(asset.kind==='motion') return 'animation';
  return 'other';
}

function licenseForAsset(asset:WorldForgeAssetRef){
  const metadataLicense=typeof asset.metadata?.license==='string'
    ? asset.metadata.license.trim()
    : '';
  if(metadataLicense) return metadataLicense;
  if(asset.rightsState==='owned') return 'Evercraft-owned';
  if(asset.rightsState==='public_domain') return 'public-domain';
  if(asset.rightsState==='licensed'){
    throw new Error(`world_forge_world_engine_asset_license_required:${asset.id}`);
  }
  throw new Error(`world_forge_world_engine_asset_rights_not_renderable:${asset.id}:${asset.rightsState}`);
}

function externalWorldAsset(asset:WorldForgeAssetRef):WorldAssetRecord{
  if(!/^[a-f0-9]{64}$/i.test(asset.digest??'')){
    throw new Error(`world_forge_world_engine_asset_digest_required:${asset.id}`);
  }
  const sourceRef=asset.sourceRefs[0]?.trim();
  if(!sourceRef) throw new Error(`world_forge_world_engine_asset_source_required:${asset.id}`);

  return {
    id:assetIdFor(asset.id),
    kind:worldAssetKind(asset),
    revision:1,
    sha256:asset.digest!,
    uri:asset.uri,
    contentType:typeof asset.metadata?.contentType==='string'
      ? asset.metadata.contentType
      : undefined,
    provenance:{
      sourceRef,
      rightsState:asset.rightsState,
      license:licenseForAsset(asset),
      attribution:typeof asset.metadata?.attribution==='string'
        ? asset.metadata.attribution
        : undefined,
    },
    metadata:{
      worldForgeAssetId:asset.id,
      evidenceState:asset.evidenceState,
      sourceRefs:[...asset.sourceRefs],
      ...(asset.metadata??{}),
    },
  };
}

function color3(value:[number,number,number]){
  return {r:value[0],g:value[1],b:value[2]};
}

function worldMaterial(
  material:WorldForgeMaterial,
  assetIdMap:Map<string,string>,
  blockers:string[],
):MaterialDefinition{
  const textureRefs:MaterialDefinition['textureRefs']={};
  for(const binding of material.textureBindings??[]){
    const mapped=assetIdMap.get(binding.assetId);
    if(!mapped) throw new Error(`world_forge_world_engine_texture_asset_missing:${material.id}:${binding.assetId}`);
    if(binding.slot==='base_color') textureRefs.baseColor=mapped;
    else if(binding.slot==='normal') textureRefs.normal=mapped;
    else if(binding.slot==='emissive') textureRefs.emissive=mapped;
    else if(binding.slot==='roughness'||binding.slot==='metallic'){
      blockers.push(`material_orm_pack_required:${material.id}:${binding.slot}`);
    }else if(binding.slot==='opacity'){
      blockers.push(`material_opacity_texture_unsupported:${material.id}`);
    }
  }

  const alpha=material.opacity??material.baseColor[3];
  return {
    id:materialIdFor(material.id),
    model:'pbr',
    baseColor:{
      r:material.baseColor[0],
      g:material.baseColor[1],
      b:material.baseColor[2],
      a:alpha,
    },
    metallic:material.metallic,
    roughness:material.roughness,
    emissive:material.emissive?color3(material.emissive):undefined,
    emissiveIntensity:material.emissive?1:undefined,
    alphaMode:alpha<1?'blend':'opaque',
    textureRefs:Object.keys(textureRefs).length?textureRefs:undefined,
  };
}

function cameraComponent(
  project:WorldForgeProject,
  node:WorldForgeNode,
):CameraComponent{
  if(!node.camera) throw new Error(`world_forge_world_engine_camera_component_missing:${node.id}`);
  const camera=node.camera;
  const intent=project.renderIntents.find(item=>item.cameraNodeId===node.id);
  const aspect=intent?intent.width/intent.height:16/9;
  const near=Math.max(.001,(camera.near??.05)*project.unitScaleMeters);
  const far=Math.max(near+.1,(camera.far??200)*project.unitScaleMeters);

  if(camera.projection==='orthographic'){
    return {
      projection:{
        type:'orthographic',
        orthoHeight:Math.max(.001,(camera.orthoScale??10)*project.unitScaleMeters),
      },
      near,
      far,
    };
  }

  const focal=Math.max(.001,camera.focalLengthMm??50);
  const sensorWidth=Math.max(.001,camera.sensorWidthMm??36);
  const sensorHeight=sensorWidth/aspect;
  const fovYDeg=2*Math.atan(sensorHeight/(2*focal))*RAD;
  return {
    projection:{type:'perspective',fovYDeg},
    near,
    far,
  };
}

function lightComponent(
  project:WorldForgeProject,
  node:WorldForgeNode,
  warnings:string[],
):LightComponent{
  if(!node.light) throw new Error(`world_forge_world_engine_light_component_missing:${node.id}`);
  const source=node.light;
  const common={
    color:color3(source.color),
    intensity:source.intensity,
  };

  if(source.type==='sun'){
    return {
      type:'directional',
      ...common,
      castsShadow:source.castShadows,
    };
  }

  if(source.type==='spot'){
    const outer=Math.max(.1,Math.min(90,source.coneDeg??45));
    warnings.push(`spot_inner_cone_derived:${node.id}`);
    return {
      type:'spot',
      ...common,
      range:Math.max(.001,(source.range??12)*project.unitScaleMeters),
      innerConeDeg:outer*.72,
      outerConeDeg:outer,
      castsShadow:source.castShadows,
    };
  }

  if(source.type==='area'){
    warnings.push(`area_light_approximated_as_point:${node.id}`);
  }
  return {
    type:'point',
    ...common,
    range:Math.max(.001,(source.range??Math.max(12,(source.size??1)*4))*project.unitScaleMeters),
    castsShadow:source.castShadows,
  };
}

function sourceMaterialId(
  project:WorldForgeProject,
  node:WorldForgeNode,
){
  const source=node.materialIds?.[0];
  if(source&&project.materials.some(material=>material.id===source)){
    return materialIdFor(source);
  }
  return 'wfmat:default';
}

function referencedAssetIds(project:WorldForgeProject){
  const ids=new Set<string>();
  for(const node of project.nodes){
    if(node.geometry?.kind==='asset') ids.add(node.geometry.assetId);
  }
  for(const material of project.materials){
    for(const binding of material.textureBindings??[]) ids.add(binding.assetId);
  }
  return ids;
}

function receiptDigest(
  receipt:Omit<WorldForgeWorldEngineBridgeReceipt,'digest'>|WorldForgeWorldEngineBridgeReceipt,
){
  return sha256(receipt);
}

export function verifyWorldForgeWorldEngineBridgeReceipt(
  receipt:WorldForgeWorldEngineBridgeReceipt,
){
  if(receipt?.schema!=='evercraft.fallen.world-forge-world-engine-bridge-receipt.v1') return false;
  return receipt.digest===receiptDigest(receipt);
}

export function compileWorldForgeToWorldEngine(input:{
  project:WorldForgeProject;
  tickRateHz?:number;
}):WorldForgeWorldEngineBridgeResult{
  const project=structuredClone(input.project);
  const validation=validateWorldForgeProject(project);
  if(validation.status!=='accepted'){
    throw new Error(`world_forge_world_engine_project_invalid:${validation.errors.join('|')}`);
  }
  if(project.nodes.some(node=>node.parentId)){
    throw new Error('world_forge_world_engine_parent_hierarchy_requires_flatten');
  }
  if(project.animations.length){
    throw new Error('world_forge_world_engine_object_animation_bridge_not_ready');
  }
  if(project.simulations.length){
    throw new Error('world_forge_world_engine_simulation_bridge_not_ready');
  }

  const projectDigest=worldForgeDigest(project);
  const warnings:string[]=[];
  const blockers:string[]=[];
  const worldId=safeEngineId('world-forge',project.id);

  const usedAssetIds=referencedAssetIds(project);
  const sourceAssets=new Map(project.assets.map(asset=>[asset.id,asset]));
  const externalAssets:WorldAssetRecord[]=[];
  const assetIdMap=new Map<string,string>();
  for(const assetId of [...usedAssetIds].sort()){
    const asset=sourceAssets.get(assetId);
    if(!asset) throw new Error(`world_forge_world_engine_asset_missing:${assetId}`);
    const record=externalWorldAsset(asset);
    externalAssets.push(record);
    assetIdMap.set(asset.id,record.id);
  }

  const materials:MaterialDefinition[]=[
    {
      id:'wfmat:default',
      model:'pbr',
      baseColor:{r:.5,g:.5,b:.5,a:1},
      metallic:0,
      roughness:.7,
      alphaMode:'opaque',
    },
    ...project.materials.map(material=>worldMaterial(material,assetIdMap,blockers)),
  ];

  const geometriesByDigest=new Map<string,GeometryAsset>();
  const geometryAssetRecords:WorldAssetRecord[]=[];
  const nodeEntityMap:Array<{nodeId:string;entityId:string}>=[];
  const materialMap=project.materials.map(material=>({
    worldForgeMaterialId:material.id,
    worldEngineMaterialId:materialIdFor(material.id),
  }));
  const assetMap=[...assetIdMap].map(([worldForgeAssetId,worldEngineAssetId])=>({
    worldForgeAssetId,
    worldEngineAssetId,
  }));
  const entities:WorldEntity[]=[];

  for(const node of project.nodes){
    const entityId=safeEngineId('wfnode',node.id);
    nodeEntityMap.push({nodeId:node.id,entityId});

    const entity:WorldEntity={
      id:entityId,
      name:node.name,
      transform:engineTransform(node,project.unitScaleMeters),
      tags:['world-forge',node.kind,...(node.tags??[])],
      properties:{
        worldForgeProjectId:project.id,
        worldForgeNodeId:node.id,
        worldForgeNodeKind:node.kind,
        locked:node.locked===true,
        sourceRefs:[...(node.sourceRefs??[])],
        sourceMetadata:structuredClone(node.metadata??{}),
        coordinateSource:'right_handed_z_up',
      },
    };

    if(node.kind==='mesh'){
      if(!node.geometry) throw new Error(`world_forge_world_engine_mesh_geometry_missing:${node.id}`);

      let geometryRef:string;
      if(node.geometry.kind==='asset'){
        const mapped=assetIdMap.get(node.geometry.assetId);
        if(!mapped) throw new Error(`world_forge_world_engine_geometry_asset_missing:${node.id}`);
        geometryRef=mapped;
        blockers.push(`external_geometry_requires_materialized_geometry_asset:${node.id}:${node.geometry.assetId}`);
      }else if(node.geometry.kind==='procedural'){
        throw new Error(`world_forge_world_engine_procedural_geometry_requires_bake:${node.id}`);
      }else{
        const mesh=geometrySource(node);
        if(!mesh) throw new Error(`world_forge_world_engine_geometry_compile_failed:${node.id}`);
        const descriptorDigest=sha256({
          geometry:node.geometry,
          unitScaleMeters:project.unitScaleMeters,
        });
        let geometry=geometriesByDigest.get(descriptorDigest);
        if(!geometry){
          const geometryId=`wfgeom:${descriptorDigest.slice(0,24)}`;
          geometry=geometryAssetFromMesh(
            geometryId,
            mesh,
            project.unitScaleMeters,
          );
          geometriesByDigest.set(descriptorDigest,geometry);
          const geometryDigest=sha256(geometry);
          geometryAssetRecords.push({
            id:geometry.id,
            kind:'geometry',
            revision:project.version,
            sha256:geometryDigest,
            uri:`world-forge://${encodeURIComponent(project.id)}/geometry/${descriptorDigest}`,
            contentType:'application/vnd.evercraft.world-engine.geometry+json',
            provenance:{
              sourceRef:`world-forge:${project.id}:geometry:${descriptorDigest}`,
              rightsState:'owned',
              license:'Evercraft-owned authored geometry',
            },
            metadata:{
              worldForgeProjectId:project.id,
              geometryDescriptorDigest:descriptorDigest,
              coordinateConversion:'x=x,y=z,z=-y',
            },
          });
        }
        geometryRef=geometry.id;
      }

      if(node.modifiers?.length){
        warnings.push(`modifier_stack_not_baked:${node.id}:${node.modifiers.map(item=>item.type).join(',')}`);
      }

      entity.renderable={
        geometryRef,
        materialId:sourceMaterialId(project,node),
        visible:node.visible!==false,
        castsShadow:true,
        receivesShadow:true,
      };
    }

    if(node.kind==='light'){
      entity.light=lightComponent(project,node,warnings);
    }

    if(node.kind==='camera'){
      entity.camera=cameraComponent(project,node);
      if(node.camera?.lookAt){
        entity.properties={
          ...(entity.properties??{}),
          worldForgeLookAt:structuredClone(node.camera.lookAt),
          cameraOrientationDerivedFromLookAt:true,
        };
      }
    }

    entities.push(entity);
  }

  const cameras=project.nodes.filter(node=>node.kind==='camera'&&node.camera);
  const activeCameraNodeId=
    project.activeCameraNodeId ??
    project.renderIntents[0]?.cameraNodeId ??
    cameras[0]?.id;
  if(!activeCameraNodeId){
    throw new Error('world_forge_world_engine_camera_required');
  }
  const activeCameraEntity=nodeEntityMap.find(item=>item.nodeId===activeCameraNodeId)?.entityId;
  if(!activeCameraEntity){
    throw new Error(`world_forge_world_engine_active_camera_missing:${activeCameraNodeId}`);
  }

  const hasTextures=materials.some(material=>Boolean(material.textureRefs));
  if(hasTextures) blockers.push('world_engine_webgpu_texture_runtime_not_ready');

  const visualParity=
    blockers.length?'blocked':
    warnings.length?'approximate':
    'exact';

  const world:WorldDefinition={
    schema:'evercraft.world-engine.world.v1',
    id:worldId,
    version:project.version,
    tickRateHz:input.tickRateHz??60,
    gravity:{x:0,y:-9.81,z:0},
    entities:entities.sort((a,b)=>a.id.localeCompare(b.id)),
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      materials:materials.sort((a,b)=>a.id.localeCompare(b.id)),
      initialCameraEntityId:activeCameraEntity,
      cameraTransitions:[],
      clearColor:{r:.018,g:.021,b:.026},
    },
    metadata:{
      source:'world-forge',
      sourceProjectId:project.id,
      coordinateConversion:'right_handed_z_up_to_right_handed_y_up_v1',
      renderAuthority:false,
      publicationAuthority:false,
      simulationAuthority:false,
    },
  };

  validateWorldDefinition(world);
  const assets=createWorldAssetManifest(
    world.id,
    [...geometryAssetRecords,...externalAssets].sort((a,b)=>a.id.localeCompare(b.id)),
    project.version,
  );
  const geometries=[...geometriesByDigest.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const worldDigest=worldDefinitionDigest(world);

  const receiptCore:Omit<WorldForgeWorldEngineBridgeReceipt,'digest'>={
    schema:'evercraft.fallen.world-forge-world-engine-bridge-receipt.v1',
    projectId:project.id,
    projectVersion:project.version,
    projectDigest,
    worldId:world.id,
    worldVersion:world.version,
    worldDigest,
    assetManifestDigest:assets.digest,
    geometryAssetDigests:geometries.map(geometry=>({
      id:geometry.id,
      sha256:sha256(geometry),
    })),
    nodeEntityMap:nodeEntityMap.sort((a,b)=>a.nodeId.localeCompare(b.nodeId)),
    materialMap:materialMap.sort((a,b)=>a.worldForgeMaterialId.localeCompare(b.worldForgeMaterialId)),
    assetMap:assetMap.sort((a,b)=>a.worldForgeAssetId.localeCompare(b.worldForgeAssetId)),
    coordinateSystem:{
      source:'right_handed_z_up',
      target:'right_handed_y_up',
      mapping:'x=x,y=z,z=-y',
    },
    warnings:[...new Set(warnings)].sort(),
    blockers:[...new Set(blockers)].sort(),
    runtimeReady:true,
    webGpuReady:blockers.length===0,
    visualParity,
    boundaries:{
      publicationAuthorityGranted:false,
      productionRenderAuthorityGranted:false,
      simulationAuthorityGranted:false,
      restrictedAssetsRenderable:false,
    },
  };

  const receipt:WorldForgeWorldEngineBridgeReceipt={
    ...receiptCore,
    digest:receiptDigest(receiptCore),
  };

  return {
    schema:'evercraft.fallen.world-forge-world-engine-bridge.v1',
    world,
    assets,
    geometries,
    receipt,
  };
}
