// Boundary between Raven's checkout intent assertion and a customer-visible
// Website Audit payment handoff. A passing contract is NOT verification that
// a Stripe session exists or is paid.
const CENTRAL_OFFER='systemia.website_audit_quick_win_49.v1';
const PAYMENT_URL_HOSTS=new Set(['checkout.stripe.com','buy.stripe.com']);
const fail=(reason)=>Object.freeze({valid:false,reason,provider_authentication_verified:false,
  paid:false,customer_contact_authority:false});
export function verifyWebsiteAuditCheckoutHandoff(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return fail('missing_upstream_contract');
  if(value.ok!==true||value.authority!=='Evercraft Payments'||
      value.payment_runtime!=='central')return fail('wrong_checkout_authority');
  if(value.offer_key!==CENTRAL_OFFER||value.capability_key!=='website-audit-quick-win'){
    return fail('wrong_offer_identity');
  }
  if(value.amount_cents!==4900||value.currency!=='usd')return fail('wrong_checkout_amount');
  if(value.checkout_ready!==true||value.payment_state!=='unpaid'||
    value.fulfillment_release!==false)return fail('untrusted_checkout_or_paid_state');
  let url;
  try{url=new URL(String(value.checkout_url||''));}
  catch{return fail('invalid_checkout_url');}
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||
    !PAYMENT_URL_HOSTS.has(url.hostname.toLowerCase())||url.pathname==='/'){
    return fail('noncanonical_stripe_checkout_url');
  }
  // An exact trusted hostname is necessary but still not proof of provider-side session validity.
  return Object.freeze({
    valid:true,reason:'asserted_contract_matches_requires_provider_session_verification',
    provider_authentication_verified:false,paid:false,customer_contact_authority:false,
  });
}
