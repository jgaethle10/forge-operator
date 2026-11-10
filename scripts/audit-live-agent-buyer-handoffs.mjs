#!/usr/bin/env node
// Read-only live ChatGPT/agent buyer-continuation canary. Never starts checkout.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectCommercialReleaseState} from './audit-commercial-release-hold.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const MCP='https://fabric.systemiacommandcenters.com/mcp';
const HEALTH='https://fabric.systemiacommandcenters.com/health';
const HOME='https://findmypart.base44.app/functions/evercraftBuy';
const unique=x=>[...new Set(x)];

export function assessLiveAgentBuyerHandoffs({buyer,crosswalk,liveResults,health}={}){
 if(!buyer||!crosswalk||!Array.isArray(liveResults)||!health)
  throw Error('agent_buyer_evidence_missing');
 const failures=[],verified=[];
 const fail=(code)=>failures.push(code);
 const entries=crosswalk.capabilities;
 if(buyer.schema!=='evercraft.payments.public-buyer-doors.v1'||
    crosswalk.schema!=='evercraft.fabric.verified-human-handoffs.v1'||
    buyer.live_buyer_home!==HOME||buyer.revenue_verified_usd!==null||
    !Array.isArray(buyer.offers)||buyer.offers.length!==13||
    !Array.isArray(entries)||entries.length!==4)
  fail('catalog_or_crosswalk_contract_mismatch');
 const byOffer=new Map((buyer.offers||[]).map(x=>[x.slug,x]));
 if(byOffer.size!==(buyer.offers||[]).length)fail('duplicate_offer_source');
 if(unique((entries||[]).map(x=>x.public_id)).length!==(entries||[]).length)fail('duplicate_capability_source');
 if(liveResults.length!==(entries||[]).length)fail('missing_live_capability_result');
 const seenIds=new Set();
 for(const row of liveResults){
   const id=row?.public_id;
   const map=entries?.find(x=>x.public_id===id);
   if(!map||seenIds.has(id)){fail('unexpected_or_duplicate_live_capability:'+id);continue}
   seenIds.add(id);
   if(row?.transactional!==false||row.external_action_taken!==false)
     fail('agent_interface_transaction_authority_not_read_only:'+id);
   if(row.human_buyer_options_state!=='read_only_exact_price_match_only')
     fail('buyer_options_state_mismatch:'+id);
   const options=row.human_buyer_options;
   if(!Array.isArray(options)){fail('missing_live_buyer_options:'+id);continue}
   const expected=map.offer_slugs;
   if(!Array.isArray(expected)||options.length!==expected.length){
     fail('offer_count_mismatch:'+id);continue;
   }
   if(new Set(options.map(x=>x.offer_slug)).size!==options.length)
     fail('duplicated_live_offer:'+id);
   for(const slug of expected){
      const offer=byOffer.get(slug);
      const actual=options.find(x=>x.offer_slug===slug);
      if(!actual||!offer){fail('missing_exact_offer:'+id+':'+slug);continue;}
      const expectedUrl=HOME+'?offer='+encodeURIComponent(slug);
      if(offer.buyer_url!==expectedUrl||actual.human_form_url!==expectedUrl)
        fail('buyer_url_mismatch:'+id+':'+slug);
      if(offer.currency!=='usd'||actual.currency!==offer.currency||
         actual.price_cents!==offer.amount_cents||actual.offer_name!==offer.title)
        fail('buyer_price_or_name_mismatch:'+id+':'+slug);
      if(actual.hosting!=='transitional_provider_hosted'||
         actual.buyer_confirmation_required!==true||
         actual.checkout_created!==false||
         actual.payment_verified!==false||
         actual.fulfillment_verified!==false||
         offer.payment_receipt_state!=='not_observed')
        fail('buyer_payment_truth_mismatch:'+id+':'+slug);
      if(actual.form_evidence!=='exact_offer_price_form_get_200_observed_2026-10-15')
        fail('unsupported_buyer_form_evidence:'+id+':'+slug);
      if(!failures.some(x=>x.endsWith(':'+id+':'+slug)))verified.push({public_id:id,offer_slug:slug,price_cents:offer.amount_cents,url:expectedUrl});
   }
 }
 for(const e of entries||[])if(!seenIds.has(e.public_id))fail('live_capability_not_checked:'+e.public_id);
 if(health.ok!==true||!Number.isSafeInteger(health.capability_count)||health.capability_count<1)
   fail('fabric_health_unverified');
 return {
   schema:'evercraft.audit.live-agent-human-buyer-handoffs.v1',
   ok:failures.length===0,checked_capabilities:seenIds.size,
   verified_offer_routes:verified.length,expected_offer_routes:6,
   options:verified,failures:unique(failures).sort(),
   source_release_ref:health.source_release_ref||null,
   source_release_ref_bound:health.source_release_ref_bound===true,
   deployment_receipt_bound:health.deployment_receipt_bound===true,
   commercial_truth:'PUBLIC_READ_ONLY_BUYER_FORM_NAVIGATION_ONLY',
   checkout_created:false,provider_paid_verified:false,settlement_verified:false,
   fulfillment_verified:false,external_action_taken:false,
   notice:'Live read-only customer continuation only. Other workflow verifies form HTTP GET and CTA. A provider-paid receipt and Shipping must be verified separately. Release source ref is a runtime report, not a signed deployment receipt.',
 };
}
async function getJson(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(18000)});
 if(response.status!==200)throw Error('live_probe_http_'+response.status);
 return response.json();
}
async function connection(public_id){
 const result=await getJson(MCP,{
   method:'POST',
   headers:{'content-type':'application/json','accept':'application/json','user-agent':'Evercraft-ReadOnly-BuyerNavigation/1.0'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
     params:{name:'get_evercraft_connection_options',arguments:{public_id}}})
 });
 const p=result?.result?.structuredContent;
 if(result?.error||result?.result?.isError||p?.public_id!==public_id)
   throw Error('mcp_connection_read_failed:'+public_id);
 return p;
}
export async function collectLiveAgentBuyerEvidence(){
 // Preserve the previously tested six-form contract as historical QA only.
 // If the authoritative source says checkout is quarantined, instead verify
 // that all four production MCP consumers truly suppress risky buyer links.
 const release=read('public/.well-known/evercraft-commercial-readiness.json');
 if(release.current_state==='HELD_PROVIDER_HTTP_402_AND_OWNED_PAYMENT_ENDPOINT_NOT_ATTESTED' &&
    release.commercial_checkout_ready===false) return collectCommercialReleaseState();
 const buyer=read('public/.well-known/evercraft-payments-buyer-doors.json');
 const crosswalk=read('public/.well-known/evercraft-fabric-human-buyer-handoffs.json');
 const [health,liveResults]=await Promise.all([
   getJson(HEALTH,{headers:{accept:'application/json','user-agent':'Evercraft-ReadOnly-BuyerNavigation/1.0'}}),
   Promise.all(crosswalk.capabilities.map(x=>connection(x.public_id))),
 ]);
 return assessLiveAgentBuyerHandoffs({buyer,crosswalk,liveResults,health});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const r=await collectLiveAgentBuyerEvidence();
  process.stdout.write(JSON.stringify({...r,observed_at:new Date().toISOString()},null,2)+'\n');
  if(!(r.ok===true || (r.safety_ok===true && r.commercial_checkout_ready===false)))
    process.exitCode=1;
 }catch(e){
  console.error(JSON.stringify({ok:false,error:'agent_human_checkout_canary_failed',reason:String(e?.message||e).slice(0,230)}));
  process.exitCode=1;
 }
}
