import crypto from 'node:crypto';

export type WorldForgeNodeKind =
  | 'mesh'
  | 'curve'
  | 'text'
  | 'volume'
  | 'camera'
  | 'light'
  | 'armature'
  | 'empty'
  | 'media_surface'
  | 'particle_emitter';

export type WorldForgeEvidenceState =
  | 'observed'
  | 'licensed'
  | 'generated_visualization'
  | 'modeled'
  | 'inferred'
  | 'unknown';

export type WorldForgeRightsState =
  | 'owned'
  | 'licensed'
  | 'public_domain'
  | 'restricted'
  | 'unknown';

export interface Vec3 {
  x:number;
  y:number;
  z:number;
}

export interface Euler3 {
  x:number;
  y:number;
  z:number;
}

export interface WorldForgeTransform {
  position:Vec3;
  rotationDeg:Euler3;
  scale:Vec3;
}

export interface WorldForgeAssetRef {
  id:string;
  kind:'mesh'|'texture'|'image'|'video'|'audio'|'motion'|'volume'|'font'|'environment';
  uri:string;
  digest?:string;
  evidenceState:WorldForgeEvidenceState;
  rightsState:WorldForgeRightsState;
  sourceRefs:string[];
  metadata?:Record<string,unknown>;
}

export type WorldForgePrimitive =
  | 'cube'
  | 'sphere'
  | 'plane'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'capsule';

export type WorldForgeGeometry =
  | {
      kind:'primitive';
      primitive:WorldForgePrimitive;
      parameters?:Record<string,number>;
    }
  | {
      kind:'asset';
      assetId:string;
    }
  | {
      kind:'procedural';
      graphId:string;
      outputSocket?:string;
    };

export interface WorldForgeMaterial {
  id:string;
  name:string;
  model:'pbr';
  baseColor:[number,number,number,number];
  metallic:number;
  roughness:number;
  emissive?:[number,number,number];
  opacity?:number;
  textureBindings?:Array<{
    slot:'base_color'|'normal'|'roughness'|'metallic'|'emissive'|'opacity';
    assetId:string;
  }>;
  sourceRefs?:string[];
}

export type WorldForgeModifier =
  | { id:string; type:'mirror'; axis:Array<'x'|'y'|'z'> }
  | { id:string; type:'array'; count:number; offset:Vec3 }
  | { id:string; type:'bevel'; width:number; segments:number }
  | { id:string; type:'subdivision'; levels:number }
  | { id:string; type:'solidify'; thickness:number }
  | { id:string; type:'boolean'; operation:'union'|'difference'|'intersect'; targetNodeId:string }
  | { id:string; type:'deform'; mode:'bend'|'twist'|'taper'; amount:number; axis:'x'|'y'|'z' }
  | { id:string; type:'geometry_graph'; graphId:string };

export interface WorldForgeCameraComponent {
  projection:'perspective'|'orthographic';
  focalLengthMm?:number;
  sensorWidthMm?:number;
  orthoScale?:number;
  near?:number;
  far?:number;
}

export interface WorldForgeLightComponent {
  type:'point'|'sun'|'spot'|'area';
  intensity:number;
  color:[number,number,number];
  range?:number;
  coneDeg?:number;
  size?:number;
  castShadows?:boolean;
}

export interface WorldForgeNode {
  id:string;
  name:string;
  kind:WorldForgeNodeKind;
  parentId?:string;
  transform:WorldForgeTransform;
  visible?:boolean;
  locked?:boolean;
  geometry?:WorldForgeGeometry;
  materialIds?:string[];
  modifiers?:WorldForgeModifier[];
  camera?:WorldForgeCameraComponent;
  light?:WorldForgeLightComponent;
  sourceRefs?:string[];
  tags?:string[];
  metadata?:Record<string,unknown>;
}

export interface WorldForgeGraphNode {
  id:string;
  type:string;
  label?:string;
  params?:Record<string,unknown>;
  inputs?:string[];
  outputs?:string[];
}

export interface WorldForgeGraphLink {
  from:{nodeId:string;socket:string};
  to:{nodeId:string;socket:string};
}

