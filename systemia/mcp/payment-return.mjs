import {parseOwnedPaymentUrl} from './owned-payment-transport.mjs';
import {publicPaymentOffer} from './public-payment-offers.mjs';
import crypto from 'node:crypto';
export function buyerOrderKey(slug,idempotencyKey){
  const h=crypto.createHash('sha256').update(JSON.stringify([slug,idempotencyKey])).digest('hex').slice(0,32);
  return 'buyer-'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
const NATIVE_OFFERS={
 'website-audit':'systemia.website_audit_quick_win_49.v1',
 'ibmi-rescue':'ibmi_estate_xray_250',
 'legacy-rescue':'legacy_rescue_scan_299.v1',
 findmypart:'findmypart.quick_hunt_19.v1',
 'part-quick':'findmypart.quick_hunt_19.v1',
 'site-survive':'evercraft_network.site_survive_rapid_audit_250.v1'
};
export async function verifyNativePaymentReturn(slug,params,paymentFetch=fetch,ownedOpsUrl=process.env.EVERCRAFT_PAYMENT_OPS_OWNED_URL||''){
 // Native and expanded offers share the exact approved SKU registry.
 // Never infer entitlement from the amount or an unrelated same-price offer.
 const offerKey=NATIVE_OFFERS[slug]||publicPaymentOffer(slug)?.offer_key;
 const orderKey=params.get('evercraft_order_key')||'';
 const session=params.get('stripe_session_id')||'';
 if(!offerKey||params.get('offer_key')!==offerKey||!/^cs_(?:live|test)_[A-Za-z0-9]+$/.test(session)||!/^[A-Za-z0-9_-]{8,260}$/.test(orderKey))return {state:'invalid',status:400};
 let endpoint;
 try{endpoint=parseOwnedPaymentUrl(ownedOpsUrl)}catch{return {state:'pending',status:503}}
 if(!endpoint)return {state:'pending',status:503};
 try{
  const response=await paymentFetch(endpoint,{
   method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'Evercraft-Fabric-Payment-Return/1.0'},
   body:JSON.stringify({action:'verify_checkout',offer_key:offerKey,order_key:orderKey,provider_session_id:session}),signal:AbortSignal.timeout(18000)
  });
  const d=await response.json();
  if(response.ok&&d.ok===true&&d.payment_confirmed===true&&d.receipt_key&&d.order_key===orderKey&&d.offer_key===offerKey){
   return {state:d.synthetic===true?'synthetic':'paid',status:200,queued:Boolean(d.fulfillment_job_key)&&d.fulfillment_state==='queued'};
  }
  return {state:'pending',status:200};
 }catch{return {state:'pending',status:503};}
}
