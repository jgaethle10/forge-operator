import crypto from 'node:crypto';
import type {
  VisualModelJob,
  VisualModelPlan,
} from './model-fabric.js';

export interface VisualExecutionArtifact {
  path:string;
  digest:string;
  mimeType:string;
  width?:number;
  height?:number;
  durationSec?:number;
}

export interface VisualExecutionReceipt {
  schema:'evercraft.fallen.visual-execution-receipt.v1';
  jobId:string;
  requestId:string;
  needId:string;
  modelId:string;
  providerId:string;
  providerRequestId?:string;
  artifact:VisualExecutionArtifact;
  commercialRights:'allowed'|'unknown'|'denied';
  provenance:'complete'|'missing';
  continuityDigest:string;
  sourceRefs:string[];
  generatedAt:string;
}

export interface VisualModelAdapter {
  id:string;
  modelId:string;
  providerId:string;
  verified:boolean;
  execute(job:VisualModelJob):Promise<VisualExecutionReceipt>;
}

export interface VisualExecutionResult {
  schema:'evercraft.fallen.visual-model-execution.v1';
  requestId:string;
  status:'completed'|'partial'|'blocked';
  completed:VisualExecutionReceipt[];
  failed:Array<{jobId:string;modelId:string;error:string}>;
  executionDigest:string;
  boundaries:{
    verifiedAdaptersOnly:true;
    planModelBindingEnforced:true;
    receiptArtifactDigestRequired:true;
    failedCandidatesDoNotBecomeAssets:true;
    publicationAuthorityGranted:false;
  };
  completedAt:string;
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

function sha(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function validateReceipt(job:VisualModelJob,receipt:VisualExecutionReceipt){
  if(receipt.schema!=='evercraft.fallen.visual-execution-receipt.v1') throw new Error('visual_execution_receipt_schema_invalid');
  if(receipt.jobId!==job.id) throw new Error('visual_execution_job_id_mismatch');
  if(receipt.requestId!==job.requestId) throw new Error('visual_execution_request_id_mismatch');
  if(receipt.needId!==job.needId) throw new Error('visual_execution_need_id_mismatch');
  if(receipt.modelId!==job.modelId) throw new Error('visual_execution_model_id_mismatch');
  if(receipt.providerId!==job.providerId) throw new Error('visual_execution_provider_id_mismatch');
  if(receipt.continuityDigest!==job.continuityDigest) throw new Error('visual_execution_continuity_digest_mismatch');
  if(!receipt.artifact?.path?.trim()) throw new Error('visual_execution_artifact_path_missing');
  if(!/^[a-f0-9]{64}$/i.test(receipt.artifact?.digest??'')) throw new Error('visual_execution_artifact_digest_invalid');
  if(job.outputContract.commercialRightsRequired&&receipt.commercialRights!=='allowed'){
    throw new Error('visual_execution_commercial_rights_not_allowed');
  }
  if(job.outputContract.provenanceRequired&&receipt.provenance!=='complete'){
    throw new Error('visual_execution_provenance_missing');
  }
  if(!receipt.sourceRefs?.length) throw new Error('visual_execution_source_refs_missing');
}

export async function executeVisualModelPlan(
  plan:VisualModelPlan,
  adapters:VisualModelAdapter[],
):Promise<VisualExecutionResult>{
  if(plan.schema!=='evercraft.fallen.visual-model-plan.v1') throw new Error('visual_execution_plan_schema_invalid');
  if(plan.status!=='routed'||!plan.jobs.length){
    return {
      schema:'evercraft.fallen.visual-model-execution.v1',
      requestId:plan.requestId,
      status:'blocked',
      completed:[],
      failed:[],
      executionDigest:sha({requestId:plan.requestId,status:'blocked'}),
      boundaries:{
        verifiedAdaptersOnly:true,
        planModelBindingEnforced:true,
        receiptArtifactDigestRequired:true,
        failedCandidatesDoNotBecomeAssets:true,
        publicationAuthorityGranted:false,
      },
      completedAt:new Date().toISOString(),
    };
  }

  const adapterByModel=new Map<string,VisualModelAdapter>();
  for(const adapter of adapters){
    if(!adapter.verified) continue;
    if(adapterByModel.has(adapter.modelId)) throw new Error(`visual_execution_duplicate_adapter:${adapter.modelId}`);
    adapterByModel.set(adapter.modelId,adapter);
  }

  const settled=await Promise.all(plan.jobs.map(async job=>{
    const adapter=adapterByModel.get(job.modelId);
    if(!adapter){
      return {ok:false as const,job,error:'verified_adapter_missing'};
    }
    if(adapter.modelId!==job.modelId||adapter.providerId!==job.providerId){
      return {ok:false as const,job,error:'adapter_binding_mismatch'};
    }
    try{
      const receipt=await adapter.execute(job);
      validateReceipt(job,receipt);
      return {ok:true as const,job,receipt};
    }catch(error){
      return {
        ok:false as const,
        job,
        error:error instanceof Error?error.message:String(error),
      };
    }
  }));

  const completed=settled.filter(item=>item.ok).map(item=>item.receipt).sort((a,b)=>a.jobId.localeCompare(b.jobId));
  const failed=settled.filter(item=>!item.ok).map(item=>({
    jobId:item.job.id,
    modelId:item.job.modelId,
    error:item.error,
  })).sort((a,b)=>a.jobId.localeCompare(b.jobId));

  const status:VisualExecutionResult['status']=completed.length===plan.jobs.length
    ? 'completed'
    : completed.length
      ? 'partial'
      : 'blocked';

  const core={requestId:plan.requestId,status,completed,failed};

  return {
    schema:'evercraft.fallen.visual-model-execution.v1',
    ...core,
    executionDigest:sha(core),
    boundaries:{
      verifiedAdaptersOnly:true,
      planModelBindingEnforced:true,
      receiptArtifactDigestRequired:true,
      failedCandidatesDoNotBecomeAssets:true,
      publicationAuthorityGranted:false,
    },
    completedAt:new Date().toISOString(),
  };
}