export interface WorldForgeProceduralGraph {
  id:string;
  name:string;
  domain:'geometry'|'material'|'simulation'|'compositor';
  nodes:WorldForgeGraphNode[];
  links:WorldForgeGraphLink[];
  exposedParameters?:Record<string,unknown>;
}

export interface WorldForgeKeyframe<T=number> {
  frame:number;
  value:T;
  interpolation?:'step'|'linear'|'bezier';
}

export interface WorldForgeAnimationChannel {
  nodeId:string;
  property:
    | 'position.x'|'position.y'|'position.z'
    | 'rotationDeg.x'|'rotationDeg.y'|'rotationDeg.z'
    | 'scale.x'|'scale.y'|'scale.z'
    | 'visible'
    | string;
  keyframes:Array<WorldForgeKeyframe<number|boolean>>;
}

export interface WorldForgeAnimationClip {
  id:string;
  name:string;
  fps:number;
  startFrame:number;
  endFrame:number;
  channels:WorldForgeAnimationChannel[];
}

export interface WorldForgeSimulationDomain {
  id:string;
  type:'rigid_body'|'cloth'|'soft_body'|'particles'|'fluid'|'smoke'|'hair';
  nodeIds:string[];
  graphId?:string;
  cachePolicy:'live'|'bake_required';
  deterministicSeed?:number;
  parameters?:Record<string,unknown>;
}

export interface WorldForgeRenderIntent {
  id:string;
  cameraNodeId:string;
  width:number;
  height:number;
  fps:number;
  startFrame:number;
  endFrame:number;
  quality:'preview'|'production';
  colorPipeline:'srgb'|'aces';
  transparentBackground?:boolean;
}

export interface WorldForgeProject {
  schema:'evercraft.fallen.world-forge-project.v1';
  id:string;
  title:string;
  version:number;
  unitScaleMeters:number;
  nodes:WorldForgeNode[];
  assets:WorldForgeAssetRef[];
  materials:WorldForgeMaterial[];
  graphs:WorldForgeProceduralGraph[];
  animations:WorldForgeAnimationClip[];
  simulations:WorldForgeSimulationDomain[];
  renderIntents:WorldForgeRenderIntent[];
  activeCameraNodeId?:string;
  metadata?:Record<string,unknown>;
  createdAt:string;
  updatedAt:string;
}

export interface WorldForgeValidation {
  schema:'evercraft.fallen.world-forge-validation.v1';
  status:'accepted'|'rejected';
  errors:string[];
  warnings:string[];
  digest:string;
  projectId:string;
  version:number;
  boundaries:{
    publicationAuthorityGranted:false;
    paidGenerationAuthorityGranted:false;
    restrictedAssetsRenderable:false;
  };
}

export type WorldForgeOperation =
  | { type:'add_node'; node:WorldForgeNode }
  | { type:'remove_node'; nodeId:string; allowDestructive?:boolean }
  | { type:'rename_node'; nodeId:string; name:string }
  | { type:'set_transform'; nodeId:string; transform:Partial<WorldForgeTransform> }
  | { type:'set_visibility'; nodeId:string; visible:boolean }
  | { type:'reparent_node'; nodeId:string; parentId?:string }
  | { type:'add_modifier'; nodeId:string; modifier:WorldForgeModifier }
  | { type:'remove_modifier'; nodeId:string; modifierId:string }
  | { type:'bind_material'; nodeId:string; materialId:string; slot?:number };

