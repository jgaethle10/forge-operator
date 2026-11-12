/**
 * Raven Nexus Stripe reader, read-only implementation candidate.
 * Only GETs Stripe API. Never logs tokens, customer email, billing details,
 * full API responses, or payment method secrets.
 *
 * The private Raven runtime must custody the key. This source module alone
 * does not prove that a Raven Nexus service has been deployed or connected.
 */
const BASE='https://api.stripe.com';
const cleanId=(value,prefix)=>typeof value==='string'&&value.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(value);
export function createRavenStripeHostedReader({secretKey,fetchImpl=fetch}={}){
  if(typeof secretKey!=='string'||!/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(secretKey))
    throw Error('owner_authorized_live_stripe_read_key_required');
  async function read(pathname,query={}){
    const url=new URL(pathname,BASE);
    if(url.origin!==BASE||!url.pathname.startsWith('/v1/'))throw Error('stripe_get_path_unapproved');
    for(const [key,val] of Object.entries(query))if(val!==null&&val!==undefined)
      url.searchParams.set(key,String(val));
    let response;
    try{
      response=await fetchImpl(url.toString(),{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{
          accept:'application/json',
          authorization:'Bearer '+secretKey,
          'user-agent':'Evercraft-Raven-Hosted-Receipt-Reader/1.0',
        },
      });
    }catch{throw Error('stripe_read_transport_unavailable');}
    if(!response.ok)throw Error('stripe_read_http_'+response.status);
    const data=await response.json().catch(()=>null);
    if(!data||typeof data!=='object')throw Error('stripe_read_invalid_json');
    return data;
  }
  return Object.freeze({
    getAccount:()=>read('/v1/account'),
    listCheckoutSessions:({paymentLinkId,startingAfter=null,limit=100}={})=>{
      if(!cleanId(paymentLinkId,'plink_')||!Number.isInteger(limit)||limit<1||limit>100)
        throw Error('invalid_checkout_session_query');
      if(startingAfter!==null&&!cleanId(startingAfter,'cs_'))
        throw Error('invalid_session_cursor');
      return read('/v1/checkout/sessions',{payment_link:paymentLinkId,limit,
        starting_after:startingAfter});
    },
    retrieveCheckoutSession:(sessionId)=>{
      if(!cleanId(sessionId,'cs_'))throw Error('invalid_session_id');
      return read('/v1/checkout/sessions/'+sessionId);
    },
    listSessionLineItems:(sessionId)=>{
      if(!cleanId(sessionId,'cs_'))throw Error('invalid_session_id');
      return read('/v1/checkout/sessions/'+sessionId+'/line_items',{limit:10});
    },
    retrievePaymentIntent:(intentId)=>{
      if(!cleanId(intentId,'pi_'))throw Error('invalid_payment_intent_id');
      return read('/v1/payment_intents/'+intentId);
    },
    retrieveCharge:(chargeId)=>{
      if(!cleanId(chargeId,'ch_'))throw Error('invalid_charge_id');
      return read('/v1/charges/'+chargeId);
    }
  });
}
