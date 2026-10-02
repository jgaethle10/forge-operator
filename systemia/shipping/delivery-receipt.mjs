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

export function buildDeliveryReceipt({
  state,
  recipient_ref,
  artifact_refs = [],
  entitlement_refs = [],
  delivery_channel = 'customer_handoff',
  delivered_at = new Date().toISOString()
} = {}) {
  if (!state?.fulfillment_key) throw new Error('fulfillment_state_required');
  if (state?.payment?.evidence_ref == null) throw new Error('payment_evidence_required');
  if (!clean(recipient_ref)) throw new Error('recipient_ref_required');

  const deliveryTask = state.tasks?.find((task) => task.work_key === 'customer-delivery');
  const qaTask = state.tasks?.find((task) => task.work_key === 'parallel-quality-pass');
  const humanReview = state.tasks?.find((task) => task.work_key === 'human-delivery-review');

  if (!deliveryTask || deliveryTask.state !== 'completed') throw new Error('customer_delivery_task_incomplete');
  if (!qaTask || qaTask.state !== 'completed') throw new Error('quality_pass_incomplete');
  if (humanReview && humanReview.state !== 'completed') throw new Error('human_delivery_review_incomplete');

  const refs = [...new Set([...(artifact_refs || []), ...(entitlement_refs || [])].filter(Boolean))];
  if (!refs.length) throw new Error('delivery_artifact_or_entitlement_required');

  const body = {
    schema:'evercraft.shipping.delivery-receipt.v1',
    fulfillment_key:state.fulfillment_key,
    mission_key:state.mission_key,
    public_id:state.public_id,
    product_name:state.product_name,
    order_key:state.payment?.order_key || null,
    payment_evidence_ref:state.payment?.evidence_ref || null,
    recipient_ref:clean(recipient_ref),
    delivery_channel:clean(delivery_channel),
    delivered_at:new Date(delivered_at).toISOString(),
    promised_deliverables:state.promised_deliverables || [],
    qa_contract:state.qa_contract || [],
    artifact_refs:[...(artifact_refs || [])],
    entitlement_refs:[...(entitlement_refs || [])],
    evidence_refs:[
      ...(state.evidence_refs || []),
      ...(qaTask.evidence_refs || []),
      ...(deliveryTask.evidence_refs || [])
    ].filter(Boolean),
    truth_boundary:{
      delivery_receipt_proves_packaged_delivery_event:true,
      customer_acceptance_not_inferred:true,
      product_outcome_not_guaranteed:true,
      expansion_not_authorized:true
    }
  };
  return {
    ...body,
    receipt_key:'delivery:' + crypto.createHash('sha256').update(state.fulfillment_key + '|' + body.delivered_at + '|' + body.recipient_ref).digest('hex').slice(0,24),
    integrity_digest:digest(body)
  };
}


export function buildVerifiedDeliveryReceipt({
  state,
  recipient_ref,
  shipment,
  package_manifest,
  sent_copy_verification,
  entitlement_refs = [],
  delivery_channel = 'customer_handoff',
  delivered_at = new Date().toISOString()
} = {}) {
  if (!state?.fulfillment_key) throw new Error('fulfillment_state_required');
  if (state?.payment?.evidence_ref == null) throw new Error('payment_evidence_required');
  if (!clean(recipient_ref)) throw new Error('recipient_ref_required');

  const deliveryTask = state.tasks?.find((task) => task.work_key === 'customer-delivery');
  const qaTask = state.tasks?.find((task) => task.work_key === 'parallel-quality-pass');
  const humanReview = state.tasks?.find((task) => task.work_key === 'human-delivery-review');

  if (!deliveryTask || deliveryTask.state !== 'completed') throw new Error('customer_delivery_task_incomplete');
  if (!qaTask || qaTask.state !== 'completed') throw new Error('quality_pass_incomplete');
  if (humanReview && humanReview.state !== 'completed') throw new Error('human_delivery_review_incomplete');

  if (!shipment?.shipment_key) throw new Error('shipment_key_required');
  if (shipment.state !== 'verified_delivered') throw new Error('shipment_not_verified_delivered');
  if (!package_manifest?.package_digest || package_manifest.pass !== true) throw new Error('package_manifest_not_verified');
  if (sent_copy_verification?.verified !== true) throw new Error('sent_copy_not_verified');

  const providerMessageId = clean(
    sent_copy_verification.provider_message_id ||
    shipment.provider_message_id
  );
  if (!providerMessageId) throw new Error('provider_message_id_required');
  if (
    clean(shipment.provider_message_id) &&
    clean(sent_copy_verification.provider_message_id) &&
    clean(shipment.provider_message_id) !== clean(sent_copy_verification.provider_message_id)
  ) throw new Error('provider_message_id_mismatch');

  const artifactRefs = (package_manifest.artifacts || []).map((artifact) =>
    artifact.sha256 || artifact.client_filename
  ).filter(Boolean);
  const refs = [...new Set([...artifactRefs, ...(entitlement_refs || [])].filter(Boolean))];
  if (!refs.length) throw new Error('delivery_artifact_or_entitlement_required');

  const body = {
    schema:'evercraft.shipping.delivery-receipt.v2',
    fulfillment_key:state.fulfillment_key,
    mission_key:state.mission_key,
    public_id:state.public_id,
    product_name:state.product_name,
    order_key:state.payment?.order_key || null,
    payment_evidence_ref:state.payment?.evidence_ref || null,
    recipient_ref:clean(recipient_ref),
    delivery_channel:clean(delivery_channel),
    delivered_at:new Date(delivered_at).toISOString(),
    shipment_key:shipment.shipment_key,
    shipment_idempotency_key:shipment.idempotency_key || null,
    provider_message_id:providerMessageId,
    package_digest:package_manifest.package_digest,
    artifact_manifest:(package_manifest.artifacts || []).map((artifact) => ({
      client_filename:artifact.client_filename || null,
      mime_type:artifact.mime_type || null,
      size_bytes:artifact.size_bytes || null,
      sha256:artifact.sha256 || null,
      openable:artifact.openability?.openable === true,
      render_verified:artifact.render_verified === true
    })),
    entitlement_refs:[...(entitlement_refs || [])],
    sent_copy_verification:{
      verification_digest:sent_copy_verification.verification_digest || null,
      recipient_verified:sent_copy_verification.recipient_verified === true,
      subject_verified:sent_copy_verification.subject_verified === true,
      attachments_verified:sent_copy_verification.attachments_verified === true,
      attachment_names:[...(sent_copy_verification.attachment_names || [])]
    },
    promised_deliverables:state.promised_deliverables || [],
    qa_contract:state.qa_contract || [],
    evidence_refs:[
      ...(state.evidence_refs || []),
      ...(qaTask.evidence_refs || []),
      ...(deliveryTask.evidence_refs || []),
      package_manifest.package_digest,
      sent_copy_verification.verification_digest || null,
      providerMessageId
    ].filter(Boolean),
    truth_boundary:{
      delivery_receipt_proves_verified_provider_delivery:true,
      sent_copy_attachment_manifest_verified:true,
      customer_acceptance_not_inferred:true,
      product_outcome_not_guaranteed:true,
      expansion_not_authorized:true
    }
  };

  return {
    ...body,
    receipt_key:'delivery-v2:' + crypto.createHash('sha256')
      .update(state.fulfillment_key + '|' + shipment.shipment_key + '|' + providerMessageId + '|' + body.delivered_at)
      .digest('hex')
      .slice(0,24),
    integrity_digest:digest(body)
  };
}
