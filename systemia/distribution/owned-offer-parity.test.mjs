import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reconcileOwnedOfferCatalog} from './owned-offer-parity.mjs';

const root=new URL('../../',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const buyerDoors=read('public/.well-known/evercraft-payments-buyer-doors.json');
const capabilities=read('public/chum/capabilities.json');
const publicOffers=read('systemia/distribution/owned-offer-parity-fixture.json');

const make=(pub=publicOffers,buyer=buyerDoors,catalog=capabilities)=>
  reconcileOwnedOfferCatalog({publicOffers:pub,buyerDoors:buyer,capabilities:catalog});

test('all fifteen public pages have approved exact price and no silent payment claims',()=>{
 const x=make();
 assert.equal(x.declared_public_offer_count,15);
 assert.equal(x.buyer_snapshot_offer_count,13);
 assert.deepEqual(x.missing_approved_buyer_slugs,[]);
 assert.deepEqual(x.mismatches,[]);
 assert.equal(x.provider_paid_verified,false);
 assert.equal(x.safe_to_claim_end_to_end,false);
 assert.equal(x.routes.filter(q=>q.checkout_post_verified).length,0);
});
test('approved part-quick human SKU is normalized from native findmypart slug',()=>{
 const x=make();assert.equal(x.routes.find(q=>q.slug==='findmypart').expected_cents,1900);
});
test('unknown external pseudo public IDs cannot silently become capability IDs',()=>{
 const x=make();
 assert.ok(x.generic_or_unverified_id_count>=9);
 assert.equal(x.routes.find(q=>q.slug==='workflow-xray').canonical_capability_mapping,'unverified_or_generic_payment_id');
});
test('price drifting one cent fails',()=>{
 const fake=structuredClone(publicOffers);
 fake.offers.find(x=>x.slug==='workflow-xray').price='$250.01';
 const result=make(fake);
 assert.ok(result.mismatches.some(x=>x.slug==='workflow-xray'&&x.failures.includes('price_drift')));
});
test('refuse external domain, relative URL, missing consent and fictitious paid state',()=>{
 const fake=structuredClone(publicOffers);
 const a=fake.offers.find(x=>x.slug==='website-audit');
 a.url='https://stranger.example/offers/website-audit';
 a.human_confirmation_required=false;
 a.paid_delivery_verified=true;
 const issues=make(fake).mismatches.find(x=>x.slug==='website-audit').failures;
 assert.ok(issues.includes('unexpected_host_or_slug'));
 assert.ok(issues.includes('human_confirmation_not_declared'));
 assert.ok(issues.includes('paid_state_misrepresented'));
});
test('refuse duplicate slugs',()=>{
 const fake=structuredClone(publicOffers);fake.offers.push({...fake.offers[0]});
 assert.throws(()=>make(fake),/duplicate_or_invalid_public_slug/);
});
test('refuse unapproved SKU and missing exact price reference',()=>{
 const fake=structuredClone(publicOffers);
 fake.offers.push({public_id:'unknown',slug:'unknown',price:'$250',url:'https://fabric.systemiacommandcenters.com/offers/unknown',human_confirmation_required:true,checkout_is_not_payment:true,paid_delivery_verified:false});
 const x=make(fake);
 assert.ok(x.mismatches.find(y=>y.slug==='unknown').failures.includes('no_approved_price_reference'));
});
