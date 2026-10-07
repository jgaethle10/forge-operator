const clean=(value)=>String(value??'').trim();

function requireHttps(value,label){
  let url;
  try{url=new URL(clean(value));}catch{throw new Error(label+'_invalid');}
  if(url.protocol!=='https:') throw new Error(label+'_requires_https');
  return url.toString();
}

export async function createStripeCheckoutSession({
  secret,
  offer,
  orderKey,
  successUrl,
  cancelUrl,
  idempotencyKey,
  fetchImpl=fetch,
}={}){
  const secretKey=clean(secret?.secret_key);
  if(!secretKey) throw new Error('stripe_secret_not_configured');
  if(!offer?.purchase_key||!Number.isInteger(offer?.amount_cents)||offer.amount_cents<=0){
    throw new Error('stripe_offer_invalid');
  }
  const order=clean(orderKey);
  if(!order) throw new Error('stripe_order_key_required');
  const idem=clean(idempotencyKey);
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(idem)) throw new Error('stripe_idempotency_key_invalid');
  if(typeof fetchImpl!=='function') throw new Error('stripe_fetch_invalid');

  const success=requireHttps(successUrl,'stripe_success_url');
  const cancel=requireHttps(cancelUrl,'stripe_cancel_url');
  const body=new URLSearchParams();
  body.set('mode','payment');
  body.set('success_url',success);
  body.set('cancel_url',cancel);
  body.set('client_reference_id',order);
  body.set('line_items[0][price_data][currency]',String(offer.currency||'usd').toLowerCase());
  body.set('line_items[0][price_data][unit_amount]',String(offer.amount_cents));
  body.set('line_items[0][price_data][product_data][name]',clean(offer.offer_name||offer.product_name||offer.purchase_key));
  body.set('line_items[0][quantity]','1');
  body.set('metadata[evercraft_order_key]',order);
  body.set('metadata[evercraft_purchase_key]',offer.purchase_key);
  body.set('metadata[evercraft_product_key]',offer.product_key);

  const response=await fetchImpl('https://api.stripe.com/v1/checkout/sessions',{
    method:'POST',
    headers:{
      authorization:'Bearer '+secretKey,
      'content-type':'application/x-www-form-urlencoded',
      'idempotency-key':idem,
      'user-agent':'Evercraft-Raven-Nexus-Stripe-Adapter/1.0',
    },
    body:body.toString(),
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok){
    const type=clean(payload?.error?.type)||'stripe_provider_error';
    throw new Error(type);
  }

  const checkoutUrl=requireHttps(payload?.url,'stripe_checkout_url');
  if(!clean(payload?.id)) throw new Error('stripe_checkout_session_id_missing');
  return {
    schema:'evercraft.raven.stripe-checkout-session.v1',
    adapter:'stripe',
    provider_role:'settlement_adapter',
    checkout_session_id:String(payload.id),
    checkout_url:checkoutUrl,
    payment_state:clean(payload?.payment_status)||'unpaid',
    provider_status:clean(payload?.status)||null,
    secret_values_exposed:false,
  };
}
