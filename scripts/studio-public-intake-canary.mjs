#!/usr/bin/env node
// Read-only external route acceptance; never submits a customer inquiry.
import fs from 'node:fs';
const site='https://jgaethle10.github.io/forge-operator/commercial-studio/';
const endpoint='https://fabric.systemiacommandcenters.com/api/commercial-studio/inquiry';
const contractEndpoint='https://fabric.systemiacommandcenters.com/api/commercial-studio/offer-contract';
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
let publicProjectOptions=null;
if(offers!=='https://fabric.systemiacommandcenters.com/offers')findings.push('BUYER_FRONTAGE_POINTS_TO_LEGACY_OR_UNKNOWN_ROUTE');
try{
  const a=await observe(site);
  // Compare the exact options served to buyers with the owned runtime's
  // current accepted contract, without sending any synthetic buyer details.
  const select=a.body.match(/<select\s+id="project"\s+name="project"[^>]*>([\s\S]*?)<\/select>/);
  publicProjectOptions=select?[...select[1].matchAll(/<option(?:\s+[^>]*)?>([^<]+)<\/option>/g)]
    .map(m=>m[1].trim()):null;
  const ready=a.status===200&&a.body.includes('Send my commercial brief')&&a.body.includes(endpoint)&&a.body.includes('receipt.received!==true');
  results.push({name:'customer_form',url:site,status:a.status,source_aware:ready});
  if(!ready)findings.push('PUBLIC_CUSTOMER_FORM_NOT_UPDATED');
  const heroStart=a.body.indexOf('<section class="hero">');
  const heroEnd=a.body.indexOf('</section>',heroStart);
  const hero=heroStart>=0&&heroEnd>heroStart?a.body.slice(heroStart,heroEnd):'';
  const priceFirst=hero.includes('<em>$50 commercial</em>')&&
    hero.includes('One focused 30-second social video')&&
    hero.includes('No filming or ad spend included')&&
    hero.includes('Request my $50 commercial');
  results.push({name:'price_first_customer_copy',url:site,status:a.status,exact_introductory_offer_visible:priceFirst});
  if(!priceFirst)findings.push('PUBLIC_PRICE_FIRST_VALUE_PROP_NOT_DEPLOYED');
  // Buyers must have a direct email escape hatch even if Fabric intake is
  // degraded; an unverified Stripe destination must not be served anywhere,
  // including machine-readable structured data.
  const directEmail=hero.includes('id="studio-email-hero"')&&
    hero.includes('mailto:jessegaethle10@gmail.com')&&
    hero.includes('Email my brief directly');
  results.push({name:'buyer_direct_email',url:site,status:a.status,
    first_screen_contact_visible:directEmail});
  if(!directEmail)findings.push('PUBLIC_FIRST_SCREEN_EMAIL_CONTACT_NOT_DEPLOYED');
  const paymentHeld=a.body.includes('Already approved a project? Request payment instructions')&&
    a.body.includes('Email for verified payment instructions')&&
    a.body.includes('No payment or booking happens on this page')&&
    !a.body.includes('4gM5kEd6K40d7ju86w4AU0e');
  results.push({name:'unverified_checkout_suppressed',url:site,status:a.status,
    unverified_stripe_destination_absent:!a.body.includes('4gM5kEd6K40d7ju86w4AU0e'),
    verified_payment_instructions_required:paymentHeld});
  if(!paymentHeld)findings.push('PUBLIC_UNVERIFIED_CHECKOUT_STILL_EXPOSED_OR_HOLD_NOT_DEPLOYED');
}catch{findings.push('PUBLIC_CUSTOMER_FORM_UNOBSERVED');}
try{
  const a=await observe(contractEndpoint);
  let contract=null;
  try{contract=JSON.parse(a.body)}catch{}
  const matching=a.status===200 &&
    contract?.schema==='evercraft.studio.public-offer-contract.v1' &&
    contract.default_project===publicProjectOptions?.[0] &&
    Array.isArray(contract.project_options) && publicProjectOptions!==null &&
    JSON.stringify(contract.project_options)===JSON.stringify(publicProjectOptions) &&
    contract.intake_acceptance_proved===false &&
    contract.payment_authority===false &&
    contract.production_authority===false;
  results.push({name:'live_form_to_runtime_offer_contract',url:contractEndpoint,
    status:a.status,all_public_project_options_accepted_in_source_contract:matching});
  if(!matching)findings.push('PUBLIC_STUDIO_FORM_RUNTIME_CONTRACT_MISMATCH');
}catch{findings.push('PUBLIC_STUDIO_FORM_RUNTIME_CONTRACT_UNOBSERVED');}

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
