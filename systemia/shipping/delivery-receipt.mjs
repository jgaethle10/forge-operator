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
