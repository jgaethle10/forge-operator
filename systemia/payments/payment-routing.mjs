export const EVERCRAFT_PAYMENT_ROUTE = Object.freeze({
  schema: 'evercraft.payments.route.v1',
  commerce_layer: 'evercraft_payments',
  provider_boundary: 'raven_nexus',
  settlement_adapter: 'stripe',
  provider_role: 'settlement_adapter',
  canonical_order_owner: 'evercraft_payments',
  canonical_entitlement_owner: 'evercraft_payments',
  direct_provider_checkout_allowed: false
});

export function buildPaymentRoute({
  productKey,
  offerKey,
  amount,
  currency='USD'
}={}) {
  if (!productKey) throw new Error('productKey required');
  if (!offerKey) throw new Error('offerKey required');
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('positive amount required');

  return {
    schema:'evercraft.payments.order-route.v1',
    product_key:String(productKey),
    offer_key:String(offerKey),
    amount:Number(amount),
    currency:String(currency).toUpperCase(),
    commerce_layer:EVERCRAFT_PAYMENT_ROUTE.commerce_layer,
    provider_boundary:EVERCRAFT_PAYMENT_ROUTE.provider_boundary,
    settlement_adapter:EVERCRAFT_PAYMENT_ROUTE.settlement_adapter,
    direct_provider_checkout_allowed:false,
    order_truth:'evercraft_payments',
    settlement_truth:'authoritative_provider_receipt_required'
  };
}

export function assertEvercraftPaymentRoute(route={}) {
  const errors=[];
  if (route.commerce_layer!=='evercraft_payments') errors.push('commerce must originate in Evercraft Payments');
  if (route.provider_boundary!=='raven_nexus') errors.push('provider settlement must route through Raven Nexus');
  if (route.direct_provider_checkout_allowed===true) errors.push('direct provider checkout bypass is forbidden');
  if (route.order_truth && route.order_truth!=='evercraft_payments') errors.push('Evercraft Payments must own canonical order truth');
  return {ok:errors.length===0,errors};
}
