import {parseOwnedPaymentUrl} from '../mcp/owned-payment-transport.mjs';
import {FORENSISCOPE_OFFERS} from './commercial-offers.mjs';

const ORDER=/^forensiscope-[a-f0-9]{32}$/;
const SOURCE='evercraft_payments_authoritative_provider_readback';
const MAX_RECEIPT_AGE_MS=5*60*1000;
const deny=()=>null;

function exactOwnedOrder(order,key){
 if(!order||order.order_key!==key||order.checkout_state!=='created'||
    order.payment_state!=='unpaid'||order.quote?.state!=='quote_only')
  return false;
 const q=order.quote;
 const tier=FORENSISCOPE_OFFERS.find(t=>
  Number.isSafeInteger(q.duration_seconds)&&q.duration_seconds>0&&
  q.duration_seconds<=t.max_duration_seconds);
 return Boolean(tier&&q.offer_key===tier.offer_key&&
  q.amount_cents===tier.amount_usd*100&&q.currency==='usd'&&
  Number.isSafeInteger(q.file_size_bytes)&&q.file_size_bytes>0);
}

/**
 * Fail-closed readback for ONE canonical Evercraft Payments-owned order.
 *
 * This is an adapter contract, not a currently deployed merchant endpoint.
 * The Evercraft Payments owner must implement the *exact* documented
 * verify_order_settlement response schema before enabling it in production.
 * Never accept a checkout redirect, browser JSON or an arbitrary Stripe
 * status as verified settlement. Secrets remain server-side.
 */
export function createForensiScopeOwnedSettlementReader({
 readbackUrl='',serviceAuthorization='',enabled=false,
 loadTrustedSettlementOrder,fetchImpl=fetch,now=()=>Date.now(),
 timeoutMs=10000
}={}){
 const endpoint=parseOwnedPaymentUrl(readbackUrl);
 if(typeof loadTrustedSettlementOrder!=='function'||typeof fetchImpl!=='function'||
    typeof now!=='function')throw new Error('trusted_settlement_dependencies_required');
 if(endpoint&&(endpoint.search||endpoint.hash||endpoint.pathname==='/'))
  throw new Error('owned_settlement_endpoint_path_required');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
  throw new Error('settlement_timeout_invalid');
 const configured=Boolean(endpoint&&typeof serviceAuthorization==='string'&&
  serviceAuthorization.length>=24&&!/[\r\n]/.test(serviceAuthorization));
 const ready=enabled===true&&configured;
 const verifyPaidOrder=async orderKey=>{
  if(!ready||typeof orderKey!=='string'||!ORDER.test(orderKey))return deny();
  let order;
  try{order=await loadTrustedSettlementOrder(orderKey)}catch{return deny()}
  if(!exactOwnedOrder(order,orderKey))return deny();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let result;
  try{
   const response=await fetchImpl(endpoint.href,{
    method:'POST',redirect:'error',signal:controller.signal,
    headers:{
     'authorization':'Bearer '+serviceAuthorization,
     'content-type':'application/json',
     'accept':'application/json',
     'cache-control':'no-store',
     'user-agent':'Evercraft-ForensiScope-Settlement-Readback/1.0'
    },
    body:JSON.stringify({
     action:'verify_order_settlement',
     order_key:orderKey,
     offer_key:order.quote.offer_key,
     amount_cents:order.quote.amount_cents,
     currency:'usd'
    })
   });
   if(response?.status!==200||!response.ok)return deny();
   result=await response.json();
  }catch{return deny()}finally{clearTimeout(timeout)}
  const timestamp=Date.parse(String(result?.verified_at||''));
  const fresh=Number.isFinite(timestamp)&&
   timestamp<=now()+30000&&now()-timestamp<=MAX_RECEIPT_AGE_MS;
  const receipt=String(result?.provider_receipt_id||'');
  const valid=result?.schema==='evercraft.payments.authoritative-settlement-readback.v1'&&
   result?.authority==='evercraft_payments'&&
   result?.provider_boundary==='raven_nexus'&&
   result?.order_key===orderKey&&
   result?.offer_key===order.quote.offer_key&&
   result?.amount_cents===order.quote.amount_cents&&
   result?.currency==='usd'&&
   result?.payment_state==='paid'&&
   result?.provider_paid_verified===true&&
   result?.settlement_verified===true&&
   result?.livemode===true&&
   result?.refund_state==='none'&&
   result?.dispute_state==='none'&&
   receipt.length>=8&&receipt.length<=256&&!/[\r\n\x00-\x1f]/.test(receipt)&&
   fresh;
  if(!valid)return deny();
  // These fields have the exact private-admission schema expected by
  // evaluateForensiScopePaidUpload; no customer identity/media is returned.
  return Object.freeze({
   verification_source:SOURCE,
   order_key:orderKey,
   offer_key:order.quote.offer_key,
   amount_cents:order.quote.amount_cents,
   currency:'usd',
   provider_paid_verified:true,
   settlement_verified:true,
   provider_receipt_id:receipt,
   verified_at:new Date(timestamp).toISOString()
  });
 };
 return Object.freeze({
  verifyPaidOrder,
  readiness:Object.freeze({
   schema:'evercraft.forensiscope.settlement-reader-readiness.v1',
   configured,enabled:ready,
   checkout_redirect_is_payment:false,
   authoritative_provider_readback_required:true,
   upstream_provider_402_must_fail_closed:true
  })
 });
}
