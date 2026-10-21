/**
 * Evercraft Payments | read-only Systemia Stripe payment evidence examiner.
 *
 * Private trust boundary: callers must re-fetch session, line items, payment
 * intent, and charge with authorized Stripe read scopes for the SAME account.
 * This pure inspector cannot authenticate a caller, process payments, create
 * orders, verify bank payout, or issue entitlements. Never expose it directly
 * as a public endpoint or give untrusted JSON an authenticated provenance.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL('../../public/mesh/checkout-ready/verified-links.json',import.meta.url),'utf8'));
const bindings=new Map(manifest.links.map(x=>[x.payment_link_id,Object.freeze({
  key:x.key,name:x.name,amount_cents:x.amount_cents,price_id:x.stripe_price_id,
  product_id:x.stripe_product_id,payment_link_id:x.payment_link_id,
})]));
const LIVE_ID=/^cs_live_[A-Za-z0-9]+$/;
const PI_ID=/^pi_[A-Za-z0-9]+$/;
const CH_ID=/^ch_[A-Za-z0-9]+$/;
const ACCOUNT=/^acct_[A-Za-z0-9]+$/;
const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);

export function inspectSystemiaServicePaymentEvidence({
  source,expectedAccountId,authenticatedAccountId,
  session,lineItems,paymentIntent,charge,
}={}){
  const hold=reason=>({
    schema:'evercraft.payments.systemia-external-evidence.v1',
    accepted:false,state:'held_unverified',reason,
    canonical_order_created:false,provider_payout_verified:false,
    payment_recorded_in_evercraft:false,entitlement_granted:false,
    fulfillment_released:false,
  });
  if(source!=='raven_nexus_authenticated_stripe_read'||
    !ACCOUNT.test(String(expectedAccountId||''))||
    authenticatedAccountId!==expectedAccountId){
    return hold('authenticated_matching_systemia_account_required');
  }
  if(!isObject(session)||session.object!=='checkout.session'||
    !LIVE_ID.test(session.id)||session.livemode!==true||
    session.mode!=='payment'||session.status!=='complete'||
    session.payment_status!=='paid'||session.currency!=='usd'){
    return hold('live_completed_paid_checkout_not_observed');
  }
  const binding=bindings.get(session.payment_link);
  if(!binding)return hold('payment_link_not_approved_for_systemia_services');
  if(!Number.isSafeInteger(session.amount_total)||session.amount_total!==binding.amount_cents){
    return hold('checkout_amount_does_not_match_approved_offer');
  }
  if(!isObject(lineItems)||lineItems.object!=='list'||
    lineItems.has_more!==false||!Array.isArray(lineItems.data)||
    lineItems.data.length!==1){
    return hold('complete_single_line_item_read_required');
  }
  const item=lineItems.data[0];
  if(!isObject(item)||item.object!=='item'||item.quantity!==1||
    item.currency!=='usd'||item.amount_total!==binding.amount_cents||
    item.price?.id!==binding.price_id||
    item.price?.product!==binding.product_id||item.price?.active!==true||
    item.price?.livemode!==true){
    return hold('product_price_quantity_or_currency_mismatch');
  }
  if(!isObject(paymentIntent)||paymentIntent.object!=='payment_intent'||
    !PI_ID.test(paymentIntent.id)||session.payment_intent!==paymentIntent.id||
    paymentIntent.livemode!==true||paymentIntent.currency!=='usd'||
    paymentIntent.status!=='succeeded'||
    paymentIntent.amount!==binding.amount_cents||
    paymentIntent.amount_received!==binding.amount_cents){
    return hold('authoritative_succeeded_payment_intent_required');
  }
  if(!isObject(charge)||charge.object!=='charge'||!CH_ID.test(charge.id)||
    paymentIntent.latest_charge!==charge.id||
    charge.payment_intent!==paymentIntent.id||
    charge.livemode!==true||charge.currency!=='usd'||
    charge.status!=='succeeded'||charge.paid!==true||
    charge.captured!==true||charge.amount!==binding.amount_cents||
    charge.amount_refunded!==0||charge.refunded!==false||
    charge.disputed!==false){
    return hold('matching_successful_undisputed_unreversed_charge_required');
  }
  // No buyer email, card details, account ID or Stripe link URLs in receipts.
  const evidenceKey='provider-observation-'+createHash('sha256').update(
    JSON.stringify(['systemia',expectedAccountId,session.id,paymentIntent.id,charge.id])
  ).digest('hex').slice(0,40);
  return {
    schema:'evercraft.payments.systemia-external-evidence.v1',
    accepted:true,state:'provider_paid_observed_requires_order_reconciliation',
    evidence_key:evidenceKey,offer_key:binding.key,offer_name:binding.name,
    amount_cents:binding.amount_cents,currency:'USD',provider:'stripe',
    processor_account_label:'Systemia',provider_checkout_id:session.id,
    provider_payment_intent_id:paymentIntent.id,
    provider_charge_id:charge.id,
    receipt_status:'provider_payment_observed_not_canonical_evercraft_receipt',
    canonical_order_created:false,provider_payout_verified:false,
    payment_recorded_in_evercraft:false,entitlement_granted:false,
    fulfillment_released:false,
    next_gate:'match_authorized_customer_order_then_private_idempotent_reconciliation',
  };
}
