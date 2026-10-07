import crypto from 'node:crypto';

import {
  applyWorldForgeOperations,
  worldForgeDigest,
  type WorldForgeMutationResult,
  type WorldForgeNode,
  type WorldForgeOperation,
  type WorldForgeProject,
} from './world-forge.js';

export type WorldForgeChangeSetPrecondition =
  | {
      kind:'node';
      nodeId:string;
      state:'present';
      digest:string;
    }
  | {
      kind:'node';
      nodeId:string;
      state:'absent';
    };

export interface WorldForgeChangeSet {
  schema:'evercraft.fallen.world-forge-change-set.v2';
  id:string;
  title:string;
  projectId:string;
  baseVersion:number;
  baseDigest:string;
  author:{
    kind:'human'|'agent'|'system';
    id:string;
  };
  authority:{
    destructive:boolean;
    publication:false;
  };
  operations:WorldForgeOperation[];
  preconditions:WorldForgeChangeSetPrecondition[];
  lineage?:{
    parentChangeSetDigest:string;
    rebasedFromVersion:number;
    rebasedFromWorldDigest:string;
    rebasedAt:string;
  };
  createdAt:string;
  digest:string;
}

export interface WorldForgeChangeSetApplyResult {
  schema:'evercraft.fallen.world-forge-change-set-apply-result.v2';
  status:'applied'|'blocked';
  changeSetId:string;
  changeSetDigest:string;
  projectId:string;
  baseVersion:number;
  baseDigest:string;
  currentVersion:number;
  currentDigest:string;
  reason?:string;
  conflicts?:string[];
  mutation?:WorldForgeMutationResult;
  boundaries:{
    atomic:true;
    staleDigestRejected:true;
    resourcePreconditionsVerified:true;
    destructiveAuthorityExplicit:true;
    publicationAuthorityGranted:false;
  };
}

