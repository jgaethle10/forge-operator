#!/usr/bin/env node
/**
 * Evercraft Payments / exact-SKU hosted links: no-charge current HTTP canary.
 * Only GETs historical Systemia Stripe Payment Links from pinned local catalog.
 * Reachability is not account activity, verified price, a paid order or fulfillment.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX_REDIRECTS=3;
const allowed=(raw)=>{
  try {
    const u=new URL(raw);
    return u.protocol==='https:' && !u.username && !u.password &&
      (u.hostname==='buy.stripe.com'||u.hostname==='checkout.stripe.com');
  }catch{return false;}
};
export async function inspectCheckoutUrl(raw,{fetchImpl=fetch}={}){
  if(!allowed(raw))return {outcome:'UNAPPROVED_DESTINATION',http_status:null};
  let current=raw,redirects=0,code=null;
  try{
    while(true){
      const r=await fetchImpl(current,{
        method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
        headers:{accept:'text/html','user-agent':'Evercraft-Hosted-Checkout-ReadOnly-Canary/1.0'}
      });
      code=r.status;
      if(code>=300&&code<=399){
        if(redirects>=MAX_REDIRECTS)return {outcome:'TOO_MANY_REDIRECTS',http_status:code};
        const loc=r.headers.get('location');
        if(!loc)return {outcome:'REDIRECT_MISSING_DESTINATION',http_status:code};
        const next=new URL(loc,current).toString();
        if(!allowed(next))return {outcome:'UNAPPROVED_REDIRECT',http_status:code};
        redirects++;current=next;continue;
      }
      // Never return HTML or dynamic checkout tokens from these pages.
      return {outcome:code===200?'HTTP_REACHABLE_FORM_NOT_VERIFIED':'NOT_HTTP_200',
        http_status:code,redirect_count:redirects,final_host:new URL(current).hostname};
    }
  }catch(e){
    return {outcome:'REQUEST_FAILED',http_status:code,
      error_category:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK_OR_PROVIDER'};
  }
}

export async function observeHostedLinks({cwd=process.cwd(),fetchImpl=fetch}={}){
  const file=resolve(cwd,'public/mesh/checkout-ready/verified-links.json');
  const catalog=JSON.parse(readFileSync(file,'utf8'));
  if(!Array.isArray(catalog.links)||catalog.links.length===0)throw Error('empty_checkout_catalog');
  const keys=new Set();
  const receipt={schema:'evercraft.payments.exact-hosted-link-get-canary.v1',
    observed_at:new Date().toISOString(),source_snapshot:catalog.checked_on||null,
    operations:'GET_only',orders_created:0,payments_attempted:0,form_submissions:0,
    provider_account_activity_verified:false,product_price_identity_live_verified:false,results:[]};
  for(const o of catalog.links){
    if(!o||!o.key||keys.has(o.key)||!Number.isSafeInteger(o.amount_cents)||o.amount_cents<=0||!allowed(o.url))
      throw Error('invalid_exact_hosted_catalog');
    keys.add(o.key);
    const check=await inspectCheckoutUrl(o.url,{fetchImpl});
    receipt.results.push({key:o.key,recorded_price_usd:(o.amount_cents/100).toFixed(2),...check});
  }
  receipt.total=receipt.results.length;
  receipt.http_reachable=receipt.results.filter(x=>x.outcome==='HTTP_REACHABLE_FORM_NOT_VERIFIED').length;
  receipt.next_step='Review the current actual Stripe account product/price in provider dashboard and confirm agreed delivery scope before promoting links.';
  return receipt;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  console.log(JSON.stringify(await observeHostedLinks(),null,2));
}
