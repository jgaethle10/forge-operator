import { buildPaymentRoute, assertEvercraftPaymentRoute } from '../payments/payment-routing.mjs';

// Published duration prices. Prepare an Evercraft Payments order intent, never
// create a provider checkout or charge from product code.
export const FORENSISCOPE_OFFERS = Object.freeze([
  Object.freeze({offer_key:'forensiscope.media_review_5m.v1', max_duration_seconds:300, amount_usd:15}),
  Object.freeze({offer_key:'forensiscope.media_review_30m.v1', max_duration_seconds:1800, amount_usd:35}),
  Object.freeze({offer_key:'forensiscope.media_review_2h.v1', max_duration_seconds:7200, amount_usd:75}),
  Object.freeze({offer_key:'forensiscope.media_review_6h.v1', max_duration_seconds:21600, amount_usd:149}),
  Object.freeze({offer_key:'forensiscope.media_review_12h.v1', max_duration_seconds:43200, amount_usd:249})
]);

export function prepareForensiScopePaymentIntent({durationSeconds, mediaRightsConfirmed=false}={}) {
  if(!Number.isInteger(durationSeconds) || durationSeconds <= 0)
    throw new Error('durationSeconds must be a positive integer');
  if(mediaRightsConfirmed!==true)
    throw new Error('confirmed authority to submit media required');
  const offer=FORENSISCOPE_OFFERS.find(tier=>durationSeconds<=tier.max_duration_seconds);
  if(!offer) throw new Error('outside published duration tiers; require human scope review');
  const paymentRoute=buildPaymentRoute({
    productKey:'forensiscope', offerKey:offer.offer_key, amount:offer.amount_usd*100, currency:'USD'
  });
  if(!assertEvercraftPaymentRoute(paymentRoute).ok)
    throw new Error('noncanonical Evercraft Payments route');
  return Object.freeze({
    schema:'evercraft.forensiscope.payment-intent.v1',
    requested_duration_seconds:durationSeconds,
    offer_key:offer.offer_key,
    price_usd:offer.amount_usd,
    payment_route:paymentRoute,
    order_state:'not_created',
    checkout_state:'not_created',
    entitlement_state:'not_granted',
    intake_state:'not_authorized',
    buyer_confirmation_required:true,
    receipt_required_before_fulfillment:true,
    media_size_limit:'not_verified',
    note:'Quote preparation only. Confirm media size, scope and capacity before buyer checkout; only Evercraft Payments may create order and initiate Raven Nexus settlement.'
  });
}
