import test from 'node:test';
import assert from 'node:assert/strict';
import {createRavenStripeHostedReader} from '../systemia/raven/stripe-hosted-receipt-reader.mjs';

const TEST_ONLY_FAKE_SECRET='sk_live_LOCAL_UNIT_TEST_ONLY_FAKE';
test('Raven reader requires owner-authorized live key, never accepts missing or test credentials',()=>{
 assert.throws(()=>createRavenStripeHostedReader({secretKey:''}),/owner_authorized/);
 assert.throws(()=>createRavenStripeHostedReader({secretKey:'sk_test_not_livemode'}),/owner_authorized/);
});

test('Raven reader only uses authenticated GET for exact Stripe hosted-link receipt resources',async()=>{
 const calls=[];
 const fakeFetch=async(url,init)=>{
   const parsed=new URL(url);
   calls.push({url:parsed,method:init.method,auth:init.headers.authorization,redirect:init.redirect});
   if(parsed.pathname==='/v1/account')return Response.json({id:'acct_testfixture'});
   if(parsed.pathname==='/v1/checkout/sessions')return Response.json({data:[],has_more:false});
   return Response.json({id:parsed.pathname.split('/').at(-1)});
 };
 const reader=createRavenStripeHostedReader({secretKey:TEST_ONLY_FAKE_SECRET,fetchImpl:fakeFetch});
 assert.equal((await reader.getAccount()).id,'acct_testfixture');
 await reader.listCheckoutSessions({paymentLinkId:'plink_test123',limit:100});
 await reader.retrieveCheckoutSession('cs_live_test123');
 await reader.listSessionLineItems('cs_live_test123');
 await reader.retrievePaymentIntent('pi_test123');
 await reader.retrieveCharge('ch_test123');
 assert.equal(calls.length,6);
 assert.ok(calls.every(c=>c.method==='GET'&&c.redirect==='error'&&c.url.origin==='https://api.stripe.com'));
 assert.ok(calls.every(c=>c.auth==='Bearer '+TEST_ONLY_FAKE_SECRET));
 assert.equal(calls[1].url.searchParams.get('payment_link'),'plink_test123');
 assert.equal(calls[1].url.searchParams.get('limit'),'100');
 assert.equal(calls[3].url.pathname,'/v1/checkout/sessions/cs_live_test123/line_items');
});

test('Raven reader refuses invalid identifiers before reaching Stripe',async()=>{
 let calls=0;
 const reader=createRavenStripeHostedReader({secretKey:TEST_ONLY_FAKE_SECRET,fetchImpl:async()=>{
   calls++;return Response.json({});
 }});
 assert.throws(()=>reader.listCheckoutSessions({paymentLinkId:'https://malicious.test/path'}),/invalid_checkout_session_query/);
 assert.throws(()=>reader.retrieveCheckoutSession('cs_../notallowed'),/invalid_session_id/);
 assert.throws(()=>reader.retrievePaymentIntent('bad'),/invalid_payment_intent_id/);
 assert.equal(calls,0);
});

test('Raven reader fails closed on provider errors without returning customer data',async()=>{
 const reader=createRavenStripeHostedReader({secretKey:TEST_ONLY_FAKE_SECRET,
   fetchImpl:async()=>new Response(JSON.stringify({error:{message:'secret private details'}}),{status:401})});
 await assert.rejects(()=>reader.getAccount(),/stripe_read_http_401/);
});
