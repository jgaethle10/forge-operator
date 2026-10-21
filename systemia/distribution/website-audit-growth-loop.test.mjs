import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWave,scorecard,trackedLink} from './website-audit-growth-loop.mjs';
test('six unique tagged organic placements and no false publication',()=>{
 const w=buildWave();
 assert.equal(w.placements.length,6);
 assert.equal(new Set(w.placements.map(p=>p.offer_url)).size,6);
 assert.equal(w.publication_authority,false);
 assert.equal(w.systemia_admission,'required_unverified');
 for(const p of w.placements){
  const u=new URL(p.offer_url);
  assert.equal(u.pathname,'/offers/website-audit');
  assert.equal(u.searchParams.get('utm_source'),p.channel);
  assert.equal(u.searchParams.get('utm_campaign'),w.campaign_id);
  assert.match(p.caption,/\$49/);
  assert.equal(p.state,'staged_not_published');
  assert.equal(p.publish_receipt,null);
 }
 assert.equal(w.placements.filter(p=>p.asset===null).length,4);
});
test('tagging rejects other destinations and query injection',()=>{
 assert.throws(()=>trackedLink('unknown','phone-test'),/unsupported_channel/);
 assert.throws(()=>trackedLink('facebook','bad&x=1'),/invalid_treatment/);
});
test('unknown source coverage is not zero',()=>{
 const r=scorecard();
 assert.equal(r.counts.web,null);
 assert.equal(r.counts.payments,null);
 assert.equal(r.submitted_settlement_value_usd,null);
 assert.equal(r.visit_to_payment_rate,null);
});
test('dedupes observed visits and orders; checkout alone is not payment',()=>{
 const events=[
 {type:'visit',receipt_id:'edge1',evidence_provider:'Fabric Edge'},
 {type:'visit',receipt_id:'edge1',evidence_provider:'Fabric Edge'},
 {type:'checkout_intent',receipt_id:'intent1',evidence_provider:'Evercraft Payments'},
 {type:'payment_settled',receipt_id:'pending',evidence_provider:'Evercraft Payments',order_id:'o1'},
 {type:'payment_settled',receipt_id:'paid1',evidence_provider:'Evercraft Payments',order_id:'o1',provider_verified:true,settlement_verified:true},
 {type:'payment_settled',receipt_id:'paid2',evidence_provider:'Evercraft Payments',order_id:'o1',provider_verified:true,settlement_verified:true},
 {type:'audit_delivered',receipt_id:'ship1',evidence_provider:'Systemia Shipping',order_id:'o1',delivery_verified:true}
 ];
 const r=scorecard({events,coverage:{web:true,checkout:true,payments:true,shipping:true}});
 assert.equal(r.counts.web,1);
 assert.equal(r.counts.checkout,1);
 assert.equal(r.counts.payments,1);
 assert.equal(r.counts.shipping,1);
 assert.equal(r.counts.publisher,null);
 assert.equal(r.submitted_settlement_value_usd,49);
 assert.deepEqual(r.receipts_rejected.map(v=>v.reason),['duplicate_receipt','unverified_payment','duplicate_order']);
});
test('complete zero-activity coverage has no fake conversion rate',()=>{
 const r=scorecard({coverage:{web:true,payments:true}});
 assert.equal(r.counts.web,0);assert.equal(r.counts.payments,0);
 assert.equal(r.visit_to_payment_rate,null);
});
