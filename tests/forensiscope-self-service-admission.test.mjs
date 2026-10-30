import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteForensiScopeSelfService as quote,
  evaluateForensiScopeCheckoutGate as gate,
  evaluateForensiScopePaidUpload as upload,
  evaluateForensiScopeResultRelease as release
} from '../systemia/forensiscope/self-service-admission.mjs';

const opts={
  fileName:'recording.MP4',fileSizeBytes:1024*1024,durationSeconds:300,
  mediaRightsConfirmed:true
};
const ready={
  ingress_max_bytes:64*1024*1024,codec_preflight_verified:true,
  secure_resumable_ingress_verified:true,
  processing_capacity_verified:true,
  private_result_delivery_verified:true,
  exact_offer_payment_route_verified:true
};
const payment={
  verification_source:'evercraft_payments_authoritative_provider_readback',
  provider_paid_verified:true,settlement_verified:true,
  order_key:'paid-order-123456',offer_key:'forensiscope.media_review_5m.v1',
  amount_cents:1500,currency:'usd',provider_receipt_id:'provider:receipt:123'
};
const hash='sha256:'+'a'.repeat(64);
const resultHash='sha256:'+'b'.repeat(64);
function privateResult(u){
 return {
  uploadAdmission:u,sourceSha256:hash,
  analysisReceipt:{
   state:'completed',order_key:payment.order_key,
   source_sha256:hash,result_sha256:resultHash
  },
  accessGrant:{
   verified:true,order_key:payment.order_key,
   scope:'private_result_read',
   expires_at:new Date(Date.now()+60_000).toISOString()
  }
 };
}

test('exact price brackets and strict media preflight',()=>{
 const tiers=[
  [300,1500],[301,3500],[1800,3500],[1801,7500],
  [7200,7500],[7201,14900],[21600,14900],[21601,24900],[43200,24900]
 ];
 for(const [seconds,cents] of tiers){
  const q=quote({...opts,durationSeconds:seconds});
  assert.equal(q.amount_cents,cents,String(seconds));
  assert.equal(q.state,'quote_only');
  assert.equal(q.checkout_created,false);
  assert.equal(q.upload_authorized,false);
  assert.equal(q.private_result_available,false);
 }
 for(const bad of [
  {...opts,fileName:'../private.mp4'},
  {...opts,fileName:'evil.mp4/other'},
  {...opts,fileName:'video.exe'},
  {...opts,fileSizeBytes:0},
  {...opts,fileSizeBytes:Number.MAX_SAFE_INTEGER+2},
  {...opts,durationSeconds:0},
  {...opts,durationSeconds:43201},
  {...opts,durationSeconds:3.5},
  {...opts,mediaRightsConfirmed:false}
 ])assert.throws(()=>quote(bad));
});

test('checkout gate fails closed on every missing infrastructure capability',()=>{
 const q=quote(opts);
 const all=gate({quote:q,capabilities:ready});
 assert.equal(all.permitted,true);
 assert.equal(all.checkout_created,false);
 assert.equal(all.upload_authorized,false);
 const flags=[
  'codec_preflight_verified','secure_resumable_ingress_verified',
  'processing_capacity_verified','private_result_delivery_verified',
  'exact_offer_payment_route_verified'
 ];
 for(const key of flags){
  const x=gate({quote:q,capabilities:{...ready,[key]:false}});
  assert.equal(x.permitted,false,key);
  assert.ok(x.blockers.length>0);
 }
 assert.equal(gate({quote:q,capabilities:{...ready,ingress_max_bytes:null}}).permitted,false);
 assert.equal(gate({quote:q,capabilities:{...ready,ingress_max_bytes:10}}).permitted,false);
 assert.equal(gate({quote:q,capabilities:{}}).permitted,false);
 assert.throws(()=>gate({quote:{...q,amount_cents:1},capabilities:ready}));
});

test('paid upload requires authoritative server readback, exact SKU and actual settlement',async()=>{
 const q=quote(opts);const admission=gate({quote:q,capabilities:ready});
 const base={quote:q,checkoutAdmission:admission,orderKey:payment.order_key};
 await assert.rejects(upload(base),/trusted_server_payment_readback_required/);
 await assert.rejects(upload({...base,checkoutAdmission:gate({quote:q,capabilities:{}}),verifyPaidOrder:async()=>payment}));
 const checked=await upload({...base,verifyPaidOrder:async orderKey=>{
  assert.equal(orderKey,payment.order_key); return payment;
 }});
 assert.equal(checked.admitted,true);
 assert.equal(checked.source_upload_link_created,false);
 assert.equal(checked.analysis_started,false);
 for(const tampered of [
  {...payment,provider_paid_verified:false},
  {...payment,settlement_verified:false},
  {...payment,verification_source:'browser_checkout_redirect'},
  {...payment,order_key:'another-order'},
  {...payment,offer_key:'forensiscope.media_review_30m.v1'},
  {...payment,amount_cents:1},
  {...payment,currency:'eur'},
  {...payment,provider_receipt_id:null}
 ]){
  const denied=await upload({...base,verifyPaidOrder:async()=>tampered});
  assert.equal(denied.admitted,false);
  assert.equal(denied.payment_verified,false);
 }
});

test('private release requires paid order, source hash, completed analysis and unexpired scoped grant',async()=>{
 const q=quote(opts);
 const paid=await upload({
  quote:q,checkoutAdmission:gate({quote:q,capabilities:ready}),
  orderKey:payment.order_key,verifyPaidOrder:async()=>payment
 });
 const result=privateResult(paid);
 assert.equal(release(result).releasable,true);
 assert.equal(release(result).result_url_issued,false);
 assert.equal(release(result).public_media_access,false);
 for(const payload of [
  {...result,sourceSha256:'sha256:'+'c'.repeat(64)},
  {...result,analysisReceipt:{...result.analysisReceipt,state:'processing'}},
  {...result,analysisReceipt:{...result.analysisReceipt,order_key:'wrong-order'}},
  {...result,analysisReceipt:{...result.analysisReceipt,result_sha256:'bad'}},
  {...result,accessGrant:{...result.accessGrant,verified:false}},
  {...result,accessGrant:{...result.accessGrant,scope:'public_read'}},
  {...result,accessGrant:{...result.accessGrant,expires_at:'2000-01-01T00:00:00.000Z'}},
  {...result,uploadAdmission:{...paid,admitted:false}}
 ])assert.equal(release(payload).releasable,false);
});
