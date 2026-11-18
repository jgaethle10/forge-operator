import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildVerifiedDeliveryReceipt } from "../shipping/delivery-receipt.mjs";
import { buildShippingProofBundle } from "../shipping/proof-bundle.mjs";
import { reconcileEvercraftOutcomeSource } from "./os-outcome-source-audit.mjs";

const hash = x => createHash("sha256").update(x).digest("hex");
const paidTime="2026-11-15T18:00:00.000Z";
const missionTime="2026-11-15T18:01:00.000Z";
const execTime="2026-11-15T18:03:00.000Z";
const deliveryTime="2026-11-15T18:05:00.000Z";
function signed(body,kind){
  return {...body,receipt_hash:kind==="mission"?
    hash(JSON.stringify(body)).slice(0,12):
    "sha256:"+hash(JSON.stringify(body))};
}
function specimen(){
  const paidOrder={
    order_key:"buyer-123456789",offer_key:"systemia.website_audit_quick_win_49.v1",
    amount_cents:4900,currency:"USD",provider_boundary:"raven_nexus",
    payment_state:"paid",provider_paid_verified:true,settlement_verified:true,
    synthetic:false,livemode:true,refund_state:"none",dispute_state:"none",
    provider_receipt_id:"pi_live_verified_fake_specimen_001",provider_verified_at:paidTime,
  };
  const missionReceipt=signed({
    schema:"evercraft.systemia.mission-admission-receipt.v1",
    mission_key:"systemia-test-mission-01",admitted_at:missionTime,
    admitted:true,execution_authority_granted:false,
  },"mission");
  const executionReceipt=signed({
    schema:"evercraft.execution-gate.lease-event.v1",
    lease_id:"lease-001",idempotency_key:"work-001",
    state:"completed",execution_outcome_recorded:true,
    outcome_evidence_ref:"saban-evidence-fixture",recorded_at:execTime,
  },"execution");
  const release_manifest={
    package_digest:"sha256:"+ "a".repeat(64),pass:true,
    artifacts:[{client_filename:"Website Audit.pdf",mime_type:"application/pdf",
      size_bytes:128,sha256:"sha256:"+"b".repeat(64),
      openability:{openable:true},render_verified:true}],
  };
  const shipment={
    shipment_key:"ship-123",state:"verified_delivered",
    idempotency_key:"ship-once",provider_message_id:"fixture:msg:123",
  };
  const sent_copy_verification={
    verified:true,provider_message_id:shipment.provider_message_id,
    verification_digest:"sha256:"+"c".repeat(64),
    recipient_verified:true,subject_verified:true,attachments_verified:true,
    attachment_names:["Website Audit.pdf"],
  };
  const recipient_ref="fixture-buyer@example.test";
  const deliveryReceipt=buildVerifiedDeliveryReceipt({
    state:{
      fulfillment_key:"fulfillment-123",mission_key:missionReceipt.mission_key,
      public_id:"website-audit",product_name:"Website Audit",
      payment:{order_key:paidOrder.order_key,evidence_ref:"payment:canonical-fixture-001"},
      tasks:[
        {work_key:"customer-delivery",state:"completed",evidence_refs:["saban-evidence-fixture"]},
        {work_key:"parallel-quality-pass",state:"completed",evidence_refs:["qa-evidence-fixture"]},
        {work_key:"human-delivery-review",state:"completed"}],
      promised_deliverables:["PDF audit"],qa_contract:["source-only specimen"],
    },
    recipient_ref,shipment,package_manifest:release_manifest,
    sent_copy_verification,delivered_at:deliveryTime,
  });
  const shippingProof=buildShippingProofBundle({
    order:{
      order_key:"shipping-control-order-fixture",
      recipient_ref,package_digest:release_manifest.package_digest,
      state:"verified_delivered",
    },
    release_manifest,shipment,sent_copy_verification,delivery_receipt:deliveryReceipt,
    generated_at:deliveryTime,
  });
  assert.equal(shippingProof.pass,true);
  return {paidOrder,missionReceipt,executionReceipt,deliveryReceipt,shippingProof};
}
test("canonical constructors yield a structurally consistent but NEVER externally verified source bundle",()=>{
  const data=specimen(),result=reconcileEvercraftOutcomeSource(data);
  assert.equal(result.state,"source_consistent_unattested");
  assert.deepEqual(result.reason_codes,[]);
  assert.equal(result.source_contracts_structurally_consistent,true);
  for(const key of [
    "payment_issuer_authenticated","systemia_ledger_authenticated",
    "execution_gate_ledger_authenticated","shipping_provider_independently_refetched",
    "worker_result_attested","customer_acceptance_verified",
    "customer_outcome_verified","business_margin_verified",
    "exact_offer_to_product_mapping_verified",
    "duplicate_order_or_side_effect_replay_checked",
    "production_release_authorized","action_performed","private_ids_returned"
  ])assert.equal(result[key],false,key);
  const publicView=JSON.stringify(result);
  for(const secret of ["fixture-buyer@example.test","pi_live_verified_fake_specimen_001",
    "saban-evidence-fixture","buyer-123456789","systemia-test-mission-01"])assert.ok(!publicView.includes(secret));
});
test("absent, partial, refunded, disputed or test-mode payment holds the chain",()=>{
  const original=specimen();
  for(const variant of [
    null,{...original.paidOrder,settlement_verified:false},
    {...original.paidOrder,synthetic:true},{...original.paidOrder,livemode:false},
    {...original.paidOrder,refund_state:"refunded"},{...original.paidOrder,dispute_state:"open"},
    {...original.paidOrder,provider_verified_at:"not-time"},
  ]){
    const result=reconcileEvercraftOutcomeSource({...original,paidOrder:variant});
    assert.equal(result.state,"held");
    assert.ok(result.reason_codes.includes(variant?"payment_contract_invalid":"payment_record_missing"));
  }
});
test("changed order and mission links fail even with otherwise valid receipts",()=>{
  const original=specimen();
  assert.ok(reconcileEvercraftOutcomeSource({
    ...original,paidOrder:{...original.paidOrder,order_key:"different-buyer-12345"},
  }).reason_codes.includes("payment_delivery_order_mismatch"));
  const m=original.missionReceipt;
  const altered=signed({...m,mission_key:"different-mission-001",receipt_hash:undefined},"mission");
  // The replacement signer must sign the core receipt fields, not the old hash.
  const {receipt_hash:unused,...core}=altered;
  const newMission=signed(core,"mission");
  assert.ok(reconcileEvercraftOutcomeSource({
    ...original,missionReceipt:newMission,
  }).reason_codes.includes("mission_delivery_mismatch"));
});
test("forged hashes, missing execution reference and unverified shipping fail closed",()=>{
  const base=specimen();
  assert.ok(reconcileEvercraftOutcomeSource({
    ...base,missionReceipt:{...base.missionReceipt,admitted:false}
  }).reason_codes.includes("mission_receipt_invalid"));
  assert.ok(reconcileEvercraftOutcomeSource({
    ...base,executionReceipt:{...base.executionReceipt,receipt_hash:"sha256:"+"0".repeat(64)}
  }).reason_codes.includes("execution_receipt_invalid"));
  assert.ok(reconcileEvercraftOutcomeSource({
    ...base,deliveryReceipt:{...base.deliveryReceipt,order_key:"tampered-order"}
  }).reason_codes.includes("delivery_receipt_invalid"));
  assert.ok(reconcileEvercraftOutcomeSource({
    ...base,shippingProof:{...base.shippingProof,pass:false}
  }).reason_codes.includes("shipping_proof_invalid"));
  const {receipt_hash:ignored,...executionBody}=base.executionReceipt;
  const unjoined=signed({...executionBody,outcome_evidence_ref:"not-in-shipping"},"execution");
  assert.ok(reconcileEvercraftOutcomeSource({
    ...base,executionReceipt:unjoined
  }).reason_codes.includes("execution_outcome_not_linked_to_delivery"));
});
test("time inversion and shipping receipt mismatch cannot pass",()=>{
  const base=specimen();
  const {receipt_hash:ignored,...executionBody}=base.executionReceipt;
  const inverted=signed({...executionBody,recorded_at:"2026-11-15T18:06:00.000Z"},"execution");
  assert.ok(reconcileEvercraftOutcomeSource({...base,executionReceipt:inverted})
    .reason_codes.includes("receipt_timeline_inconsistent"));
  // Re-hashing a forged Shipping proof still cannot reconcile its receipt key.
  const forged={...base.shippingProof,receipt:{...base.shippingProof.receipt,receipt_key:"different-delivery"}};
  assert.ok(reconcileEvercraftOutcomeSource({...base,shippingProof:forged})
    .reason_codes.includes("shipping_delivery_proof_mismatch"));
});
test("empty input and an unsupported text payload remain held, never authority",()=>{
  assert.equal(reconcileEvercraftOutcomeSource().state,"held");
  assert.equal(reconcileEvercraftOutcomeSource({paidOrder:"paid"}).state,"held");
});
