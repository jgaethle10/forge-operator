import {parseOwnedPaymentUrl,isEvercraftPaymentHost} from '../mcp/owned-payment-transport.mjs';
import {FORENSISCOPE_OFFERS} from './commercial-offers.mjs';
import {evaluateForensiScopeCheckoutGate} from './self-service-admission.mjs';

const ORDER=/^[A-Za-z0-9._:-]{8,120}$/;
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const error=(code,status=503)=>Object.assign(new Error(code),{status});
const validOrder=value=>typeof value==='string'&&ORDER.test(value);
const safeEmail=value=>typeof value==='string'&&
  value.length<=200&&EMAIL.test(value)&&!/[<>\r\n]/.test(value);
const exactPrice=(quote)=>{
 const tier=FORENSISCOPE_OFFERS.find(t=>t.offer_key===quote?.offer_key);
 return tier&&quote?.state==='quote_only'&&
  Number.isSafeInteger(quote.duration_seconds)&&quote.duration_seconds>0&&
  quote.duration_seconds<=tier.max_duration_seconds&&
  quote.amount_cents===tier.amount_usd*100&&
  quote.currency==='usd'&&
  Number.isSafeInteger(quote.file_size_bytes)&&quote.file_size_bytes>0;
};

/**
 * First-party payment bridge. This is not a direct Stripe integration.
 *
 * Required dependencies are all owned, server-side, and authoritative:
 * - loadOrder: persisted customer order and approved media quote
 * - readCapacity: live owned disk/codec/worker/delivery/payment readiness
 * - reserveCapacity: durable processing capacity reservation
 * - persistCheckout: durable owned order record before returning buyer URL
 *
 * No checkout starts unless explicitly enabled by the deployment owner.
 * Checkout URLs are never interpreted as evidence of settlement.
 */