export interface WorldForgeChangeSetRebaseResult {
  schema:'evercraft.fallen.world-forge-change-set-rebase-result.v1';
  status:'unchanged'|'rebased'|'blocked';
  projectId:string;
  originalChangeSetDigest:string;
  currentVersion:number;
  currentDigest:string;
  conflicts:string[];
  reason?:string;
  changeSet?:WorldForgeChangeSet;
  boundaries:{
    touchedResourcesMustBeUnchanged:true;
    destructiveAuthorityPreserved:true;
    publicationAuthorityGranted:false;
  };
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([key])=>key!=='digest'&&key!=='createdAt'&&key!=='rebasedAt')
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function hash(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function worldForgeNodeDigest(node:WorldForgeNode){
  return hash(node);
}

export function worldForgeChangeSetDigest(changeSet:Omit<WorldForgeChangeSet,'digest'>|WorldForgeChangeSet){
  return hash(changeSet);
}

function requiresDestructiveAuthority(operation:WorldForgeOperation){
  if(operation.type==='remove_node') return operation.allowDestructive===true;
  if(operation.type==='set_geometry') return operation.allowDestructive===true;
  return false;
}

function operationNodeId(operation:WorldForgeOperation){
  return operation.type==='add_node'?operation.node.id:operation.nodeId;
}

function buildPreconditions(project:WorldForgeProject,operations:WorldForgeOperation[]){
  const preconditions:WorldForgeChangeSetPrecondition[]=[];
  const seen=new Set<string>();
  const addedIds=new Set(
    operations
      .filter((operation):operation is Extract<WorldForgeOperation,{type:'add_node'}>=>operation.type==='add_node')
      .map(operation=>operation.node.id),
  );

  for(const operation of operations){
    if(operation.type==='add_node'){
      if(seen.has(operation.node.id)) continue;
      seen.add(operation.node.id);
      if(project.nodes.some(node=>node.id===operation.node.id)){
        throw new Error(`world_forge_change_set_add_node_exists:${operation.node.id}`);
      }
      preconditions.push({
        kind:'node',
        nodeId:operation.node.id,
        state:'absent',
      });
      continue;
    }

    if(addedIds.has(operation.nodeId)) continue;
    if(seen.has(operation.nodeId)) continue;
    seen.add(operation.nodeId);

    const node=project.nodes.find(item=>item.id===operation.nodeId);
    if(!node) throw new Error(`world_forge_change_set_node_missing:${operation.nodeId}`);
    preconditions.push({
      kind:'node',
      nodeId:node.id,
      state:'present',
      digest:worldForgeNodeDigest(node),
    });
  }

  return preconditions.sort((a,b)=>a.nodeId.localeCompare(b.nodeId));
}

function preconditionConflicts(project:WorldForgeProject,changeSet:WorldForgeChangeSet){
  const conflicts:string[]=[];

  for(const precondition of changeSet.preconditions){
    const node=project.nodes.find(item=>item.id===precondition.nodeId);
    if(precondition.state==='absent'){
      if(node) conflicts.push(`node_expected_absent:${precondition.nodeId}`);
      continue;
    }

    if(!node){
      conflicts.push(`node_expected_present:${precondition.nodeId}`);
      continue;
    }

    const actual=worldForgeNodeDigest(node);
    if(actual!==precondition.digest){
      conflicts.push(`node_changed:${precondition.nodeId}:expected=${precondition.digest}:actual=${actual}`);
    }
  }

  return conflicts;
}

function contractError(changeSet:WorldForgeChangeSet){
  if(changeSet.schema!=='evercraft.fallen.world-forge-change-set.v2'){
    return 'change_set_schema_invalid';
  }
  if(changeSet.digest!==worldForgeChangeSetDigest(changeSet)){
    return 'change_set_digest_invalid';
  }
  if(!changeSet.operations.length) return 'change_set_operations_missing';
  if(changeSet.operations.length>100) return 'change_set_operation_limit';
  return null;
}

export function createWorldForgeChangeSet(input:{
  project:WorldForgeProject;
  id:string;
  title:string;
  author:{kind:'human'|'agent'|'system';id:string};
  operations:WorldForgeOperation[];
  destructiveAuthority?:boolean;
}):WorldForgeChangeSet{
  if(!input.id.trim()) throw new Error('world_forge_change_set_id_missing');
  if(!input.title.trim()) throw new Error('world_forge_change_set_title_missing');
  if(!input.author.id.trim()) throw new Error('world_forge_change_set_author_missing');
  if(!input.operations.length) throw new Error('world_forge_change_set_operations_missing');
  if(input.operations.length>100) throw new Error('world_forge_change_set_operation_limit');

  const createdAt=new Date().toISOString();
  const draft:Omit<WorldForgeChangeSet,'digest'>={
    schema:'evercraft.fallen.world-forge-change-set.v2',
    id:input.id.trim(),
    title:input.title.trim(),
    projectId:input.project.id,
    baseVersion:input.project.version,
    baseDigest:worldForgeDigest(input.project),
    author:{
      kind:input.author.kind,
      id:input.author.id.trim(),
    },
    authority:{
      destructive:input.destructiveAuthority===true,
      publication:false,
    },
    operations:JSON.parse(JSON.stringify(input.operations)) as WorldForgeOperation[],
    preconditions:buildPreconditions(input.project,input.operations),
    createdAt,
  };

  return {
    ...draft,
    digest:worldForgeChangeSetDigest(draft),
  };
}

export function rebaseWorldForgeChangeSet(input:{
  project:WorldForgeProject;
  changeSet:WorldForgeChangeSet;
}):WorldForgeChangeSetRebaseResult{
  const currentDigest=worldForgeDigest(input.project);
  const base={
    schema:'evercraft.fallen.world-forge-change-set-rebase-result.v1' as const,
    projectId:input.project.id,
    originalChangeSetDigest:input.changeSet.digest,
    currentVersion:input.project.version,
    currentDigest,
    conflicts:[] as string[],
    boundaries:{
      touchedResourcesMustBeUnchanged:true as const,
      destructiveAuthorityPreserved:true as const,
      publicationAuthorityGranted:false as const,
    },
  };

  const invalid=contractError(input.changeSet);
  if(invalid) return {...base,status:'blocked',reason:invalid};

  if(input.changeSet.projectId!==input.project.id){
    return {
      ...base,
      status:'blocked',
      reason:`change_set_project_conflict:expected=${input.changeSet.projectId}:actual=${input.project.id}`,
    };
  }

  if(
    input.changeSet.baseVersion===input.project.version &&
    input.changeSet.baseDigest===currentDigest
  ){
    return {...base,status:'unchanged',changeSet:input.changeSet};
  }

  const conflicts=preconditionConflicts(input.project,input.changeSet);
  if(conflicts.length){
    return {
      ...base,
      status:'blocked',
      conflicts,
      reason:'change_set_resource_conflict',
    };
  }

  const cloned=JSON.parse(JSON.stringify(input.changeSet)) as WorldForgeChangeSet;
  const {digest:_previousDigest,...withoutDigest}=cloned;
  const rebasedDraft:Omit<WorldForgeChangeSet,'digest'>={
    ...withoutDigest,
    baseVersion:input.project.version,
    baseDigest:currentDigest,
    preconditions:buildPreconditions(input.project,input.changeSet.operations),
    lineage:{
      parentChangeSetDigest:input.changeSet.digest,
      rebasedFromVersion:input.changeSet.baseVersion,
      rebasedFromWorldDigest:input.changeSet.baseDigest,
      rebasedAt:new Date().toISOString(),
    },
  };

  const rebased:WorldForgeChangeSet={
    ...rebasedDraft,
    digest:worldForgeChangeSetDigest(rebasedDraft),
  };

  return {
    ...base,
    status:'rebased',
    changeSet:rebased,
  };
}

export function applyWorldForgeChangeSet(input:{
  project:WorldForgeProject;
  changeSet:WorldForgeChangeSet;
}):WorldForgeChangeSetApplyResult{
  const currentDigest=worldForgeDigest(input.project);
  const base={
    schema:'evercraft.fallen.world-forge-change-set-apply-result.v2' as const,
    changeSetId:input.changeSet.id,
    changeSetDigest:input.changeSet.digest,
    projectId:input.project.id,
    baseVersion:input.changeSet.baseVersion,
    baseDigest:input.changeSet.baseDigest,
    currentVersion:input.project.version,
    currentDigest,
    boundaries:{
      atomic:true as const,
      staleDigestRejected:true as const,
      resourcePreconditionsVerified:true as const,
      destructiveAuthorityExplicit:true as const,
      publicationAuthorityGranted:false as const,
    },
  };

  const invalid=contractError(input.changeSet);
  if(invalid) return {...base,status:'blocked',reason:invalid};

  if(input.changeSet.projectId!==input.project.id){
    return {...base,status:'blocked',reason:`change_set_project_conflict:expected=${input.changeSet.projectId}:actual=${input.project.id}`};
  }

  if(input.changeSet.baseVersion!==input.project.version){
    return {...base,status:'blocked',reason:`change_set_version_conflict:expected=${input.changeSet.baseVersion}:actual=${input.project.version}`};
  }

  if(input.changeSet.baseDigest!==currentDigest){
    return {...base,status:'blocked',reason:`change_set_digest_conflict:expected=${input.changeSet.baseDigest}:actual=${currentDigest}`};
  }

  const conflicts=preconditionConflicts(input.project,input.changeSet);
  if(conflicts.length){
    return {
      ...base,
      status:'blocked',
      conflicts,
      reason:'change_set_resource_conflict',
    };
  }

  const destructive=input.changeSet.operations.some(requiresDestructiveAuthority);
  if(destructive&&input.changeSet.authority.destructive!==true){
    return {...base,status:'blocked',reason:'change_set_destructive_authority_required'};
  }

  const mutation=applyWorldForgeOperations({
    project:input.project,
    operations:input.changeSet.operations,
    expectedVersion:input.changeSet.baseVersion,
  });

  if(mutation.status!=='completed'){
    return {
      ...base,
      status:'blocked',
      reason:mutation.receipt.rejectedOperations[0]?.reason??'change_set_mutation_blocked',
      mutation,
    };
  }

  return {
    ...base,
    status:'applied',
    currentVersion:mutation.project.version,
    currentDigest:mutation.validation.digest,
    mutation,
  };
}
