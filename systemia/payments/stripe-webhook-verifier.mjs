/**
 * Evercraft Payments / Stripe signature gateway.
 * This is a release candidate, not production webhook acceptance.
 * A signed notification NEVER directly creates a paid receipt: verification
 * must re-fetch an existing exact order/session via canonical operations.
 */
import crypto from 'node:crypto';

const SIGNED_TYPES=new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);
const REVERSAL_TYPES=new Set([
  'charge.refunded','charge.dispute.created','charge.dispute.closed',
  'refund.created','refund.updated','refund.failed'
]);
const SESSION=/^cs_(test|live)_[A-Za-z0-9]+$/;
const EVENT=/^evt_[A-Za-z0-9]+$/;
const MAX_PAYLOAD_BYTES=65536;

export function validateStripeWebhook({rawBody,signatureHeader,signingSecret,nowMs=Date.now()}={}){
  if(!Buffer.isBuffer(rawBody)||rawBody.length===0||rawBody.length>MAX_PAYLOAD_BYTES)
    return {ok:false,reason:'invalid_payload'};
  if(typeof signingSecret!=='string'||!/^whsec_[A-Za-z0-9]+$/.test(signingSecret))
    return {ok:false,reason:'missing_or_invalid_signing_secret'};
  if(typeof signatureHeader!=='string'||signatureHeader.length>1024)
    return {ok:false,reason:'invalid_signature_header'};
  const attrs=signatureHeader.split(',').map(x=>x.trim());
  const timestampAttr=attrs.find(x=>/^t=\d+$/.test(x));
  const signatureAttrs=attrs.filter(x=>/^v1=[a-fA-F0-9]{64}$/.test(x));
  if(!timestampAttr||!signatureAttrs.length)return {ok:false,reason:'invalid_signature_header'};
  const timestamp=Number(timestampAttr.slice(2));
  if(!Number.isSafeInteger(timestamp)||Math.abs(nowMs/1000-timestamp)>300)
    return {ok:false,reason:'stale_or_future_signature'};
  const signed=Buffer.concat([Buffer.from(String(timestamp)+'.'),rawBody]);
  const digest=crypto.createHmac('sha256',signingSecret).update(signed).digest();
  const matched=signatureAttrs.some(item=>{
    const candidate=Buffer.from(item.slice(3),'hex');
    return candidate.length===digest.length&&crypto.timingSafeEqual(candidate,digest);
  });
  if(!matched)return {ok:false,reason:'signature_mismatch'};
  let parsed;
  try{parsed=JSON.parse(rawBody.toString('utf8'));}catch{return {ok:false,reason:'invalid_json'};}
  if(!parsed||!EVENT.test(parsed.id||'')||typeof parsed.type!=='string'||
     !parsed.data?.object||typeof parsed.data.object!=='object')
    return {ok:false,reason:'invalid_event'};
  return {ok:true,event:parsed};
}

export async function processVerifiedStripeWebhook({rawBody,signatureHeader,signingSecret,operate,nowMs}={}){
  const verification=validateStripeWebhook({rawBody,signatureHeader,signingSecret,nowMs});
  if(!verification.ok)return {status:400,body:{received:false,error:verification.reason}};
  const event=verification.event;
  if(REVERSAL_TYPES.has(event.type)){
    // Do not silently discard refund/chargeback: native release remains BLOCKED
    // until the durable reversal reconciliation handler is implemented.
    return {status:503,body:{received:false,error:'reversal_reconciliation_not_implemented'}};
  }
  if(!SIGNED_TYPES.has(event.type)){
    return {status:200,body:{received:true,processed:false,reason:'not_a_payment_completion_event'}};
  }
  const session=event.data.object||{};
  const orderKey=String(session.client_reference_id||'');
  const offerKey=String(session.metadata?.offer_key||'');
  if(!SESSION.test(session.id||'')||!/^buyer-[0-9a-f-]{36}$/.test(orderKey)||
     offerKey.length<5||offerKey.length>150){
    return {status:400,body:{received:false,error:'unbound_checkout_event'}};
  }
  if(typeof operate!=='function')
    return {status:503,body:{received:false,error:'payment_operations_not_configured'}};
  // No trust in event's payment_status. This must refetch processor state,
  // validate the existing session/order/currency/amount and journal the receipt.
  const result=await operate({
    action:'verify_checkout',
    order_key:orderKey,
    offer_key:offerKey,
    provider_session_id:session.id
  }).catch(()=>null);
  if(!result?.body?.payment_confirmed)
    return {status:503,body:{received:false,error:'provider_receipt_not_confirmed'}};
  return {status:200,body:{
    received:true,processed:true,
    order_verified:true,
    fulfillment_released:false
  }};
}
