#!/usr/bin/env node
/**
 * Evercraft Payments / NextGen read-only commercial truth probe.
 * This runs on NextGen, not inside the public Fabric service. Local environment
 * flags therefore report ONLY local shell configuration and MUST NOT be used to
 * infer public Fabric configuration. Nothing here creates orders or charges.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const LOCAL_FILES=Object.freeze({
  catalog:'public/mesh/checkout-ready/verified-links.json',
  release:'public/.well-known/evercraft-commercial-readiness.json',
});
const LOCAL_ENV_KEYS=Object.freeze([
  'EVERCRAFT_PURCHASE_INTENT_OWNED_URL','EVERCRAFT_PAYMENT_OPS_OWNED_URL',
]);
const ALLOWED_STATE=new Set(['held_owned_payment_endpoint_unconfigured','owned_transport_requires_independent_checkout_canary']);

export function interpretFabricHealth(health){
  if(!health||typeof health!=='object'||Array.isArray(health))return {observed:false};
  const configuredIntent=health.checkout_purchase_intent_configured===true;
  const configuredOps=health.checkout_direct_offer_ops_configured===true;
  const operational=typeof health.checkout_operational_state==='string'&&ALLOWED_STATE.has(health.checkout_operational_state)
    ?health.checkout_operational_state:'unrecognized_or_absent';
  return {
    observed:true,
    runtime:'public_owned_fabric',
    purchase_intent_configured:configuredIntent,
    payment_ops_configured:configuredOps,
    checkout_operational_state:operational,
    public_human_checkout_enabled:health.human_offer_checkout_enabled===true,
    paid_receipt_verified:health.checkout_provider_paid_verified===true,
    fulfillment_verified:health.checkout_fulfillment_verified===true,
    release_ref_bound:health.source_release_ref_bound===true,
    deployment_receipt_bound:health.deployment_receipt_bound===true,
    source_claim_only:true,
  };
}

export function interpretCatalog(catalog){
  if(!catalog||!Array.isArray(catalog.links))return {valid:false,count:0};
  const keys=new Set();
  const valid=catalog.links.length>0&&catalog.links.every(o=>{
    if(!o||typeof o.key!=='string'||keys.has(o.key))return false;
    keys.add(o.key);
    return Number.isSafeInteger(o.amount_cents)&&o.amount_cents>0&&
      typeof o.url==='string'&&/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(o.url)&&
      typeof o.stripe_price_id==='string'&&o.stripe_price_id.startsWith('price_');
  });
  return {valid,count:catalog.links.length,snapshot_date:catalog.checked_on||null,
    current_provider_verification:'not_attempted',
    reconciliation:catalog.canonical_order_reconciliation||'unknown',
    note:'The catalog records historical hosted checkout verification, NOT current provider activity or actual payments.'};
}

async function safeGet(fetchImpl,url,{json=false}={}){
  try{
    const r=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(9000),
      headers:{accept:json?'application/json':'text/html','user-agent':'Evercraft-NextGen-Payments-ReadOnly/2.0'}});
    if(json){
      if(r.status!==200)return {status:r.status,reachable:false};
      const t=(await r.text()).slice(0,150000);
      let parsed;try{parsed=JSON.parse(t);}catch{return {status:r.status,reachable:true,body_valid:false};}
      return {status:r.status,reachable:true,body_valid:true,health:interpretFabricHealth(parsed)};
    }
    return {status:r.status,reachable:r.status===200};
  }catch(e){return {reachable:false,error:e?.name==='TimeoutError'?'timeout':'request_failed'};}
}

export async function observeReadiness({cwd=process.cwd(),env=process.env,fetchImpl=fetch}={}){
  const receipt={schema:'evercraft.nextgen.payments-readiness.v2',observed_at:new Date().toISOString(),
    node:'nextgen',scope:'local_shell_and_external_public_GET_only',
    payments_attempted:0,orders_created:0,checkout_posts:0,checks:[]};
  receipt.checks.push({check:'nextgen_shell_env',scope:'shell_process_only',
    flags:Object.fromEntries(LOCAL_ENV_KEYS.map(k=>[k,Boolean(String(env[k]||'').trim())])),
    warning:'These flags do not establish public Fabric service configuration.'});
  for(const [name,relative] of Object.entries(LOCAL_FILES)){
    try{
      const data=JSON.parse(readFileSync(resolve(cwd,relative),'utf8'));
      if(name==='catalog')receipt.checks.push({check:'local_hosted_links_snapshot',...interpretCatalog(data)});
      else receipt.checks.push({check:'local_release_snapshot',as_of:data.as_of||null,
        native_checkout_held_in_source:data.commercial_checkout_ready===false,
        note:'This reflects the local Git checkout only. It may be behind the public deployment.'});
    }catch(e){receipt.checks.push({check:'local_'+name,ok:false,reason:'missing_or_invalid_json'});}
  }
  const health=await safeGet(fetchImpl,ORIGIN+'/health',{json:true});
  receipt.checks.push({check:'public_fabric_health',...health});
  receipt.checks.push({check:'public_signal_offer',...await safeGet(fetchImpl,ORIGIN+'/offers/signal-brief')});
  receipt.native_checkout_paid_acceptance_verified=false;
  receipt.hosted_link_live_status='not_verified_this_run';
  const h=health?.health;
  receipt.operational_gap=h?.observed&&(!h.purchase_intent_configured||!h.payment_ops_configured)
    ?'PUBLIC_FABRIC_OWNED_TRANSPORT_NOT_FULLY_CONFIGURED'
    :h?.observed?'OWNED_TRANSPORT_CONFIG_CANNOT_PROVE_PAID_ACCEPTANCE'
    :'PUBLIC_FABRIC_HEALTH_UNKNOWN';
  receipt.next_engineering_step='Identify an actual owner-controlled payment operations service and its private service credentials. Do not insert placeholder URLs or claim payment from HTTP 200.';
  return receipt;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  console.log(JSON.stringify(await observeReadiness(),null,2));
}
