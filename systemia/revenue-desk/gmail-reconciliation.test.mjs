import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileGmailOutreach,checkOutboundCandidate} from './gmail-reconciliation.mjs';
const key='test-only-hmac-secret-longer-than-32-bytes-20261119';
const now='2026-11-19T20:00:00-08:00';
const prospect=(over={})=>({
 prospect_key:'buyer-001',business_email:'orders@acme.example',stage:'researched',
 official_contact_verified:true,provider_status_verified:true,legal_requirements_verified:true,
 delivery_scope_verified:true,passport_exact_message_permit_verified:true,
 source_ref:'https://first-party.example/request',pain_evidence_ref:'first-party:project:nov-2026',
 ...over
});
const email=(i,to,at='2026-11-19T19:00:00-08:00')=>({
 message_id:'mail-'+i,thread_id:'thread-'+i,direction:'outbound',
 from_address:'outreach@evercraft.example',to_addresses:[to],occurred_at:at
});
const args=(additional={})=>({
 messages:[],prospects:[prospect()],now,hmacKey:key,historyComplete:true,
 providerDailyCap:500,coldTarget:400,replyReserve:100,...additional
});

test('real Gmail sent receipt blocks repeat contact and enforces 72-hour cooldown',()=>{
 const result=reconcileGmailOutreach(args({messages:[email(1,'Orders@ACME.Example')]}));
 assert.equal(result.quota.rolling_24h_units,1);
 assert.equal(result.prospects[0].prior_contact,true);
 assert.equal(result.prospects[0].last_contact_ref,'gmail:mail-1');
 assert.ok(result.prospects[0].reasons.includes('cooldown_active'));
 assert.ok(result.prospects[0].reasons.includes('prior_contact_reconcile_before_new_outreach'));
 assert.equal(result.prospects[0].send_authorized,false);
 const text=JSON.stringify(result);
 assert.ok(!text.includes('orders@acme.example'));
 assert.ok(!text.includes('https://first-party.example/request'));
});

test('rolling 24h counts EVERY outgoing message including replies and holds cold #401',()=>{
 const messages=Array.from({length:400},(_,i)=>email(i,'recipient'+i+'@example.test'));
 const result=reconcileGmailOutreach(args({messages}));
 assert.equal(result.quota.rolling_24h_units,400);
 assert.equal(result.quota.cold_budget_remaining,0);
 assert.equal(result.quota.provider_units_remaining,100);
 assert.ok(result.prospects[0].reasons.includes('cold_outreach_quota_exhausted'));
 assert.equal(result.quota.allow_unattended_sending,false);
 const after=reconcileGmailOutreach(args({messages:[
  ...messages,email(401,'reply@customer.test')] }));
 assert.equal(after.quota.rolling_24h_units,401);
 assert.equal(after.quota.provider_units_remaining,99);
});

test('incomplete Gmail coverage, unknown cap or unknown recipient fails closed',()=>{
 const partial=reconcileGmailOutreach(args({historyComplete:false}));
 assert.equal(partial.quota.quota_verified,false);
 assert.equal(partial.quota.cold_budget_remaining,null);
 assert.equal(partial.prospects[0].actionable_as_new_cold_target,false);
 const noCap=reconcileGmailOutreach(args({providerDailyCap:null}));
 assert.equal(noCap.quota.quota_verified,false);
 const bad=reconcileGmailOutreach(args({messages:[{message_id:'x',direction:'outbound',occurred_at:now,to_addresses:[]}]}));
 assert.equal(bad.record_coverage.invalid,1);
 assert.equal(bad.quota.quota_verified,false);
});

test('Gmail inbound buyer reply differs from bounce or auto reply; cannot verify payment',()=>{
 const messages=[email(1,'orders@acme.example'),
 {message_id:'r1',thread_id:'thread-1',direction:'inbound',occurred_at:'2026-11-19T19:05:00-08:00',
   from_address:'orders@acme.example',to_addresses:['outreach@evercraft.example']},
 {message_id:'auto',direction:'inbound',occurred_at:'2026-11-19T19:05:00-08:00',
   from_address:'robot@example.test',is_auto_reply:true,to_addresses:['outreach@evercraft.example']},
 {message_id:'bounce',direction:'inbound',occurred_at:'2026-11-19T19:05:00-08:00',
   from_address:'mailer@example.test',is_bounce:true,to_addresses:['outreach@evercraft.example']}];
 const r=reconcileGmailOutreach(args({messages}));
 assert.equal(r.prospects[0].stage,'replied');
 assert.equal(r.funnel.inbound_non_auto_messages,1);
 assert.equal(r.funnel.newly_paid_orders_verified,0);
 assert.equal(r.paid_revenue_verified,false);
 assert.equal(r.customer_acceptance_verified,false);
});

