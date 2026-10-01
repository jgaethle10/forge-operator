function clean(value){ return String(value??'').trim(); }
function required(value,field){
  const text=clean(value);
  if(!text) throw new Error(field+'_required');
  return text;
}
function expectedTierConfig(tiers,tier){
  const row=tiers?.[tier];
  if(!row) throw new Error('stripe_tier_unknown');
  return row;
}
function firstLineItemPrice(session){
  return session?.line_items?.data?.[0]?.price||{};
}
function assertMetadata(session,expected={}){
  for(const [key,value] of Object.entries(expected||{})){
    if(String(session?.metadata?.[key]??'')!==String(value??'')){
      throw new Error('stripe_checkout_metadata_mismatch:'+key);
    }
  }
}

export function createStripeCommerceAdapter({client,tiers={}}={}){
  if(!client||typeof client.retrieveCheckoutSession!=='function'){
    throw new Error('stripe_commerce_client_required');
  }
  return {
    provider:'stripe',
    creates_payment_obligations:false,
    async fetchPayment({paymentRef,context={}}={}){
      const session=await client.retrieveCheckoutSession(required(paymentRef,'stripe_session_id'),{
        expandLineItems:true
      });
      if(clean(session.id)!==paymentRef) throw new Error('stripe_session_id_mismatch');

      const tier=required(session?.metadata?.tier,'stripe_session_tier');
      if(context?.expected_tier && tier!==String(context.expected_tier)){
        throw new Error('stripe_checkout_tier_mismatch');
      }
      if(context?.expected_metadata) assertMetadata(session,context.expected_metadata);

      const config=expectedTierConfig(tiers,tier);
      const amount=Number(session.amount_total);
      const currency=clean(session.currency).toUpperCase();
      if(!Number.isInteger(amount)||amount<0) throw new Error('stripe_checkout_amount_invalid');
      if(currency!=='USD') throw new Error('stripe_checkout_currency_invalid');
      if(amount!==Number(config.amount_minor)) throw new Error('stripe_checkout_price_mismatch');

      const price=firstLineItemPrice(session);
      if(config.price_id){
        if(clean(price.id)!==String(config.price_id)) throw new Error('stripe_checkout_price_id_mismatch');
      }else{
        if(Number(price.unit_amount)!==Number(config.amount_minor)){
          throw new Error('stripe_checkout_inline_price_mismatch');
        }
      }

      const successful=
        clean(session.status).toLowerCase()==='complete' &&
        clean(session.payment_status).toLowerCase()==='paid';

      return {
        status:successful?'succeeded':'pending',
        amount_minor:amount,
        currency,
        provider_event_ref:clean(session.payment_intent||session.id)||paymentRef,
        provider_session_status:clean(session.status).toLowerCase(),
        provider_payment_status:clean(session.payment_status).toLowerCase(),
        customer_email:clean(session.customer_details?.email||session.customer_email,320),
        tier
      };
    }
  };
}
