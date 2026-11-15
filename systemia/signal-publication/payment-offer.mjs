import { buildPaymentRoute, assertEvercraftPaymentRoute } from '../payments/payment-routing.mjs';
import { publicPaymentOffer } from '../mcp/public-payment-offers.mjs';

const SLUG='signal-brief';
const OFFER_KEY='signal.incident_evidence_brief_250.v1';
const PRICE_CENTS=25000;

export function prepareSignalPaymentRoute({scopeAccepted=false}={}){
  const offer=publicPaymentOffer(SLUG);
  if(!offer||offer.offer_key!==OFFER_KEY||offer.amount_cents!==PRICE_CENTS||offer.currency!=='usd')
    throw new Error('Signal canonical payment offer mismatch');
  const paymentRoute=buildPaymentRoute({
    productKey:'evercraft-signal',
    offerKey:offer.offer_key,
    amount:offer.amount_cents,
    currency:'USD'
  });
  if(!assertEvercraftPaymentRoute(paymentRoute).ok)throw new Error('noncanonical Evercraft Payments path');
  const approved=scopeAccepted===true;
  const operational=offer.native_order_enabled===true;
  return Object.freeze({
    schema:'evercraft.signal.payment-offer.v1',
    product:'Evercraft Signal',
    slug:SLUG,
    offer_key:OFFER_KEY,
    amount_cents:PRICE_CENTS,
    currency:'usd',
    payment_route:paymentRoute,
    public_owned_offer_url:'https://fabric.systemiacommandcenters.com/offers/signal-brief',
    order_state:'not_created',
    checkout_state:approved&&operational?'ready_for_separate_owned_checkout_request':'held',
    order_created:false,
    checkout_created:false,
    paid:false,
    fulfillment_released:false,
    scope_accepted:approved,
    operational_checkout_enabled:operational,
    buyer_confirmation_required:true,
    provider_receipt_required:true,
    note:'Preparing or viewing this Evercraft Payments offer never creates a paid order. Only Evercraft Payments can issue the real checkout after scope, deployment and provider acceptance.'
  });
}
