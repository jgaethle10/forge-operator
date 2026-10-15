import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProviderPaymentEvidence as evaluate} from '../systemia/payments/provider-evidence-gate.mjs';

const order={order_key:'ord-001',offer_key:'website_audit_49',merchant_id:'merchant-01',
 amount_cents:4900,currency:'usd',buyer_confirmed:true,synthetic:false,state:'checkout_prepared'};
const event={order_key:'ord-001',offer_key:'website_audit_49',merchant_id:'merchant-01',
 provider_id:'partner_one',provider_event_id:'evt_abc',session_id:'sess_abc',
 verification_path:'provider_refetch',amount_cents:4900,currency:'usd',payment_status:'paid'};
const paid={
 verified:true,source:'raven_nexus',evidence_ref:'processor:readback:evt_abc',
 verified_at:'2026-10-14T20:00:00Z',provider_id:'partner_one',
 provider_event_id:'evt_abc',session_id:'sess_abc',order_key:'ord-001',
 offer_key:'website_audit_49',merchant_id:'merchant-01',amount_cents:4900,
 currency:'usd',payment_status:'paid'
};
const makeVerifier=(result=paid)=>async()=>result;
test('no payment evidence or explicit buyer consent means no provider call',async()=>{
 let calls=0;const verify=async()=>{calls++;return paid};
 assert.equal((await evaluate({order,claimed_event:null,verify_with_raven:verify})).decision,'HOLD');
 assert.equal((await evaluate({order:{...order,buyer_confirmed:false},claimed_event:event,verify_with_raven:verify})).decision,'HOLD');
 assert.equal(calls,0);
});
test('checkout URL or return alone cannot infer paid state',async()=>{
 assert.deepEqual((await evaluate({order,claimed_event:event})).reasons,['server_side_raven_verification_unavailable']);
 const r=await evaluate({order,claimed_event:event,verify_with_raven:makeVerifier({...paid,payment_status:'unpaid'})});
 assert.equal(r.decision,'HOLD');assert.equal(r.entitlement_granted,false);
});
test('valid server-side verification only recommends a canonical reconciliation review',async()=>{
 const r=await evaluate({order,claimed_event:event,verify_with_raven:makeVerifier()});
 assert.equal(r.decision,'CANDIDATE_FOR_CANONICAL_ORDER_RECONCILIATION');
 assert.equal(r.evidence_state,'raven_provider_paid_verified');
 assert.equal(r.verification_performed,true);
 assert.equal(r.payment_record_updated,false);
 assert.equal(r.entitlement_granted,false);
 assert.equal(r.fulfillment_dispatched,false);
 assert.equal(r.payout_settled,false);
 assert.equal(r.money_moved,false);
});
test('rejects wrong amount, currency, offer, merchant, order, and synthetic event before provider access',async()=>{
 const variants=[
  {claimed_event:{...event,amount_cents:4901}},
  {claimed_event:{...event,currency:'eur'}},
  {claimed_event:{...event,offer_key:'other'}},
  {claimed_event:{...event,merchant_id:'another'}},
  {claimed_event:{...event,order_key:'another'}},
  {claimed_event:{...event,synthetic:true}},
  {order:{...order,synthetic:true}},
 ];
 let calls=0;
 const verify=async()=>{calls++;return paid};
 for(const variant of variants){
  const r=await evaluate({order,claimed_event:event,verify_with_raven:verify,...variant});
  assert.equal(r.decision,'HOLD');
  assert.equal(r.payment_record_updated,false);
 }
 assert.equal(calls,0);
});
test('provider record must match every payment identity and exact total',async()=>{
 const variants=[
  {amount_cents:4800},{currency:'eur'},{offer_key:'wrong'},
  {merchant_id:'wrong'},{order_key:'wrong'},{provider_id:'wrong'},
  {provider_event_id:'evt_other'},{session_id:'sess_other'},
  {source:'client'},{verified:false},{evidence_ref:''},
  {verified_at:'invalid'},{payment_status:'refunded'},{disputed:true},
  {reversed:true},{refunded:true},
 ];
 for(const mutation of variants){
  const r=await evaluate({order,claimed_event:event,verify_with_raven:makeVerifier({...paid,...mutation})});
  assert.equal(r.decision,'HOLD',JSON.stringify(mutation));
  assert.equal(r.entitlement_granted,false);
 }
});
test('duplicate events, paid order and network failure fail closed',async()=>{
 assert.deepEqual((await evaluate({order,claimed_event:event,verify_with_raven:makeVerifier(),previously_recorded_event_ids:['evt_abc']})).reasons,['duplicate_provider_event']);
 assert.equal((await evaluate({order:{...order,state:'paid'},claimed_event:event,verify_with_raven:makeVerifier()})).decision,'HOLD');
 const r=await evaluate({order,claimed_event:event,verify_with_raven:async()=>{throw Error('network or auth')}});
 assert.deepEqual(r.reasons,['provider_verification_error']);
 assert.equal(r.entitlement_granted,false);
});
