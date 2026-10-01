function clean(value){ return String(value??'').trim(); }
function required(value,field){
  const text=clean(value);
  if(!text) throw new Error(field+'_required');
  return text;
}
function httpsOrigin(value,field){
  const url=new URL(required(value,field));
  if(url.protocol!=='https:'||url.username||url.password) throw new Error(field+'_invalid');
  if(url.hostname==='base44.app'||url.hostname.endsWith('.base44.app')) throw new Error(field+'_base44_forbidden');
  return url.origin;
}
function sessionId(value){
  const id=required(value,'stripe_session_id');
  if(!/^cs_[A-Za-z0-9_:-]{3,240}$/.test(id)) throw new Error('stripe_session_id_invalid');
  return id;
}
function encodeParams(input={}){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(input||{})){
    if(value===undefined||value===null||value==='') continue;
    if(Array.isArray(value)){
      for(const item of value) params.append(key,String(item));
    }else{
      params.append(key,String(value));
    }
  }
  return params;
}
async function json(response,label){
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(label+'_http_'+response.status);
    error.status=response.status;
    error.provider_error=body?.error?.message||null;
    throw error;
  }
  if(!body||typeof body!=='object') throw new Error(label+'_response_invalid');
  return body;
}

export function createStripeProviderClient({
  secretProvider,
  fetchImpl=globalThis.fetch,
  apiOrigin='https://api.stripe.com'
}={}){
  if(typeof secretProvider!=='function') throw new Error('stripe_secret_provider_required');
  if(typeof fetchImpl!=='function') throw new Error('stripe_fetch_required');
  const origin=httpsOrigin(apiOrigin,'stripe_api_origin');

  async function authHeader(){
    return 'Bearer '+required(await secretProvider(),'stripe_secret_key');
  }

  return {
    provider:'stripe',
    creates_payment_obligations:false,

    async createCheckoutSession(params={}){
      const response=await fetchImpl(origin+'/v1/checkout/sessions',{
        method:'POST',
        headers:{
          authorization:await authHeader(),
          'content-type':'application/x-www-form-urlencoded',
          accept:'application/json'
        },
        body:encodeParams(params)
      });
      return await json(response,'stripe_checkout_create');
    },

    async retrieveCheckoutSession(id,{expandLineItems=true}={}){
      const safeId=sessionId(id);
      const url=new URL('/v1/checkout/sessions/'+encodeURIComponent(safeId),origin);
      if(expandLineItems) url.searchParams.append('expand[]','line_items.data.price');
      const response=await fetchImpl(url,{
        headers:{
          authorization:await authHeader(),
          accept:'application/json'
        }
      });
      return await json(response,'stripe_checkout_read');
    }
  };
}
