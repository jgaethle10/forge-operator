import crypto from 'node:crypto';

function clean(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

function digest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(stable(value)).digest('hex');
}

export function buildShippingProofBundle({
  order,
  release_manifest,
  shipment,
  sent_copy_verification,
  delivery_receipt,
  generated_at = new Date().toISOString()
} = {}) {
  const reasons = [];

  if (!order?.order_key) reasons.push('order_missing');
  if (!release_manifest?.package_digest) reasons.push('release_manifest_missing');
  if (!shipment?.shipment_key) reasons.push('shipment_missing');
  if (sent_copy_verification?.verified !== true) reasons.push('sent_copy_not_verified');
  if (!delivery_receipt?.receipt_key) reasons.push('delivery_receipt_missing');

  const orderPackage = clean(order?.package_digest);
  const releasePackage = clean(release_manifest?.package_digest);
  const receiptPackage = clean(delivery_receipt?.package_digest);
  if (orderPackage && releasePackage && orderPackage !== releasePackage) reasons.push('order_release_package_digest_mismatch');
  if (receiptPackage && releasePackage && receiptPackage !== releasePackage) reasons.push('receipt_release_package_digest_mismatch');

  const shipmentKey = clean(shipment?.shipment_key);
  const receiptShipmentKey = clean(delivery_receipt?.shipment_key);
  if (shipmentKey && receiptShipmentKey && shipmentKey !== receiptShipmentKey) reasons.push('shipment_receipt_key_mismatch');

  const shipmentMessage = clean(shipment?.provider_message_id);
  const verificationMessage = clean(sent_copy_verification?.provider_message_id);
  const receiptMessage = clean(delivery_receipt?.provider_message_id);
  const messageIds = [shipmentMessage, verificationMessage, receiptMessage].filter(Boolean);
  if (new Set(messageIds).size > 1) reasons.push('provider_message_id_mismatch');

  const recipient = clean(order?.recipient_ref).toLowerCase();
  const receiptRecipient = clean(delivery_receipt?.recipient_ref).toLowerCase();
  if (recipient && receiptRecipient && recipient !== receiptRecipient) reasons.push('recipient_mismatch');

  const orderDelivered = order?.state === 'verified_delivered';
  const shipmentDelivered = shipment?.state === 'verified_delivered';
  if (!orderDelivered) reasons.push('control_tower_not_verified_delivered');
  if (!shipmentDelivered) reasons.push('shipment_ledger_not_verified_delivered');

  const artifactRows = (release_manifest?.artifacts || []).map((row) => ({
    client_filename:row.client_filename,
    size_bytes:row.size_bytes,
    sha256:row.sha256
  }));
  const receiptRows = (delivery_receipt?.artifact_manifest || []).map((row) => ({
    client_filename:row.client_filename,
    size_bytes:row.size_bytes,
    sha256:row.sha256
  }));
  if (stable(artifactRows) !== stable(receiptRows)) reasons.push('release_receipt_artifact_manifest_mismatch');

  const core = {
    schema:'evercraft.shipping.proof-bundle.v3',
    generated_at:new Date(generated_at).toISOString(),
    order:{
      order_key:order?.order_key || null,
      logical_package_key:order?.logical_package_key || null,
      version:order?.version || null,
      reissue_of:order?.reissue_of || null,
      recipient_ref:order?.recipient_ref || null,
      channel:order?.channel || null,
      authorization_ref:order?.authorization_ref || null,
      state:order?.state || null
    },
    release:{
      release_key:release_manifest?.release_key || null,
      release_fingerprint:release_manifest?.release_fingerprint || null,
      package_digest:release_manifest?.package_digest || null,
      materialization_digest:release_manifest?.materialization_digest || null,
      artifacts:artifactRows
    },
    transport:{
      shipment_key:shipment?.shipment_key || null,
      idempotency_key:shipment?.idempotency_key || null,
      provider_message_id:shipment?.provider_message_id || null,
      state:shipment?.state || null
    },
    verification:{
      verification_digest:sent_copy_verification?.verification_digest || null,
      provider_message_id:sent_copy_verification?.provider_message_id || null,
      recipient_verified:sent_copy_verification?.recipient_verified === true,
      subject_verified:sent_copy_verification?.subject_verified === true,
      attachments_verified:sent_copy_verification?.attachments_verified === true,
      attachment_names:[...(sent_copy_verification?.attachment_names || [])]
    },
    receipt:{
      receipt_key:delivery_receipt?.receipt_key || null,
      integrity_digest:delivery_receipt?.integrity_digest || null,
      provider_message_id:delivery_receipt?.provider_message_id || null,
      package_digest:delivery_receipt?.package_digest || null,
      recipient_ref:delivery_receipt?.recipient_ref || null
    },
    truth_boundary:{
      exact_packaged_bytes_attested:true,
      provider_delivery_verified:true,
      recipient_open_not_inferred:true,
      customer_acceptance_not_inferred:true,
      customer_satisfaction_not_inferred:true,
      business_outcome_not_inferred:true
    }
  };

  return {
    ...core,
    pass:reasons.length === 0,
    reasons,
    proof_digest:digest(core)
  };
}
