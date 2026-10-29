import { verifySignedAgentEvidence } from "../agent-continuity/signed-evidence.mjs";
import { verifyCommissionedRoster } from "../agent-continuity/signed-roster.mjs";
import { verifyCommissionedWorkerExecution } from "../agent-continuity/worker-evidence.mjs";

const str=(v)=>String(v??"").trim();
const norm=(v)=>str(v).toLowerCase();
function reject(reason){return {status:"blocked",blocked_reason:reason,commissioned_worker_verified:false};}

/**
 * First-party receiver contract. Never forwards a commissioned request to
 * the ordinary /v1/infer provider model. No key or evidence may come from
 * the incoming HTTP body. The trusted owned adapters remain separate.
 *
 * The producers for readEvidence, authorizeLease, dispatchWorker and
 * persistWorkerProof do NOT exist merely because this contract exists.
 */
export function createCommissionedWorkerReceiver({
  trustedKeys,
  readEvidence,
  authorizeLease,
  dispatchWorker,
  claimWorkerDispatch,
  persistWorkerProof,
  now=()=>new Date(),
}={}){
  return {
    async execute(body){
      if(body?.schema!=="evercraft.raven.commissioned-inference.request.v1"||
         body?.constraints?.internal_analysis_only!==true||
         body?.constraints?.no_external_actions!==true||
         body?.constraints?.no_credential_return!==true)
        return reject("commissioned_request_schema_or_constraints_invalid");
      const reviewerId=str(body.reviewer_id);
      const agentId=str(body.agent_id);
      const callId=str(body.request_id);
      const suffix=":"+reviewerId;
      if(!reviewerId||!agentId||["juniper","sentinel"].includes(norm(agentId))||
         !callId.endsWith(suffix)||callId.length<=suffix.length||
         !str(body.input)||!str(body.preflight_id)||
         !str(body.registry_snapshot_hash)||
         !str(body.mission_key)||!str(body.work_key))
        return reject("commissioned_assignment_identity_or_scope_invalid");
      if(!trustedKeys?.dispatch_preflight||!trustedKeys?.registry_snapshot||
         !trustedKeys?.worker_execution||typeof readEvidence!=="function"||
         typeof authorizeLease!=="function"||
         typeof dispatchWorker!=="function"||
         typeof claimWorkerDispatch!=="function"||
         typeof persistWorkerProof!=="function")
        return reject("commissioned_owned_receiver_not_configured");
      const rootId=callId.slice(0,-suffix.length);
      const request={
        request_id:rootId,mission_key:body.mission_key,work_key:body.work_key,
      };
      let evidence;
      try{
        evidence=await readEvidence({request,reviewerId,agentId});
      }catch{return reject("commissioned_owned_preflight_or_roster_unavailable");}
      const preflightEnvelope=evidence?.preflightEnvelope;
      const rosterEnvelope=evidence?.rosterEnvelope;
      if(!verifySignedAgentEvidence({
        envelope:preflightEnvelope,kind:"dispatch_preflight",
        trustedKeys,now:now(),
      }))return reject("commissioned_dispatch_preflight_signature_invalid");
      const p=preflightEnvelope.payload||{};
      if(p.request_id!==request.request_id||
         p.mission_key!==request.mission_key||
         p.work_key!==request.work_key||
         p.preflight_id!==body.preflight_id||
         p.registry_snapshot_hash!==body.registry_snapshot_hash||
         p.reviewer_assignments?.[reviewerId]!==agentId||
         !Array.isArray(p.role_ids)||!p.role_ids.includes(agentId)||
         p.juniper?.memory_read!=="passed"||!str(p.juniper?.read_receipt_ref)||
         p.sentinel?.guard!=="passed"||!str(p.sentinel?.guard_receipt_ref)||
         !str(p.passport_receipt_ref)||!str(p.execution_gate_receipt_ref))
        return reject("commissioned_preflight_identity_dna_or_authority_scope_invalid");
      const roster=verifyCommissionedRoster({
        request:{...request,assigned_agents:p.role_ids},
        preflightEvidence:preflightEnvelope,
        rosterEnvelope,trustedKeys,now:now(),
      });
      if(roster?.verified!==true||roster.digest!==body.registry_snapshot_hash)
        return reject(roster?.reason||"commissioned_owned_registry_unverified");
      // The receiver must independently interrogate *active* Passport and
      // Execution Gate leases. Signed references alone do not authorize work.
      let authorized;
      try{
        authorized=await authorizeLease({
          request,reviewerId,agentId,preflightEnvelope,
          rosterEnvelope,passportReceiptRef:p.passport_receipt_ref,
          executionGateReceiptRef:p.execution_gate_receipt_ref,
        });
      }catch{return reject("commissioned_execution_lease_verification_unavailable");}
      if(authorized?.allowed!==true||
         authorized?.passport_verified!==true||
         authorized?.execution_gate_verified!==true||
         authorized?.worker_enrollment_verified!==true)
        return reject("commissioned_execution_lease_or_worker_enrollment_unverified");
      const preflight={
        allowed:true,
        preflight_id:p.preflight_id,
        registry_snapshot_hash:roster.digest,
        reviewer_assignments:p.reviewer_assignments,
      };
      // Claim BEFORE dispatch: replayed requests must never make workers
      // perform duplicate compute, even if proof persistence later fails.
      let claimed=false;
      try{
        claimed=await claimWorkerDispatch({
          request,reviewerId,agentId,preflight,authorization:authorized,
        })===true;
      }catch{/* Durable replay/claim failure must hold. */}
      if(!claimed)return reject("commissioned_worker_dispatch_claim_replayed_or_unavailable");
      let result;
      try{
        result=await dispatchWorker({
          request, reviewerId, agentId, preflight,
          input:body.input, inferenceRequestId:callId,
          authorization:authorized,
        });
      }catch{return reject("commissioned_enrolled_worker_execution_unavailable");}
      const inference=result?.inference;
      const workerResult=verifyCommissionedWorkerExecution({
        request,preflight,reviewerId,inference,
        evidence:result?.workerEvidence,trustedKeys,now:now(),
      });
      if(workerResult.verified!==true)
        return reject(workerResult.reason||"commissioned_worker_execution_unverified");
      // Do not declare completion until independent worker proof is durably
      // persisted for downstream Raven verification / Juniper writeback.
      try{
        const persisted=await persistWorkerProof({
          request,reviewerId,agentId,
          workerEvidence:result.workerEvidence,
          workerResult,
        });
        if(persisted!==true)
          return reject("commissioned_worker_proof_not_persisted");
      }catch{return reject("commissioned_worker_proof_not_persisted");}
      return {
        status:"completed",text:inference.text,
        provider:inference.provider,model:inference.model||null,
        provider_receipt:inference.provider_receipt,
        commissioned_worker_verified:true,
        worker_run_receipt_ref:workerResult.worker_run_receipt_ref,
        worker_instance_id:workerResult.worker_instance_id,
        external_side_effects_authorized:false,
      };
    },
  };
}
