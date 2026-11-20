import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOutreachReceipts} from './outreach-receipt-audit.mjs';

const now = '2026-11-20T12:00:00Z';
const hmacSecret = 'synthetic-test-only-never-use-in-production-1234';
const coverage = {complete:true,from:'2026-11-19T10:00:00Z',through:now};
const event = (provider_id,contact,kind,observed_at='2026-11-20T11:00:00Z') =>
 ({source:'authenticated_provider',provider_id,contact,kind,observed_at});
const audit = (events, rest={}) => auditOutreachReceipts({events,now,hmacSecret,coverage,...rest});

test('count distinct sends, not recipients or duplicate receipt rows', () => {
  const x=event('m-1','first@example.test','sent');
  const res=audit([x,x,event('m-1','second@example.test','sent')]);
  assert.equal(res.summary.unique_sent_messages_last_24h,1);
  assert.equal(res.summary.recipient_count,2);
  assert.equal(res.summary.duplicate_receipts_discarded,1);
});
test('single recent unanswered contact is held, automatic reply does not open it', () => {
  const r=audit([event('s','first@example.test','sent'),event('auto','first@example.test','auto_reply')]);
  assert.equal(r.contacts[0].status,'HOLD');
  assert.equal(r.contacts[0].reason,'recent_outbound_no_human_reply');
  assert.equal(r.summary.human_replies_observed,0);
});
test('two workstreams to same recipient are flagged', () => {
  const r=audit([event('agentA','first@example.test','sent'),event('agentB','FIRST@example.test','sent')]);
  assert.equal(r.summary.recipient_count,1);
  assert.equal(r.contacts[0].reason,'multiple_unanswered_outbounds');
});
test('permanent DSN denies outreach even when normal sent receipt exists', () => {
  const r=audit([event('a','bad@example.test','sent','2026-11-19T12:00:00Z'),event('dsn','bad@example.test','hard_bounce')]);
  assert.deepEqual([r.contacts[0].status,r.contacts[0].reason],['DENY','address_hard_bounced']);
});
test('delivery delay holds; opting out denies; human replies do not grant send authority', () => {
  const s=audit([event('a','one@example.test','sent'),event('soft','one@example.test','soft_bounce')]);
  assert.equal(s.contacts[0].reason,'unresolved_delivery_delay');
  const o=audit([event('p','one@example.test','opt_out')]);
  assert.equal(o.contacts[0].reason,'channel_opted_out');
  const h=audit([event('a','one@example.test','sent','2026-11-19T00:00:00Z'),event('h','one@example.test','human_reply')]);
  assert.equal(h.contacts[0].status,'MANUAL_REVIEW');
  assert.equal(h.send_authority,'NONE_READ_ONLY');
});
test('incomplete 24-hour coverage means no known send capacity', () => {
  const r=audit([event('a','one@example.test','sent')],{coverage:{complete:false}});
  assert.equal(r.coverage,'UNKNOWN_INCOMPLETE_FAIL_CLOSED');
  assert.equal(r.summary.soft_cap_remaining_if_coverage_complete,null);
});
test('does not leak addresses, subjects, or message content in JSON output', () => {
  const r=audit([event('mail-s','private-buyer@example.test','sent')]);
  const output=JSON.stringify(r);
  assert.doesNotMatch(output,/private-buyer|example\.test|mail-s/);
  assert.match(r.contacts[0].contact_key,/^[0-9a-f]{64}$/);
});
test('reject unverified source, bad dates, absent strong secret', () => {
  assert.throws(()=>audit([{...event('a','one@example.test','sent'),source:'unverified_snippet'}]),/authenticated_provider/);
  assert.throws(()=>audit([event('a','one@example.test','sent','nonsense')]),/observed_at_invalid/);
  assert.throws(()=>audit([], {hmacSecret:'short'}),/private_hmac_secret/);
});
