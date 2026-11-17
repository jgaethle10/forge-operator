import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIT_STRIPE_CHECKOUT,inspectWebsiteAuditStripeCheckout} from '../systemia/payments/website-audit-stripe-receipt.mjs';

const checkout=()=>({
 id:'cs_live_AUDIT123456',livemode:true,mode:'payment',status:'complete',
 payment_status:'paid',payment_link:AUDIT_STRIPE_CHECKOUT.payment_link,
 amount_total:4900,currency:'usd',automatic_tax:{enabled:true,status:'complete'},
 metadata:{offer_key:AUDIT_STRIPE_CHECKOUT.offer_key,authority:'Evercraft Payments'},
 customer_details:{email:'customer@example.com'},
 custom_fields:[
   {key:'websiteurl',type:'text',text:{value:'https://example.com/prices?secret=removed'}},
   {key:'auditgoal',type:'dropdown',dropdown:{value:'quotes'}}
 ]
});
const lineItems=()=>({data:[{quantity:1,price:{id:AUDIT_STRIPE_CHECKOUT.price,product:AUDIT_STRIPE_CHECKOUT.product}}],has_more:false});
const checked=(session=checkout(),items=lineItems(),authenticatedProviderRead=true)=>
 inspectWebsiteAuditStripeCheckout(session,items,{authenticatedProviderRead});

test('Website Audit paid candidate requires authenticated Stripe read and never releases fulfillment',()=>{
 assert.equal(checked(checkout(),lineItems(),false).reason,'authenticated_stripe_read_required');
 const ok=checked();
 assert.equal(ok.ok,true);
 assert.equal(ok.order_created,false);
 assert.equal(ok.fulfillment_release,false);
 assert.equal(ok.state,'provider_paid_candidate');
 assert.equal(ok.receipt_candidate.website_url,'https://example.com/prices');
 assert.equal(ok.receipt_candidate.customer_email,'customer@example.com');
 assert.match(ok.receipt_candidate.order_reference,/^EC-WA-[A-F0-9]{24}$/);
 assert.equal(ok.receipt_candidate.refund_status_not_verified,true);
 assert.equal(ok.receipt_candidate.human_review_required,true);
 assert.equal(checked().receipt_candidate.order_reference,ok.receipt_candidate.order_reference);
});
test('Website Audit paid candidate refuses unverified, forged, wrong-price, incomplete and synthetic sessions',()=>{
 for(const value of [
  {payment_status:'unpaid'}, {status:'open'}, {livemode:false},
  {mode:'setup'}, {payment_link:'plink_unrelated'}, {currency:'cad'},
  {amount_total:1900},{metadata:{offer_key:'other',authority:'Evercraft Payments'}},
  {metadata:{offer_key:AUDIT_STRIPE_CHECKOUT.offer_key,authority:'Stripe'}},
  {automatic_tax:{enabled:false,status:'complete'}},{automatic_tax:{enabled:true,status:'requires_location_inputs'}}
 ]){
  const result=checked({...checkout(),...value});
  assert.equal(result.ok,false,JSON.stringify(value));
  assert.equal(result.fulfillment_release,false);
 }
 const badPrice=lineItems();badPrice.data[0].price.id='price_unrelated';
 assert.equal(checked(checkout(),badPrice).reason,'price_line_item_mismatch');
 const badProduct=lineItems();badProduct.data[0].price.product='prod_unrelated';
 assert.equal(checked(checkout(),badProduct).reason,'price_line_item_mismatch');
 const twice=lineItems();twice.data.push(twice.data[0]);
 assert.equal(checked(checkout(),twice).reason,'line_item_count_mismatch');
 assert.equal(checked(checkout(),{data:[],has_more:true}).reason,'line_item_count_mismatch');
});
test('Website Audit paid candidate needs public HTTPS URL, allowed goal and buyer email',()=>{
 const invalidSites=['http://example.com','https://localhost','https://192.168.0.4','https://example.local','https://user:pass@example.com','https://example.com:8443'];
 for(const url of invalidSites){
  const s=checkout();s.custom_fields[0].text.value=url;
  assert.equal(checked(s).reason,'invalid_checkout_intake',url);
 }
 const noGoal=checkout();noGoal.custom_fields[1].dropdown.value='unsupported';
 assert.equal(checked(noGoal).reason,'invalid_checkout_intake');
 const missingEmail=checkout();missingEmail.customer_details.email='';
 assert.equal(checked(missingEmail).reason,'invalid_checkout_intake');
 const missingFields=checkout();missingFields.custom_fields=[];
 assert.equal(checked(missingFields).reason,'missing_checkout_intake');
});
