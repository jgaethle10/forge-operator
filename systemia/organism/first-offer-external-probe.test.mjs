import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFirstOfferBuyerPage,OFFER_ONE_URL} from './first-offer-external-probe.mjs';

const page=(opts={})=>`<!doctype html><html><head><title>Evercraft IBM i 7.4 Deadline X-Ray</title></head><body>
<h1>IBM i 7.4 Deadline X-Ray</h1><p>$250</p>
<form method="post" action="/api/offers/ibmi-74-deadline-xray/checkout"></form>
${opts.extra||''}</body></html>`;
const response=(body=page(),opts={})=>new Response(body,{
 status:opts.status||200,
 headers:{'content-type':opts.contentType||'text/html',...(opts.headers||{})}
});
const req=(returnValue)=>async (url,opts)=>{
 assert.equal(url,OFFER_ONE_URL);
 assert.equal(opts.method,'GET');
 assert.equal(opts.redirect,'manual');
 assert.equal(opts.headers.accept,'text/html');
 assert.equal('authorization' in opts.headers,false);
 return returnValue;
};

test('independent exact visible page proof is never a verified purchase',async()=>{
 const x=await inspectFirstOfferBuyerPage({request:req(response())});
 assert.equal(x.state,'externally_verified_buyer_page');
 assert.equal(x.verified,true);
 assert.equal(x.checkout_verified,false);
 assert.equal(x.payment_verified,false);
 assert.match(x.html_sha256,/^sha256:/);
});
test('generic IBM i page, absence of form, price changes and bad promises fail closed',async()=>{
 for(const [body,reason] of [
  ['<h1>Evercraft IBM i Estate X-Ray $250</h1>','specific_offer_not_present'],
  [page().replace('method="post"','method="get"'),'buyer_checkout_form_missing'],
  [page().replace('$250','$1500'),'public_price_missing'],
  [page({extra:'Our certified IBM engineers offer a guaranteed upgrade'}),'unsupported_promise_detected']
 ]){
  const x=await inspectFirstOfferBuyerPage({request:req(response(body))});
  assert.equal(x.verified,false);
  assert.equal(x.reason,reason);
 }
});
test('HTTP holds and redirect do not become launch evidence',async()=>{
 for(const status of [301,404,503]){
  const x=await inspectFirstOfferBuyerPage({request:req(response('hold',{status}))});
  assert.equal(x.verified,false);
  assert.equal(x.http_status,status);
  assert.equal(x.reason,status===301?'redirect_not_verified':'http_'+status);
 }
});
test('transport errors, unexpected content and oversized payload remain held',async()=>{
 const fails=[
   await inspectFirstOfferBuyerPage({request:async()=>{throw new TypeError('fetch failed')},diagnose:async()=>({dns:'resolved',tcp_443:'reachable'})}),
   await inspectFirstOfferBuyerPage({request:req(response('{}',{contentType:'application/json'}))}),
   await inspectFirstOfferBuyerPage({request:req(response('x'.repeat(150001)))}),
 ];
 assert.deepEqual(fails.map(x=>x.reason),['http_or_tls_handshake_unavailable','not_html','oversized_response']);
 assert.ok(fails.every(x=>x.verified===false));
});

test('an external network failure resolves to the correct actionable gate',async()=>{
 const lookupCases=[
  [{dns:'error',dns_error_code:'ENOTFOUND',tcp_443:'not_tested'},'public_dns_unresolved'],
  [{dns:'resolved',ipv4_count:1,tcp_443:'timeout'},'public_tcp_443_unreachable'],
  [{dns:'resolved',ipv4_count:1,tcp_443:'reachable'},'http_or_tls_handshake_unavailable']
 ];
 for(const [diagnostic,reason] of lookupCases){
  const r=await inspectFirstOfferBuyerPage({
   request:async()=>{throw new Error('connection unavailable');},
   diagnose:async()=>diagnostic
  });
  assert.equal(r.reason,reason);
  assert.deepEqual(r.ingress,diagnostic);
  assert.equal(r.payment_verified,false);
 }
});
