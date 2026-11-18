// Fail-closed local-ledger witness for Fabric private OS readback.
// This verifies two already-owned persisted stores against supplied receipt
// shapes. Local file parity is not an independent issuer signature, a live
// worker attestation, a payment, or delivery provider readback.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EVENTS = 20000;
const MAX_SHIPMENTS = 10000;
const short = value => typeof value === "string" && value.length > 0 && value.length <= 256;
const sha = object => "sha256:" + createHash("sha256").update(JSON.stringify(object)).digest("hex");
function localFile(file) {
  if (typeof file !== "string" || !path.isAbsolute(file) ||
      !/\.(json|jsonl)$/.test(file)) throw Error("ledger_path_invalid");
  const dir=path.dirname(file), a=fs.lstatSync(dir), b=fs.lstatSync(file);
  if(!a.isDirectory() || a.isSymbolicLink() || (a.mode&0o077)!==0 ||
     !b.isFile() || b.isSymbolicLink() || (b.mode&0o077)!==0 ||
     b.size<2 || b.size>MAX_BYTES ||
     fs.realpathSync(file)!==file || fs.realpathSync(dir)!==dir)
    throw Error("ledger_untrusted");
  const raw=fs.readFileSync(file,"utf8");
  if(Buffer.byteLength(raw,"utf8")>MAX_BYTES)throw Error("ledger_oversized");
  return raw;
}
function validExecutionEvent(row) {
  if(!row || row.schema!=="evercraft.execution-gate.lease-event.v1" ||
     !short(row.lease_id) || !short(row.idempotency_key) ||
     !/^sha256:[a-f0-9]{64}$/.test(String(row.receipt_hash||"")))return false;
  const {receipt_hash,...body}=row;
  return row.receipt_hash===sha(body);
}
function executionLatest(file,reference) {
  const lines=localFile(file).split("\n").filter(Boolean);
  if(lines.length===0 || lines.length>MAX_EVENTS)throw Error("ledger_event_count_invalid");
  let current=null;
  for(const line of lines){
    const row=JSON.parse(line);
    if(!validExecutionEvent(row))throw Error("execution_event_invalid");
    if(row.lease_id===reference.lease_id)current=row;
  }
  if(!current || current.state!=="completed")throw Error("execution_not_latest_completed");
  if(current.receipt_hash!==reference.receipt_hash ||
     current.idempotency_key!==reference.idempotency_key ||
     current.outcome_evidence_ref!==reference.outcome_evidence_ref)
    throw Error("execution_receipt_not_in_local_ledger");
  return true;
}
function shippingCurrent(file,reference,proof){
  const data=JSON.parse(localFile(file));
  if(data?.schema!=="evercraft.shipping.ledger.v2" ||
     !Number.isSafeInteger(data.revision) || data.revision<0 ||
     !Array.isArray(data.shipments) || data.shipments.length>MAX_SHIPMENTS)
    throw Error("shipping_ledger_contract_invalid");
  const shipments=data.shipments;
  const row=shipments.find(x=>x?.shipment_key===reference.shipment_key);
  if(!row || shipments.filter(x=>x?.shipment_key===reference.shipment_key).length!==1)
    throw Error("shipping_record_missing_or_duplicate");
  if(row.schema!=="evercraft.shipping.shipment.v2" ||
     row.state!=="verified_delivered" ||
     !short(row.idempotency_key) ||
     shipments.some(x=>x!==row && x?.idempotency_key===row.idempotency_key) ||
     row.idempotency_key!==reference.shipment_idempotency_key ||
     row.idempotency_key!==proof.transport?.idempotency_key ||
     row.provider_message_id!==reference.provider_message_id ||
     row.provider_message_id!==proof.transport?.provider_message_id ||
     row.package_digest!==reference.package_digest ||
     row.package_digest!==proof.release?.package_digest ||
     !short(row.authorization_ref) ||
     String(row.recipient_ref||"").toLowerCase()!==
       String(reference.recipient_ref||"").toLowerCase() ||
     !Array.isArray(row.attempts) ||
     !row.attempts.some(x=>x?.outcome==="sent" &&
       x.provider_message_id===reference.provider_message_id) ||
     !row.sent_copy_verification ||
     row.sent_copy_verification.provider_message_id!==reference.provider_message_id ||
     row.sent_copy_verification.recipient_verified!==true ||
     row.sent_copy_verification.subject_verified!==true ||
     row.sent_copy_verification.attachments_verified!==true ||
     !Array.isArray(row.sent_copy_verification.attachment_names) ||
     JSON.stringify(row.sent_copy_verification.attachment_names)!==
       JSON.stringify(reference.sent_copy_verification?.attachment_names))
    throw Error("shipping_ledger_delivery_mismatch");
  return true;
}
export function verifyFabricOutcomeLocalLedgers({
  executionEventsFile="",shippingLedgerFile="",records=null,
}={}) {
  const held={
    schema:"evercraft.fabric.outcome-local-ledger-witness.v1",
    state:"held",
    source_files_readable:false,
    execution_event_matches_local_latest:false,
    shipping_record_matches_local_verified_delivery:false,
    independently_authenticated_payment:false,
    independently_authenticated_mission:false,
    independently_authenticated_worker:false,
    independently_authenticated_shipping_provider:false,
    customer_delivery_verified:false,
    no_mutation:true,
    private_record_data_returned:false,
  };
  try {
    if(!records || typeof records!=="object" || Array.isArray(records) ||
       !records.executionReceipt || !records.deliveryReceipt ||
       !records.shippingProof || !executionEventsFile || !shippingLedgerFile)
      return held;
    executionLatest(executionEventsFile,records.executionReceipt);
    shippingCurrent(shippingLedgerFile,records.deliveryReceipt,records.shippingProof);
    return Object.freeze({
      ...held,
      state:"local_ledgers_consistent_unattested",
      source_files_readable:true,
      execution_event_matches_local_latest:true,
      shipping_record_matches_local_verified_delivery:true,
    });
  } catch {
    return Object.freeze(held);
  }
}
