import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaymentRoute,assertEvercraftPaymentRoute,selectPaymentRail,
  EVERCRAFT_PAYMENT_ROUTE,EVERCRAFT_PAYMENT_RAILS
} from './payment-routing.mjs';

test('Evercraft owns order and entitlements: no mandatory Stripe or any processor',()=>{
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.commerce_layer,'evercraft_payments');
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.provider_boundary,'raven_nexus');
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.settlement_adapter,null);
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.processor_required,false);
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.direct_provider_checkout_allowed,false);
});
test('cash/check/bank/Zelle and business apps can be selected without Stripe',()=>{
  const route=buildPaymentRoute({
    productKey:'earthworks-autonomy',offerKey:'site-autonomy-study-design-partner',amount:5000
  });
  assert.equal(route.settlement_adapter,null);
  assert.equal(route.payment_rail,null);
  assert.equal(route.paid,false);
  assert.equal(assertEvercraftPaymentRoute(route).ok,true);
  for(const rail of ['cash','check','bank_transfer','zelle_business','paypal_business','venmo_business','cash_app_business']){
    const chosen=selectPaymentRail(route,{rail});
    assert.equal(chosen.settlement_adapter,null);
    assert.equal(chosen.rail_state,'requires_merchant_rail_verification');
    assert.equal(chosen.payment_state,'unpaid');
    assert.equal(chosen.entitlement_active,false);
    assert.equal(chosen.fulfillment_released,false);
    assert.equal(assertEvercraftPaymentRoute(chosen).ok,true);
  }
  assert.equal(Object.keys(EVERCRAFT_PAYMENT_RAILS).length,8);
});
test('card processor is optional and must be explicitly named',()=>{
  const route=buildPaymentRoute({productKey:'audit',offerKey:'audit_49',amount:49});
  assert.throws(()=>selectPaymentRail(route,{rail:'card_processor'}),/named_processor/);
  const other=selectPaymentRail(route,{rail:'card_processor',adapter:'other_gateway'});
  assert.equal(other.settlement_adapter,'other_gateway');
  assert.equal(other.paid,false);
  assert.equal(other.rail_state,'requires_merchant_rail_verification');
  assert.equal(assertEvercraftPaymentRoute(other).ok,true);
});
test('no payment rail selection or buyer claim can release paid entitlement',()=>{
  const route=buildPaymentRoute({productKey:'findmypart',offerKey:'quick_hunt_19',amount:19});
  assert.throws(()=>selectPaymentRail(route,{rail:'not_a_provider'}),/unsupported_payment_rail/);
  assert.throws(()=>selectPaymentRail(route,{rail:'cash',adapter:'stripe'}),/unexpected_processor/);
  assert.equal(selectPaymentRail(route,{rail:'cash',verifiedAvailability:true}).paid,false);
  const hacked={...route,paid:true};
  assert.equal(assertEvercraftPaymentRoute(hacked).ok,false);
  assert.throws(()=>selectPaymentRail(hacked,{rail:'cash'}),/invalid_evercraft/);
});
test('no direct provider-first bypass',()=>{
  const result=assertEvercraftPaymentRoute({
    commerce_layer:'stripe',provider_boundary:'product_code',
    direct_provider_checkout_allowed:true,order_truth:'stripe'
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.length>=3);
});
