#!/usr/bin/env node
// External Saban checkout contract canary. Read-only public GETs; no orders or payments.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const OFFERS=[['website-audit','$49'],['ibmi-rescue','$250'],['legacy-rescue','$299'],['findmypart','$19'],['site-survive','$250']];
async function request(url,fetchImpl){
  const r=await fetchImpl(url,{method:'GET',redirect:'follow',headers:{accept:'text/html,application/json','user-agent':'Evercraft-Saban-Checkout-Canary/1.0'},signal:AbortSignal.timeout(12000)});
  return {status:r.status,body:(await r.text()).slice(0,200000)};
}
export async function runCanary({origin=ORIGIN,fetchImpl=fetch}={}){
  if(origin!==ORIGIN)throw new Error('unapproved_canary_origin');
  const receipt={schema:'evercraft.saban.checkout-release.v1',origin,observed_at:new Date().toISOString(),checkout_posts:0,payments:0,checks:[],failures:[]};
  try{
    const res=await request(origin+'/health',fetchImpl);
    const health=res.status===200?JSON.parse(res.body):{};
    const owned={
      authority:health.payment_authority==='Evercraft Payments',
      provider_boundary:health.payment_router==='Raven Nexus',
      purchase_intent_configured:health.checkout_purchase_intent_configured===true,
      payment_ops_configured:health.checkout_direct_offer_ops_configured===true,
      native_checkout_enabled:health.human_offer_checkout_enabled===true,
      operational_state:String(health.checkout_operational_state||'unknown').slice(0,100),
    };
    receipt.owned_payment_transport=owned;
    receipt.checks.push({route:'/health',http:res.status,release_ref:health.source_release_ref||null,release_bound:health.source_release_ref_bound===true,deployment_bound:health.deployment_receipt_bound===true,instance_id:health.instance_id||null,owned_payments:owned});
    if(!owned.authority||!owned.provider_boundary)receipt.failures.push('evercraft_payments_or_raven_boundary_missing');
    if(!owned.purchase_intent_configured)receipt.failures.push('evercraft_purchase_intent_endpoint_unconfigured');
    if(!owned.payment_ops_configured)receipt.failures.push('evercraft_payment_ops_endpoint_unconfigured');
    if(!owned.native_checkout_enabled)receipt.failures.push('owned_buyer_checkout_held');
    if(res.status!==200)receipt.failures.push('health_http_'+res.status);
    if(health.source_release_ref_bound!==true)receipt.failures.push('source_release_unbound');
    if(health.deployment_receipt_bound!==true)receipt.failures.push('deployment_receipt_unbound');
  }catch(e){receipt.failures.push('health_unreachable');receipt.checks.push({route:'/health',error:String(e?.message||e).slice(0,180)});}
  for(const [slug,price] of OFFERS){
    const route='/offers/'+slug;
    try{
      const res=await request(origin+route,fetchImpl);
      const email=/<input\b[^>]*\bname=["']customer_ref["'][^>]*\btype=["']email["']/i.test(res.body);
      const cta=res.body.includes('Continue to checkout');
      const form=res.body.includes('/api/offers/'+slug+'/checkout');
      const correctPrice=res.body.includes(price);
      const assisted=res.body.includes('Online checkout is temporarily unavailable.');
      const stage=res.status!==200?'unreachable':
        assisted&&!email&&!cta&&!form?'assisted_purchase_only':
        email&&cta&&form&&correctPrice?'checkout_form_present_unpaid':
        'mismatched_or_broken';
      receipt.checks.push({route,http:res.status,email,cta,form,correct_price:correctPrice,price,
        assisted_checkout_held:assisted,buyer_stage:stage,
        checkout_created:false,payment_verified:false,fulfillment_verified:false});
      if(res.status!==200)receipt.failures.push(slug+'_http_'+res.status);
      if(res.status===200&&stage==='assisted_purchase_only'){
        receipt.failures.push(slug+'_owned_checkout_held');
        if(!correctPrice)receipt.failures.push(slug+'_price_missing');
      }
      if(res.status===200&&stage==='mismatched_or_broken')
        receipt.failures.push(slug+'_contract_incomplete');
    }catch(e){receipt.checks.push({route,error:String(e?.message||e).slice(0,180)});receipt.failures.push(slug+'_unreachable');}
  }
  receipt.passed=receipt.failures.length===0;
  receipt.summary={passed:receipt.passed,offers:OFFERS.length,failures:receipt.failures.length,
    native_payments_may_be_promoted:false,
    unpaid_form_count:receipt.checks.filter(x=>x.buyer_stage==='checkout_form_present_unpaid').length,
    held_offer_count:receipt.checks.filter(x=>x.buyer_stage==='assisted_purchase_only').length,
    current_gate:'independent_end_to_end_payment_and_fulfillment_acceptance_required'};
  receipt.checkout_posts=0;
  receipt.payments=0;
  receipt.receipt_hash='sha256:'+crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  return receipt;
}
export function saveReceipt(receipt,file='artifacts/saban/checkout-health/latest.json'){
  const output=path.resolve(file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');return output;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const receipt=await runCanary();saveReceipt(receipt);
  console.log('SABAN_CHECKOUT_RELEASE_CANARY '+JSON.stringify({passed:receipt.passed,
    failures:receipt.failures,owned_payment_transport:receipt.owned_payment_transport||null,
    held_offer_count:receipt.summary.held_offer_count,observed_at:receipt.observed_at}));
  if(!receipt.passed)process.exitCode=1;
}
