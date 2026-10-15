import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCommercialTopology,auditCommercialTopologyFromDisk} from '../scripts/audit-evercraft-commercial-topology.mjs';

function sample(){
 return {
  capabilities:{capabilities:[{public_id:'audit-v1',name:'Audit',commercial_state:'sell_now',machine_state:'payment_ready',start_url:null,start_url_state:'held_no_owned_public_origin'}]},
  buyerDoors:{live_buyer_home:'https://example.org/buy',revenue_verified_usd:null,offers:[{slug:'sample',offer_key:'offer-sample-v1',amount_cents:4900,currency:'usd',buyer_url:'https://example.org/buy?offer=sample',payment_receipt_state:'not_observed',buyer_form_state:'synthetic_test_only'}]},
  directDoors:{products:[{slug:'sample-product',state:'held',direct_callable:false,registry_published:false,mcp_url:null}]},
  registry:{products:[{product_key:'sample'}]},
 };
}
test('source sell_now with held owned start is not treated as checkout-ready',()=>{
 const out=inspectCommercialTopology(sample());
 assert.equal(out.ok,true);
 assert.equal(out.counts.sell_now_missing_owned_start_count,1);
 assert.equal(out.source_capabilities[0].commercial_release_state,'HOLD_NO_OWNED_START');
 assert.equal(out.approved_buyer_forms[0].independently_verified_paid_receipt,false);
});
test('wrong offer URL, duplicate slug and unjustified paid claim fail closed',()=>{
 const x=sample();
 x.buyerDoors.offers[0].buyer_url='https://example.org/other';
 x.buyerDoors.offers[0].payment_receipt_state='paid_verified';
 x.buyerDoors.offers.push({...x.buyerDoors.offers[0]});
 const out=inspectCommercialTopology(x);
 assert.equal(out.ok,false);
 assert.ok(out.errors.some(v=>v.startsWith('unapproved_or_missing_offer_url')));
 assert.ok(out.errors.some(v=>v.startsWith('duplicate_or_invalid_offer_slug')));
 assert.ok(out.errors.some(v=>v.startsWith('unsupported_payment_receipt_claim')));
});
test('duplicate capabilities and fake verified start are rejected',()=>{
 const x=sample();
 x.capabilities.capabilities.push({...x.capabilities.capabilities[0],start_url_state:'verified'});
 const out=inspectCommercialTopology(x);
 assert.equal(out.ok,false);
 assert.ok(out.errors.includes('duplicate_or_invalid_capability_id'));
 assert.ok(out.errors.includes('verified_start_has_no_https_url:audit-v1'));
});
test('missing critical source data is not silently reinterpreted as empty',()=>{
 assert.throws(()=>inspectCommercialTopology({}),/missing_or_wrong_shape/);
});
test('real repository source topology is internally consistent but not proven live',()=>{
 const r=auditCommercialTopologyFromDisk();
 assert.equal(r.ok,true,JSON.stringify(r.errors));
 assert.ok(r.counts.capability_source_count>=40);
 assert.ok(r.counts.separately_advertised_selected_offers>=13);
 assert.ok(r.counts.direct_specialist_products>=10);
 assert.equal(r.evidence_class,'REPOSITORY_SNAPSHOT_ONLY');
 assert.equal(r.counts.provider_verified_payments_observed_in_source,0);
});
