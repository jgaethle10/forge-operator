#!/usr/bin/env node
// External read-only proof that live Fabric discovery reflects source commercial truth.
// Never creates customers, orders, payment sessions or buyer traffic.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const origin='https://fabric.systemiacommandcenters.com';
const pathLLMS='/llms.txt';
const pathReady='/.well-known/evercraft-commercial-readiness.json';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function assessProjection({llms,readiness,sourceLlms,sourceReadiness}){
  const findings=[];
  if(typeof llms!=='string'||!llms.includes('native Evercraft Payments / Raven Nexus checkout rail remains HELD'))findings.push('LLMS_NATIVE_RAIL_TRUTH_MISSING');
  if(typeof llms!=='string'||!llms.includes('seven existing Systemia Stripe-hosted Payment Links'))findings.push('LLMS_HOSTED_LINK_TRUTH_MISSING');
  if(typeof llms==='string'&&llms.includes('**Payment checkout is HELD.**'))findings.push('LLMS_OUTDATED_BLANKET_HOLD');
  if(typeof llms!=='string'||!llms.includes('Do not substitute any of these links'))findings.push('LLMS_EXACT_SKU_SAFETY_MISSING');
  if(!readiness||typeof readiness!=='object'||readiness.schema!=='evercraft.payments.public-commercial-readiness.v1')findings.push('READINESS_SCHEMA_INVALID');
  if(readiness?.commercial_checkout_ready!==false||readiness?.may_charge_customers!==false||readiness?.may_issue_entitlements!==false)findings.push('NATIVE_RAIL_HOLD_NOT_EXPLICIT');
  if(readiness?.separate_systemia_hosted_stripe?.verified_active_live_exact_sku_links!==7||
    readiness?.separate_systemia_hosted_stripe?.state!=='PROVIDER_ACTIVE_AND_HTTP_REACHABLE_BROWSER_CHECKOUT_NOT_YET_ATTESTED')findings.push('HOSTED_STRIPE_STATE_NOT_PROJECTED');
  if(readiness?.separate_systemia_hosted_stripe?.human_graphical_checkout_verified!==false||
    readiness?.separate_systemia_hosted_stripe?.verified_payment_observed!==false)findings.push('FALSE_CHECKOUT_OR_PAYMENT_PROOF');
  if(sourceReadiness?.separate_systemia_hosted_stripe?.verified_active_live_exact_sku_links!==7)throw Error('source_contract_changed');
  return {state:findings.length?'LIVE_PROJECTION_BLOCKED':'LIVE_SEMANTICS_VERIFIED',
    findings,
    equality:{llms_sha256_equal:typeof llms==='string'&&typeof sourceLlms==='string'&&sha(llms)===sha(sourceLlms),
      readiness_json_equal:readiness&&JSON.stringify(readiness)===JSON.stringify(sourceReadiness)},
    proof_boundary:'Exact source-to-live byte equality is not required for semantics; semantic pass is not a graphical checkout, sale or fulfillment receipt'};
}
async function fetchText(url,accept){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(url,{method:'GET',redirect:'error',signal:controller.signal,
      headers:{accept,'user-agent':'Evercraft-CHUM-Live-Projection-Canary/1.0'}});
    const body=(await res.text()).slice(0,200000);
    return {status:res.status,content_type:res.headers.get('content-type'),body};
  }finally{clearTimeout(timeout);}
}
export async function inspect({fetcher=fetchText,sourceLlms,sourceReadiness}){
  const results=[], live={};
  for(const [key,path,accept] of [['llms',pathLLMS,'text/plain'],['readiness',pathReady,'application/json']]){
    try{
      const res=await fetcher(origin+path,accept);
      results.push({key,url:origin+path,status:res.status,content_type:res.content_type,
        sha256:sha(res.body||'')});
      if(res.status===200 && typeof res.body==='string'){
        if(key==='llms'&&(res.content_type||'').includes('text/plain'))live.llms=res.body;
        if(key==='readiness'&&(res.content_type||'').includes('json')){try{live.readiness=JSON.parse(res.body);}catch{results.at(-1).error='invalid_json';}}
      }
    }catch(e){results.push({key,url:origin+path,status:null,error:e?.name==='AbortError'?'timeout':'request_failed'});}
  }
  // Read-only public health is diagnostic, not deployment attestation. Log only non-secret release fields.
  let runtime_release={status:null,source_release_ref:null,source_release_ref_bound:false,deployment_receipt_bound:false};
  try{
    const res=await fetcher(origin+'/health','application/json');
    runtime_release.status=res.status;
    if(res.status===200){
      const health=JSON.parse(res.body);
      runtime_release.source_release_ref=typeof health?.source_release_ref==='string'&&
        /^[a-f0-9]{40,64}$/i.test(health.source_release_ref)?health.source_release_ref:null;
      runtime_release.source_release_ref_bound=health?.source_release_ref_bound===true;
      runtime_release.deployment_receipt_bound=health?.deployment_receipt_bound===true;
    }
  }catch{/* public health diagnostic missing; do not infer current source */}
  const assessment=assessProjection({llms:live.llms,readiness:live.readiness,sourceLlms,sourceReadiness});
  return {schema:'evercraft.chum.live-projection-canary.v1',observed_at:new Date().toISOString(),origin,
    state:assessment.state,findings:assessment.findings,equality:assessment.equality,checks:results,runtime_release,
    proof_boundary:assessment.proof_boundary};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const sourceLlms=readFileSync(new URL('../../public/llms.txt',import.meta.url),'utf8');
  const sourceReadiness=JSON.parse(readFileSync(new URL('../../public/.well-known/evercraft-commercial-readiness.json',import.meta.url),'utf8'));
  const receipt=await inspect({sourceLlms,sourceReadiness});
  const output=process.env.CHUM_LIVE_PROJECTION_RECEIPT||'/tmp/evercraft-chum-live-projection.json';
  writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({receipt_path:output,...receipt},null,2));
  if(receipt.state!=='LIVE_SEMANTICS_VERIFIED')process.exitCode=1;
}
