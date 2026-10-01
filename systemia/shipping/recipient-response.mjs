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

const DISPOSITIONS = new Set([
  'unknown',
  'acknowledged',
  'meeting_requested',
  'question',
  'needs_changes',
  'approved',
  'declined'
]);

export function correlateRecipientResponse({
  order,
  shipment,
  inbound_message,
  link_authorization_ref = null,
  disposition = 'unknown',
  disposition_basis = 'unclassified',
  now = new Date()
} = {}) {
  if (order?.state !== 'verified_delivered') throw new Error('verified_delivery_required_before_response_correlation');
  if (shipment?.state !== 'verified_delivered') throw new Error('verified_shipment_required_before_response_correlation');
  if (!clean(inbound_message?.id || inbound_message?.message_id)) throw new Error('inbound_message_id_required');
  if (!clean(inbound_message?.from)) throw new Error('inbound_sender_required');

  const normalizedDisposition = clean(disposition).toLowerCase() || 'unknown';
  if (!DISPOSITIONS.has(normalizedDisposition)) throw new Error('invalid_recipient_response_disposition');

  const deliveryMessageId = clean(shipment.provider_message_id);
  const inReplyTo = clean(
    inbound_message.in_reply_to ||
    inbound_message.in_reply_to_provider_message_id ||
    inbound_message.reply_to_message_id
  );
  const sameThread = clean(inbound_message.thread_ref || inbound_message.thread_id) &&
    clean(inbound_message.thread_ref || inbound_message.thread_id) === clean(shipment.thread_ref || shipment.provider_thread_id);
  const directReplyMatch = deliveryMessageId && inReplyTo && deliveryMessageId === inReplyTo;
  const explicitLink = clean(link_authorization_ref);

  if (!directReplyMatch && !sameThread && !explicitLink) {
    throw new Error('recipient_response_linkage_not_proven');
  }

  const receivedAt = new Date(inbound_message.received_at || inbound_message.email_ts || now).toISOString();
  const core = {
    schema:'evercraft.shipping.recipient-response.v3',
    order_key:order.order_key,
    shipment_key:shipment.shipment_key,
    delivery_provider_message_id:deliveryMessageId || null,
    inbound_message_id:clean(inbound_message.id || inbound_message.message_id),
    inbound_thread_ref:clean(inbound_message.thread_ref || inbound_message.thread_id) || null,
    from:clean(inbound_message.from),
    to:[...(inbound_message.to || [])],
    subject:clean(inbound_message.subject) || null,
    received_at:receivedAt,
    linkage:{
      direct_reply_match:directReplyMatch,
      same_thread:sameThread,
      explicit_link_authorization_ref:explicitLink || null
    },
    disposition:normalizedDisposition,
    disposition_basis:clean(disposition_basis) || 'unclassified',
    truth_boundary:{
      proves_inbound_response_observed:true,
      proves_named_human_identity:false,
      proves_customer_acceptance:normalizedDisposition === 'approved' && disposition_basis === 'human_confirmed',
      sentiment_not_inferred:true,
      downstream_business_outcome_not_inferred:true
    }
  };

  return {
    ...core,
    response_key:'recipient-response:' + crypto.createHash('sha256')
      .update([core.order_key, core.shipment_key, core.inbound_message_id].join('|'))
      .digest('hex')
      .slice(0,24),
    integrity_digest:digest(core)
  };
}

export function buildRecipientResponseSignal(response = {}) {
  if (!response?.response_key) throw new Error('recipient_response_required');
  return {
    schema:'evercraft.shipping.recipient-response-signal.v1',
    signal_key:'signal:' + response.response_key,
    signal_type:'recipient_response_observed',
    order_key:response.order_key,
    shipment_key:response.shipment_key,
    response_key:response.response_key,
    disposition:response.disposition,
    disposition_basis:response.disposition_basis,
    received_at:response.received_at,
    evidence_refs:[
      response.delivery_provider_message_id,
      response.inbound_message_id,
      response.integrity_digest
    ].filter(Boolean),
    recommended_next_action:
      response.disposition === 'meeting_requested' ? 'route_to_scheduling' :
      response.disposition === 'question' ? 'route_to_owner_review' :
      response.disposition === 'needs_changes' ? 'route_to_revision_intake' :
      response.disposition === 'approved' ? 'route_to_relationship_followup' :
      response.disposition === 'declined' ? 'route_to_closeout_review' :
      'route_to_owner_review',
    autonomous_external_action_authorized:false
  };
}

export function dedupeRecipientResponses(responses = []) {
  const seen = new Set();
  const unique = [];
  for (const response of responses || []) {
    const key = clean(response?.response_key || response?.inbound_message_id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(response);
  }
  return unique;
}
