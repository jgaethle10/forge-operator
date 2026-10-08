// Raven -> Systemia phone handoff: verified, read-only commercial classification.
// Adapts EXISTING Raven writeCommunicationsBridge HMAC format. No outbound/payment authority.
import { createHmac, timingSafeEqual } from 'node:crypto';

const verifiedEnvelopes = new WeakSet();
const MAX_BYTES = 65536;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CHANNELS = new Set(['voice', 'sms']);
const asText = (x) => typeof x === 'string' ? x.trim() : '';
const validTimestamp = (value) => {
  const n = Date.parse(asText(value));
  return Number.isFinite(n) ? n : null;
};
function safeRef(value, max = 300) {
  const s = asText(value);
  if (!s || s.length > max || /[\x00-\x1f]/.test(s)) throw new Error('missing_or_invalid_provider_reference');
  return s;
}
function hmac(secret, message) {
  return createHmac('sha256', secret).update(message, 'utf8').digest();
}

// Raven bridge signs timestamp + "." + raw JSON via SHA-256 HMAC.
// Verification MUST precede parsing/routing. A Raven database record alone is not provider proof.
export function verifyRavenPhoneBridge({
  rawBody, timestamp, signature, secret, now = new Date(), maxClockSkewMs = MAX_CLOCK_SKEW_MS,
} = {}) {
  if (typeof rawBody !== 'string' || !rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_BYTES) {
    throw new Error('invalid_bridge_body_size');
  }
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('bridge_secret_required');
  const at = now instanceof Date ? now.getTime() : validTimestamp(now);
  const sentAt = validTimestamp(timestamp);
  if (!Number.isFinite(at) || sentAt === null ||
      !Number.isFinite(maxClockSkewMs) || maxClockSkewMs <= 0 ||
      Math.abs(at - sentAt) > maxClockSkewMs) throw new Error('bridge_timestamp_invalid_or_stale');
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) {
    throw new Error('bridge_signature_invalid');
  }
  const expected = hmac(secret, timestamp + '.' + rawBody);
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(expected, provided)) {
    throw new Error('bridge_signature_invalid');
  }

  let data;
  try { data = JSON.parse(rawBody); } catch { throw new Error('bridge_payload_not_json'); }
  if (!data || Array.isArray(data) || typeof data !== 'object' ||
      data.source_system !== 'raven_nexus' ||
      data.provider_type !== 'twilio' ||
      data.direction !== 'inbound' || !CHANNELS.has(data.channel) ||
      !['VoiceCall', 'PhoneMessage'].includes(data.source_entity)) {
    throw new Error('bridge_source_contract_invalid');
  }
  if ((data.channel === 'voice' && data.source_entity !== 'VoiceCall') ||
      (data.channel === 'sms' && data.source_entity !== 'PhoneMessage')) {
    throw new Error('bridge_channel_mismatch');
  }
  safeRef(data.source_record_ref);
  safeRef(data.idempotency_key);
  safeRef(data.provider_event_ref);
  const eventAt = validTimestamp(data.occurred_at);
  if (eventAt === null || eventAt > at + MAX_CLOCK_SKEW_MS) throw new Error('bridge_event_time_invalid');

  // Freeze payload identity: the classifier accepts only an envelope verified in this process.
  const envelope = Object.freeze({
    data: Object.freeze(data),
    attestedAt: new Date(at).toISOString(),
    secretKey: secret, // Private in-process only; never serialize this envelope.
  });
  verifiedEnvelopes.add(envelope);
  return envelope;
}

const OPT_OUT = /^(?:stop|stopall|unsubscribe|quit|end|cancel)\s*[.!]?\s*$/i;
const ASK_HUMAN = /\b(?:human|person|representative|call me back|speak to someone|talk to somebody)\b/i;
const SENSITIVE = /\b(?:password|passcode|verification code|social security|ssn|credit card|debit card|account number|bank routing|wire transfer|payment details|medical record|tax record|login credentials|api key)\b/i;
const SALES = /\b(?:quote|estimate|pricing|price|purchase|buy|demo|consultation|proposal|need help|interested)\b/i;
const SUPPORT = /\b(?:existing customer|help with my order|technical support|job status|complaint|refund|reschedule)\b/i;
const PRODUCT_MATCHERS = Object.freeze([
  { lane: 'eps', patterns: [/\b(?:roofing|handyman|tree service|yard cleanup|property maintenance|fence|gutter|pressure wash)\b/i] },
  { lane: 'legacy_rescue', patterns: [/\b(?:ibm[\s-]*i|as[\/-]?400|rpg program|cobol|legacy modernization)\b/i] },
  { lane: 'aliev', patterns: [/\b(?:ev charging|ev charger|charging station|charger utilization|vehicle electrification)\b/i] },
  { lane: 'recovery', patterns: [/\b(?:business turnaround|business recovery|save our business|distressed business)\b/i] },
  { lane: 'network', patterns: [/\b(?:evercraft network|mesh network|offline connectivity)\b/i] },
]);
const SCOPE = Object.freeze({
  'eps': 'eps', 'evercraft property services': 'eps',
  'legacy rescue': 'legacy_rescue', 'ibm i rescue': 'legacy_rescue',
  'aliev': 'aliev', 'evercraft recovery': 'recovery',
  'evercraft network': 'network', 'rivet': 'rivet_partner_hold',
});

