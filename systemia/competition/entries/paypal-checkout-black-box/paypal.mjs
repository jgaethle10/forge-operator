const DEFAULT_PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";

function clean(value,max=1000){ return String(value??"").trim().slice(0,max); }
function amountString(value){ return Number(value).toFixed(2); }

export function resolvePayPalConfig(env=process.env){
  return {
    clientId:clean(env.PAYPAL_CLIENT_ID||env.RAVEN_PAYPAL_CLIENT_ID,1000),
    clientSecret:clean(env.PAYPAL_CLIENT_SECRET||env.RAVEN_PAYPAL_CLIENT_SECRET,2000),
    baseUrl:clean(env.PAYPAL_API_BASE_URL||DEFAULT_PAYPAL_BASE_URL,1000).replace(/\/$/,""),
  };
}

export async function getPayPalAccessToken({
  fetchImpl=globalThis.fetch,
  clientId,
  clientSecret,
  baseUrl=DEFAULT_PAYPAL_BASE_URL,
  timeoutMs=15_000,
}={}){
  if(typeof fetchImpl!=="function") throw new Error("fetch_required");
  if(!clean(clientId)||!clean(clientSecret)) throw new Error("paypal_credentials_missing");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||15_000)));
  try{
    const response=await fetchImpl(String(baseUrl).replace(/\/$/,"")+"/v1/oauth2/token",{
      method:"POST",
      headers:{
        authorization:"Basic "+Buffer.from(String(clientId)+":"+String(clientSecret)).toString("base64"),
        "content-type":"application/x-www-form-urlencoded",
        accept:"application/json",
      },
      body:"grant_type=client_credentials",
      signal:controller.signal,
    });
    const raw=await response.text(); let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch{payload={};}
    if(!response.ok) throw new Error("paypal_oauth_http_"+response.status+":"+clean(payload?.error_description||raw,240));
    if(!payload.access_token) throw new Error("paypal_access_token_missing");
    return {accessToken:String(payload.access_token),expiresIn:Number(payload.expires_in||0)};
  }finally{clearTimeout(timer);}
}

async function paypalRequest(path,{method="GET",body=null,fetchImpl=globalThis.fetch,clientId,clientSecret,baseUrl=DEFAULT_PAYPAL_BASE_URL,requestId=""}={}){
  const token=await getPayPalAccessToken({fetchImpl,clientId,clientSecret,baseUrl});
  const headers={authorization:"Bearer "+token.accessToken,accept:"application/json"};
  if(body!=null) headers["content-type"]="application/json";
  if(requestId) headers["PayPal-Request-Id"]=requestId;
  const response=await fetchImpl(String(baseUrl).replace(/\/$/,"")+path,{
    method,headers,body:body==null?undefined:JSON.stringify(body),
  });
  const raw=await response.text(); let payload={};
  try{payload=raw?JSON.parse(raw):{};}catch{payload={};}
  if(!response.ok) throw new Error("paypal_http_"+response.status+":"+clean(payload?.message||payload?.name||raw,300));
  return payload;
}

export async function createPayPalOrder(input={},options={}){
  const config={...resolvePayPalConfig(),...options};
  return paypalRequest("/v2/checkout/orders",{
    ...config,
    method:"POST",
    requestId:"cbb-"+String(input.proposal_id||"").slice(-30),
    body:{
      intent:"CAPTURE",
      purchase_units:[{
        reference_id:String(input.proposal_id),
        custom_id:String(input.proposal_id),
        description:clean(input.item,127),
        amount:{
          currency_code:String(input.currency).toUpperCase(),
          value:amountString(input.amount),
        },
      }],
    },
  });
}

export async function getPayPalOrder(orderId,options={}){
  const config={...resolvePayPalConfig(),...options};
  return paypalRequest("/v2/checkout/orders/"+encodeURIComponent(String(orderId)),config);
}

export async function capturePayPalOrder(orderId,options={}){
  const config={...resolvePayPalConfig(),...options};
  return paypalRequest("/v2/checkout/orders/"+encodeURIComponent(String(orderId))+"/capture",{
    ...config,
    method:"POST",
    requestId:"cbb-capture-"+String(orderId).slice(-30),
    body:{},
  });
}

function moneyFromOrder(order={}){
  const unit=Array.isArray(order.purchase_units)?order.purchase_units[0]:null;
  const capture=unit?.payments?.captures?.[0]||null;
  const amount=capture?.amount||unit?.amount||null;
  return {
    reference_id:unit?.reference_id||null,
    custom_id:unit?.custom_id||null,
    value:amount?.value==null?null:Number(amount.value),
    currency:amount?.currency_code||null,
  };
}

export function reconcilePayPalOrder(order={},authorization={},options={}){
  const observed=moneyFromOrder(order);
  const errors=[];
  if(!order?.id) errors.push("paypal_order_id_missing");
  if(observed.reference_id&&observed.reference_id!==authorization.proposal_id) errors.push("proposal_reference_mismatch");
  if(observed.custom_id&&observed.custom_id!==authorization.proposal_id) errors.push("proposal_custom_id_mismatch");
  if(Number(observed.value)!==Number(authorization.amount)) errors.push("amount_drift");
  if(String(observed.currency||"").toUpperCase()!==String(authorization.currency||"").toUpperCase()) errors.push("currency_drift");
  if(options.capture&&String(order.status||"").toUpperCase()!=="COMPLETED") errors.push("capture_not_completed");
  return {
    ok:errors.length===0,
    errors,
    observed,
    authorized:{
      proposal_id:authorization.proposal_id,
      amount:Number(authorization.amount),
      currency:String(authorization.currency),
    },
  };
}