test('suppress opted out, bounced, declined, and unfulfilled work',()=>{
 for(const status of ['opted_out','bounced','declined','do_not_contact','customer_hold']){
  const r=reconcileGmailOutreach(args({prospects:[prospect({contact_state:status})]}));
  assert.ok(r.prospects[0].reasons.includes('suppressed_or_customer_hold'));
  assert.equal(r.prospects[0].actionable_as_new_cold_target,false);
 }
 const duty=reconcileGmailOutreach(args({prospects:[prospect({unfulfilled_commitment:true})]}));
 assert.ok(duty.prospects[0].reasons.includes('complete_customer_commitment_first'));
});

test('candidate check holds if compliance or fulfillment is missing, never sends',()=>{
 const r=reconcileGmailOutreach(args());
 assert.equal(r.prospects[0].actionable_as_new_cold_target,true);
 const first=checkOutboundCandidate({row:r.prospects[0],quota:r.quota,
 message:'Hello Acme. A source-backed invoice flow was described in your public owner brief on Wednesday. Here is a one-screen QA pilot.',
 opportunity:{buyer_specific_opening:'Your public brief requests quote intake QA',fixed_scope_deliverables:'one intake-path audit',verified_offer_ref:'owner:offer:audit'},
 sender:{}});
 assert.equal(first.decision,'hold');
 assert.ok(first.reasons.includes('valid_postal_address_missing'));
 assert.ok(first.reasons.includes('working_opt_out_missing'));
 const good=checkOutboundCandidate({row:r.prospects[0],quota:r.quota,
 message:'Hello Acme. You asked for a checkout-path fix in your recent brief. We offer a bounded source-backed review for your specific issue.',
 opportunity:{buyer_specific_opening:'Owner requested checkout QA',fixed_scope_deliverables:'a bounded QA report',verified_offer_ref:'evercraft:public-offer'},
 sender:{spf_dkim_dmarc_verified:true,postal_address_verified:true,
 postal_address:'verified fixture-only commercial address',opt_out_functional_verified:true,
 opt_out_instructions:'reply stop',suppression_current:true,bounce_health_verified:true,hourly_owner_signoff:true}});
 assert.equal(good.decision,'candidate_passed_non_authoritative_preflight');
 assert.equal(good.ready_to_send,false);
 assert.equal(good.must_recheck_passport_ledger_and_gmail_before_send,true);
});

test('two agents cannot treat an unsent shared buyer as two independent cold prospects',()=>{
 const r=reconcileGmailOutreach(args({prospects:[
  prospect({prospect_key:'agent-grok-target',business_email:'buyer@shared.example'}),
  prospect({prospect_key:'agent-harbor-target',business_email:'BUYER@SHARED.EXAMPLE'})
 ]}));
 assert.equal(r.prospects.length,2);
 assert.equal(r.prospects.filter(p=>p.actionable_as_new_cold_target).length,1);
 assert.ok(r.prospects[1].reasons.includes('duplicate_contact_across_agents'));
});
test('same opportunity with a second verified company mailbox cannot evade existing Gmail contact history',()=>{
 const sent=email('existing','owner@company.example');
 const r=reconcileGmailOutreach(args({messages:[sent],prospects:[
  prospect({prospect_key:'one-project',business_email:'new@company.example'}),
  prospect({prospect_key:'one-project',business_email:'owner@company.example'})
 ]}));
 assert.equal(r.prospects.filter(p=>p.actionable_as_new_cold_target).length,0);
 assert.equal(r.prospects[0].last_contact_ref,'gmail:mail-existing');
 assert.ok(r.prospects[0].reasons.includes('prior_contact_reconcile_before_new_outreach'));
 assert.ok(r.prospects[1].reasons.includes('duplicate_opportunity_across_agents'));
});


