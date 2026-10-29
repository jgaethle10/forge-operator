import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyNativePaymentReturn } from '../systemia/mcp/payment-return.mjs';

const endpoint='https://fabric.systemiacommandcenters.com/api/payments/ops';
const cases=[
 ['findmypart','findmypart.quick_hunt_19.v1'],
 ['part-quick','findmypart.quick_hunt_19.v1'],
 ['part-deep','findmypart.deep_hunt_49.v1'],
 ['part-rescue','findmypart.rescue_hunt_99.v1']
];
for(const [slug,offer_key] of cases){
 test(slug+' payment return requires exact offer key, verified receipt and order',async()=>{
   let calls=0;
   const query=new URLSearchParams({offer_key,evercraft_order_key:'buyer-test-12345',stripe_session_id:'cs_test_SAMPLE12345'});
   const result=await verifyNativePaymentReturn(slug,query,async(_url,init)=>{
     calls++;
     const body=JSON.parse(init.body);
     assert.equal(body.action,'verify_checkout');
     assert.equal(body.offer_key,offer_key);
     assert.equal(body.order_key,'buyer-test-12345');
     return Response.json({ok:true,payment_confirmed:true,receipt_key:'receipt-test-1234',
       offer_key,order_key:'buyer-test-12345',fulfillment_job_key:'job-test-1234',fulfillment_state:'queued'});
   },endpoint);
   assert.equal(result.state,'paid');
   assert.equal(result.queued,true);
   assert.equal(calls,1);
   const wrong=new URLSearchParams(query);wrong.set('offer_key','findmypart.quick_hunt_19.v1'===offer_key?'findmypart.deep_hunt_49.v1':'findmypart.quick_hunt_19.v1');
   let attempts=0;
   const rejected=await verifyNativePaymentReturn(slug,wrong,async()=>{attempts++;throw Error('not expected')},endpoint);
   assert.equal(rejected.state,'invalid');
   assert.equal(attempts,0);
 });
}
test('synthetic or pending payment is never labeled paid',async()=>{
 const params=new URLSearchParams({offer_key:'findmypart.rescue_hunt_99.v1',evercraft_order_key:'buyer-test-99999',stripe_session_id:'cs_test_ABCDEF123'});
 const synthetic=await verifyNativePaymentReturn('part-rescue',params,async()=>Response.json({
   ok:true,payment_confirmed:true,receipt_key:'qa-receipt',order_key:'buyer-test-99999',
   offer_key:'findmypart.rescue_hunt_99.v1',synthetic:true,fulfillment_state:'queued'
 }),endpoint);
 assert.equal(synthetic.state,'synthetic');
 assert.notEqual(synthetic.state,'paid');
 const pending=await verifyNativePaymentReturn('part-rescue',params,async()=>Response.json({
   ok:true,payment_confirmed:false,order_key:'buyer-test-99999',
   offer_key:'findmypart.rescue_hunt_99.v1'
 }),endpoint);
 assert.equal(pending.state,'pending');
});