export function createForensiScopeOwnedCheckoutBridge({
 paymentOpsUrl='',returnOrigin='https://fabric.systemiacommandcenters.com',
 enabled=false,loadOrder,readCapacity,reserveCapacity,persistCheckout,
 fetchImpl=fetch,timeoutMs=12000,maxUploadBytes=256*1024*1024
}={}){
 const endpoint=parseOwnedPaymentUrl(paymentOpsUrl);
 const returnUrl=parseOwnedPaymentUrl(returnOrigin,{allowMissing:false});
 if(returnUrl.pathname!=='/'||returnUrl.search)throw error('return_origin_must_be_owned_origin');
 if([loadOrder,readCapacity,reserveCapacity,persistCheckout,fetchImpl]
   .some(fn=>typeof fn!=='function'))throw error('trusted_checkout_dependencies_required');
 if(!Number.isSafeInteger(maxUploadBytes)||maxUploadBytes<=0)
   throw error('invalid_owned_upload_capacity');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
   throw error('invalid_payment_timeout');
 const createCheckout=async({orderKey,subject,buyerEmail,confirmed}={})=>{
  if(enabled!==true||!endpoint)
   throw error('evercraft_payments_checkout_not_enabled');
  if(!validOrder(orderKey)||typeof subject!=='string'||!subject||
     subject.length>160||!safeEmail(buyerEmail))
   throw error('authenticated_order_and_customer_required',401);
  if(confirmed!==true)throw error('explicit_checkout_confirmation_required',409);
  const owned=await loadOrder(orderKey,subject);
  if(owned?.subject!==subject||owned?.order_key!==orderKey||
     !exactPrice(owned.quote)||
     owned.media_rights_confirmed!==true)
   throw error('owned_order_or_exact_offer_not_verified',409);
  // Recompute, never accept a browser-controlled capacity/price gate.
  const capacity=await readCapacity();
  if(!capacity||typeof capacity!=='object'||Array.isArray(capacity))
   throw error('owned_capacity_unavailable');
  const admission=evaluateForensiScopeCheckoutGate({
   quote:owned.quote,capabilities:{
    ...capacity,
    ingress_max_bytes:Math.min(
     Number.isSafeInteger(capacity.ingress_max_bytes)?capacity.ingress_max_bytes:0,
     maxUploadBytes
    )
   }
  });
  if(!admission.permitted)throw error('checkout_capacity_unavailable',503);
  const reservation=await reserveCapacity({
   orderKey,subject,offerKey:owned.quote.offer_key,
   fileSizeBytes:owned.quote.file_size_bytes
  });
  if(reservation?.ok!==true||reservation.order_key!==orderKey||
     typeof reservation.reservation_id!=='string'||
     reservation.reservation_id.length<8)
   throw error('owned_processing_reservation_required');
  let result,response;
  try{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    response=await fetchImpl(endpoint.href,{
     method:'POST',redirect:'error',
     headers:{
      'content-type':'application/json',
      'accept':'application/json',
      'user-agent':'Evercraft-ForensiScope-Owned-Checkout/1.0'
     },
     body:JSON.stringify({
      action:'create_checkout',
      offer_key:owned.quote.offer_key,
      order_key:orderKey,
      customer_email:buyerEmail,
      source_ref:'forensiscope|owned-customer-runtime',
      return_origin:returnUrl.origin,
      success_path:'/forensiscope/?payment=processing',
      cancel_path:'/forensiscope/?payment=cancelled'
     }),
     signal:controller.signal
    });
   }finally{clearTimeout(timer)}
   if(response?.status===402)throw error('evercraft_payments_provider_hold_402',503);
   if(!response?.ok)throw error('evercraft_payments_checkout_unavailable');
   result=await response.json();
  }catch{
   // There is no provider fallback, implicit retry, or claim of payment.
   throw error('evercraft_payments_checkout_unavailable');
  }
  const exact=result?.ok===true&&result.order_key===orderKey&&
   result.offer_key===owned.quote.offer_key&&
   result.amount_cents===owned.quote.amount_cents&&
   String(result.currency||'').toLowerCase()==='usd';
  let checkoutUrl;
  try{
   checkoutUrl=new URL(String(result?.checkout_url||''));
  }catch{throw error('owned_checkout_url_missing')}
  if(!exact||checkoutUrl.protocol!=='https:'||
     checkoutUrl.username||checkoutUrl.password||checkoutUrl.hash||
     !(isEvercraftPaymentHost(checkoutUrl.hostname)||
       checkoutUrl.hostname==='stripe.com'||
       checkoutUrl.hostname.endsWith('.stripe.com')))
   throw error('owned_checkout_receipt_mismatch');
  // Durable order state before exposing the provider's buyer handoff URL.
  // This persistence does not mark an order paid or grant entitlement.
  const stored=await persistCheckout({
   orderKey,subject,
   offerKey:owned.quote.offer_key,
   amountCents:owned.quote.amount_cents,
   currency:'usd',
   reservationId:reservation.reservation_id,
   providerCheckoutUrl:checkoutUrl.href,
   paymentState:'unpaid',
   entitlementGranted:false,
   uploadAuthorized:false
  });
  if(stored?.ok!==true||stored.order_key!==orderKey||
     stored.payment_state!=='unpaid')
   throw error('owned_checkout_order_persistence_failed');
  return Object.freeze({
   schema:'evercraft.forensiscope.checkout-handoff.v1',
   order_key:orderKey,
   offer_key:owned.quote.offer_key,
   amount_cents:owned.quote.amount_cents,
   currency:'usd',checkout_url:checkoutUrl.href,
   checkout_created:true,payment_state:'unpaid',
   provider_paid_verified:false,entitlement_granted:false,
   upload_authorized:false,job_started:false,
   provider_authority:'Evercraft Payments'
  });
 };
 return Object.freeze({
  createCheckout,
  readiness:Object.freeze({
   configured:Boolean(endpoint),enabled:enabled===true&&Boolean(endpoint),
   payment_authority:'Evercraft Payments',
   provider_receipt_required:true,
   max_upload_bytes:maxUploadBytes
  })
 });
}