const verifiedDsn=(over={})=>({
 dsn_message_id:'dsn-001',original_sent_message_id:'mail-1',
 recipient_address:'orders@acme.example',
 delivery_state:'permanent_failure',occurred_at:'2026-11-19T19:12:00-08:00',
 source_kind:'gmail_delivery_status_notification',source_verified_by_operator:true,...over
});

test('an operator-verified permanent DSN for the exact Gmail recipient creates a bounce hold',()=>{
 const r=reconcileGmailOutreach(args({messages:[email(1,'orders@acme.example')],
   deliveryEvents:[verifiedDsn()]}));
 assert.equal(r.delivery_event_coverage.accepted,1);
 assert.equal(r.delivery_event_coverage.hard_bounces,1);
 assert.equal(r.prospects[0].contact_state,'bounced');
 assert.ok(r.prospects[0].reasons.includes('verified_dsn_hard_bounce_hold'));
 assert.equal(r.prospects[0].delivery_status_hold_ref,'gmail:dsn-001');
 assert.equal(r.prospects[0].actionable_as_new_cold_target,false);
 assert.equal(r.provider_delivery_verified,false);
 assert.ok(!JSON.stringify(r).includes('orders@acme.example'));
});

test('temporary Gmail delivery delay is a hold, not a permanent bounce or a reply',()=>{
 const r=reconcileGmailOutreach(args({messages:[email(1,'orders@acme.example')],
   deliveryEvents:[verifiedDsn({delivery_state:'temporary_delay'})]}));
 assert.equal(r.delivery_event_coverage.pending_delays,1);
 assert.equal(r.delivery_event_coverage.hard_bounces,0);
 assert.equal(r.prospects[0].contact_state,'delivery_delayed');
 assert.ok(r.prospects[0].reasons.includes('verified_dsn_delivery_delay_hold'));
 assert.equal(r.prospects[0].actionable_as_new_cold_target,false);
 assert.equal(r.funnel.inbound_non_auto_messages,0);
});

test('a DSN for a different recipient cannot fabricate another recipient bounce',()=>{
 const r=reconcileGmailOutreach(args({messages:[email(1,'other@acme.example')],
   deliveryEvents:[verifiedDsn()]}));
 assert.equal(r.delivery_event_coverage.accepted,0);
 assert.equal(r.delivery_event_coverage.rejected,1);
 assert.equal(r.record_coverage.invalid,1);
 assert.equal(r.quota.quota_verified,false);
 assert.equal(r.prospects[0].contact_state,'unknown');
 assert.equal(r.prospects[0].actionable_as_new_cold_target,false);
});

test('unverified DSN assertions fail closed without claiming a verified bounce',()=>{
 const r=reconcileGmailOutreach(args({messages:[email(1,'orders@acme.example')],
   deliveryEvents:[verifiedDsn({source_verified_by_operator:false})]}));
 assert.equal(r.delivery_event_coverage.rejected,1);
 assert.equal(r.delivery_event_coverage.hard_bounces,0);
 assert.equal(r.prospects[0].contact_state,'unknown');
 assert.equal(r.quota.quota_verified,false);
});

test('permanent failure beats a later delay and duplicate DSN ids are not recounted',()=>{
 const b=verifiedDsn();
 const r=reconcileGmailOutreach(args({messages:[email(1,'orders@acme.example')],
   deliveryEvents:[b,b,verifiedDsn({dsn_message_id:'dsn-002',delivery_state:'temporary_delay',occurred_at:'2026-11-19T19:20:00-08:00'})]}));
 assert.equal(r.delivery_event_coverage.accepted,2);
 assert.equal(r.delivery_event_coverage.hard_bounces,1);
 assert.equal(r.prospects[0].contact_state,'bounced');
 assert.equal(r.prospects[0].delivery_status_hold_ref,'gmail:dsn-001');
});

test('delivery status never grants automatic sending or claims provider confirmation',()=>{
 const r=reconcileGmailOutreach(args({messages:[email(1,'orders@acme.example')],
   deliveryEvents:[verifiedDsn()]}));
 assert.equal(r.delivery_event_coverage.operator_asserted_evidence_only,true);
 assert.equal(r.delivery_event_coverage.provider_delivery_verified,false);
 assert.equal(r.quota.allow_unattended_sending,false);
 assert.equal(r.prospects[0].send_authorized,false);
 assert.equal(r.send_performed,false);
});
