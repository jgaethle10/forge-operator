import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFirstOfferCIStatus,renderFirstOfferCIStatus} from './first-offer-ci-status.mjs';

const readiness={mission_key:'systemia-first-commercial-offer-2026-10-07'};
const lineage={integrity_ok:true,git_artifact_byte_parity:true,
 source_only_ephemeral_proof:true,durable_lineage_remote_persisted:false};
const page={state:'externally_verified_buyer_page',verified:true,
 reason:'page_identity_price_and_form_visible',http_status:200};
test('A passing CI, page probe, and ephemeral mirror never unlock commercial release',()=>{
 const r=buildFirstOfferCIStatus({readiness,lineage,probe:page});
 assert.equal(r.release_state,'held');
 assert.equal(r.release_authorized,false);
 assert.equal(r.publication_authorized,false);
 assert.equal(r.checkout_verified,false);
 assert.equal(r.payment_verified,false);
 assert.equal(r.buyer_page.verified,true);
 assert.equal(r.lineage.durable_production_verified,false);
 assert.match(renderFirstOfferCIStatus(r),/Commercial release: HELD/);
});
test('Observed ingress timeout is visible as a hold, not silently green',()=>{
 const r=buildFirstOfferCIStatus({readiness,lineage,probe:{
  state:'held',verified:false,reason:'public_tcp_443_unreachable',http_status:null
 }});
 assert.equal(r.buyer_page.verified,false);
 assert.ok(r.holds.includes('buyer_page_not_independently_verified'));
 assert.equal(r.next_gate,'independently_verify_owned_https_buyer_page');
 assert.match(renderFirstOfferCIStatus(r),/HELD: public_tcp_443_unreachable/);
});
test('Failure to establish a native mirror is explicitly represented',()=>{
 const r=buildFirstOfferCIStatus({readiness,lineage:{...lineage,integrity_ok:false},probe:page});
 assert.ok(r.holds.includes('ephemeral_lineage_integrity_not_proved'));
 assert.equal(r.lineage.ephemeral_integrity_and_mirror_proved,false);
});
test('Untrusted source status cannot inject markdown or grant authority',()=>{
 const r=buildFirstOfferCIStatus({readiness,lineage,probe:{
  state:'held',verified:true,reason:'bad|<script>\\nrelease ready',http_status:null
 }});
 assert.equal(r.buyer_page.verified,false);
 assert.equal(r.release_authorized,false);
 assert.doesNotMatch(renderFirstOfferCIStatus(r),/<script>/);
});
test('Absent source evidence fails closed',()=>{
 assert.throws(()=>buildFirstOfferCIStatus({readiness,lineage}),/all_ci_evidence_required/);
});
