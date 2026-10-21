/** Evercraft owns the order; no processor or payment app is required by default. */
export const EVERCRAFT_PAYMENT_RAILS=Object.freeze({
  cash:Object.freeze({mode:'direct',verification:'counted_owner_receipt'}),
  check:Object.freeze({mode:'external',verification:'cleared_bank_deposit'}),
  bank_transfer:Object.freeze({mode:'external',verification:'posted_business_bank_credit'}),
  zelle_business:Object.freeze({mode:'external',verification:'posted_business_bank_credit'}),
  paypal_business:Object.freeze({mode:'external',verification:'authenticated_business_provider_receipt'}),
  venmo_business:Object.freeze({mode:'external',verification:'authenticated_business_provider_receipt'}),
  cash_app_business:Object.freeze({mode:'external',verification:'authenticated_business_provider_receipt'}),
  card_processor:Object.freeze({mode:'provider_adapter',verification:'authenticated_processor_settlement'})
});
export const EVERCRAFT_PAYMENT_ROUTE=Object.freeze({
  schema:'evercraft.payments.route.v2',
  commerce_layer:'evercraft_payments',
  provider_boundary:'raven_nexus',
  settlement_adapter:null,
  adapter_selection:'optional_per_order',
  processor_required:false,
  provider_role:'optional_settlement_adapter',
  canonical_order_owner:'evercraft_payments',
  canonical_entitlement_owner:'evercraft_payments',
  direct_provider_checkout_allowed:false,
  external_payment_confirmation_required:true
});

export function buildPaymentRoute({
  productKey,offerKey,amount,currency='USD'
}={}){
  if(!productKey)throw Error('productKey required');
  if(!offerKey)throw Error('offerKey required');
  if(!Number.isFinite(Number(amount))||Number(amount)<=0)throw Error('positive amount required');
  if(!/^([A-Z]{3})$/.test(String(currency).toUpperCase()))throw Error('currency_code_invalid');
  return {
    schema:'evercraft.payments.order-route.v2',
    product_key:String(productKey),
    offer_key:String(offerKey),
    amount:Number(amount),currency:String(currency).toUpperCase(),
    commerce_layer:'evercraft_payments',
    provider_boundary:'raven_nexus',
    settlement_adapter:null,
    payment_rail:null,
    rail_state:'awaiting_customer_choice',
    payment_state:'unpaid',
    paid:false,entitlement_active:false,fulfillment_released:false,
    direct_provider_checkout_allowed:false,
    order_truth:'evercraft_payments',
    settlement_truth:'authoritative_external_evidence_required'
  };
}

/**
 * Method selection is not provider authentication or evidence funds arrived.
 * Readiness is provided by an operator-controlled, out-of-band verification,
 * not a public buyer request or an assumed configured payment handle.
 */
export function selectPaymentRail(route,{rail,adapter=null,verifiedAvailability=false}={}){
  const base=assertEvercraftPaymentRoute(route);
  if(!base.ok)throw Error('invalid_evercraft_order_route');
  const method=EVERCRAFT_PAYMENT_RAILS[rail];
  if(!method)throw Error('unsupported_payment_rail');
  if(route.payment_state!=='unpaid'||route.paid===true)throw Error('already_paid_or_invalid_order');
  if(rail==='card_processor'){
    if(!/^[a-z][a-z0-9_-]{1,40}$/.test(String(adapter||'')))throw Error('named_processor_required');
  }else if(adapter!==null){
    throw Error('unexpected_processor_on_noncard_rail');
  }
  return {
    ...route,payment_rail:rail,settlement_adapter:adapter,
    rail_state:verifiedAvailability===true?'eligible_to_show_instructions':'requires_merchant_rail_verification',
    paid:false,entitlement_active:false,fulfillment_released:false
  };
}
export function assertEvercraftPaymentRoute(route={}){
  const errors=[];
  if(route.commerce_layer!=='evercraft_payments')errors.push('commerce must originate in Evercraft Payments');
  if(route.provider_boundary!=='raven_nexus')errors.push('external providers must route through Raven Nexus');
  if(route.direct_provider_checkout_allowed===true)errors.push('direct provider checkout bypass is forbidden');
  if(route.order_truth&&route.order_truth!=='evercraft_payments')errors.push('Evercraft Payments must own canonical order truth');
  if(route.payment_rail!==undefined&&route.payment_rail!==null&&!EVERCRAFT_PAYMENT_RAILS[route.payment_rail])errors.push('unsupported payment rail');
  if(route.settlement_adapter&&route.payment_rail!=='card_processor')errors.push('processor adapter must be explicitly selected');
  if(route.paid===true||route.entitlement_active===true||route.fulfillment_released===true)errors.push('route selection cannot certify settlement');
  return {ok:errors.length===0,errors};
}
