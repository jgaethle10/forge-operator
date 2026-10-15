import { DEADLINE_KEY, DEADLINE_AMOUNT_CENTS } from '../chum/ibmi-74-offer-contract.mjs';

const STRIPE_CHECKOUT_HOST='checkout.stripe.com';

/**
 * This validates a checkout *handoff*, not the settlement of an order.
 * A payment backend's self-asserted response is never authoritative paid state.
 */
export function validateOwnedCheckoutHandoff({slug='',offer=null,result=null}={}){
  const fail=(reason)=>({ok:false,reason,checkout_url:null,settlement_verified:false,fulfillment_release:false});
  if(!offer || offer.commercial_state!=='sell_now') return fail('offer_not_published_sell_now');
  const isDeadline=slug==='ibmi-74-deadline-xray';
  const expectedCents=isDeadline
    ? DEADLINE_AMOUNT_CENTS
    : Number(offer.entry_paid_offer?.price_usd_normalized)*100;
  if(!Number.isSafeInteger(expectedCents)||expectedCents<=0) return fail('published_offer_price_unverified');
  if(result?.ok!==true || result?.checkout_ready!==true) return fail('owned_checkout_not_ready');
  if(result?.authority!=='Evercraft Payments') return fail('wrong_order_authority');
  if(!String(result?.order_key||'').trim() ||
     String(result.order_key).length>200 ||
     /[\r\n]/.test(String(result.order_key))) return fail('missing_or_invalid_evercraft_order');
  if(isDeadline && String(result?.offer_key||'')!==DEADLINE_KEY) return fail('ibmi_74_checkout_contract_not_verified');
  if(!Number.isSafeInteger(Number(result?.amount_cents))||
     Number(result.amount_cents)!==expectedCents) return fail('published_offer_amount_mismatch');
  if(String(result?.currency||'').toLowerCase()!=='usd') return fail('published_offer_currency_mismatch');
  if(String(result?.payment_state||'').toLowerCase()!=='unpaid') return fail('unexpected_checkout_payment_state');
  if(result?.fulfillment_release!==false) return fail('unexpected_fulfillment_release');
  let url;
  try{
    url=new URL(String(result?.checkout_url||''));
  }catch{return fail('checkout_url_invalid');}
  if(url.protocol!=='https:' || url.hostname!==STRIPE_CHECKOUT_HOST ||
     url.username || url.password || url.port || url.hash ||
     !url.pathname.startsWith('/c/pay/')){
    return fail('unapproved_checkout_destination');
  }
  if(!url.pathname.slice('/c/pay/'.length).replaceAll('/','').trim()){
    return fail('checkout_session_path_missing');
  }
  return {
    ok:true,
    reason:'owned_checkout_handoff_validated_not_payment',
    checkout_url:url.toString(),
    amount_cents:expectedCents,
    currency:'USD',
    order_key:String(result.order_key),
    offer_key:isDeadline?DEADLINE_KEY:null,
    settlement_verified:false,
    fulfillment_release:false,
  };
}
