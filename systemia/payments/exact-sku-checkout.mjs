/**
 * Evercraft Payments | read-only, exact-SKU hosted-checkout resolver.
 *
 * This DOES NOT create an Evercraft PaymentOrder, a Stripe Checkout Session,
 * a payment, or a fulfilled entitlement. It preserves the seven existing
 * Systemia-hosted payment links as a transitional manual-reconciliation rail.
 *
 * To onboard another offer, give it its OWN provider-active SKU and a separate
 * independently checked exact-price link. Never borrow an existing link merely
 * because its price happens to match.
 */
const fail=(state,details={})=>({
  ok:false,state,checkout_url:null,checkout_ready:false,
  paid_verified:false,fulfillment_release:false,...details,
});

export function validateExactSkuRegistry(products,manifest){
  if(products?.schema!=='evercraft.commercial-products.v1'||
     !Array.isArray(products.products)||
     manifest?.schema!=='evercraft.payments.existing-provider-links.v1'||
     !Array.isArray(manifest.links))throw Error('invalid_exact_sku_catalog');
  const ids=new Set(),skuKeys=new Set(),checkoutUrls=new Set(),linkKeys=new Set();
  for(const link of manifest.links){
    if(!link.key||linkKeys.has(link.key)||!Number.isSafeInteger(link.amount_cents)||
       link.amount_cents<=0||!link.payment_link_id||!link.stripe_price_id||
       !link.stripe_product_id||!link.name)throw Error('invalid_or_duplicate_payment_link');
    linkKeys.add(link.key);
    let checkout;
    try{checkout=new URL(link.url)}catch{throw Error('invalid_provider_url')}
    if(checkout.protocol!=='https:'||checkout.hostname!=='buy.stripe.com'||
       checkout.username||checkout.password||checkout.search||checkout.hash||
       !/^\/[A-Za-z0-9]+$/.test(checkout.pathname)||
       checkoutUrls.has(link.url))throw Error('unapproved_or_duplicate_checkout_url');
    checkoutUrls.add(link.url);
  }
  for(const p of products.products){
    if(!p.product_id||ids.has(p.product_id)||!p.sku_key||
       skuKeys.has(p.sku_key))throw Error('invalid_or_duplicate_commercial_product');
    ids.add(p.product_id);skuKeys.add(p.sku_key);
    const exact=manifest.links.find(l=>l.key===p.sku_key);
    if(!exact||p.checkout_url!==exact.url||
       p.exact_checkout_product!==exact.name||
       !Number.isSafeInteger(p.price_usd*100)||
       p.price_usd*100!==exact.amount_cents)throw Error('catalog_exact_sku_mismatch');
  }
  if(products.products.length!==manifest.links.length)throw Error('unmapped_commercial_product');
  if(manifest.current_processor_account!=='Systemia')throw Error('unexpected_merchant_account');
  if(manifest.canonical_order_reconciliation!=='manual_not_automated')
    throw Error('unverified_automatic_reconciliation_claim');
  return true;
}

/**
 * A caller may request a product identity, not choose a different offer by
 * amount.  Only the exact independently mapped original Stripe SKU is used.
 */
export function resolveExactSkuCheckout({
  product_id,
  expected_amount_cents=null,
  currency='usd',
  scope_approved=false,
  capacity_approved=false,
  buyer_confirmed=false,
}={}, {products,manifest}={}){
  validateExactSkuRegistry(products,manifest);
  const product=products.products.find(p=>p.product_id===product_id);
  if(!product)return fail('EXACT_SKU_NOT_PROVISIONED',{
    reason:'This product needs its own approved exact product, price and provider-verified checkout before any paid handoff.',
  });
  const link=manifest.links.find(l=>l.key===product.sku_key);
  if(expected_amount_cents!==null &&
     (!Number.isSafeInteger(expected_amount_cents)||expected_amount_cents!==link.amount_cents))
    return fail('AMOUNT_MISMATCH',{product_id});
  if(String(currency).toLowerCase()!=='usd')
    return fail('CURRENCY_MISMATCH',{product_id});
  if(scope_approved!==true||capacity_approved!==true||buyer_confirmed!==true)
    return fail('SCOPE_CAPACITY_AND_BUYER_CONFIRMATION_REQUIRED',{
      product_id,buyer_page:product.landing_page,amount_cents:link.amount_cents,
      currency:'usd',
    });
  return {
    ok:true,state:'EXACT_PROVIDER_CHECKOUT_REVIEW_AVAILABLE',
    product_id,offer_key:link.key,provider_product_name:link.name,
    amount_cents:link.amount_cents,currency:'usd',
    buyer_page:product.landing_page,checkout_url:link.url,
    payment_link_id:link.payment_link_id,stripe_price_id:link.stripe_price_id,
    stripe_product_id:link.stripe_product_id,
    payment_authority:'Evercraft Payments',
    settlement_provider:'Stripe',merchant_account:'Systemia',
    checkout_ready:true,checkout_created:false,
    paid_verified:false,fulfillment_release:false,
    canonical_order_reconciliation:'manual_required',
    note:'A valid hosted payment form is not a paid order, customer entitlement or delivered work.',
  };
}

export function commerceCoverage({publicProducts,products,manifest}={}){
  validateExactSkuRegistry(products,manifest);
  if(!Array.isArray(publicProducts?.products))throw Error('public_product_catalog_invalid');
  const productKeys=new Set();
  const discovery=publicProducts.products.map(p=>{
    if(!p.product_key||productKeys.has(p.product_key))throw Error('duplicate_public_product_key');
    productKeys.add(p.product_key);
    return {product_key:p.product_key,name:p.name,
      state:'INVENTORIED_NOT_AUTOMATICALLY_PAYMENT_APPROVED'};
  });
  return {
    schema:'evercraft.payments.coverage.v1',
    owned_discovery_products:discovery.length,
    independently_linked_commercial_products:products.products.length,
    exact_provider_checkout_links:manifest.links.length,
    other_offers_automatically_reusing_any_of_seven:0,
    source_note:'Discovery inventory and independent commercial SKUs are separate dimensions; some products overlap. Counts must not be added to claim total unique products.',
    discovery,
    independently_linked_products:products.products.map(p=>({product_id:p.product_id,sku_key:p.sku_key,amount_cents:manifest.links.find(l=>l.key===p.sku_key).amount_cents})),
    state:'EXACT_SKU_ONBOARDING_REQUIRED_FOR_ADDITIONAL_OFFERS',
  };
}
