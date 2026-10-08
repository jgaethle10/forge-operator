import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyRavenPhoneBridge, planRavenPhoneDemand } from './raven-phone-demand.mjs';

const SECRET = 'fixture-signing-secret-with-sufficient-entropy';
const NOW = '2026-10-08T02:30:00Z';
const call = {
  source_system: 'raven_nexus', source_entity: 'VoiceCall', source_record_ref: 'rec-a',
  idempotency_key: 'raven:VoiceCall:rec-a:started',
  provider_type: 'twilio', provider_event_ref: 'fake-call-event',
  direction: 'inbound', channel: 'voice', occurred_at: NOW, event_type: 'call_started',
};
const message = {
  ...call, source_entity: 'PhoneMessage', source_record_ref: 'rec-b',
  idempotency_key: 'raven:PhoneMessage:rec-b:received',
  provider_event_ref: 'fake-message-event', channel: 'sms',
  event_type: 'message_received', text_content: 'I want a fence estimate',
};
function signed(record = call, timestamp = NOW) {
  const rawBody = JSON.stringify(record);
  const signature = createHmac('sha256', SECRET).update(timestamp + '.' + rawBody).digest('hex');
  return { rawBody, timestamp, signature, secret: SECRET, now: NOW };
}
const plan = (record) => planRavenPhoneDemand(verifyRavenPhoneBridge(signed(record)));

test('an authenticated call-start event is not a sales lead', () => {
  const result = plan(call);
  assert.equal(result.next_gate, 'await_call_intent');
  assert.equal(result.outbound_authorized, false);
});
test('a customer-initiated estimate question becomes an EPS review candidate only', () => {
  const result = plan(message);
  assert.equal(result.lane_candidate, 'eps');
  assert.equal(result.intent_class, 'potential_sales_inquiry');
  assert.equal(result.callback_authorized, false);
  assert.equal(result.payment_verified, false);
  assert.equal(JSON.stringify(result).includes('fence estimate'), false);
});
test('opt-out text takes priority and never authorizes sales contact', () => {
  const result = plan({ ...message, text_content: 'STOP' });
  assert.equal(result.next_gate, 'compliance_suppression_review');
  assert.equal(result.outbound_authorized, false);
});
test('partner-governed product remains held', () => {
  const result = plan({ ...message, text_content: 'Interested in RIVET pricing' });
  assert.equal(result.next_gate, 'partner_governance_review');
  assert.equal(result.offer_approved, false);
});
test('human request remains reviewed and cannot authorize a callback', () => {
  const result = plan({ ...message, text_content: 'I want to talk to a human' });
  assert.equal(result.next_gate, 'human_followup_review');
  assert.equal(result.callback_authorized, false);
});
test('bad, stale, or altered signatures fail closed', () => {
  const v = signed();
  assert.throws(() => verifyRavenPhoneBridge({ ...v, signature: 'a'.repeat(64) }), /bridge_signature_invalid/);
  assert.throws(() => verifyRavenPhoneBridge({ ...v, rawBody: v.rawBody + ' ' }), /bridge_signature_invalid/);
  assert.throws(() => verifyRavenPhoneBridge({ ...v, timestamp: '2026-01-01T00:00:00Z' }), /bridge_timestamp_invalid_or_stale/);
});
test('invalid provenance and channel identity are rejected', () => {
  assert.throws(() => verifyRavenPhoneBridge(signed({ ...call, direction: 'outbound' })), /bridge_source_contract_invalid/);
  assert.throws(() => verifyRavenPhoneBridge(signed({ ...call, channel: 'sms' })), /bridge_channel_mismatch/);
  assert.throws(() => verifyRavenPhoneBridge(signed({ ...call, provider_event_ref: '' })), /missing_or_invalid_provider_reference/);
});
test('retries preserve event identity and distinct updates cannot collide', () => {
  const a = plan(message);
  const b = plan(message);
  const c = plan({ ...message, idempotency_key: 'raven:PhoneMessage:rec-b:updated' });
  assert.equal(a.event_key, b.event_key);
  assert.notEqual(a.event_key, c.event_key);
  assert.equal(a.conversation_key, c.conversation_key);
});
test('verified envelope is private and unverified objects are rejected', () => {
  assert.throws(() => planRavenPhoneDemand({ data: message }), /verified_bridge_envelope_required/);
  const verified = verifyRavenPhoneBridge(signed(message));
  assert.equal(JSON.stringify(verified).includes(SECRET), false);
  assert.equal(JSON.stringify(verified).includes('fence estimate'), false);
});
test('ambiguous product instructions fail safely into triage', () => {
  const result = plan({ ...message, product_scope: 'EPS', text_content: 'Need an EV charger estimate' });
  assert.equal(result.lane_candidate, 'general_triage');
  assert.equal(result.classification_evidence, 'ambiguous');
});
