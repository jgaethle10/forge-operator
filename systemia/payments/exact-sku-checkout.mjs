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
 * Additional offers live in a separate registry so the seven legacy receipts,
 * original buyer SKUs and seven-checkout canary never need to be overwritten.
 * Entries are admitted only with an exact owner-approved provider identity
 * and a dated independent rendered-buyer-view receipt. Evidence URLs are
 * review inputs, not themselves payment/fulfillment receipts.
 */
export function validateAdditionalExactSkuLinks(additional,{products,manifest}={}){
  validateExactSkuRegistry(products,manifest);
  if(additional==null)return [];
  if(additional.schema!=='evercraft.payments.additional-exact-sku-links.v1'||
    additional.settlement_account!=='Systemia'||additional.settlement_provider!=='Stripe'||
    !Array.isArray(additional.offers))throw Error('additional_exact_sku_schema_invalid');
  const ids=new Set(products.products.map(x=>x.product_id));
  const skus=new Set(manifest.links.map(x=>x.key));
  const links=new Set(manifest.links.map(x=>x.url));
  const priceIds=new Set(manifest.links.map(x=>x.stripe_price_id));
  const paymentIds=new Set(manifest.links.map(x=>x.payment_link_id));
  for(const offer of additional.offers){
    if(!offer||typeof offer!=='object'||!offer.product_id||!offer.sku_key||
      !offer.name||!Number.isSafeInteger(offer.amount_cents)||offer.amount_cents<=0||
      offer.currency!=='usd'||offer.approved_by_owner!==true||
      offer.verification_state!=='PROVIDER_AND_RENDERED_BUYER_VIEW_VERIFIED'||
      !offer.independent_browser_receipt||!offer.browser_checked_at||
      !offer.landing_page||!offer.payment_link_id||!offer.stripe_product_id||
      !offer.stripe_price_id||!offer.url)throw Error('unverified_additional_exact_sku');
    if(ids.has(offer.product_id)||skus.has(offer.sku_key)||
       links.has(offer.url)||priceIds.has(offer.stripe_price_id)||
       paymentIds.has(offer.payment_link_id))throw Error('duplicate_additional_exact_sku');
    let checkout,proof,page;
    try{
      checkout=new URL(offer.url);proof=new URL(offer.independent_browser_receipt);
      page=new URL(offer.landing_page);
    }catch{throw Error('additional_exact_sku_invalid_url')}
    if(checkout.protocol!=='https:'||checkout.hostname!=='buy.stripe.com'||
       !/^\\/[A-Za-z0-9]+$/.test(checkout.pathname)||
       checkout.search||checkout.hash||checkout.username||checkout.password||
       proof.protocol!=='https:'||proof.hostname!=='github.com'||
       !proof.pathname.startsWith('/jgaethle10/forge-operator/actions/runs/')||
       page.protocol!=='https:'||
       !(page.hostname==='fabric.systemiacommandcenters.com'||
         (page.hostname==='jgaethle10.github.io'&&page.pathname.startsWith('/forge-operator/')))||
       !Number.isFinite(Date.parse(offer.browser_checked_at)))
       throw Error('additional_exact_sku_unapproved_evidence');
    ids.add(offer.product_id);skus.add(offer.sku_key);links.add(offer.url);
    priceIds.add(offer.stripe_price_id);paymentIds.add(offer.payment_link_id);
  }
  return additional.offers;
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
}={}, {products,manifest,additional=null}={}){
  validateExactSkuRegistry(products,manifest);
  const verifiedAdditional=validateAdditionalExactSkuLinks(additional,{products,manifest});
  const original=products.products.find(p=>p.product_id===product_id);
  const added=verifiedAdditional.find(p=>p.product_id===product_id);
  const product=original||added;
  if(!product)return fail('EXACT_SKU_NOT_PROVISIONED',{
    reason:'This product needs its own approved exact product, price and provider-verified checkout before any paid handoff.',
  });
  const link=original?manifest.links.find(l=>l.key===product.sku_key):added;
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

export function commerceCoverage({publicProducts,products,manifest,additional=null}={}){
  validateExactSkuRegistry(products,manifest);
  const verifiedAdditional=validateAdditionalExactSkuLinks(additional,{products,manifest});
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
    independently_linked_commercial_products:products.products.length+verifiedAdditional.length,
    exact_provider_checkout_links:manifest.links.length+verifiedAdditional.length,
    additional_independently_verified_offers:verifiedAdditional.length,
    other_offers_automatically_reusing_any_of_seven:0,
    source_note:'Discovery inventory and independent commercial SKUs are separate dimensions; some products overlap. Counts must not be added to claim total unique products.',
    discovery,
    independently_linked_products:[
      ...products.products.map(p=>({product_id:p.product_id,sku_key:p.sku_key,amount_cents:manifest.links.find(l=>l.key===p.sku_key).amount_cents})),
      ...verifiedAdditional.map(p=>({product_id:p.product_id,sku_key:p.sku_key,amount_cents:p.amount_cents})),
    ],
    state:'EXACT_SKU_ONBOARDING_REQUIRED_FOR_ADDITIONAL_OFFERS',
  };
}
