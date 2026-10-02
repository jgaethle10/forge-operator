import crypto from 'node:crypto';
import type { VisualModelEndpoint } from './model-fabric.js';
import type { VisualModelAdapter } from './model-fabric-runtime.js';

export interface VisualRuntimeInventoryInput {
  schema:'evercraft.fallen.visual-runtime-inventory-input.v1';
  id:string;
  endpoints:VisualModelEndpoint[];
  adapters:VisualModelAdapter[];
  sourceRefs:string[];
}

export interface VisualRuntimeInventoryRow {
  modelId:string;
  providerId:string;
  endpointState:'verified'|'declared'|'missing';
  adapterState:'verified'|'unverified'|'missing';
  status:'executable'|'blocked';
  reasons:string[];
  tasks:string[];
}

export interface VisualRuntimeInventory {
  schema:'evercraft.fallen.visual-runtime-inventory.v1';
  id:string;
  rows:VisualRuntimeInventoryRow[];
  executableModelIds:string[];
  blockedModelIds:string[];
  orphanAdapterIds:string[];
  sourceRefs:string[];
  inventoryDigest:string;
  boundaries:{
    adapterInstanceRequired:true;
    endpointAndAdapterModelBindingRequired:true;
    endpointAndAdapterProviderBindingRequired:true;
    secretsNotSerialized:true;
    noProviderCallExecuted:true;
    paidGenerationAuthorityGranted:false;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function buildVisualRuntimeInventory(
  input:VisualRuntimeInventoryInput,
):VisualRuntimeInventory{
  if(input.schema!=='evercraft.fallen.visual-runtime-inventory-input.v1'){
    throw new Error('visual_runtime_inventory_schema_invalid');
  }
  if(!input.id?.trim()) throw new Error('visual_runtime_inventory_id_missing');
  if(!input.sourceRefs?.length) throw new Error('visual_runtime_inventory_source_refs_missing');

  const endpointById=new Map<string,VisualModelEndpoint>();
  for(const endpoint of input.endpoints){
    if(endpointById.has(endpoint.id)){
      throw new Error('visual_runtime_inventory_duplicate_endpoint:'+endpoint.id);
    }
    endpointById.set(endpoint.id,endpoint);
  }

  const adapterByModel=new Map<string,VisualModelAdapter>();
  const duplicateAdapters=new Set<string>();
  for(const adapter of input.adapters){
    if(adapterByModel.has(adapter.modelId)){
      duplicateAdapters.add(adapter.modelId);
      continue;
    }
    adapterByModel.set(adapter.modelId,adapter);
  }

  const rows:VisualRuntimeInventoryRow[]=[];
  for(const endpoint of [...input.endpoints].sort((a,b)=>a.id.localeCompare(b.id))){
    const reasons:string[]=[];
    const adapter=adapterByModel.get(endpoint.id);

    if(!endpoint.enabled) reasons.push('endpoint_disabled');
    if(endpoint.executionState!=='verified') reasons.push('endpoint_not_verified');
    if(duplicateAdapters.has(endpoint.id)) reasons.push('duplicate_adapter_for_model');
    if(!adapter) reasons.push('adapter_missing');
    else{
      if(!adapter.verified) reasons.push('adapter_not_verified');
      if(adapter.modelId!==endpoint.id) reasons.push('adapter_model_binding_mismatch');
      if(adapter.providerId!==endpoint.providerId) reasons.push('adapter_provider_binding_mismatch');
    }

    rows.push({
      modelId:endpoint.id,
      providerId:endpoint.providerId,
      endpointState:endpoint.executionState,
      adapterState:adapter?(adapter.verified?'verified':'unverified'):'missing',
      status:reasons.length?'blocked':'executable',
      reasons:[...new Set(reasons)],
      tasks:[...new Set(endpoint.capabilities.map(capability=>capability.task))].sort(),
    });
  }

  const orphanAdapterIds=input.adapters
    .filter(adapter=>!endpointById.has(adapter.modelId))
    .map(adapter=>adapter.id)
    .sort();

  const executableModelIds=rows
    .filter(row=>row.status==='executable')
    .map(row=>row.modelId)
    .sort();
  const blockedModelIds=rows
    .filter(row=>row.status==='blocked')
    .map(row=>row.modelId)
    .sort();

  const core={
    id:input.id,
    rows,
    executableModelIds,
    blockedModelIds,
    orphanAdapterIds,
    sourceRefs:[...new Set(input.sourceRefs)].sort(),
  };

  return {
    schema:'evercraft.fallen.visual-runtime-inventory.v1',
    ...core,
    inventoryDigest:digest(core),
    boundaries:{
      adapterInstanceRequired:true,
      endpointAndAdapterModelBindingRequired:true,
      endpointAndAdapterProviderBindingRequired:true,
      secretsNotSerialized:true,
      noProviderCallExecuted:true,
      paidGenerationAuthorityGranted:false,
      publicationAuthorityGranted:false,
    },
    createdAt:new Date().toISOString(),
  };
}
