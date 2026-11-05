#!/usr/bin/env node
// NextGen Evercraft Payments readiness check. READ ONLY: no checkout POST, secrets, charges, or orders.
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
const catalogPath=resolve(process.cwd(),'public/mesh/checkout-ready/verified-links.json');
const readinessPath=resolve(process.cwd(),'public/.well-known/evercraft-commercial-readiness.json');
const result={schema:'evercraft.nextgen.payments-readiness.v1',observed_at:new Date().toISOString(),node:'nextgen',operations:'read_only',checks:[],payments_attempted:0,orders_created:0};
function check(name,detail){result.checks.push({name,...detail});}
function envSet(key){return Boolean((process.env[key]||'').trim());}
for(const key of ['EVERCRAFT_PURCHASE_INTENT_OWNED_URL','EVERCRAFT_PAYMENT_OPS_OWNED_URL'])check('env:'+key,{configured:envSet(key)}); // Never emit values.
for(const [name,path] of [['catalog',catalogPath],['readiness',readinessPath]]){
 if(!existsSync(path)){check(name,{ok:false,reason:'missing_file',path});continue;}
 try{
  const data=JSON.parse(readFileSync(path,'utf8'));
  if(name==='catalog'){
   const links=Array.isArray(data.links)?data.links:[];
   const good=links.every(x=>x.key&&Number.isInteger(x.amount_cents)&&x.amount_cents>0&&/^https:\/\/buy\.stripe\.com\//.test(x.url));
   check(name,{ok:good,verified_snapshot_date:data.checked_on||null,hosted_offer_count:links.length,manual_reconciliation:data.canonical_order_reconciliation==='manual_not_automated'});
  }else check(name,{ok:true,as_of:data.as_of||null,native_checkout_held:data.commercial_checkout_ready===false,claimed_revenue_verified:data.may_claim_verified_revenue===true});
 }catch(e){check(name,{ok:false,reason:'invalid_json',error:String(e.message).slice(0,100)});}
}
async function get(url){
 try{
  const r=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'user-agent':'Evercraft-NextGen-Payments-Readiness/1.0'}});
  return {status:r.status,reachable:r.status>=200&&r.status<400};
 }catch(e){return {reachable:false,error:e.name||'request_failed'};}
}
for(const path of ['/health','/offers/signal-brief']){
 check('owned:'+path,await get('https://fabric.systemiacommandcenters.com'+path));
}
result.native_checkout_ready=false; // A read-only health check cannot prove acceptance.
result.hosted_links_current_provider_active='not_reverified'; // Historical catalog is not live account truth.
result.next_action='Verify configured owned transport privately and run authorized sandbox checkout, provider receipt, order reconciliation and fulfillment tests before promoting native checkout.';
console.log(JSON.stringify(result,null,2));
