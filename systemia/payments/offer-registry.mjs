export const EVERCRAFT_PAYMENT_OFFERS=Object.freeze({
  'website-audit-quick-win':Object.freeze({
    purchase_key:'website-audit-quick-win',
    product_key:'audit-center-website-audit-machine-v1',
    product_name:'Systemia Website Audit',
    offer_name:'Quick Win Audit',
    amount_cents:4900,
    currency:'usd',
    settlement_mode:'payment',
    fulfillment_release_requires_verified_payment:true,
  }),
  'ibmi-estate-xray':Object.freeze({
    purchase_key:'ibmi-estate-xray',
    product_key:'ibmi-rescue-v1',
    product_name:'Evercraft IBM i Rescue',
    offer_name:'IBM i Estate X-Ray',
    amount_cents:25000,
    currency:'usd',
    settlement_mode:'payment',
    fulfillment_release_requires_verified_payment:true,
  }),
  'legacy-rescue-scan':Object.freeze({
    purchase_key:'legacy-rescue-scan',
    product_key:'legacy-rescue-lab-v1',
    product_name:'Legacy Rescue Lab',
    offer_name:'Legacy Rescue Scan',
    amount_cents:29900,
    currency:'usd',
    settlement_mode:'payment',
    fulfillment_release_requires_verified_payment:true,
  }),
  'findmypart-quick-hunt':Object.freeze({
    purchase_key:'findmypart-quick-hunt',
    product_key:'findmypart-paid-hunt-v1',
    product_name:'FindMyPart Paid Part Hunt',
    offer_name:'Quick Hunt',
    amount_cents:1900,
    currency:'usd',
    settlement_mode:'payment',
    fulfillment_release_requires_verified_payment:true,
  }),
});

export function getEvercraftPaymentOffer(purchaseKey){
  return EVERCRAFT_PAYMENT_OFFERS[String(purchaseKey||'').trim()]||null;
}

export function listEvercraftPaymentOffers(){
  return Object.values(EVERCRAFT_PAYMENT_OFFERS);
}
