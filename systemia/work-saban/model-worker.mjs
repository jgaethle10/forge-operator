// Work Saban model-worker admission boundary. This module does not call a model.
// The caller must supply a verified provider adapter; no default or simulated result.
import { createHash, randomUUID } from 'node:crypto';

const digest = value => 'sha256:' + createHash('sha256').update(value,'utf8').digest('hex');
const MAX_TASK_BYTES=8192;
const MAX_OUTPUT_BYTES=32768;

export async function executeApprovedModelWorker({
  task, approval, adapter, workerId='work-saban-model-writer'
}={}) {
  if(typeof task!=='string'||!task.trim()||
      Buffer.byteLength(task,'utf8')>MAX_TASK_BYTES)
    throw new Error('model_task_invalid_or_oversized');
  if(approval?.model_inference_approved!==true||
      approval?.external_network_approved!==true||
      approval?.outbound_actions_approved!==false||
      approval?.source_access_approved!==false)
    throw new Error('model_execution_consent_required');
  if(typeof adapter?.execute!=='function'||typeof adapter?.provider!=='string'||
      !/^[a-z0-9_-]{2,60}$/.test(adapter.provider))
    throw new Error('verified_model_adapter_required');
  if(typeof workerId!=='string'||!/^[a-z0-9-]{3,80}$/.test(workerId))
    throw new Error('invalid_model_worker_id');
  const runId=randomUUID();
  const inputDigest=digest(task);
  // Only the text task is supplied. No files, tokens, tools, or account handles.
  const response=await adapter.execute(Object.freeze({
    task,run_id:runId,worker_id:workerId,
    tool_access:false,source_access:false,outbound_actions:false
  }));
  if(!response||response.provider!==adapter.provider||
      response.model_inference_performed!==true||
      typeof response.output_text!=='string'||!response.output_text.trim()||
      Buffer.byteLength(response.output_text,'utf8')>MAX_OUTPUT_BYTES||
      !Array.isArray(response.external_actions)||response.external_actions.length!==0)
    throw new Error('model_worker_unverified_output');
  if(typeof response.model_id!=='string'||!response.model_id.trim()||
      typeof response.provider_request_id!=='string'||!response.provider_request_id.trim())
    throw new Error('model_worker_provenance_required');
  return Object.freeze({
    schema:'evercraft.work-saban.model-worker-receipt.v1',
    run_id:runId,worker_id:workerId,
    evidence_state:'adapter_reported_model_execution_unattested',
    provider:adapter.provider,model_id:response.model_id,
    provider_request_id:response.provider_request_id,
    input_sha256:inputDigest,output_sha256:digest(response.output_text),
    output_text:response.output_text,
    model_inference:true,source_access:false,tool_access:false,
    external_actions:[],
    independent_provider_attestation:false,
    verified_customer_delivery:false
  });
}
