#!/usr/bin/env node
// Read-only external route acceptance; never submits a customer inquiry.
import fs from 'node:fs';
const site='https://jgaethle10.github.io/forge-operator/commercial-studio/';
const endpoint='https://fabric.systemiacommandcenters.com/api/commercial-studio/inquiry';
async function observe(url,method='GET',headers={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(url,{method,headers,redirect:'error',signal:controller.signal});
    return {status:res.status,headers:res.headers,body:method==='GET'?(await res.text()).slice(0,220000):''};
  }finally{clearTimeout(timeout);}
}
const attribution=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-chum-attribution.json',import.meta.url),'utf8'));
const offers=attribution.endpoints?.buyer_frontage?.url_template;
const findings=[],results=[];
if(offers!=='https://fabric.systemiacommandcenters.com/offers')findings.push('BUYER_FRONTAGE_POINTS_TO_LEGACY_OR_UNKNOWN_ROUTE');
try{
  const a=await observe(site);
  const ready=a.status===200&&a.body.includes('Send my commercial brief')&&a.body.includes(endpoint)&&a.body.includes('receipt.received!==true');
  results.push({name:'customer_form',url:site,status:a.status,source_aware:ready});
  if(!ready)findings.push('PUBLIC_CUSTOMER_FORM_NOT_UPDATED');
}catch{findings.push('PUBLIC_CUSTOMER_FORM_UNOBSERVED');}
try{
  const a=await observe(endpoint,'OPTIONS',{'origin':'https://jgaethle10.github.io','access-control-request-method':'POST','access-control-request-headers':'content-type'});
  const originOk=a.headers.get('access-control-allow-origin')==='https://jgaethle10.github.io';
  const methodOk=(a.headers.get('access-control-allow-methods')||'').includes('POST');
  results.push({name:'safe_preflight',url:endpoint,status:a.status,origin_ok:originOk,post_allowed:methodOk});
  if(a.status!==204||!originOk||!methodOk)findings.push('PUBLIC_INTAKE_CORS_UNVERIFIED');
}catch{findings.push('PUBLIC_INTAKE_PREFLIGHT_UNOBSERVED');}
try{
  const a=await observe(endpoint,'GET',{'origin':'https://jgaethle10.github.io'});
  results.push({name:'non_mutating_method_guard',url:endpoint,status:a.status});
  if(a.status!==405)findings.push('PUBLIC_INTAKE_METHOD_GUARD_UNVERIFIED');
}catch{findings.push('PUBLIC_INTAKE_METHOD_GUARD_UNOBSERVED');}
try{
  const a=await observe(offers);
  const valid=a.status===200&&/<!doctype html|<html/i.test(a.body)&&/Evercraft/i.test(a.body);
  results.push({name:'owned_buyer_offer_directory',url:offers,status:a.status,valid_human_offer_page:valid});
  if(!valid)findings.push('OWNED_BUYER_DIRECTORY_NOT_VISIBLE');
}catch{findings.push('OWNED_BUYER_DIRECTORY_UNOBSERVED');}
const receipt={schema:'evercraft.studio.public-intake-readonly-canary.v1',checked_at:new Date().toISOString(),
  state:findings.length?'NOT_YET_VERIFIED':'PUBLIC_INQUIRY_SURFACE_VERIFIED',
  results,findings,
  scope:'Page GET + form endpoint OPTIONS + guarded GET only. No lead submitted, no customer email, order or payment.',
  requires_followup:'A real voluntary visitor submission is required to prove durable live intake acceptance; do not synthesize a buyer'};
const file=process.env.STUDIO_PUBLIC_RECEIPT||'/tmp/evercraft-studio-public-intake-canary.json';
fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({receipt_path:file,...receipt},null,2));
if(receipt.findings.length)process.exitCode=1;
