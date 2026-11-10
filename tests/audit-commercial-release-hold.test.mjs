import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessCommercialReleaseState} from '../scripts/audit-commercial-release-hold.mjs';

const buyerCatalog=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-payments-buyer-doors.json',import.meta.url),'utf8'));
const crosswalk=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-fabric-human-buyer-handoffs.json',import.meta.url),'utf8'));
const HELD='held_provider_http_402_requires_new_payment_receipt';
const REASON='evercraft_public_commercial_mcp_http402_20261017';
const health={ok:true,capability_count:53,source_release_ref:'a'.repeat(40),source_release_ref_bound:true,
 deployment_receipt_bound:false,checkout_operational_state:'held_owned_payment_endpoint_unconfigured',
 checkout_provider_paid_verified:false,human_offer_checkout_enabled:false,
 checkout_purchase_intent_configured:false,checkout_direct_offer_ops_configured:false};
const connections=crosswalk.capabilities.map(c=>({
 ok:true,public_id:c.public_id,transactional:false,external_action_taken:false,
 human_offer_url:null,owned_human_buyer_options:[],human_buyer_options:[],
 human_buyer_options_state:HELD,buyer_checkout_available:false,
 checkout_suppression_reason:REASON,
}));
const check=(options={})=>assessCommercialReleaseState({health,buyerCatalog,crosswalk,connections,
 asOf:'2026-10-21T21:00:00Z',...options});

test('safe blocked checkout is not falsely advertised as operational or paid',()=>{
 const r=check();
 assert.equal(r.safety_ok,true);
 assert.equal(r.state,'HELD_SAFE_NOT_COMMERCIALLY_READY');
 assert.equal(r.commercial_checkout_ready,false);
 assert.equal(r.payment_route_publishable,false);
 assert.equal(r.human_buyer_options_published,0);
 assert.equal(r.capabilities_checked,4);
 assert.equal(r.provider_paid_receipt_verified,false);
 assert.equal(r.signed_deployment_receipt_verified,false);
 assert.equal(r.historic_public_source_buyer_urls,13);
 assert.equal(r.failures.length,0);
});
test('old 13 URLs are recognized only as historical, not a public go-live',()=>{
 const r=check();
 assert.ok(r.findings.includes('historical_buyer_urls_exist_in_public_source_do_not_promote'));
 assert.ok(r.caveats.some(t=>t.includes('NOT a current availability')));
});
test('unauthorized reappearance of buyer links or self-asserted availability fails',()=>{
 const cases=[
  {human_buyer_options:[{offer_slug:'website-audit',human_form_url:'https://evil.example/'}]},
  {human_offer_url:'https://findmypart.base44.app/functions/evercraftBuy'},
  {owned_human_buyer_options:[{offer_slug:'website-audit'}]},
  {buyer_checkout_available:true},
  {human_buyer_options_state:'read_only_exact_price_match_only'},
  {checkout_suppression_reason:null},
  {transactional:true},
  {external_action_taken:true}
 ];
 for(const v of cases){
  const live=structuredClone(connections);Object.assign(live[0],v);
  const r=check({connections:live});
  assert.equal(r.safety_ok,false,JSON.stringify(v));
 }
});
test('missing connection, duplicate connection and unexpected capability fail closed',()=>{
 const all=[connections.slice(1),[connections[0],...connections],
  [...connections,{...connections[0],public_id:'unexpected'}]];
 for(const live of all)assert.equal(check({connections:live}).safety_ok,false);
});
test('missing, malformed, or contradictory source and false paid claims fail',()=>{
 assert.throws(()=>assessCommercialReleaseState({}),/evidence_missing/);
 assert.equal(check({buyerCatalog:{...buyerCatalog,revenue_verified_usd:100}}).safety_ok,false);
 assert.equal(check({buyerCatalog:{...buyerCatalog,offers:[]}}).safety_ok,false);
 assert.equal(check({health:{...health,ok:false}}).safety_ok,false);
 assert.equal(check({health:{...health,checkout_provider_paid_verified:true}}).safety_ok,false);
});
test('owned endpoint config is not a provider-paid event or permission to release buyer URLs',()=>{
 const configured={...health,checkout_operational_state:'owned_transport_requires_independent_checkout_canary',
 checkout_purchase_intent_configured:true,checkout_direct_offer_ops_configured:true,
 human_offer_checkout_enabled:true};
 const r=check({health:configured});
 assert.equal(r.safety_ok,true);
 assert.equal(r.commercial_checkout_ready,false);
 assert.equal(r.provider_paid_receipt_verified,false);
 assert.ok(r.findings.includes('owned_payment_transport_configured_requires_separate_provider_reconciliation'));
});
test('read-only fake health JSON cannot invent a signed deployment receipt',()=>{
 const forged={...health,source_release_ref:'b'.repeat(40),deployment_receipt_bound:true,deployment_receipt_ref:'a'.repeat(64)};
 const r=check({health:forged});
 assert.equal(r.signed_deployment_receipt_verified,false);
 assert.equal(r.settlement_verified,false);
});