function chooseLane(data, text) {
  const matched = PRODUCT_MATCHERS.filter((item) => item.patterns.some((re) => re.test(text))).map((item) => item.lane);
  const declared = SCOPE[asText(data.product_scope).toLowerCase()] ?? null;
  if (declared === 'rivet_partner_hold' || /\brivet\b/i.test(text)) {
    return { lane: 'rivet_partner_hold', confidence: 'partner_governance_review' };
  }
  const choices = new Set(matched);
  if (declared) choices.add(declared);
  if (choices.size !== 1) return { lane: 'general_triage', confidence: choices.size ? 'ambiguous' : 'unclassified' };
  return { lane: [...choices][0], confidence: matched.length ? 'keyword_candidate' : 'declared_scope_only' };
}

export function planRavenPhoneDemand(envelope) {
  if (!verifiedEnvelopes.has(envelope)) throw new Error('verified_bridge_envelope_required');
  const { data, secretKey, attestedAt } = envelope;
  const fullText = [asText(data.text_content), asText(data.content_summary), asText(data.intent)].filter(Boolean).join(' ').slice(0, 12000);
  const customerText = asText(data.text_content);
  let intent, route, lane, confidence;
  if (data.channel === 'sms' && OPT_OUT.test(customerText)) {
    intent = 'opt_out'; route = 'compliance_suppression_review';
    lane = 'compliance'; confidence = 'explicit_opt_out_keyword';
  } else if (data.sensitive_action_blocked === true || SENSITIVE.test(fullText)) {
    intent = 'sensitive_action'; route = 'restricted_human_review';
    lane = 'restricted'; confidence = 'sensitive_flag_or_keyword';
  } else if (data.human_gate_required === true || ASK_HUMAN.test(fullText)) {
    intent = 'human_requested'; route = 'human_followup_review';
    const match = chooseLane(data, fullText); lane = match.lane; confidence = match.confidence;
  } else if (data.event_type === 'call_started' && !fullText) {
    intent = 'unclassified'; route = 'await_call_intent';
    lane = 'general_triage'; confidence = 'call_started_not_a_lead';
  } else {
    const match = chooseLane(data, fullText);
    lane = match.lane; confidence = match.confidence;
    intent = SALES.test(fullText) ? 'potential_sales_inquiry' :
      SUPPORT.test(fullText) ? 'potential_support_inquiry' : 'unclassified';
    route = lane === 'rivet_partner_hold' ? 'partner_governance_review' : 'systemia_intake_review';
  }

  const stableKey = hmac(secretKey, [
    data.source_system, data.channel, data.provider_event_ref, data.idempotency_key,
  ].join('\x1f')).toString('hex');
  const conversationKey = hmac(secretKey,
    data.source_system + '\x1f' + data.channel + '\x1f' + data.provider_event_ref).toString('hex');
  return Object.freeze({
    schema: 'evercraft.systemia.raven-phone-demand-candidate.v1',
    observed_at: attestedAt, source: 'raven_nexus', channel: data.channel,
    event_key: 'raven:event:' + stableKey.slice(0, 32),
    conversation_key: 'raven:conversation:' + conversationKey.slice(0, 32),
    intent_class: intent, lane_candidate: lane, classification_evidence: confidence,
    next_gate: route, state: 'systemia_admission_candidate',
    provider_receipt_required: true, durable_deduplication_required: true,
    current_source_attestation: 'raven_bridge_hmac_verified_only',
    outbound_authorized: false, callback_authorized: false,
    booking_confirmed: false, offer_approved: false,
    payment_verified: false, delivery_verified: false,
    no_pii_in_candidate: true,
    // Systemia ingestion MUST atomically enforce event_key uniqueness in its durable store.
    // This stateless module does not claim duplicate suppression or provider-side delivery.
  });
}
