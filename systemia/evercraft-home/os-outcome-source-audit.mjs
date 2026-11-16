// Evercraft OS source-only correlation audit.
// IMPORTANT: Integrity hashes are not issuer authentication. This module
// never reads production data, issues permits, dispatches, pays, or delivers.
// It only checks whether already-supplied canonical-shaped receipts agree.
import { createHash } from "node:crypto";

const sha = raw => createHash("sha256").update(raw).digest("hex");
const stable = value => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
};
const present = value => typeof value === "string" && value.length > 0 && value.length <= 256;
const exactTime = value => typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const hasReceiptHash = (receipt, format) => {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  const { receipt_hash, ...body } = receipt;
  if (format === "mission") return typeof receipt_hash === "string" &&
    /^[a-f0-9]{12}$/.test(receipt_hash) &&
    receipt_hash === sha(JSON.stringify(body)).slice(0, 12);
  return typeof receipt_hash === "string" && /^sha256:[a-f0-9]{64}$/.test(receipt_hash) &&
    receipt_hash === "sha256:" + sha(JSON.stringify(body));
};
const hasShippingHash = receipt => {
  if (!receipt || typeof receipt !== "object") return false;
  const { integrity_digest, receipt_key, ...body } = receipt;
  return typeof integrity_digest === "string" && integrity_digest === "sha256:" + sha(stable(body));
};
const hasProofHash = proof => {
  if (!proof || typeof proof !== "object") return false;
  const { proof_digest, pass, reasons, ...body } = proof;
  return typeof proof_digest === "string" && proof_digest === "sha256:" + sha(stable(body));
};

