#!/usr/bin/env node
// Commercial safety: restrict the temporary provider-hosted exception to the
// 13 known, GET-checked Evercraft Payments buyer forms only. Every other public
// legacy provider URL is denied. This checker never mutates any file.
import fs from 'node:fs';
import path from 'node:path';

const ROOT='public';
const BUYER_PATH='public/.well-known/evercraft-payments-buyer-doors.json';
const CHUM_PATH='public/.well-known/evercraft-chum.json';
const BUYER_HOME='https://findmypart.base44.app/functions/evercraftBuy';
const DEAD_HOME='https://jgaethle10.github.io/forge-operator/chum/';
const roots=['conformance/products.json','distribution/direct-product-doors.json',ROOT,'registry'];
const legacy=/https?:\/\/(?:base44\.app|[^/\s"'<>]+\.base44\.app)(?:\/|$)/i;
const mutated=/https?:\/\/[A-Za-z0-9._-]*legacy(?:%20| )provider\.app(?:\/|$)/i;
const hits=[];
const buyer=JSON.parse(fs.readFileSync(BUYER_PATH,'utf8'));
const chum=JSON.parse(fs.readFileSync(CHUM_PATH,'utf8'));
const llms=fs.readFileSync('public/llms.txt','utf8');

const approved=new Set([
 'website-audit','workflow-xray','browser-diagnosis','payments-pilot',
 'part-quick','part-deep','part-rescue','legacy-xray','ibmi-xray',
 'site-survive','sign-pilot','towi-evidence','event-boost',
]);
function assert(cond,message){if(!cond)hits.push({file:'critical_buyer_contract',reason:message})}
assert(buyer.live_buyer_home===BUYER_HOME,'live_buyer_home_not_exact_verified_route');
const release=JSON.parse(fs.readFileSync('public/.well-known/evercraft-commercial-readiness.json','utf8'));
assert(chum.public_entrypoints?.human_conversion===null,'suppressed_checkout_hub_must_be_null');
assert(chum.public_entrypoints?.human_conversion_state==='held_provider_http_402_requires_new_payment_receipt','chum_checkout_hold_missing');
assert(chum.conversion_corridor?.public_checkout_ready===false,'chum_reenables_commerce_without_proof');
assert(release.current_state==='HELD_PROVIDER_HTTP_402_AND_OWNED_PAYMENT_ENDPOINT_NOT_ATTESTED','commercial_release_safety_state_changed');
assert(release.commercial_checkout_ready===false && release.may_promote_buyer_links===false && release.may_charge_customers===false,'unapproved_checkout_release_in_source');
assert(chum.public_entrypoints?.live_machine_catalog==='https://fabric.systemiacommandcenters.com/capabilities','live_catalog_not_owned_verified_route');
assert(!llms.includes(DEAD_HOME),'llms_advertises_known_404');
assert(Array.isArray(buyer.offers)&&buyer.offers.length===approved.size,'unexpected_scoped_offer_count');
const seen=new Set();
for(const offer of buyer.offers||[]){
 if(!approved.has(offer.slug)||seen.has(offer.slug)){
  hits.push({file:BUYER_PATH,reason:'unapproved_or_repeated_slug'});continue;
 }
 seen.add(offer.slug);
 assert(offer.buyer_url===BUYER_HOME+'?offer='+encodeURIComponent(offer.slug),'buyer_url_not_exact_verified_route:'+offer.slug);
 assert(offer.payment_receipt_state==='not_observed','paid_state_not_verified:'+offer.slug);
}
assert(buyer.revenue_verified_usd===null,'nonverified_revenue_claim');
assert(buyer.buyer_link_observation?.checkout_post_retested===false,'current_checkout_post_unverified_claim');
assert(buyer.buyer_link_observation?.provider_receipt_observed===false,'provider_receipt_unverified_claim');

// Remove only the two explicitly allowlisted URL fields from a copy before
// checking the entire remaining document for unapproved provider URLs.
const buyerForScan=structuredClone(buyer);
buyerForScan.live_buyer_home=null;
for(const offer of buyerForScan.offers||[])offer.buyer_url=null;
const chumForScan=structuredClone(chum);
chumForScan.public_entrypoints.human_conversion=null;
function checkText(file,raw){
 raw.split(/\r?\n/).forEach((line,i)=>{
  if(legacy.test(line)||mutated.test(line))hits.push({file,line:i+1,reason:'unapproved_legacy_url'});
 });
}
function walk(target){
 if(!fs.existsSync(target))return;
 const st=fs.statSync(target);
 if(st.isDirectory()){
  for(const e of fs.readdirSync(target,{withFileTypes:true})){
   const p=path.join(target,e.name);
   if(e.isDirectory())walk(p);
   else if(e.isFile()&&/\.(json|jsonld|txt|md|html|xml|yml|yaml|js|mjs|ts|tsx|jsx)$/i.test(e.name))walk(p);
  }
  return;
 }
 const normalized=target.replaceAll('\\','/');
 if(normalized===BUYER_PATH)return checkText(normalized,JSON.stringify(buyerForScan,null,2));
 if(normalized===CHUM_PATH)return checkText(normalized,JSON.stringify(chumForScan,null,2));
 checkText(normalized,fs.readFileSync(target,'utf8'));
}
for(const p of roots)walk(p);
if(hits.length){
 console.error(JSON.stringify({ok:false,error:'commercial_buyer_route_guard_failed',hits:hits.slice(0,150)},null,2));
 process.exit(1);
}
console.log(JSON.stringify({
 ok:true,state:'unapproved_legacy_provider_urls_blocked',
 temporary_exception:'13_archived_exact_offer_urls_source_only_not_public_routing',
 exception_retirement_gate:'independently_verified_owned_replacement_and_payment_to_shipping_chain',
 automated_legacy_url_purge_allowed:false,
 zero_charges:true,
},null,2));
