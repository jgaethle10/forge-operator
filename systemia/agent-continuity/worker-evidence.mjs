import crypto from "node:crypto";
import { verifySignedAgentEvidence } from "./signed-evidence.mjs";

const str = (value) => String(value ?? "").trim();
const sha256 = (value) => "sha256:" + crypto.createHash("sha256").update(str(value)).digest("hex");

/**
 * Independently validate a named commissioned worker's real inference result.
 * A prompt naming an agent and a generic model/provider receipt are NOT proof
 * that this commissioned worker executed anything.
 */
export function verifyCommissionedWorkerExecution({
  request, preflight, reviewerId, inference, evidence, trustedKeys, now = new Date(),
} = {}) {
  const agentId = preflight?.reviewer_assignments?.[reviewerId];
  if (!preflight?.allowed || !agentId || ["sentinel", "juniper"].includes(str(agentId).toLowerCase())) {
    return { verified: false, reason: "commissioned_worker_identity_missing" };
  }
  if (!evidence || evidence.key_id !== agentId ||
      !verifySignedAgentEvidence({
        envelope: evidence,
        kind: "worker_execution",
        trustedKeys, now,
      })) return { verified: false, reason: "commissioned_worker_signature_invalid" };
  const p = evidence.payload || {};
  if (p.request_id !== request?.request_id ||
      p.mission_key !== request?.mission_key ||
      p.work_key !== request?.work_key ||
      p.preflight_id !== preflight.preflight_id ||
      p.registry_snapshot_hash !== preflight.registry_snapshot_hash ||
      p.reviewer_id !== reviewerId ||
      p.agent_id !== agentId ||
      p.inference_request_id !== str(request?.request_id) + ":" + str(reviewerId) ||
      p.result_sha256 !== sha256(inference?.text) ||
      !str(inference?.text) ||
      !str(inference?.provider_receipt) ||
      p.provider_receipt !== str(inference.provider_receipt) ||
      p.result_state !== "completed" ||
      p.runtime_class !== "evercraft-owned-commissioned-worker" ||
      !str(p.worker_run_receipt_ref) ||
      !str(p.worker_instance_id)) {
    return { verified: false, reason: "commissioned_worker_output_or_mission_binding_invalid" };
  }
  return {
    verified: true,
    agent_id: agentId,
    reviewer_id: reviewerId,
    worker_run_receipt_ref: p.worker_run_receipt_ref,
    worker_instance_id: p.worker_instance_id,
    result_sha256: p.result_sha256,
  };
}
