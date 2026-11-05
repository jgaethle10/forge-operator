/**
 * Evercraft Payments / Raven Nexus native Website Audit checkout boundary.
 * This is PREPAYMENT validation only. It cannot authenticate settlement,
 * grant entitlements or verify any provider-side charge.
 *
 * The public $49 SKU must not be sent to a checkout for another price.
 */
export const WEBSITE_AUDIT_NATIVE_ORDER=Object.freeze({
  slug:'website-audit',
  capabilityKey:'website-audit-quick-win',
  amountCents:4900,
  currency:'usd',
  authority:'Evercraft Payments',
});

export function inspectWebsiteAuditCheckoutHandoff({result,auditedDomain}={}){
  const deny=reason=>({accepted:false,reason,
    checkoutCreatedByThisValidator:false,
    providerPaymentVerified:false,fulfillmentAuthorized:false});
  if(!result||typeof result!=='object')return deny('checkout_response_missing');
  if(result.ok!==true||result.checkout_ready!==true)return deny('checkout_not_ready');
  if(result.authority!==WEBSITE_AUDIT_NATIVE_ORDER.authority)
    return deny('payment_authority_mismatch');
  if(result.amount_cents!==WEBSITE_AUDIT_NATIVE_ORDER.amountCents||
     result.currency!==WEBSITE_AUDIT_NATIVE_ORDER.currency)
    return deny('amount_or_currency_mismatch');
  // A payment session is not a paid order, nor permission to deliver.
  if(result.payment_state!=='unpaid'||result.fulfillment_release!==false)
    return deny('premature_payment_or_fulfillment');
  if(typeof result.order_key!=='string'||
    !/^[A-Za-z0-9:_-]{8,260}$/.test(result.order_key))
    return deny('canonical_order_key_missing');
  if(typeof auditedDomain!=='string'||!auditedDomain.trim()||
    result.context_persisted!==true||result.audited_domain!==auditedDomain)
    return deny('audited_domain_custody_mismatch');
  let checkout;
  try{checkout=new URL(String(result.checkout_url||''));}catch{
    return deny('checkout_destination_invalid');
  }
  if(checkout.protocol!=='https:'||checkout.username||checkout.password||
     checkout.hash||!checkout.hostname)
    return deny('checkout_destination_invalid');
  return {accepted:true,reason:'unpaid_exact_sku_handoff_only',
    orderKey:result.order_key,checkoutUrl:checkout.toString(),
    expectedAmountCents:WEBSITE_AUDIT_NATIVE_ORDER.amountCents,
    currency:WEBSITE_AUDIT_NATIVE_ORDER.currency,
    checkoutCreatedByThisValidator:false,
    providerPaymentVerified:false,fulfillmentAuthorized:false};
}
