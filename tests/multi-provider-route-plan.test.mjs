import test from 'node:test';
import assert from 'node:assert/strict';
import {planMerchantPaymentRoute,PROVIDER_FAMILIES} from '../systemia/payments/multi-provider-route-plan.mjs';

const time='2026-10-14T23:00:00Z',merchant='merchant-001';
const connection=(provider_id,overrides={})=>({
 provider_id,merchant_id:merchant,status:'approved',compliance_approved:true,
 credentials_verified:true,enabled_methods:['card','ach'],...overrides});
const quote=(provider_id,fee,overrides={})=>({
 provider_id,merchant_id:merchant,method:'card',country:'US',currency:'USD',
 amount_cents:10000,provider_terms_approved:true,cost_verified:true,
 verified_at:'2026-10-14T22:00:00Z',expires_at:'2026-10-15T00:00:00Z',
 cost_evidence_ref:'contract-approved-rate-schedule',
 processing_fee_cents:fee,payout_fee_cents:0,platform_fee_cents:0,
 allocated_fixed_fee_cents:0,other_known_fee_cents:0,...overrides});
const base={merchant_id:merchant,merchant_opted_in:true,merchant_scope_approved:true,amount_cents:10000,now:time};

test('provider families alone are not connected accounts',()=>{
 assert.deepEqual(Object.keys(PROVIDER_FAMILIES).sort(),['adyen','finix','moov','stripe']);
 const out=planMerchantPaymentRoute(base);
 assert.equal(out.status,'HELD');
 assert.equal(out.selected_provider_for_execution,null);
});
test('merchant opt-in and scoped approval are mandatory',()=>{
 const connections=[connection('stripe')],quotes=[quote('stripe',50)];
 for(const perm of [{merchant_opted_in:false},{merchant_scope_approved:false},{merchant_id:''}]){
  const r=planMerchantPaymentRoute({...base,connections,quotes,...perm});
  assert.equal(r.reason,'merchant_permission_missing');
  assert.equal(r.candidates.length,0);
 }
});
test('can rank two genuine eligible quotes, cannot charge or switch provider',()=>{
 const r=planMerchantPaymentRoute({...base,connections:[connection('stripe'),connection('moov')],
  quotes:[quote('stripe',300),quote('moov',200),quote('adyen',100)]});
 assert.equal(r.cheapest_candidate_provider_id,'moov');
 assert.deepEqual(r.candidates.map(x=>x.provider_id),['moov','stripe']);
 assert.equal(r.intent_or_charge_created,false);
 assert.equal(r.payment_authorized,false);
 assert.equal(r.funds_moved,false);
 assert.equal(r.requires_human_confirmation,true);
});
test('stale, unsupported, unpriced and unauthorised terms all fail closed',()=>{
 const connections=[connection('stripe')];
 for(const q of [
  quote('stripe',100,{expires_at:'2026-10-14T22:00:00Z'}),
  quote('stripe',100,{cost_evidence_ref:''}),
  quote('stripe',100,{provider_terms_approved:false}),
  quote('stripe',100,{processing_fee_cents:-1}),
  quote('stripe',100,{amount_cents:20000}),
  quote('stripe',100,{merchant_id:'another-merchant'}),
  quote('stripe',100,{verified_at:'2026-10-15T22:00:00Z'}),
 ]){
  assert.equal(planMerchantPaymentRoute({...base,connections,quotes:[q]}).status,'HELD');
 }
 assert.equal(planMerchantPaymentRoute({...base,connections:[connection('stripe',{compliance_approved:false})],quotes:[quote('stripe',100)]}).status,'HELD');
});
test('card approval does not imply approved bank-pay method',()=>{
 const r=planMerchantPaymentRoute({...base,method:'ach',
  connections:[connection('moov',{enabled_methods:['card']})],
  quotes:[quote('moov',20,{method:'ach'})]});
 assert.equal(r.status,'HELD');
});
test('pilot does not claim cross-border support or zero-dollar settlement',()=>{
 assert.equal(planMerchantPaymentRoute({...base,country:'CA'}).status,'HELD');
 assert.equal(planMerchantPaymentRoute({...base,amount_cents:0}).status,'HELD');
});
