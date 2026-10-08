import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFirstOfferRoutes,renderFirstOfferRouteComparison} from './first-offer-route-comparison.mjs';

function client(results){
 const seen=[];
 return {
  seen,
  request:async(url,opts)=>{
   assert.equal(opts.method,'GET');
   assert.equal(opts.redirect,'manual');
   assert.equal(opts.headers.authorization,undefined);
   assert.ok(url.startsWith('https://fabric.systemiacommandcenters.com/'));
   const route=new URL(url).pathname;
   seen.push(route);
   const answer=results[route];
   if(answer==='error')throw Object.assign(new Error('connect failed'),{code:'ETIMEDOUT'});
   if(answer==null)throw Error('unexpected route '+route);
   return {status:answer,body:{cancel:async()=>{}}};
  }
 };
}
const statuses=(health,generic,offer)=>({
 '/health':health,
 '/offers/ibmi-rescue':generic,
 '/offers/ibmi-74-deadline-xray':offer
});
const observe=async(value)=>{
 const {seen,request}=client(value);
 const result=await compareFirstOfferRoutes({request,now:'2026-10-08T02:45:00Z'});
 assert.deepEqual(seen.sort(),Object.keys(value).sort());
 assert.equal(result.exact_checkout_verified,false);
 assert.equal(result.customer_payment_verified,false);
 assert.equal(result.no_network_mutation,true);
 assert.equal(result.no_release_authority,true);
 return result;
};
test('healthy generic offer and health but 7.4 404 isolates undeployed variant',async()=>{
 const r=await observe(statuses(200,200,404));
 assert.equal(r.diagnosis,'new_7_4_variant_absent_existing_ibmi_route_healthy');
 assert.equal(r.next_action,'review_protected_fabric_7_4_variant_release_and_exact_checkout_guard');
});
test('healthy service and two missing offers identifies offer routing or catalog binding',async()=>{
 const r=await observe(statuses(200,404,404));
 assert.equal(r.diagnosis,'offer_router_or_catalog_missing_from_healthy_origin');
});
test('three 404 responses do not justify NAT or DNS repair',async()=>{
 const r=await observe(statuses(404,404,404));
 assert.equal(r.diagnosis,'public_origin_returns_not_found_for_all_tested_routes');
});
test('HTTP 200 on buyer path does not prove page semantics or provider checkout',async()=>{
 const r=await observe(statuses(200,200,200));
 assert.equal(r.diagnosis,'specific_7_4_path_http_200_not_content_or_checkout_verified');
 assert.equal(r.independent_page_content_verified,false);
});
test('transport errors cannot become a claim of public release readiness',async()=>{
 const r=await observe(statuses('error','error','error'));
 assert.equal(r.diagnosis,'public_origin_transport_or_tls_unverified');
 assert.equal(r.statuses.health.http_status,null);
 assert.equal(r.statuses.health.transport_error,'ETIMEDOUT');
});
test('redirects are not followed and cannot establish commercial readiness',async()=>{
 const r=await observe(statuses(200,200,302));
 assert.equal(r.diagnosis,'public_origin_http_responses_incomplete');
 assert.equal(r.statuses.ibmi_74.redirected,true);
 assert.match(renderFirstOfferRouteComparison(r),/HTTP status/);
});
