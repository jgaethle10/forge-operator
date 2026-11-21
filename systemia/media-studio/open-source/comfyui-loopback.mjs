import crypto from 'node:crypto';

// ComfyUI's API is only contacted on an explicitly admitted local node.
// No hosted vendor endpoint, no installed custom-node execution by default.
export function localComfyBase(raw){
  const u=new URL(raw);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||
      u.pathname!=='/'||u.search||u.hash||!(Number(u.port)>0&&Number(u.port)<=65535)){
    throw new Error('comfyui_requires_explicit_loopback_http_endpoint');
  }
  return u.origin;
}

export function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,v])=>[k,canonical(v)]));
  }
  return value;
}
export function digestWorkflow(workflow){
  return crypto.createHash('sha256').update(JSON.stringify(canonical(workflow))).digest('hex');
}

export function validateLocalComfyPlan(input){
  const {endpoint,workflow,workflowSha256,approvedNodeClasses,attestation}=input??{};
  const base=localComfyBase(endpoint);
  if(!workflow||typeof workflow!=='object'||Array.isArray(workflow)||
      !Object.keys(workflow).length||Object.keys(workflow).length>60){
    throw new Error('comfyui_workflow_invalid_or_unbounded');
  }
  if(!Array.isArray(approvedNodeClasses)||approvedNodeClasses.length<1||
      approvedNodeClasses.some(x=>typeof x!=='string'||!x.trim())){
    throw new Error('comfyui_node_class_allowlist_missing');
  }
  for(const [id,node] of Object.entries(workflow)){
    if(!/^\d{1,5}$/.test(id)||!node||typeof node!=='object'||
      !approvedNodeClasses.includes(node.class_type)||!node.inputs||typeof node.inputs!=='object'){
      throw new Error('comfyui_unapproved_workflow_node:'+id);
    }
  }
  const actual=digestWorkflow(workflow);
  if(actual!==workflowSha256)throw new Error('comfyui_workflow_digest_mismatch');
  if(attestation?.nodeVerified!==true||attestation?.hardwareVerified!==true||
     attestation?.modelWeightsVerified!==true||attestation?.workflowRightsApproved!==true||
     attestation?.executionAuthorized!==true){
    throw new Error('comfyui_missing_systemia_execution_attestation');
  }
  return {endpoint:base,workflow,sha256:actual,
    publicationAuthorityGranted:false,
    outputRequiresFallenShotReview:true,
    spendAuthorityGranted:false};
}

export async function queryLocalComfySystem(endpoint,fetchFn=fetch){
  const base=localComfyBase(endpoint);
  const response=await fetchFn(base+'/system_stats',{method:'GET',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('comfyui_loopback_health_failed');
  const stats=await response.json();
  // Response is observation only. A healthy API is NOT sufficient to admit jobs.
  return {schema:'evercraft.fallen.comfyui-observation.v1',reachable:true,
    deviceCount:stats?.devices?.length??0,verified:false,
    publicationAuthorityGranted:false};
}

export async function submitAuthorizedLocalComfyPlan(input,fetchFn=fetch){
  const plan=validateLocalComfyPlan(input);
  const clientId=String(input.clientId??'');
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(clientId))throw new Error('comfyui_client_id_invalid');
  const response=await fetchFn(plan.endpoint+'/prompt',{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(30000),
    body:JSON.stringify({prompt:plan.workflow,client_id:clientId}),
  });
  if(!response.ok)throw new Error('comfyui_queue_submit_failed');
  const body=await response.json();
  if(typeof body.prompt_id!=='string'||!body.prompt_id){
    throw new Error('comfyui_prompt_id_missing');
  }
  // Queued does not mean completed, commercially usable or released.
  return {schema:'evercraft.fallen.comfyui-queue-receipt.v1',
    state:'queued_only',promptId:body.prompt_id,workflowDigest:plan.sha256,
    artifactReceived:false,rightsAndContinuityAdmitted:false,
    publicationAuthorityGranted:false};
}
