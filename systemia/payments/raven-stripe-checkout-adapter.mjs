/**
 * Server-side Raven Nexus Stripe adapter.
 *
 * This is a private provider boundary, NOT a public Fabric MCP tool. It
 * requires a separately provisioned, owner-only credential file under Raven
 * Nexus. A ChatGPT-hosted Stripe OAuth connection or the Systemia account
 * identity reference alone cannot enable it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  STRIPE_FIXED_PRICE_BINDINGS,buildRavenStripeCheckoutPlan,
  inspectCreatedStripeCheckoutSession,
} from './raven-stripe-price-bridge.mjs';

const STRIPE_ORIGIN='https://api.stripe.com';
const TIMEOUT_MS=10000;
export const RAVEN_NEXUS_PRIVATE_ROOT=path.join(
  os.homedir(),'.local','state','evercraft','raven-nexus','provider-credentials'
);

export function loadRavenStripeSecret({file,readFile=fs.readFileSync}={}){
  const resolved=path.resolve(String(file||''));
  if(!file || !path.isAbsolute(file) ||
     !resolved.startsWith(RAVEN_NEXUS_PRIVATE_ROOT+path.sep)){
    throw Error('raven_stripe_secret_must_live_in_private_provider_directory');
  }
  const dir=fs.lstatSync(path.dirname(resolved));
  const st=fs.lstatSync(resolved);
  const uid=typeof process.getuid==='function'?process.getuid():null;
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||
     !st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0 ||
     (uid!==null && (dir.uid!==uid||st.uid!==uid))){
    throw Error('raven_stripe_secret_path_insecure');
  }
  const fd=fs.openSync(resolved,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
    const check=fs.fstatSync(fd);
    if(!check.isFile()||(check.mode&0o077)!==0||
       (uid!==null&&check.uid!==uid)||check.size>1024){
      throw Error('raven_stripe_secret_file_insecure');
    }
    const secret=String(readFile(fd,'utf8')||'').trim();
    if(!/^sk_live_[A-Za-z0-9]{16,200}$/.test(secret)){
      throw Error('raven_stripe_live_secret_invalid_or_missing');
    }
    return secret;
  }finally{fs.closeSync(fd);}
}
async function stripeJson({secret,path:apiPath,method='GET',body='',idempotencyKey='',fetchImpl}){
  if(!['GET','POST'].includes(method)||!/^\/v1\/(?:account|prices\/price_[A-Za-z0-9]+|checkout\/sessions)$/.test(apiPath)){
    throw Error('raven_stripe_api_operation_not_allowlisted');
  }
  const headers={authorization:'Bearer '+secret,accept:'application/json'};
  if(method==='POST'){
    if(apiPath!=='/v1/checkout/sessions'||!/^evercraft-checkout-[a-f0-9]{44}$/.test(idempotencyKey)){
      throw Error('raven_stripe_checkout_idempotency_required');
    }
    headers['content-type']='application/x-www-form-urlencoded';
    headers['idempotency-key']=idempotencyKey;
  }
  let res;
  try{
    res=await fetchImpl(STRIPE_ORIGIN+apiPath,{
      method,headers,
      ...(method==='POST'?{body}:{}),
      redirect:'error',signal:AbortSignal.timeout(TIMEOUT_MS),
    });
  }catch{
    throw Error('raven_stripe_provider_request_unavailable');
  }
  if(!res.ok)throw Error('raven_stripe_provider_http_'+res.status);
  if(!String(res.headers?.get('content-type')||'').toLowerCase().includes('application/json')){
    throw Error('raven_stripe_provider_non_json');
  }
  try{
    const json=await res.json();
    if(!json||typeof json!=='object'||Array.isArray(json)){
      throw Error('invalid_json');
    }
    return json;
  }catch{throw Error('raven_stripe_provider_json_invalid');}
}

/**
 * Intended invocation: an authenticated internal Evercraft Payments worker
 * following canonical order persistence and buyer confirmation. It is not
 * reachable from public user input or MCP, and NEVER updates payment state.
 */
export async function createRavenStripeCheckoutSession({
  order,account,secretFile,fetchImpl=fetch,secretReader=loadRavenStripeSecret,
}={}){
  const binding=STRIPE_FIXED_PRICE_BINDINGS[order?.slug];
  if(!binding)throw Error('raven_stripe_offer_not_allowlisted');
  if(account?.stripe_context===undefined)throw Error('raven_stripe_account_reference_required');
  // Cheap order checks happen before any network/credential access.
  if(order.offer_key!==binding.offer_key || order.amount_cents!==binding.amount_cents ||
     order.order_truth!=='evercraft_payments' ||
     order.confirmation_state!=='buyer_confirmed' ||
     order.order_persisted!==true || order.payment_state!=='unpaid' ||
     order.synthetic!==false){
    throw Error('raven_stripe_canonical_order_ineligible');
  }
  // Test clients may inject a mock reader; production entrypoints MUST omit
  // this parameter so strict Raven file custody checks cannot be bypassed.
  const secret=secretReader({file:secretFile});
  const identity=await stripeJson({secret,path:'/v1/account',fetchImpl});
  if(identity.object!=='account'||identity.id!==account.stripe_context ||
     identity.charges_enabled!==true){
    throw Error('raven_stripe_verified_account_not_ready');
  }
  const livePrice=await stripeJson({secret,path:'/v1/prices/'+binding.stripe_price,fetchImpl});
  const plan=buildRavenStripeCheckoutPlan({
    order,account,providerPrice:livePrice,
    authenticatedProvider:{
      source:'raven_nexus_authenticated_stripe_api',
      account_id:identity.id,livemode:true,
      authorization_valid:true,price_retrieved_via_api:true,
    },
  });
  const session=await stripeJson({
    secret,path:'/v1/checkout/sessions',method:'POST',
    body:plan.request.body,idempotencyKey:plan.request.idempotency_key,
    fetchImpl,
  });
  const verified=inspectCreatedStripeCheckoutSession(plan,session);
  if(!verified.ok)throw Error('raven_stripe_new_session_unverified');
  // No id, key, email or order data is returned from a provider exception.
  return {
    schema:'evercraft.payments.raven-stripe-checkout-result.v1',
    state:verified.state,
    order_key:plan.order_key,offer_key:plan.offer_key,
    checkout_url:verified.checkout_url,provider_session_id:verified.session_id,
    checkout_ready:true,payment_verified:false,
    receipt_created:false,entitlement_granted:false,fulfillment_released:false,
    authoritative_paid_gate:'provider_session_retrieve_plus_canonical_order_receipt',
  };
}
