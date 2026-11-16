import { buildPaymentRoute, assertEvercraftPaymentRoute } from '../payments/payment-routing.mjs';
import { publicPaymentOffer } from '../mcp/public-payment-offers.mjs';

export const CLOSEOUT_OFFER_SLUG='closeout-pilot';
export const CLOSEOUT_OFFER_KEY='evercraft.closeout.human_review_packet_49.v1';
export const CLOSEOUT_AMOUNT_CENTS=4900;

/**
 * Preparation only. An inquiry and a route manifest are not payment orders.
 * The operator must confirm a specific job scope and checkout readiness.
 */
export function prepareCloseoutPaymentRoute({scopeAccepted=false}={}){
  const offer=publicPaymentOffer(CLOSEOUT_OFFER_SLUG);
  if(!offer || offer.offer_key!==CLOSEOUT_OFFER_KEY || offer.amount_cents!==CLOSEOUT_AMOUNT_CENTS || offer.currency!=='usd')
    throw new Error('Closeout canonical payment offer mismatch');
  const route=buildPaymentRoute({
    productKey:'evercraft-closeout',
    offerKey:offer.offer_key,
    amount:offer.amount_cents,
    currency:'USD'
  });
  const validated=assertEvercraftPaymentRoute(route);
  if(!validated.ok)throw new Error('noncanonical Closeout Evercraft Payments route: '+validated.errors.join(', '));
  const scopeApproved=scopeAccepted===true;
  const operational=offer.native_order_enabled===true;
  return Object.freeze({
    schema:'evercraft.closeout.payment-offer.v1',
    product:'Evercraft Closeout',
    slug:CLOSEOUT_OFFER_SLUG,
    offer_key:CLOSEOUT_OFFER_KEY,
    amount_cents:CLOSEOUT_AMOUNT_CENTS,
    currency:'usd',
    payment_route:route,
    public_owned_offer_url:'https://fabric.systemiacommandcenters.com/offers/closeout-pilot',
    scope_accepted:scopeApproved,
    operational_checkout_enabled:operational,
    checkout_state:scopeApproved&&operational?'ready_for_separate_owned_checkout_request':'held',
    order_created:false,
    checkout_created:false,
    paid:false,
    fulfillment_released:false,
    buyer_confirmation_required:true,
    authoritative_payment_receipt_required:true,
    note:'Source registration does not establish a live checkout, accepted scope, payment, or permission to fulfill. Only an authorized Evercraft Payments order with Raven Nexus settlement receipt may release paid fulfillment.'
  });
}
