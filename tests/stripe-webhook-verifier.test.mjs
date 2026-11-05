import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validateStripeWebhook,processVerifiedStripeWebhook} from '../systemia/payments/stripe-webhook-verifier.mjs';

const secret='whsec_testWebhookSecret12345';
const t=2000000000;
const now=t*1000;
const base={
 id:'evt_test1234567',
 type:'checkout.session.completed',
 data:{object:{
  id:'cs_test_12345abc',
  client_reference_id:'buyer-11111111-2222-3333-4444-555555555555',
  metadata:{offer_key:'workflow_foundry.xray_250.v1'},
  payment_status:'paid'
 }}
};
function signed(event=base,{timestamp=t,key=secret}={}){
 const rawBody=Buffer.from(JSON.stringify(event));
 const hex=crypto.createHmac('sha256',key).update(Buffer.concat([Buffer.from(timestamp+'.'),rawBody])).digest('hex');
 return {rawBody,signatureHeader:'t='+timestamp+',v1='+hex,signingSecret:key,nowMs:now};
}

test('valid Stripe-signed event accepted; payload tampering or wrong secret rejected',()=>{
 const good=signed();
 assert.equal(validateStripeWebhook(good).ok,true);
 assert.equal(validateStripeWebhook({...good,rawBody:Buffer.from(JSON.stringify({...base,type:'charge.refunded'}))}).reason,'signature_mismatch');
 assert.equal(validateStripeWebhook({...good,signingSecret:'whsec_badtest'}).reason,'signature_mismatch');
 assert.equal(validateStripeWebhook({...good,nowMs:now+301000}).reason,'stale_or_future_signature');
 assert.equal(validateStripeWebhook({...good,nowMs:now-301000}).reason,'stale_or_future_signature');
});

test('signed checkout event must retrieve canonical paid order, not trust event status',async()=>{
 const calls=[];
 const operate=async(x)=>{calls.push(x);return {status:200,body:{payment_confirmed:false}};};
 const unverified=await processVerifiedStripeWebhook({...signed(),operate});
 assert.equal(unverified.status,503);
 assert.equal(calls.length,1);
 assert.equal(calls[0].action,'verify_checkout');
 assert.equal(calls[0].provider_session_id,base.data.object.id);
 const done=await processVerifiedStripeWebhook({...signed(),operate:async()=>({status:200,body:{payment_confirmed:true}})});
 assert.equal(done.status,200);
 assert.equal(done.body.fulfillment_released,false);
 assert.equal(done.body.received,true);
});

test('signed reversal events fail closed until reconciliation exists',async()=>{
 const reversed={...base,type:'charge.refunded',data:{object:{id:'ch_test',payment_intent:'pi_test'}}};
 let calls=0;
 const result=await processVerifiedStripeWebhook({...signed(reversed),operate:async()=>{calls++;return {status:200,body:{payment_confirmed:true}};}});
 assert.equal(result.status,503);
 assert.equal(result.body.error,'reversal_reconciliation_not_implemented');
 assert.equal(calls,0);
});

test('unknown events never impersonate a paid receipt',async()=>{
 const event={...base,type:'invoice.paid'};
 const result=await processVerifiedStripeWebhook({...signed(event),operate:async()=>{throw Error('must_not_call');}});
 assert.equal(result.status,200);
 assert.equal(result.body.processed,false);
});

test('malformed checkout event and wrong signatures cannot start payments',async()=>{
 let calls=0;
 const invalid={...base,data:{object:{id:'cs_test_12345abc',client_reference_id:'different-order',metadata:{offer_key:'workflow_foundry.xray_250.v1'}}}};
 const response=await processVerifiedStripeWebhook({...signed(invalid),operate:async()=>{calls++;}});
 assert.equal(response.status,400);
 assert.equal(calls,0);
 const bad=signed();
 bad.signatureHeader='t='+t+',v1='+'0'.repeat(64);
 const denied=await processVerifiedStripeWebhook({...bad,operate:async()=>{calls++;}});
 assert.equal(denied.status,400);
 assert.equal(calls,0);
});