export interface WorldForgeMutationReceipt {
  schema:'evercraft.fallen.world-forge-mutation-receipt.v1';
  projectId:string;
  versionBefore:number;
  versionAfter:number;
  digestBefore:string;
  digestAfter:string;
  operations:WorldForgeOperation[];
  inverseOperations:WorldForgeOperation[];
  rejectedOperations:Array<{index:number;reason:string}>;
  boundaries:{
    destructiveMutationRequiresExplicitAuthority:true;
    lockedNodesRespected:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

export interface WorldForgeMutationResult {
  schema:'evercraft.fallen.world-forge-mutation-result.v1';
  status:'completed'|'blocked';
  project:WorldForgeProject;
  receipt:WorldForgeMutationReceipt;
  validation:WorldForgeValidation;
}

export interface WorldForgeRenderPlan {
  schema:'evercraft.fallen.world-forge-render-plan.v1';
  id:string;
  projectId:string;
  projectVersion:number;
  projectDigest:string;
  intent:WorldForgeRenderIntent;
  camera:WorldForgeNode;
  assets:WorldForgeAssetRef[];
  requirements:{
    true3DScene:boolean;
    meshGeometry:boolean;
    proceduralGeometry:boolean;
    pbrMaterials:boolean;
    animation:boolean;
    simulation:boolean;
    volumetrics:boolean;
    alphaOutput:boolean;
  };
  backend:{
    authority:'unassigned';
    executable:false;
    reason:'renderer_not_selected';
  };
  boundaries:{
    publicationAuthorityGranted:false;
    providerExecutionAuthorityGranted:false;
    restrictedAssetsRenderable:false;
  };
}

const IDENTITY_TRANSFORM:WorldForgeTransform={
  position:{x:0,y:0,z:0},
  rotationDeg:{x:0,y:0,z:0},
  scale:{x:1,y:1,z:1},
};

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([key])=>key!=='createdAt'&&key!=='updatedAt')
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

export function worldForgeDigest(project:WorldForgeProject){
  return crypto.createHash('sha256').update(JSON.stringify(stable(project))).digest('hex');
}

function uniqueIds<T extends {id:string}>(items:T[],prefix:string,errors:string[]){
  const seen=new Set<string>();
  for(const item of items){
    if(!item.id?.trim()) errors.push(`${prefix}_id_missing`);
    if(seen.has(item.id)) errors.push(`${prefix}_id_duplicate:${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

function hasHierarchyCycle(project:WorldForgeProject,nodeId:string){
  const nodes=new Map(project.nodes.map(node=>[node.id,node]));
  const seen=new Set<string>();
  let cursor=nodes.get(nodeId);
  while(cursor?.parentId){
    if(seen.has(cursor.parentId)||cursor.parentId===nodeId) return true;
    seen.add(cursor.parentId);
    cursor=nodes.get(cursor.parentId);
  }
  return false;
}

function graphValidation(graph:WorldForgeProceduralGraph){
  const errors:string[]=[];
  const ids=new Set(graph.nodes.map(node=>node.id));
  for(const link of graph.links){
    if(!ids.has(link.from.nodeId)) errors.push(`graph_link_from_missing:${graph.id}:${link.from.nodeId}`);
    if(!ids.has(link.to.nodeId)) errors.push(`graph_link_to_missing:${graph.id}:${link.to.nodeId}`);
  }
  return errors;
}

export function validateWorldForgeProject(project:WorldForgeProject):WorldForgeValidation{
  const errors:string[]=[];
  const warnings:string[]=[];

  if(project.schema!=='evercraft.fallen.world-forge-project.v1') errors.push('schema_invalid');
  if(!project.id?.trim()) errors.push('project_id_missing');
  if(!project.title?.trim()) errors.push('project_title_missing');
  if(!Number.isInteger(project.version)||project.version<1) errors.push('project_version_invalid');
  if(!Number.isFinite(project.unitScaleMeters)||project.unitScaleMeters<=0) errors.push('unit_scale_invalid');

  const nodeIds=uniqueIds(project.nodes,'node',errors);
  const assetIds=uniqueIds(project.assets,'asset',errors);
  const materialIds=uniqueIds(project.materials,'material',errors);
  const graphIds=uniqueIds(project.graphs,'graph',errors);
  uniqueIds(project.animations,'animation',errors);
  uniqueIds(project.simulations,'simulation',errors);
  uniqueIds(project.renderIntents,'render_intent',errors);

  for(const asset of project.assets){
    if(!asset.uri?.trim()) errors.push(`asset_uri_missing:${asset.id}`);
    if(asset.evidenceState!=='unknown'&&!asset.sourceRefs.length) warnings.push(`asset_source_refs_missing:${asset.id}`);
    if(asset.rightsState==='unknown') warnings.push(`asset_rights_unknown:${asset.id}`);
  }

  for(const material of project.materials){
    for(const binding of material.textureBindings??[]){
      if(!assetIds.has(binding.assetId)) errors.push(`material_texture_asset_missing:${material.id}:${binding.assetId}`);
    }
  }

  for(const node of project.nodes){
    if(node.parentId&&!nodeIds.has(node.parentId)) errors.push(`node_parent_missing:${node.id}:${node.parentId}`);
    if(hasHierarchyCycle(project,node.id)) errors.push(`node_hierarchy_cycle:${node.id}`);

    if(node.geometry?.kind==='asset'&&!assetIds.has(node.geometry.assetId)){
      errors.push(`node_geometry_asset_missing:${node.id}:${node.geometry.assetId}`);
    }
    if(node.geometry?.kind==='procedural'&&!graphIds.has(node.geometry.graphId)){
      errors.push(`node_geometry_graph_missing:${node.id}:${node.geometry.graphId}`);
    }

    for(const materialId of node.materialIds??[]){
      if(!materialIds.has(materialId)) errors.push(`node_material_missing:${node.id}:${materialId}`);
    }

    for(const modifier of node.modifiers??[]){
      if(modifier.type==='boolean'&&!nodeIds.has(modifier.targetNodeId)){
        errors.push(`modifier_boolean_target_missing:${node.id}:${modifier.targetNodeId}`);
      }
      if(modifier.type==='geometry_graph'&&!graphIds.has(modifier.graphId)){
        errors.push(`modifier_graph_missing:${node.id}:${modifier.graphId}`);
      }
    }

    if(node.kind==='camera'&&!node.camera) errors.push(`camera_component_missing:${node.id}`);
    if(node.kind==='light'&&!node.light) errors.push(`light_component_missing:${node.id}`);
  }

  for(const graph of project.graphs) errors.push(...graphValidation(graph));

  for(const clip of project.animations){
    if(clip.fps<=0) errors.push(`animation_fps_invalid:${clip.id}`);
    if(clip.endFrame<clip.startFrame) errors.push(`animation_frame_range_invalid:${clip.id}`);
    for(const channel of clip.channels){
      if(!nodeIds.has(channel.nodeId)) errors.push(`animation_node_missing:${clip.id}:${channel.nodeId}`);
    }
  }

  for(const simulation of project.simulations){
    for(const nodeId of simulation.nodeIds){
      if(!nodeIds.has(nodeId)) errors.push(`simulation_node_missing:${simulation.id}:${nodeId}`);
    }
    if(simulation.graphId&&!graphIds.has(simulation.graphId)){
      errors.push(`simulation_graph_missing:${simulation.id}:${simulation.graphId}`);
    }
  }

  for(const intent of project.renderIntents){
    const camera=project.nodes.find(node=>node.id===intent.cameraNodeId);
    if(!camera) errors.push(`render_camera_missing:${intent.id}:${intent.cameraNodeId}`);
    else if(camera.kind!=='camera') errors.push(`render_camera_not_camera:${intent.id}:${intent.cameraNodeId}`);
    if(intent.width<=0||intent.height<=0) errors.push(`render_dimensions_invalid:${intent.id}`);
    if(intent.fps<=0||intent.fps>240) errors.push(`render_fps_invalid:${intent.id}`);
    if(intent.endFrame<intent.startFrame) errors.push(`render_frame_range_invalid:${intent.id}`);
  }

  if(project.activeCameraNodeId){
    const camera=project.nodes.find(node=>node.id===project.activeCameraNodeId);
    if(!camera) errors.push(`active_camera_missing:${project.activeCameraNodeId}`);
    else if(camera.kind!=='camera') errors.push(`active_camera_not_camera:${project.activeCameraNodeId}`);
  }

  return {
    schema:'evercraft.fallen.world-forge-validation.v1',
    status:errors.length?'rejected':'accepted',
    errors:[...new Set(errors)],
    warnings:[...new Set(warnings)],
    digest:worldForgeDigest(project),
    projectId:project.id,
    version:project.version,
    boundaries:{
      publicationAuthorityGranted:false,
      paidGenerationAuthorityGranted:false,
      restrictedAssetsRenderable:false,
    },
  };
}

function clone<T>(value:T):T{
  return JSON.parse(JSON.stringify(value)) as T;
}

function findNode(project:WorldForgeProject,nodeId:string){
  return project.nodes.find(node=>node.id===nodeId)??null;
}

function requireEditableNode(project:WorldForgeProject,nodeId:string){
  const node=findNode(project,nodeId);
  if(!node) throw new Error(`node_missing:${nodeId}`);
  if(node.locked) throw new Error(`node_locked:${nodeId}`);
  return node;
}

function inverseTransform(node:WorldForgeNode):WorldForgeOperation{
  return {type:'set_transform',nodeId:node.id,transform:clone(node.transform)};
}

function operationInverse(project:WorldForgeProject,operation:WorldForgeOperation):WorldForgeOperation{
  if(operation.type==='add_node') return {type:'remove_node',nodeId:operation.node.id,allowDestructive:true};

  const node=findNode(project,operation.nodeId);
  if(!node) throw new Error(`node_missing:${operation.nodeId}`);

  if(operation.type==='remove_node') return {type:'add_node',node:clone(node)};
  if(operation.type==='rename_node') return {type:'rename_node',nodeId:node.id,name:node.name};
  if(operation.type==='set_transform') return inverseTransform(node);
  if(operation.type==='set_visibility') return {type:'set_visibility',nodeId:node.id,visible:node.visible!==false};
  if(operation.type==='reparent_node') return {type:'reparent_node',nodeId:node.id,parentId:node.parentId};
  if(operation.type==='add_modifier') return {type:'remove_modifier',nodeId:node.id,modifierId:operation.modifier.id};
  if(operation.type==='remove_modifier'){
    const modifier=node.modifiers?.find(item=>item.id===operation.modifierId);
    if(!modifier) throw new Error(`modifier_missing:${node.id}:${operation.modifierId}`);
    return {type:'add_modifier',nodeId:node.id,modifier:clone(modifier)};
  }
  const slot=Math.max(0,operation.slot??0);
  const previous=node.materialIds?.[slot];
  if(previous) return {type:'bind_material',nodeId:node.id,materialId:previous,slot};
  return {type:'bind_material',nodeId:node.id,materialId:operation.materialId,slot};
}

function applyOperation(project:WorldForgeProject,operation:WorldForgeOperation){
  if(operation.type==='add_node'){
    if(findNode(project,operation.node.id)) throw new Error(`node_exists:${operation.node.id}`);
    project.nodes.push(clone(operation.node));
    return;
  }

  const node=requireEditableNode(project,operation.nodeId);

  if(operation.type==='remove_node'){
    if(operation.allowDestructive!==true) throw new Error(`destructive_authority_required:${node.id}`);
    if(project.nodes.some(item=>item.parentId===node.id)) throw new Error(`node_has_children:${node.id}`);
    project.nodes=project.nodes.filter(item=>item.id!==node.id);
    return;
  }

  if(operation.type==='rename_node'){
    if(!operation.name.trim()) throw new Error(`node_name_missing:${node.id}`);
    node.name=operation.name.trim();
    return;
  }

  if(operation.type==='set_transform'){
    node.transform={
      position:{...node.transform.position,...operation.transform.position},
      rotationDeg:{...node.transform.rotationDeg,...operation.transform.rotationDeg},
      scale:{...node.transform.scale,...operation.transform.scale},
    };
    return;
  }

  if(operation.type==='set_visibility'){
    node.visible=operation.visible;
    return;
  }

  if(operation.type==='reparent_node'){
    if(operation.parentId===node.id) throw new Error(`node_parent_self:${node.id}`);
    if(operation.parentId&&!findNode(project,operation.parentId)) throw new Error(`node_parent_missing:${node.id}:${operation.parentId}`);
    node.parentId=operation.parentId;
    return;
  }

  if(operation.type==='add_modifier'){
    if((node.modifiers??[]).some(item=>item.id===operation.modifier.id)) throw new Error(`modifier_exists:${node.id}:${operation.modifier.id}`);
    node.modifiers=[...(node.modifiers??[]),clone(operation.modifier)];
    return;
  }

  if(operation.type==='remove_modifier'){
    const before=node.modifiers?.length??0;
    node.modifiers=(node.modifiers??[]).filter(item=>item.id!==operation.modifierId);
    if(node.modifiers.length===before) throw new Error(`modifier_missing:${node.id}:${operation.modifierId}`);
    return;
  }

  if(!project.materials.some(material=>material.id===operation.materialId)){
    throw new Error(`material_missing:${operation.materialId}`);
  }
  const slot=Math.max(0,operation.slot??0);
  const materialIds=[...(node.materialIds??[])];
  while(materialIds.length<=slot) materialIds.push(operation.materialId);
  materialIds[slot]=operation.materialId;
  node.materialIds=materialIds;
}

export function applyWorldForgeOperations(input:{
  project:WorldForgeProject;
  operations:WorldForgeOperation[];
  expectedVersion:number;
}):WorldForgeMutationResult{
  const original=clone(input.project);
  const beforeValidation=validateWorldForgeProject(original);
  const digestBefore=beforeValidation.digest;

  const rejectedOperations:Array<{index:number;reason:string}>=[];
  const inverseOperations:WorldForgeOperation[]=[];
  const next=clone(original);

  if(beforeValidation.status==='rejected'||input.expectedVersion!==original.version){
    const reason=beforeValidation.status==='rejected'
      ? `project_invalid:${beforeValidation.errors.join('|')}`
      : `project_version_conflict:expected=${input.expectedVersion}:actual=${original.version}`;
    rejectedOperations.push({index:-1,reason});
  } else {
    for(let index=0;index<input.operations.length;index+=1){
      const operation=input.operations[index];
      try{
        const inverse=operationInverse(next,operation);
        applyOperation(next,operation);
        const check=validateWorldForgeProject(next);
        if(check.status==='rejected'){
          throw new Error(check.errors.join('|'));
        }
        inverseOperations.unshift(inverse);
      }catch(error){
        rejectedOperations.push({
          index,
          reason:error instanceof Error?error.message:String(error),
        });
        break;
      }
    }
  }

  if(rejectedOperations.length){
    const validation=validateWorldForgeProject(original);
    return {
      schema:'evercraft.fallen.world-forge-mutation-result.v1',
      status:'blocked',
      project:original,
      validation,
      receipt:{
        schema:'evercraft.fallen.world-forge-mutation-receipt.v1',
        projectId:original.id,
        versionBefore:original.version,
        versionAfter:original.version,
        digestBefore,
        digestAfter:digestBefore,
        operations:clone(input.operations),
        inverseOperations:[],
        rejectedOperations,
        boundaries:{
          destructiveMutationRequiresExplicitAuthority:true,
          lockedNodesRespected:true,
          publicationAuthorityGranted:false,
        },
        createdAt:new Date().toISOString(),
      },
    };
  }

  next.version+=1;
  next.updatedAt=new Date().toISOString();
  const validation=validateWorldForgeProject(next);

  return {
    schema:'evercraft.fallen.world-forge-mutation-result.v1',
    status:'completed',
    project:next,
    validation,
    receipt:{
      schema:'evercraft.fallen.world-forge-mutation-receipt.v1',
      projectId:next.id,
      versionBefore:original.version,
      versionAfter:next.version,
      digestBefore,
      digestAfter:validation.digest,
      operations:clone(input.operations),
      inverseOperations,
      rejectedOperations:[],
      boundaries:{
        destructiveMutationRequiresExplicitAuthority:true,
        lockedNodesRespected:true,
        publicationAuthorityGranted:false,
      },
      createdAt:new Date().toISOString(),
    },
  };
}

export function buildWorldForgeRenderPlan(input:{
  project:WorldForgeProject;
  renderIntentId:string;
}):WorldForgeRenderPlan{
  const validation=validateWorldForgeProject(input.project);
  if(validation.status==='rejected') throw new Error(`world_forge_project_invalid:${validation.errors.join('|')}`);

  const intent=input.project.renderIntents.find(item=>item.id===input.renderIntentId);
  if(!intent) throw new Error(`render_intent_missing:${input.renderIntentId}`);

  const camera=input.project.nodes.find(node=>node.id===intent.cameraNodeId);
  if(!camera||camera.kind!=='camera') throw new Error(`render_camera_invalid:${intent.cameraNodeId}`);

  const usedAssetIds=new Set<string>();
  for(const node of input.project.nodes){
    if(node.visible===false) continue;
    if(node.geometry?.kind==='asset') usedAssetIds.add(node.geometry.assetId);
    for(const materialId of node.materialIds??[]){
      const material=input.project.materials.find(item=>item.id===materialId);
      for(const binding of material?.textureBindings??[]) usedAssetIds.add(binding.assetId);
    }
  }

  const assets=input.project.assets.filter(asset=>usedAssetIds.has(asset.id));
  const restricted=assets.filter(asset=>asset.rightsState==='restricted'||asset.rightsState==='unknown');
  if(restricted.length){
    throw new Error(`render_assets_not_cleared:${restricted.map(asset=>asset.id).join(',')}`);
  }

  const requirements={
    true3DScene:true,
    meshGeometry:input.project.nodes.some(node=>node.kind==='mesh'),
    proceduralGeometry:input.project.nodes.some(node=>node.geometry?.kind==='procedural'||node.modifiers?.some(mod=>mod.type==='geometry_graph')),
    pbrMaterials:input.project.materials.length>0,
    animation:input.project.animations.length>0,
    simulation:input.project.simulations.length>0,
    volumetrics:input.project.nodes.some(node=>node.kind==='volume'),
    alphaOutput:intent.transparentBackground===true,
  };

  return {
    schema:'evercraft.fallen.world-forge-render-plan.v1',
    id:`${input.project.id}-${intent.id}-v${input.project.version}`,
    projectId:input.project.id,
    projectVersion:input.project.version,
    projectDigest:validation.digest,
    intent:clone(intent),
    camera:clone(camera),
    assets:clone(assets),
    requirements,
    backend:{
      authority:'unassigned',
      executable:false,
      reason:'renderer_not_selected',
    },
    boundaries:{
      publicationAuthorityGranted:false,
      providerExecutionAuthorityGranted:false,
      restrictedAssetsRenderable:false,
    },
  };
}

export function createEmptyWorldForgeProject(input:{
  id:string;
  title:string;
  cameraId?:string;
}):WorldForgeProject{
  const now=new Date().toISOString();
  const cameraId=input.cameraId??'camera-main';
  return {
    schema:'evercraft.fallen.world-forge-project.v1',
    id:input.id,
    title:input.title,
    version:1,
    unitScaleMeters:1,
    nodes:[
      {
        id:cameraId,
        name:'Main Camera',
        kind:'camera',
        transform:{
          position:{x:0,y:-6,z:3},
          rotationDeg:{x:67,y:0,z:0},
          scale:{x:1,y:1,z:1},
        },
        camera:{
          projection:'perspective',
          focalLengthMm:50,
          sensorWidthMm:36,
          near:.01,
          far:10000,
        },
      },
    ],
    assets:[],
    materials:[],
    graphs:[],
    animations:[],
    simulations:[],
    renderIntents:[
      {
        id:'preview',
        cameraNodeId:cameraId,
        width:1920,
        height:1080,
        fps:30,
        startFrame:1,
        endFrame:1,
        quality:'preview',
        colorPipeline:'aces',
      },
    ],
    activeCameraNodeId:cameraId,
    createdAt:now,
    updatedAt:now,
  };
}

export function identityWorldForgeTransform():WorldForgeTransform{
  return clone(IDENTITY_TRANSFORM);
}
