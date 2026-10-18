import test from 'node:test';
import assert from 'node:assert/strict';
import {observeWebsiteAuditDoor,WEBSITE_AUDIT_OFFER_URL} from './offer-door-probe.mjs';

const mock=(body,config={})=>async(url,options)=>{
  assert.equal(url,WEBSITE_AUDIT_OFFER_URL);
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  return new Response(body,{status:config.status??200,headers:{'content-type':config.type??'text/html',
    ...(config.headers||{})}});
};
test('HTTP 200 and example visible offer copy produce reachability only',async()=>{
  const observation=await observeWebsiteAuditDoor({transport:mock('<html><h1>Quick Win Audit $49</h1></html>'),
    at:'2026-10-17T21:00:00.000Z'});
  assert.equal(observation.status,'readable_http_only');
  assert.equal(observation.httpStatus,200);
  assert.equal(observation.rawHtmlOfferNameSeen,true);
  assert.equal(observation.rawHtmlOfferPriceSeen,true);
  assert.equal(observation.checkoutVerified,false);
  assert.equal(observation.boundaries.providerSettlementVerified,false);
  assert.equal(observation.boundaries.paymentAttempted,false);
  assert.equal(observation.rawHtmlCtaVerified,false);
});
test('page not showing text in raw HTML never becomes copy or checkout proof',async()=>{
  const observation=await observeWebsiteAuditDoor({transport:mock('<html id="app"></html>')});
  assert.equal(observation.status,'readable_http_only');
  assert.equal(observation.rawHtmlOfferPriceSeen,false);
  assert.equal(observation.checkoutVerified,false);
});
test('HTTP errors, redirects, and non-HTML do not produce false reachability',async()=>{
  const gone=await observeWebsiteAuditDoor({transport:mock('Not found',{status:404,type:'text/html'})});
  assert.equal(gone.status,'held');
  assert.equal(gone.reason,'http_status_not_200');
  const redirected=await observeWebsiteAuditDoor({transport:mock(null,{status:302,headers:{location:'https://checkout.example/'}})});
  assert.equal(redirected.reason,'redirect_requires_independent_review');
  const json=await observeWebsiteAuditDoor({transport:mock('{"ok":true}',{type:'application/json'})});
  assert.equal(json.reason,'response_not_html');
});
test('transport errors and empty body are explicitly held',async()=>{
  const unavailable=await observeWebsiteAuditDoor({transport:async()=>{throw new Error('offline');}});
  assert.equal(unavailable.status,'held');
  assert.equal(unavailable.errorKind,'unreachable_or_transport_failed');
  const empty=await observeWebsiteAuditDoor({transport:mock('')});
  assert.equal(empty.reason,'html_body_empty');
});
test('no buyer probe can call POST or initiate payment',async()=>{
  let called=false;
  const observer=async(url,options)=>{called=true;assert.equal(options.method,'GET');return new Response('<html>OK</html>',{headers:{'content-type':'text/html'}});};
  const o=await observeWebsiteAuditDoor({transport:observer});
  assert.equal(called,true);
  assert.equal(o.boundaries.checkoutCreated,false);
  assert.equal(o.boundaries.paymentAttempted,false);
  assert.equal(o.boundaries.deliveryVerified,false);
});