export function reconcileEvercraftOutcomeSource({
  paidOrder = null,
  missionReceipt = null,
  executionReceipt = null,
  deliveryReceipt = null,
  shippingProof = null,
} = {}) {
  const holds = [];
  const hold = reason => { if (!holds.includes(reason)) holds.push(reason); };

  // Payment: test the exact Evercraft Payments row contract. Do not accept
  // redirects, browser-provided "paid" claims or fabricated audit totals.
  if (!paidOrder) hold("payment_record_missing");
  else if (!present(paidOrder.order_key) || !present(paidOrder.offer_key) ||
    !present(paidOrder.provider_receipt_id) ||
    paidOrder.currency !== "USD" || paidOrder.provider_boundary !== "raven_nexus" ||
    paidOrder.payment_state !== "paid" ||
    paidOrder.provider_paid_verified !== true || paidOrder.settlement_verified !== true ||
    paidOrder.synthetic !== false || paidOrder.livemode !== true ||
    paidOrder.refund_state !== "none" || paidOrder.dispute_state !== "none" ||
    !Number.isSafeInteger(paidOrder.amount_cents) ||
    paidOrder.amount_cents <= 0 || paidOrder.amount_cents > 100_000_000 ||
    !exactTime(paidOrder.provider_verified_at)) hold("payment_contract_invalid");

  // Systemia: control-plane admission is policy evaluation, never a dispatch permit.
  if (!missionReceipt) hold("mission_receipt_missing");
  else if (missionReceipt.schema !== "evercraft.systemia.mission-admission-receipt.v1" ||
    !hasReceiptHash(missionReceipt, "mission") ||
    !present(missionReceipt.mission_key) || !exactTime(missionReceipt.admitted_at) ||
    missionReceipt.admitted !== true ||
    missionReceipt.execution_authority_granted !== false)
    hold("mission_receipt_invalid");

  // Execution Gate: completed event with integrity and reference to outcome.
  // This is still just a supplied event until checked against a trusted ledger.
  if (!executionReceipt) hold("execution_receipt_missing");
  else if (executionReceipt.schema !== "evercraft.execution-gate.lease-event.v1" ||
    !hasReceiptHash(executionReceipt, "execution") ||
    executionReceipt.state !== "completed" ||
    executionReceipt.execution_outcome_recorded !== true ||
    !present(executionReceipt.lease_id) ||
    !present(executionReceipt.idempotency_key) ||
    !present(executionReceipt.outcome_evidence_ref) ||
    !exactTime(executionReceipt.recorded_at))
    hold("execution_receipt_invalid");

  // Stronger Shipping v2 requires a verified sent copy, not simply a queued send.
  if (!deliveryReceipt) hold("delivery_receipt_missing");
  else if (deliveryReceipt.schema !== "evercraft.shipping.delivery-receipt.v2" ||
    !hasShippingHash(deliveryReceipt) ||
    !present(deliveryReceipt.receipt_key) ||
    !present(deliveryReceipt.mission_key) ||
    !present(deliveryReceipt.order_key) ||
    !present(deliveryReceipt.payment_evidence_ref) ||
    !present(deliveryReceipt.provider_message_id) ||
    !present(deliveryReceipt.package_digest) ||
    !exactTime(deliveryReceipt.delivered_at) ||
    deliveryReceipt.truth_boundary?.delivery_receipt_proves_verified_provider_delivery !== true ||
    deliveryReceipt.truth_boundary?.customer_acceptance_not_inferred !== true ||
    deliveryReceipt.sent_copy_verification?.recipient_verified !== true ||
    deliveryReceipt.sent_copy_verification?.attachments_verified !== true ||
    deliveryReceipt.sent_copy_verification?.subject_verified !== true ||
    !Array.isArray(deliveryReceipt.evidence_refs) ||
    (!deliveryReceipt.artifact_manifest?.length && !deliveryReceipt.entitlement_refs?.length))
    hold("delivery_receipt_invalid");

  // Use Shipping's existing proof-bundle v3 format, including its hash.
  if (!shippingProof) hold("shipping_proof_missing");
  else if (shippingProof.schema !== "evercraft.shipping.proof-bundle.v3" ||
    !hasProofHash(shippingProof) || shippingProof.pass !== true ||
    !Array.isArray(shippingProof.reasons) || shippingProof.reasons.length !== 0 ||
    shippingProof.truth_boundary?.provider_delivery_verified !== true)
    hold("shipping_proof_invalid");

  if (paidOrder && deliveryReceipt) {
    if (paidOrder.order_key !== deliveryReceipt.order_key) hold("payment_delivery_order_mismatch");
    // Do not assume a Shipping payment evidence ref is the processor receipt id:
    // those are separate canonical identifier namespaces.
  }
  if (missionReceipt && deliveryReceipt &&
      missionReceipt.mission_key !== deliveryReceipt.mission_key)
    hold("mission_delivery_mismatch");
  if (executionReceipt && deliveryReceipt) {
    if (!Array.isArray(deliveryReceipt.evidence_refs) ||
        !deliveryReceipt.evidence_refs.includes(executionReceipt.outcome_evidence_ref))
      hold("execution_outcome_not_linked_to_delivery");
  }
  if (shippingProof && deliveryReceipt) {
    if (shippingProof.receipt?.receipt_key !== deliveryReceipt.receipt_key ||
        shippingProof.receipt?.integrity_digest !== deliveryReceipt.integrity_digest ||
        shippingProof.receipt?.package_digest !== deliveryReceipt.package_digest ||
        shippingProof.receipt?.provider_message_id !== deliveryReceipt.provider_message_id)
      hold("shipping_delivery_proof_mismatch");
  }
  if (paidOrder && missionReceipt && executionReceipt && deliveryReceipt &&
      [paidOrder.provider_verified_at, missionReceipt.admitted_at,
       executionReceipt.recorded_at, deliveryReceipt.delivered_at].every(exactTime)) {
    if (Date.parse(paidOrder.provider_verified_at) > Date.parse(executionReceipt.recorded_at) ||
        Date.parse(missionReceipt.admitted_at) > Date.parse(executionReceipt.recorded_at) ||
        Date.parse(executionReceipt.recorded_at) > Date.parse(deliveryReceipt.delivered_at))
      hold("receipt_timeline_inconsistent");
  }

  return Object.freeze({
    schema: "evercraft.os.outcome-source-audit.v1",
    state: holds.length ? "held" : "source_consistent_unattested",
    reason_codes: holds,
    source_families_checked: ["evercraft_payments", "systemia", "execution_gate", "shipping"],
    source_contracts_structurally_consistent: holds.length === 0,
    exact_offer_to_product_mapping_verified: false,
    duplicate_order_or_side_effect_replay_checked: false,
    payment_issuer_authenticated: false,
    systemia_ledger_authenticated: false,
    execution_gate_ledger_authenticated: false,
    shipping_provider_independently_refetched: false,
    worker_result_attested: false,
    customer_acceptance_verified: false,
    customer_outcome_verified: false,
    business_margin_verified: false,
    production_release_authorized: false,
    action_performed: false,
    private_ids_returned: false,
  });
}
