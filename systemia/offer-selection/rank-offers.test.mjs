import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rankOffers,evidence} from './rank-offers.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../../public/.well-known/evercraft-machine-catalog.json',import.meta.url),'utf8'));
test('selects one existing priced catalog offer and does not claim payment',()=>{
 const result=rankOffers({catalog});
 assert.equal(result.first_offer.public_id,'ibmi-rescue-v1');
 assert.equal(result.first_offer.entry_offer,'IBM i 7.4 Deadline X-Ray');
 assert.equal(result.first_offer.entry_offer_key,'ibmi_74_deadline_xray_250');
 assert.equal(result.first_offer.entry_price_published,'$250');
 assert.equal(result.first_offer.analyst_score,79);
 assert.equal(result.eligible_sell_now_offer_count,catalog.sell_now_count);
 assert.equal(result.first_offer.is_sales_proven,false);
 assert.equal(result.first_offer.first_party_order_evidence,'not_verified');
 assert.equal(result.first_offer.evidence_refs.some(url=>url.includes('ibm.com')),true);
 assert.equal(result.no_outreach_authority,true);
 assert.equal(result.no_purchase_authority,true);
});
test('only ranks five compared current offers, not fabricated sales or leads',()=>{
 const result=rankOffers({catalog});
 assert.equal(result.ranking.length,5);
 assert.equal(new Set(result.ranking.map(x=>x.public_id)).size,5);
 assert.equal(result.ranking.every(x=>x.is_sales_proven===false),true);
 assert.equal(result.ranking.every(x=>x.first_party_order_evidence==='not_verified'),true);
 assert.equal(result.ranking[1].public_id,'findmypart-paid-hunt-v1');
});
test('fails closed when canonical catalog has removed named offer',()=>{
 const copy=structuredClone(catalog);
 copy.offers=copy.offers.filter(x=>x.public_id!=='ibmi-rescue-v1');
 assert.throws(()=>rankOffers({catalog:copy}),/unknown_published_offer/);
});
test('fails closed on invalid analyst rubric or fabricated entry name',()=>{
 const copy=structuredClone(evidence);
 copy.candidates[0].ratings.time_specific_buyer_trigger=9;
 assert.throws(()=>rankOffers({catalog,evidencePack:copy}),/analyst_rating_invalid/);
 const changed=structuredClone(evidence);
 changed.candidates[0].entry_offer='Not a published offer';
 assert.throws(()=>rankOffers({catalog,evidencePack:changed}),/canonical_entry_mismatch/);
});
test('does not select a discovery-only product as first sell-now',()=>{
 const copy=structuredClone(catalog);
 copy.offers.find(x=>x.public_id==='ibmi-rescue-v1').commercial_state='verification_required';
 const result=rankOffers({catalog:copy});
 assert.notEqual(result.first_offer.public_id,'ibmi-rescue-v1');
 assert.equal(result.ranking.find(x=>x.public_id==='ibmi-rescue-v1').eligible,false);
});

test('held historical Website Audit rank keeps evidence without a purchasable price',()=>{
 const result=rankOffers({catalog});
 const audit=result.ranking.find(x=>x.public_id==='audit-center-website-audit-machine-v1');
 assert.ok(audit);
 assert.equal(audit.eligible,false);
 assert.equal(audit.entry_price_published,null);
 assert.equal(audit.entry_offer_key,null);
 assert.equal(audit.entry_offer_state,'withdrawn_not_purchasable');
 assert.ok(audit.critical_unknowns.some(x=>x.includes('No payment path permitted')));
});
