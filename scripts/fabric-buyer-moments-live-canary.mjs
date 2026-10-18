#!/usr/bin/env node
// Read-only outsider parity check for Evercraft's new problem-first offer index.
// This only performs public GET requests. It never posts forms, creates orders,
// attempts payment, accesses protected data or equates checkout with settlement.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const APPROVED_ORIGIN='https://fabric.systemiacommandcenters.com';
export const BUYER_MOMENTS=Object.freeze([
  ['payments-pilot','$750'],
  ['website-audit','$49'],
  ['browser-diagnosis','$149'],
  ['legacy-rescue','$299'],
  ['ibmi-xray','$250'],
  ['findmypart','$19'],
]);

async function get(url,fetchImpl){
  const r=await fetchImpl(url,{
    method:'GET',redirect:'error',
    headers:{accept:'text/html,application/json','user-agent':'Evercraft-BuyerMoment-ReadOnlyCanary/1.0'},
    signal:AbortSignal.timeout(12000),
  });
  return {status:r.status,contentType:String(r.headers?.get('content-type')||''),body:(await r.text()).slice(0,200000)};
}
function offeredHref(html,slug){
  return html.includes('class="moment" href="/offers/'+slug+'"');
}
export async function observeBuyerMomentParity({origin=APPROVED_ORIGIN,fetchImpl=fetch}={}){
  if(origin!==APPROVED_ORIGIN)throw new Error('unapproved_origin');
  const result={
    schema:'evercraft.fabric.buyer-moments.external-parity.v1',
    observed_at:new Date().toISOString(),origin,method:'GET',requests_posted:0,
    payment_attempts:0,source_merge_claimed:false,deployed:false,source_commit_attested:false,public_parity_observed:false,checks:[],failures:[],
  };
  try{
    const h=await get(origin+'/health',fetchImpl);
    let health={};
    if(h.status===200&&h.contentType.includes('application/json')){
      try{health=JSON.parse(h.body)}catch{result.failures.push('health_json_unparseable')}
    }
    result.checks.push({route:'/health',http:h.status,release_ref:health.source_release_ref||null,
      source_release_bound:health.source_release_ref_bound===true,
      deployment_receipt_bound:health.deployment_receipt_bound===true});
    if(h.status!==200)result.failures.push('health_http_'+h.status);
    if(health.source_release_ref_bound!==true)result.failures.push('source_release_unbound');
    if(health.deployment_receipt_bound!==true)result.failures.push('deployment_receipt_unbound');
  }catch(e){result.failures.push('health_unreachable');result.checks.push({route:'/health',error:String(e?.message||e).slice(0,130)})}
  let index='';
  try{
    const r=await get(origin+'/offers',fetchImpl);
    index=r.body;
    result.checks.push({route:'/offers',http:r.status,has_selector_heading:index.includes('What is getting in your way?'),
      has_moment_grid:index.includes('class="moment-grid"')});
    if(r.status!==200)result.failures.push('offers_index_http_'+r.status);
    if(r.status===200&&!index.includes('What is getting in your way?'))result.failures.push('buyer_moments_source_not_on_public_edge');
  }catch(e){result.failures.push('offers_index_unreachable');result.checks.push({route:'/offers',error:String(e?.message||e).slice(0,130)})}
  for(const [slug,expectedPrice] of BUYER_MOMENTS){
    const route='/offers/'+slug;
    let row={route,index_link_present:offeredHref(index,slug),expected_price:expectedPrice};
    if(!row.index_link_present)result.failures.push('index_missing_'+slug);
    try{
      const r=await get(origin+route,fetchImpl);
      row={
        ...row,http:r.status,
        exact_offer_form:r.body.includes('action="/api/offers/'+slug+'/checkout"'),
        receipt_email:/<input\b[^>]*name=["']customer_ref["'][^>]*type=["']email["']/i.test(r.body),
        exact_price:r.body.includes(expectedPrice),
        authorization_input:r.body.includes('name="user_confirmed" value="true"'),
        no_false_paid_claim:r.body.includes('Nothing is marked paid until settlement is verified'),
      };
      if(r.status!==200)result.failures.push(slug+'_http_'+r.status);
      else if(!row.exact_offer_form||!row.receipt_email||!row.exact_price||!row.authorization_input||!row.no_false_paid_claim)
        result.failures.push(slug+'_contract_incomplete');
    }catch(e){row.error=String(e?.message||e).slice(0,130);result.failures.push(slug+'_unreachable')}
    result.checks.push(row);
  }
  result.passed=result.failures.length===0;
  // Public GET alone never proves the deployed source matches the reviewed commit,
  // nor merchant authorization, checkout creation, settlement or shipping.
  result.public_parity_observed=result.passed;
  // Not equivalent to code-release provenance: only separately verified, signed
  // source+edge artifacts can attest the exact deployed commit.
  result.deployed=false;
  result.source_commit_attested=false;
  result.summary={checks:result.checks.length,failures:result.failures.length,
    buyer_moments:BUYER_MOMENTS.length,passed:result.passed};
  result.receipt_hash='sha256:'+crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  return result;
}
export function saveBuyerMomentReceipt(receipt,file='artifacts/fabric/buyer-moments/external-parity.json'){
  const target=path.resolve(file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n');
  return target;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const result=await observeBuyerMomentParity();
  saveBuyerMomentReceipt(result);
  process.stdout.write(JSON.stringify({
    schema:result.schema,observed_at:result.observed_at,origin:result.origin,
    method:result.method,passed:result.passed,failures:result.failures,
    // Never display actual source release as belonging to this PR without matching evidence.
    source_merge_claimed:false,payment_attempts:0
  })+'\n');
  if(!result.passed)process.exitCode=1;
}
