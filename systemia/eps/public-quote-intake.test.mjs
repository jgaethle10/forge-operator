import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEpsQuoteIntakeRequest, buildEpsQuoteReceipt } from './public-quote-intake.mjs';

test('builds an inert Intake Fabric request without legacy runtime authority',()=>{
  const req=buildEpsQuoteIntakeRequest({
    name:'Test Customer',
    phone:'509-555-0100',
    location:'Yakima, WA',
    service:'yard cleanup',
    details:'Back yard and haul-off'
  },{
    adapterActorRef:'passport:eps-public-form',
    receivedAt:'2026-10-05T22:00:00.000Z'
  });
  assert.equal(req.source_type,'form');
  assert.equal(req.source_ref,'eps-public-quote-form');
  assert.equal(req.source_trust_state,'untrusted_external');
  assert.match(req.content_fingerprint,/^sha256:[a-f0-9]{64}$/);
  assert.equal(req.payload.execution_authority_granted,false);
  assert.equal(req.payload.customer_obligation_created,false);
  assert.doesNotMatch(JSON.stringify(req),/base44/i);
});

test('dedupe identity is deterministic for identical quote content',()=>{
  const input={name:'A',phone:'B',location:'Yakima',service:'cleanup'};
  const a=buildEpsQuoteIntakeRequest(input,{adapterActorRef:'actor',receivedAt:'2026-10-05T22:00:00Z'});
  const b=buildEpsQuoteIntakeRequest(input,{adapterActorRef:'actor',receivedAt:'2026-10-05T22:00:01Z'});
  assert.equal(a.content_fingerprint,b.content_fingerprint);
  assert.equal(a.external_event_id,b.external_event_id);
  assert.equal(a.idempotency_key,b.idempotency_key);
});

test('quote receipt cannot be mistaken for contract or payment',()=>{
  const req=buildEpsQuoteIntakeRequest({name:'A',phone:'B',location:'Yakima',service:'cleanup'},{adapterActorRef:'actor'});
  const receipt=buildEpsQuoteReceipt(req);
  assert.equal(receipt.accepted_for_intake,true);
  assert.equal(receipt.execution_authority_granted,false);
  assert.equal(receipt.customer_obligation_created,false);
  assert.equal(receipt.payment_created,false);
  assert.match(receipt.receipt_hash,/^sha256:[a-f0-9]{64}$/);
});

test('required contact and scope fields fail closed',()=>{
  assert.throws(()=>buildEpsQuoteIntakeRequest({name:'A',phone:'B',location:'Yakima'},{adapterActorRef:'actor'}),/service_required/);
});
