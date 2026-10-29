/**
 * Native read-only Passport + Execution Gate adapter for Raven's commissioned
 * worker receiver. Requires a separately owned mission/worker binding source
 * and an independently authenticated worker enrollment observer. It neither
 * issues grants nor starts leases, workers, inference providers or processes.
 *
 * A signed preflight's receipt refs are ONLY lookup candidates. The current
 * authoritative records and their exact request/actor/resource constraints
 * must be re-read and checked for this particular dispatch.
 */
const s=(v)=>String(v??"").trim();
const validSha=(v)=>/^sha256:[a-f0-9]{64}$/.test(s(v));
function held(reason){return {allowed:false,passport_verified:false,execution_gate_verified:false,worker_enrollment_verified:false,reason};}
function eq(a,b){return s(a)!==""&&s(a)===s(b);}
function recent(iso,now,maxAgeMs){
  const t=Date.parse(iso||""); const n=now instanceof Date?now.getTime():Date.parse(now);
  return Number.isFinite(t)&&Number.isFinite(n)&&t<=n&&n-t<=maxAgeMs;
}

export function createOwnedCommissionedLeaseVerifier({
  passport,
  executionGate,
  resolveBinding,
  verifyWorkerEnrollment,
  now=()=>new Date(),
  maxAgeMs=15*60_000,
}={}){
  return async function authorizeLease({
    request, reviewerId, agentId, preflightEnvelope,
    passportReceiptRef, executionGateReceiptRef,
    inferenceRequestId, inputSha256,
  }={}){
    if(typeof passport?.getActionPermitState!=="function"||
       typeof passport?.authorize!=="function"||
       typeof executionGate?.getLease!=="function"||
       typeof resolveBinding!=="function"||
       typeof verifyWorkerEnrollment!=="function"||
       !Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0)
      return held("commissioned_owned_lease_authorities_unavailable");
    const clock=now();
    const p=preflightEnvelope?.payload;
    if(!s(request?.request_id)||!s(request?.mission_key)||!s(request?.work_key)||
       !s(agentId)||!s(reviewerId)||
       !eq(inferenceRequestId,request.request_id+":"+reviewerId)||
       !validSha(inputSha256)||
       !eq(p?.request_id,request.request_id)||
       !eq(p?.mission_key,request.mission_key)||
       !eq(p?.work_key,request.work_key)||
       !eq(p?.reviewer_assignments?.[reviewerId],agentId)||
       !eq(p?.passport_receipt_ref,passportReceiptRef)||
       !eq(p?.execution_gate_receipt_ref,executionGateReceiptRef))
      return held("commissioned_lease_request_identity_mismatch");

    // This lookup MUST derive its record from independent, owner-controlled
    // canonical mission admission, not the HTTP request or inference output.
    let binding;
    try{
      binding=await resolveBinding({request,reviewerId,agentId,inferenceRequestId});
    }catch{return held("commissioned_owned_mission_binding_unavailable");}
    if(!binding||!eq(binding.request_id,request.request_id)||
       !eq(binding.mission_key,request.mission_key)||
       !eq(binding.work_key,request.work_key)||
       !eq(binding.reviewer_id,reviewerId)||
       !eq(binding.agent_id,agentId)||
       !eq(binding.inference_request_id,inferenceRequestId)||
       !eq(binding.input_sha256,inputSha256)||
       !eq(binding.preflight_id,p.preflight_id)||
       !eq(binding.registry_snapshot_hash,p.registry_snapshot_hash)||
       !eq(binding.lease_id,executionGateReceiptRef)||
       !validSha(binding.request_fingerprint)||
       !s(binding.actor_ref)||!s(binding.passport_product)||
       !s(binding.scope)||!s(binding.resource_ref)||
       !s(binding.specialist_slug)||!s(binding.permit_id)||
       binding.route_mode!=="registered_internal")
      return held("commissioned_owned_mission_binding_invalid");

    let lease,permit,decision;
    try{
      lease=await executionGate.getLease(binding.lease_id);
      if(!lease||lease.state!=="started"||
         lease.dispatch_allowed!==true||
         lease.route_mode!=="registered_internal"||
         !eq(lease.lease_id,binding.lease_id)||
         !eq(lease.actor_ref,binding.actor_ref)||
         !eq(lease.passport_product,binding.passport_product)||
         !eq(lease.scope,binding.scope)||
         !eq(lease.resource_ref,binding.resource_ref)||
         !eq(lease.specialist_slug,binding.specialist_slug)||
         !eq(lease.request_fingerprint,binding.request_fingerprint)||
         !eq(lease.permit_id,binding.permit_id)||
         !eq(lease.permit_consumption_receipt,passportReceiptRef)||
         !recent(lease.recorded_at,clock,maxAgeMs))
        return held("commissioned_execution_gate_lease_not_current_or_exact");

      permit=await passport.getActionPermitState(binding.permit_id,{at:clock.toISOString()});
      if(!permit||permit.consumed!==true||
         permit.grant_active!==true||permit.cancelled!==false||
         permit.expired!==false||
         !eq(permit.consumption_receipt,passportReceiptRef)||
         !eq(permit.actor_ref,binding.actor_ref)||
         !eq(permit.product,binding.passport_product)||
         !eq(permit.scope,binding.scope)||
         !eq(permit.resource_ref,binding.resource_ref)||
         !eq(permit.request_fingerprint,binding.request_fingerprint))
        return held("commissioned_passport_permit_not_current_or_exact");

      decision=await passport.authorize({
        subject_ref:binding.actor_ref,product:binding.passport_product,
        scope:binding.scope,resource_ref:binding.resource_ref,
        at:clock.toISOString(),
      });
      if(decision?.decision!=="allow"||
         !eq(decision.grant_id,permit.grant_id)||
         !eq(decision.subject_ref,binding.actor_ref)||
         !eq(decision.product,binding.passport_product)||
         !eq(decision.scope,binding.scope)||
         !eq(decision.resource_ref,binding.resource_ref))
        return held("commissioned_passport_grant_not_current");
    }catch{return held("commissioned_passport_or_execution_gate_lookup_unavailable");}

    let enrolled;
    try{
      enrolled=await verifyWorkerEnrollment({
        request,agentId,reviewerId,binding,lease,passportDecision:decision,
      });
    }catch{return held("commissioned_worker_enrollment_source_unavailable");}
    if(enrolled?.verified!==true||
       !eq(enrolled.agent_id,agentId)||
       !s(enrolled.worker_instance_id)||
       !s(enrolled.source_receipt_ref)||
       !recent(enrolled.observed_at,clock,maxAgeMs))
      return held("commissioned_worker_enrollment_not_independently_verified");
    return {
      allowed:true,
      passport_verified:true,
      execution_gate_verified:true,
      worker_enrollment_verified:true,
      lease_id:binding.lease_id,
      worker_instance_id:enrolled.worker_instance_id,
      worker_enrollment_receipt_ref:enrolled.source_receipt_ref,
      authorization_checked_at:clock.toISOString(),
    };
  };
}
