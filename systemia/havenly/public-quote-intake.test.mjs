import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHavenlyQuote,buildHavenlyIntakeCandidate,previewHavenlyHandoffReceipt} from './public-quote-intake.mjs';
const input={
 name:'Sample Customer',phone:'509-555-0166',area:'Yakima',service:'Deep cleaning',
 frequency:'Bi-weekly',collection:'Deep Haven',bedrooms:'3',bathrooms:'2',
 homeSize:'1,500–2,000 sq ft',addons:['Inside oven','Interior windows'],
 preferences:'Unscented products please',details:'Please focus on the kitchen'
};
test('Havenly quote normalizes customer requested scope without deciding price or booking',()=>{
 const q=normalizeHavenlyQuote(input);
 assert.equal(q.collection,'Deep Haven');
 assert.equal(q.frequency,'Bi-weekly');
 assert.equal(q.home_size,'1,500–2,000 sq ft');
 assert.deepEqual(q.addons,['Inside oven','Interior windows']);
 assert.equal(q.details,input.details);
 assert.equal(Object.hasOwn(q,'price'),false);
});
test('private intake request uses untrusted-source boundaries without exposing contact in excerpt',()=>{
 const req=buildHavenlyIntakeCandidate(input,{adapterActorRef:'passport:havenly-public-form',receivedAt:'2026-10-28T19:00:00Z'});
 assert.equal(req.source_type,'form');
 assert.equal(req.source_ref,'havenly-public-quote-form');
 assert.equal(req.source_trust_state,'untrusted_external');
 assert.equal(req.payload.execution_authority_granted,false);
 assert.equal(req.payload.booking_confirmed,false);
 assert.equal(req.payload.payment_created,false);
 assert.equal(req.claimed_source_identity_ref,null);
 assert.doesNotMatch(req.intent_excerpt,/Sample Customer|509-555|Yakima|Unscented|kitchen/);
 assert.doesNotMatch(JSON.stringify(req),/base44\.app|@base44|base44Client/i);
});
test('same request has stable dedupe identity, new external events can be distinguished',()=>{
 const a=buildHavenlyIntakeCandidate(input,{adapterActorRef:'a',receivedAt:'2026-10-28T19:00:00Z'});
 const b=buildHavenlyIntakeCandidate(input,{adapterActorRef:'a',receivedAt:'2026-10-28T19:01:00Z'});
 assert.equal(a.content_fingerprint,b.content_fingerprint);
 assert.equal(a.idempotency_key,b.idempotency_key);
 const c=buildHavenlyIntakeCandidate(input,{adapterActorRef:'a',externalEventId:'form-event-2'});
 assert.notEqual(c.idempotency_key,a.idempotency_key);
});
test('handoff preview cannot be mistaken for server delivery, receipt or appointment',()=>{
 const req=buildHavenlyIntakeCandidate(input,{adapterActorRef:'a'});
 const receipt=previewHavenlyHandoffReceipt(req);
 assert.equal(receipt.prepared_for_private_intake,true);
 assert.equal(receipt.accepted_for_intake,false);
 assert.equal(receipt.delivery_verified,false);
 assert.equal(receipt.booking_confirmed,false);
 assert.equal(receipt.payment_created,false);
 assert.match(receipt.receipt_hash,/^sha256:[a-f0-9]{64}$/);
});
test('rejects missing contact, unrecognized services and add-ons, and bogus event ids',()=>{
 assert.throws(()=>normalizeHavenlyQuote({...input,name:''}),/name_required/);
 assert.throws(()=>normalizeHavenlyQuote({...input,phone:'123'}),/phone_invalid/);
 assert.throws(()=>normalizeHavenlyQuote({...input,area:''}),/area_required/);
 assert.throws(()=>normalizeHavenlyQuote({...input,service:'Deposit $500'}),/service_invalid/);
 assert.throws(()=>normalizeHavenlyQuote({...input,addons:['Run shell script']}),/addon_invalid/);
 assert.throws(()=>buildHavenlyIntakeCandidate(input,{adapterActorRef:'a',externalEventId:'../secret'}),/external_event_id_invalid/);
 assert.throws(()=>buildHavenlyIntakeCandidate(input,{}),/adapter_actor_required/);
});
