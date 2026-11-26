// GEMS handoff decision. No network, no job execution, no authority minting.
// A trusted private gateway must provide the REAL EvercraftExecutionGate
// instance and independently server-verified identity context.
// A plain client-supplied JSON "started" object is NOT an authorization.
import {createHash} from 'node:crypto';
import {preflightGemsMission} from './private-research-preflight.mjs';
import {readStagedGemsJob} from './research-job-ledger.mjs';

const SHA=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const hold=reason=>Object.freeze({schema:'evercraft.gems.lease-handoff-decision.v1',
  state:'held',reason,dispatch_allowed:false,worker_invoked:false});

function verifyGateReceipt(lease){
  if(!lease||typeof lease!=='object'||Array.isArray(lease))return false;
  if(typeof lease.receipt_hash!=='string')return false;
  const {receipt_hash,...body}=lease;
  return SHA(JSON.stringify(body))===receipt_hash;
}

/**
 * Decides if the PRIVATE gateway may hand off a GEMS mission.
 * This check does not call worker.execute. The caller must use the trusted
 * Execution Gate state store and an isolated registered adapter.
 */
export function evaluateGemsWorkerHandoff({request,verifiedContext,rootDir,
  executionGate,leaseId}={}){
  const policy=preflightGemsMission(request,verifiedContext);
  if(policy.state!=='policy_preflight_pass')return hold('policy_'+policy.reason);
  const staged=readStagedGemsJob({rootDir,missionId:request.mission_id});
  if(staged.state!=='staged_not_dispatched')return hold('staged_request_missing_or_unsafe');
  if(staged.request_fingerprint_sha256!==policy.request_fingerprint_sha256)
    return hold('staged_fingerprint_mismatch');
  if(typeof leaseId!=='string'||!/^lease_[a-zA-Z0-9-]{12,80}$/.test(leaseId))
    return hold('lease_id_invalid');
  if(!executionGate||typeof executionGate.getLease!=='function')
    return hold('trusted_execution_gate_required');
  let lease;
  try{lease=executionGate.getLease(leaseId);}catch{return hold('execution_gate_unavailable')}
  if(!verifyGateReceipt(lease))return hold('execution_gate_receipt_invalid');
  if(lease.state!=='started'||lease.dispatch_allowed!==true||
    !lease.permit_consumption_receipt||lease.dispatch_performed!==false)
    return hold('execution_gate_lease_not_started');
  if(lease.route_mode!=='registered_internal'||
    lease.specialist_slug!=='gems-research-worker-v1'||
    lease.passport_product!=='systemia-gems-research'||
    lease.scope!=='gems.research.execute')
    return hold('execution_gate_route_or_scope_mismatch');
  if(lease.actor_ref!==verifiedContext.principal_id||
    lease.resource_ref!==request.dataset_ref||
    lease.request_fingerprint!=='sha256:'+policy.request_fingerprint_sha256)
    return hold('execution_gate_identity_or_request_mismatch');
  if(lease.meter&&lease.meter.quantity>0&&!lease.meter_commit_receipt)
    return hold('execution_gate_meter_not_committed');
  // Passing this decision is STILL not a dispatch or a replay-safe lease
  // consumption. An atomic one-use work claim and registered isolated worker
  // adapter must be constructed before invoking the worker.
  return Object.freeze({schema:'evercraft.gems.lease-handoff-decision.v1',
    state:'lease_binding_verified',mission_id:policy.mission_id,
    lease_id:leaseId,worker_route:'gems-research-worker-v1',
    request_fingerprint_sha256:policy.request_fingerprint_sha256,
    dispatch_allowed:false,worker_invoked:false,
    requires_atomic_single_use_claim:true,
    requires_registered_isolated_worker:true,
    execution_authority_from_this_decision:false});
}
