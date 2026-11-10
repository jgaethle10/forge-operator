/** Owned-only outbound payment transport validation. No implicit legacy fallback. */
const OWNED_PAYMENT_HOSTS=Object.freeze([
  'systemiacommandcenters.com',
  'evercraftpropertyservices.com',
]);
export function isEvercraftPaymentHost(hostname){
 const host=String(hostname||'').trim().toLowerCase();
 return OWNED_PAYMENT_HOSTS.some(root=>host===root||host.endsWith('.'+root));
}
export function parseOwnedPaymentUrl(raw,{allowMissing=true}={}){
 const value=String(raw||'').trim();
 if(!value){
  if(allowMissing)return null;
  throw new Error('owned_payment_endpoint_required');
 }
 let u;
 try{u=new URL(value)}catch{throw new Error('owned_payment_endpoint_invalid')}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||
    !isEvercraftPaymentHost(u.hostname))throw new Error('owned_payment_endpoint_unapproved_origin');
 return u;
}
export function ownedPaymentTransportConfig({
 purchaseIntentUrl=process.env.EVERCRAFT_PURCHASE_INTENT_OWNED_URL||'',
 paymentOpsUrl=process.env.EVERCRAFT_PAYMENT_OPS_OWNED_URL||''
}={}){
 const purchaseIntentEndpoint=parseOwnedPaymentUrl(purchaseIntentUrl);
 const paymentOpsEndpoint=parseOwnedPaymentUrl(paymentOpsUrl);
 return {
  purchaseIntentEndpoint,
  paymentOpsEndpoint,
  purchase_intent_configured:Boolean(purchaseIntentEndpoint),
  direct_offer_ops_configured:Boolean(paymentOpsEndpoint),
  fully_configured:Boolean(purchaseIntentEndpoint&&paymentOpsEndpoint),
  platform:'evercraft_owned_only',
 };
}
