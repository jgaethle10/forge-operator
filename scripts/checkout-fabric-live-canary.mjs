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
    const receiptSource=String(health.deployment_receipt_source||'');
    const receiptRef=String(health.deployment_receipt_ref||'');
    receipt.checks.push({route:'/health',http:res.status,release_ref:health.source_release_ref||null,release_bound:health.source_release_ref_bound===true,deployment_bound:health.deployment_receipt_bound===true,deployment_source:receiptSource||null,deployment_ref_format_valid:/^sha256:[a-f0-9]{64}$/i.test(receiptRef),instance_id:health.instance_id||null});
    if(res.status!==200)receipt.failures.push('health_http_'+res.status);
    if(health.source_release_ref_bound!==true)receipt.failures.push('source_release_unbound');
    if(health.deployment_receipt_bound!==true)receipt.failures.push('deployment_receipt_unbound');
    if(health.deployment_receipt_bound===true){
      if(!['owned_updater_verified','admitted_compute'].includes(receiptSource))receipt.failures.push('deployment_provenance_unverified');
      if(!/^sha256:[a-f0-9]{64}$/i.test(receiptRef))receipt.failures.push('deployment_receipt_ref_invalid');
    }
  }catch(e){receipt.failures.push('health_unreachable');receipt.checks.push({route:'/health',error:String(e?.message||e).slice(0,180)});}
  for(const [slug,price] of OFFERS){
    const route='/offers/'+slug;
    try{
      const res=await request(origin+route,fetchImpl);
      const email=/<input\b[^>]*\bname=["']customer_ref["'][^>]*\btype=["']email["']/i.test(res.body);
      const cta=res.body.includes('Continue to checkout');
      const form=res.body.includes('/api/offers/'+slug+'/checkout');
      const correctPrice=res.body.includes(price);
      receipt.checks.push({route,http:res.status,email,cta,form,correct_price:correctPrice,price});
      if(res.status!==200)receipt.failures.push(slug+'_http_'+res.status);
      if(res.status===200&&(!email||!cta||!form||!correctPrice))receipt.failures.push(slug+'_contract_incomplete');
    }catch(e){receipt.checks.push({route,error:String(e?.message||e).slice(0,180)});receipt.failures.push(slug+'_unreachable');}
  }
  receipt.passed=receipt.failures.length===0;
  receipt.summary={passed:receipt.passed,offers:OFFERS.length,failures:receipt.failures.length};
  receipt.receipt_hash='sha256:'+crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  return receipt;
}
export function saveReceipt(receipt,file='artifacts/saban/checkout-health/latest.json'){
  const output=path.resolve(file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');return output;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const receipt=await runCanary();saveReceipt(receipt);
  console.log('SABAN_CHECKOUT_RELEASE_CANARY '+JSON.stringify({passed:receipt.passed,failures:receipt.failures,observed_at:receipt.observed_at}));
  if(!receipt.passed)process.exitCode=1;
}
