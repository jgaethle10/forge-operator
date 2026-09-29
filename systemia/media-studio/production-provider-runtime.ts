import crypto from 'node:crypto';
import { admitProductionResult } from './production-runtime.js';
import type { ProductionRoute } from './departments.js';
import type {
  ProductionAdmission,
  ProductionArtifact,
  ProductionNeed,
  ProductionReceipt,
} from './types.js';

export interface ProductionProviderResult {
  artifact:ProductionArtifact;
  receipt:ProductionReceipt;
  sourceRefs:string[];
}

export interface ProductionProviderAdapter {
  id:string;
  departmentId:string;
  verified:boolean;
  supports:Array<ProductionNeed['kind']>;
  execute(need:ProductionNeed):Promise<ProductionProviderResult>;
}

export interface ProductionExecutionItem {
  needId:string;
  status:'completed'|'failed'|'blocked';
  departmentId?:string;
  artifact?:ProductionArtifact;
  receipt?:ProductionReceipt;
  sourceRefs?:string[];
  admission?:ProductionAdmission;
  error?:string;
}

export interface ProductionExecutionResult {
  schema:'evercraft.fallen.production-provider-execution.v1';
  status:'completed'|'partial'|'blocked';
  items:ProductionExecutionItem[];
  executionDigest:string;
  boundaries:{
    verifiedAdaptersOnly:true;
    routedDepartmentBindingEnforced:true;
    productionAdmissionEnforced:true;
    failedOutputsNeverAdvance:true;
    publicationAuthorityGranted:false;
  };
  completedAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>[key,stable(item)]));
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export async function executeProductionRoutes(input:{
  needs:ProductionNeed[];
  routes:ProductionRoute[];
  adapters:ProductionProviderAdapter[];
}):Promise<ProductionExecutionResult>{
  const routeByNeed=new Map(input.routes.map(route=>[route.needId,route] as const));
  const adapterByDepartment=new Map<string,ProductionProviderAdapter>();

  for(const adapter of input.adapters){
    if(!adapter.verified) continue;
    if(adapterByDepartment.has(adapter.departmentId)){
      throw new Error('production_execution_duplicate_adapter:'+adapter.departmentId);
    }
    adapterByDepartment.set(adapter.departmentId,adapter);
  }

  const settled=await Promise.all(input.needs.map(async need=>{
    const route=routeByNeed.get(need.id);
    if(!route||route.status!=='routed'||!route.departmentId){
      return {
        needId:need.id,
        status:'blocked' as const,
        error:'production_route_missing_or_blocked',
      };
    }
    const adapter=adapterByDepartment.get(route.departmentId);
    if(!adapter){
      return {
        needId:need.id,
        status:'blocked' as const,
        departmentId:route.departmentId,
        error:'verified_production_adapter_missing',
      };
    }
    if(adapter.departmentId!==route.departmentId){
      return {
        needId:need.id,
        status:'blocked' as const,
        departmentId:route.departmentId,
        error:'production_adapter_department_mismatch',
      };
    }
    if(!adapter.supports.includes(need.kind)){
      return {
        needId:need.id,
        status:'blocked' as const,
        departmentId:route.departmentId,
        error:'production_adapter_kind_unsupported',
      };
    }

    try{
      const produced=await adapter.execute(need);
      if(!produced.sourceRefs?.length) throw new Error('production_provider_source_refs_missing');
      const admission=admitProductionResult({
        need,
        route,
        artifact:produced.artifact,
        receipt:produced.receipt,
      });
      if(admission.status!=='accepted'){
        return {
          needId:need.id,
          status:'failed' as const,
          departmentId:route.departmentId,
          artifact:produced.artifact,
          receipt:produced.receipt,
          sourceRefs:produced.sourceRefs,
          admission,
          error:'production_admission_rejected:'+admission.reasons.join('|'),
        };
      }
      return {
        needId:need.id,
        status:'completed' as const,
        departmentId:route.departmentId,
        artifact:produced.artifact,
        receipt:produced.receipt,
        sourceRefs:produced.sourceRefs,
        admission,
      };
    }catch(error){
      return {
        needId:need.id,
        status:'failed' as const,
        departmentId:route.departmentId,
        error:error instanceof Error?error.message:String(error),
      };
    }
  }));

  const completed=settled.filter(item=>item.status==='completed').length;
  const status:ProductionExecutionResult['status']=
    completed===input.needs.length?'completed':
    completed>0?'partial':
    'blocked';
  const core={status,items:settled};

  return {
    schema:'evercraft.fallen.production-provider-execution.v1',
    ...core,
    executionDigest:digest(core),
    boundaries:{
      verifiedAdaptersOnly:true,
      routedDepartmentBindingEnforced:true,
      productionAdmissionEnforced:true,
      failedOutputsNeverAdvance:true,
      publicationAuthorityGranted:false,
    },
    completedAt:new Date().toISOString(),
  };
}
