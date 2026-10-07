import crypto from 'node:crypto';

import {
  applyWorldForgeOperations,
  worldForgeDigest,
  type WorldForgeMutationResult,
  type WorldForgeOperation,
  type WorldForgeProject,
} from './world-forge.js';

export interface WorldForgeChangeSet {
  schema:'evercraft.fallen.world-forge-change-set.v1';
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
  createdAt:string;
  digest:string;
}

export interface WorldForgeChangeSetApplyResult {
  schema:'evercraft.fallen.world-forge-change-set-apply-result.v1';
  status:'applied'|'blocked';
  changeSetId:string;
  changeSetDigest:string;
  projectId:string;
  baseVersion:number;
  baseDigest:string;
  currentVersion:number;
  currentDigest:string;
  reason?:string;
  mutation?:WorldForgeMutationResult;
  boundaries:{
    atomic:true;
    staleDigestRejected:true;
    destructiveAuthorityExplicit:true;
    publicationAuthorityGranted:false;
  };
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .filter(([key])=>key!=='digest'&&key!=='createdAt')
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

export function worldForgeChangeSetDigest(changeSet:Omit<WorldForgeChangeSet,'digest'>|WorldForgeChangeSet){
  return crypto.createHash('sha256').update(JSON.stringify(stable(changeSet))).digest('hex');
}

function requiresDestructiveAuthority(operation:WorldForgeOperation){
  if(operation.type==='remove_node') return operation.allowDestructive===true;
  if(operation.type==='set_geometry') return operation.allowDestructive===true;
  return false;
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
    schema:'evercraft.fallen.world-forge-change-set.v1',
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
    createdAt,
  };

  return {
    ...draft,
    digest:worldForgeChangeSetDigest(draft),
  };
}

export function applyWorldForgeChangeSet(input:{
  project:WorldForgeProject;
  changeSet:WorldForgeChangeSet;
}):WorldForgeChangeSetApplyResult{
  const currentDigest=worldForgeDigest(input.project);
  const base={
    schema:'evercraft.fallen.world-forge-change-set-apply-result.v1' as const,
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
      destructiveAuthorityExplicit:true as const,
      publicationAuthorityGranted:false as const,
    },
  };

  if(input.changeSet.schema!=='evercraft.fallen.world-forge-change-set.v1'){
    return {...base,status:'blocked',reason:'change_set_schema_invalid'};
  }

  const expectedDigest=worldForgeChangeSetDigest(input.changeSet);
  if(input.changeSet.digest!==expectedDigest){
    return {...base,status:'blocked',reason:'change_set_digest_invalid'};
  }

  if(input.changeSet.projectId!==input.project.id){
    return {...base,status:'blocked',reason:`change_set_project_conflict:expected=${input.changeSet.projectId}:actual=${input.project.id}`};
  }

  if(input.changeSet.baseVersion!==input.project.version){
    return {...base,status:'blocked',reason:`change_set_version_conflict:expected=${input.changeSet.baseVersion}:actual=${input.project.version}`};
  }

  if(input.changeSet.baseDigest!==currentDigest){
    return {...base,status:'blocked',reason:`change_set_digest_conflict:expected=${input.changeSet.baseDigest}:actual=${currentDigest}`};
  }

  if(!input.changeSet.operations.length){
    return {...base,status:'blocked',reason:'change_set_operations_missing'};
  }

  if(input.changeSet.operations.length>100){
    return {...base,status:'blocked',reason:'change_set_operation_limit'};
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
