function clean(value){ return String(value??'').trim(); }
function required(value,field){
  const text=clean(value);
  if(!text) throw new Error(field+'_required');
  return text;
}
function scalar(value){
  if(value===null||value===undefined) return '';
  if(typeof value==='object') return JSON.stringify(value);
  return String(value);
}
function assertMetadata(actual={},expected={}){
  if(!expected||typeof expected!=='object'||Array.isArray(expected)){
    throw new Error('polar_expected_metadata_object_required');
  }
  for(const [key,value] of Object.entries(expected)){
    if(scalar(actual?.[key])!==scalar(value)){
      throw new Error('polar_checkout_metadata_mismatch:'+key);
    }
  }
}
function normalizeCurrency(value){
  const currency=clean(value).toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency)) throw new Error('polar_checkout_currency_invalid');
  return currency;
}

export function createPolarCommerceAdapter({connectorGateway}={}){
  if(!connectorGateway||typeof connectorGateway.invoke!=='function'){
    throw new Error('polar_commerce_connector_gateway_required');
  }

  return {
    provider:'polar',
    creates_payment_obligations:false,

    async fetchPayment({paymentRef,appKey,context={}}={}){
      const checkoutId=required(paymentRef,'polar_checkout_id');
      const checkout=await connectorGateway.invoke(
        required(appKey,'app_key'),
        'polar',
        'checkouts.get',
        {pathParams:{id:checkoutId}},
        {
          purpose:'commerce_verification',
          expected_metadata:context?.expected_metadata||null
        }
      );

      if(!checkout||typeof checkout!=='object') throw new Error('polar_checkout_response_invalid');
      if(clean(checkout.id)!==checkoutId) throw new Error('polar_checkout_id_mismatch');

      const expectedMetadata=context?.expected_metadata;
      if(expectedMetadata) assertMetadata(checkout.metadata||{},expectedMetadata);

      if(context?.expected_customer_email){
        const actual=clean(
          checkout.customer_email||
          checkout.customer?.email||
          checkout.customer_billing_address?.email
        ).toLowerCase();
        const expected=clean(context.expected_customer_email).toLowerCase();
        if(!actual||actual!==expected) throw new Error('polar_checkout_customer_mismatch');
      }

      const amount=Number(checkout.total_amount??checkout.amount);
      if(!Number.isInteger(amount)||amount<0) throw new Error('polar_checkout_amount_invalid');

      return {
        status:clean(checkout.status).toLowerCase(),
        amount_minor:amount,
        currency:normalizeCurrency(checkout.currency),
        provider_event_ref:
          clean(checkout.order_id||checkout.order?.id||checkout.id)||checkoutId,
        provider_metadata_verified:Boolean(expectedMetadata),
        provider_customer_verified:Boolean(context?.expected_customer_email),
        provider_checkout_ref:checkoutId
      };
    }
  };
}
