// Pure admission-policy preflight for a future PRIVATE Systemia GEMS research
// gateway. Does not authenticate, mint Passport leases, run jobs, or contact nodes.
// A real server must independently authenticate the caller and verify these
// policy inputs before invoking this function. This module is not an endpoint.
import {createHash} from 'node:crypto';

const REQUEST_KEYS=new Set(['schema','mission_id','workload','dataset_ref','compute','requested_at']);
const CONTEXT_KEYS=new Set(['principal_id','tenant_id','authenticated_by','passport_scope','grant_verified','approved_dataset_refs']);
const COMPUTE_KEYS=new Set(['runner_class','max_runtime_seconds','max_memory_mb','max_paid_usd']);
const WORKLOADS=new Set(['negative-sampling-ablation','spatial-validation','geology-evidence-review']);
const RUNNERS=new Set(['isolated-free-ci','isolated-owned-research']);
const ID=/^gems-[a-z0-9-]{12,56}$/;
const DATASET=/^gems-data-[a-z0-9-]{8,60}$/;
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).every(k=>keys.has(k));
const fail=reason=>Object.freeze({schema:'evercraft.gems.private-admission-preflight.v1',
  state:'hold',reason,dispatch_authorized:false,execution_authority_granted:false,
  passport_lease_issued:false,private_node_access_granted:false});

export function preflightGemsMission(request,verifiedContext){
  if(!exact(request,REQUEST_KEYS))return fail('request_fields_invalid');
  if(request.schema!=='evercraft.gems.private-research-request.v1')return fail('request_schema_invalid');
  if(typeof request.mission_id!=='string'||!ID.test(request.mission_id))return fail('mission_id_invalid');
  if(!WORKLOADS.has(request.workload))return fail('workload_not_allowlisted');
  if(typeof request.dataset_ref!=='string'||!DATASET.test(request.dataset_ref))return fail('dataset_ref_invalid');
  if(typeof request.requested_at!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(request.requested_at)||
    !Number.isFinite(Date.parse(request.requested_at)))return fail('timestamp_invalid');
  if(!exact(request.compute,COMPUTE_KEYS))return fail('compute_fields_invalid');
  if(!RUNNERS.has(request.compute.runner_class))return fail('runner_not_allowlisted');
  if(!Number.isSafeInteger(request.compute.max_runtime_seconds)||
    request.compute.max_runtime_seconds<1||request.compute.max_runtime_seconds>900)
    return fail('runtime_budget_invalid');
  if(!Number.isSafeInteger(request.compute.max_memory_mb)||
    request.compute.max_memory_mb<128||request.compute.max_memory_mb>2048)
    return fail('memory_budget_invalid');
  if(request.compute.max_paid_usd!==0)return fail('paid_compute_denied');
  if(!exact(verifiedContext,CONTEXT_KEYS))return fail('verified_context_missing_or_invalid');
  if(verifiedContext.authenticated_by!=='server-verified-identity'||
    verifiedContext.grant_verified!==true||
    verifiedContext.passport_scope!=='gems:research-preflight')
    return fail('verified_passport_grant_required');
  if(typeof verifiedContext.principal_id!=='string'||!/^usr_[a-z0-9-]{8,64}$/.test(verifiedContext.principal_id)||
    typeof verifiedContext.tenant_id!=='string'||!/^tenant_[a-z0-9-]{8,64}$/.test(verifiedContext.tenant_id))
    return fail('principal_binding_invalid');
  if(!Array.isArray(verifiedContext.approved_dataset_refs)||
    verifiedContext.approved_dataset_refs.length>20||
    !verifiedContext.approved_dataset_refs.includes(request.dataset_ref))
    return fail('dataset_not_authorized');
  const fingerprint=createHash('sha256').update(JSON.stringify({
    mission_id:request.mission_id,workload:request.workload,dataset_ref:request.dataset_ref,
    compute:request.compute,principal_id:verifiedContext.principal_id,tenant_id:verifiedContext.tenant_id
  })).digest('hex');
  // This is a policy preflight only. A separate identity middleware,
  // Passport lease issuer, nonce store, durable scheduler and isolated runner
  // must verify and authorize a real mission.
  return Object.freeze({schema:'evercraft.gems.private-admission-preflight.v1',
    state:'policy_preflight_pass',mission_id:request.mission_id,
    workload:request.workload,runner_class:request.compute.runner_class,
    request_fingerprint_sha256:fingerprint,
    dispatch_authorized:false,execution_authority_granted:false,
    passport_lease_issued:false,private_node_access_granted:false,
    next_gate:'verified_authenticated_gateway_and_durable_execution_lease'});
}
