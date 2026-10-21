/**
 * Evercraft Payments -> Raven Nexus -> Stripe: fixed-price checkout planning.
 *
 * Pure planning only: no Stripe network calls, no authority to charge or grant
 * fulfillment, and no provider secrets. Raven Nexus must separately authenticate
 * and re-read provider/account/price truth before creating a session.
 */
import {createHash} from 'node:crypto';

export const STRIPE_FIXED_PRICE_BINDINGS=Object.freeze({
  'website-audit':Object.freeze({
    public_id:'audit-center-website-audit-machine-v1',
    offer_key:'systemia.website_audit_quick_win_49.v1',
    stripe_product:'prod_VU2tG3AzIa9WRl',
    stripe_price:'price_1UT4ndRp1HqokPkVtnLVhmoj',
    amount_cents:4900,currency:'usd',
    name:'Evercraft Website Quick Win Audit',
    provider_observed_on:'2026-10-21',
  }),
  'findmypart':Object.freeze({
    public_id:'findmypart-paid-hunt-v1',
    offer_key:'findmypart.quick_hunt_19.v1',
    stripe_product:'prod_VU2tqBJNIGIhic',
    stripe_price:'price_1UT4nfRp1HqokPkVo3j6glgj',
    amount_cents:1900,currency:'usd',
    name:'FindMyPart Quick Hunt',
    provider_observed_on:'2026-10-21',
  }),
});

export function inspectStripeFixedPriceBinding(slug,providerPrice){
  const binding=STRIPE_FIXED_PRICE_BINDINGS[String(slug||'')];
  if(!binding)return {ok:false,reason:'offer_not_allowlisted'};
  if(!providerPrice || typeof providerPrice!=='object')return {ok:false,reason:'provider_price_not_refetched'};
  if(providerPrice.id!==binding.stripe_price ||
     providerPrice.product!==binding.stripe_product ||
     providerPrice.active!==true ||
     providerPrice.livemode!==true ||
     providerPrice.currency!==binding.currency ||
     providerPrice.unit_amount!==binding.amount_cents ||
     providerPrice.type!=='one_time' ||
     providerPrice.recurring!==null){
    return {ok:false,reason:'provider_price_mismatch'};
  }
  return {ok:true,slug,binding};
}

const safeOrderKey=key=>/^buyer-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(key||''));
const safeEmail=email=>typeof email==='string'&&email.length<=254&&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/[<>"'\r\n]/.test(email);
const ORIGIN='https://fabric.systemiacommandcenters.com';

export function buildRavenStripeCheckoutPlan({order,providerPrice,account,authenticatedProvider}={}){
  if(!order || typeof order!=='object')throw Error('canonical_order_required');
  const binding=STRIPE_FIXED_PRICE_BINDINGS[order.slug];
  if(!binding)throw Error('offer_not_allowlisted');
  if(order.offer_key!==binding.offer_key || order.amount_cents!==binding.amount_cents ||
     order.currency!=='usd' || order.order_truth!=='evercraft_payments' ||
     order.provider_boundary!=='raven_nexus' ||
     order.confirmation_state!=='buyer_confirmed' ||
     order.order_persisted!==true ||
     order.payment_state!=='unpaid' ||
     order.synthetic!==false ||
     !safeOrderKey(order.order_key) ||
     !safeEmail(order.customer_email)){
    throw Error('canonical_order_not_eligible');
  }
  if(!account || account.schema!=='systemia.payments.stripe-connection-reference.v1' ||
     account.connection_key!=='evercraft-primary-stripe' ||
     account.provider_boundary!=='raven_nexus' ||
     account.livemode!==true || !/^acct_[A-Za-z0-9]{10,64}$/.test(account.stripe_context) ||
     account.systemia_runtime_authorized!==false){
    throw Error('private_account_reference_not_verified');
  }
  // Only Raven Nexus's independent authenticated provider response may enable
  // a plan. The persisted account identity by itself grants no authority.
  if(!authenticatedProvider || authenticatedProvider.source!=='raven_nexus_authenticated_stripe_api' ||
     authenticatedProvider.account_id!==account.stripe_context ||
     authenticatedProvider.livemode!==true ||
     authenticatedProvider.authorization_valid!==true ||
     authenticatedProvider.price_retrieved_via_api!==true){
    throw Error('raven_nexus_stripe_binding_not_authenticated');
  }
  const price=inspectStripeFixedPriceBinding(order.slug,providerPrice);
  if(!price.ok)throw Error(price.reason);
  const orderKey=order.order_key;
  const slug=order.slug;
  const params=new URLSearchParams({
    mode:'payment',
    'line_items[0][price]':binding.stripe_price,
    'line_items[0][quantity]':'1',
    client_reference_id:orderKey,
    customer_email:order.customer_email,
    'metadata[evercraft_order_key]':orderKey,
    'metadata[evercraft_offer_key]':binding.offer_key,
    'metadata[evercraft_origin]':'evercraft_payments_via_raven_nexus',
    'payment_intent_data[metadata][evercraft_order_key]':orderKey,
    'payment_intent_data[metadata][evercraft_offer_key]':binding.offer_key,
    success_url:ORIGIN+'/offers/'+slug+
      '?payment=processing&stripe_session_id={CHECKOUT_SESSION_ID}'+
      '&evercraft_order_key='+encodeURIComponent(orderKey)+
      '&offer_key='+encodeURIComponent(binding.offer_key),
    cancel_url:ORIGIN+'/offers/'+slug+'?payment=cancelled',
  });
  const idempotencyKey='evercraft-checkout-'+createHash('sha256').update(
    JSON.stringify([orderKey,binding.offer_key,binding.stripe_price,account.stripe_context])
  ).digest('hex').slice(0,44);
  return {
    schema:'evercraft.payments.raven-stripe-checkout-plan.v1',
    state:'authorized_session_request_plan_not_checkout',
    provider:'stripe',
    provider_boundary:'raven_nexus',
    account_context:account.stripe_context,
    livemode:true,
    order_key:orderKey,
    offer_key:binding.offer_key,
    amount_cents:binding.amount_cents,
    currency:'usd',
    provider_price_id:binding.stripe_price,
    request:{
      method:'POST',
      path:'/v1/checkout/sessions',
      content_type:'application/x-www-form-urlencoded',
      idempotency_key:idempotencyKey,
      body:params.toString(),
    },
    session_created:false,
    checkout_url:null,
    checkout_verified:false,
    payment_verified:false,
    entitlement_granted:false,
    fulfillment_released:false,
  };
}

/**
 * Validate a newly created Stripe Checkout Session AND separately retrieved
 * Stripe line items. The caller must fetch BOTH from authenticated Raven-owned
 * provider APIs, not from the browser, return URL, or buyer-submitted payload.
 *
 * Stripe's own checkout URLs can contain #fid... fragments. The URL is
 * a navigation artifact, never payment/fulfillment evidence.
 */
export function inspectCreatedStripeCheckoutSession(plan,session,providerLineItems){
  if(plan?.schema!=='evercraft.payments.raven-stripe-checkout-plan.v1' ||
     !session || typeof session!=='object')return {ok:false,reason:'invalid_session_evidence'};
  let url;
  try{url=new URL(session.url)}catch{return {ok:false,reason:'invalid_checkout_url'}}
  const sessionId=String(session.id||'');
  const binding=Object.values(STRIPE_FIXED_PRICE_BINDINGS).find(
    item=>item.offer_key===plan.offer_key && item.stripe_price===plan.provider_price_id
  );
  const valid=(url.protocol==='https:' && url.hostname==='checkout.stripe.com' &&
    !url.username && !url.password &&
    /^cs_live_[A-Za-z0-9]+$/.test(sessionId) &&
    url.pathname==='/c/pay/'+sessionId &&
    session.object==='checkout.session' &&
    session.livemode===true &&
    session.mode==='payment' &&
    session.status==='open' &&
    session.payment_status==='unpaid' &&
    session.client_reference_id===plan.order_key &&
    session.currency===plan.currency &&
    session.amount_total===plan.amount_cents &&
    session.metadata?.evercraft_order_key===plan.order_key &&
    session.metadata?.evercraft_offer_key===plan.offer_key &&
    !!binding);
  if(!valid)return {ok:false,reason:'provider_checkout_binding_mismatch'};
  if(providerLineItems?.object!=='list' ||
     !Array.isArray(providerLineItems.data) ||
     providerLineItems.has_more!==false ||
     providerLineItems.data.length!==1){
    return {ok:false,reason:'provider_line_items_not_fully_verified'};
  }
  const line=providerLineItems.data[0];
  if(line?.price?.id!==plan.provider_price_id ||
     line?.price?.product!==binding.stripe_product ||
     line?.price?.unit_amount!==plan.amount_cents ||
     line?.price?.currency!==plan.currency ||
     line?.quantity!==1 ||
     line?.currency!==plan.currency ||
     line?.amount_total!==plan.amount_cents){
    return {ok:false,reason:'provider_line_item_offer_mismatch'};
  }
  return {
    ok:true,state:'checkout_prepared_unpaid',
    checkout_url:url.href,session_id:sessionId,
    line_items_verified:true,
    payment_verified:false,fulfillment_released:false,
  };
}
