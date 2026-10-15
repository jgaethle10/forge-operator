#!/usr/bin/env node
// Offline authority map assembled from repository public source artifacts.
// Read-only inventory, not live runtime/payment/payout proof.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const url=(s)=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false}};
export function inspectCommercialTopology({capabilities,buyerDoors,directDoors,registry}){
  if(!Array.isArray(capabilities?.capabilities)||!Array.isArray(buyerDoors?.offers)||
     !Array.isArray(directDoors?.products)||!Array.isArray(registry?.products))
     throw new Error('topology_source_missing_or_wrong_shape');
  const ids=new Set(),slugs=new Set(),errors=[];
  const capRows=capabilities.capabilities.map(c=>{
    if(!c?.public_id||ids.has(c.public_id))errors.push('duplicate_or_invalid_capability_id');
    ids.add(c.public_id);
    const sellNow=c.commercial_state==='sell_now';
    const validStart=url(c.start_url);
    if(validStart&&c.start_url_state==='held_no_owned_public_origin')errors.push('verified_start_held_state_conflict:'+c.public_id);
    if(c.start_url_state==='verified'&&!validStart)errors.push('verified_start_has_no_https_url:'+c.public_id);
    return {public_id:c.public_id,name:c.name,
      commercial_state:c.commercial_state||'unknown',
      machine_state:c.machine_state||'unknown',
      start_url_state:c.start_url_state||'unknown',
      customer_start_url:sellNow&&validStart?c.start_url:null,
      source_sell_now:sellNow,
      merchant_start_verified_by_this_audit:false,
      commercial_release_state:sellNow&&!validStart?'HOLD_NO_OWNED_START':sellNow?'REQUIRES_EXTERNAL_END_TO_END_PROOF':'NOT_PAID_OFFER',
    };
  });
  const offerRows=buyerDoors.offers.map(o=>{
    if(!o?.slug||slugs.has(o.slug))errors.push('duplicate_or_invalid_offer_slug');
    slugs.add(o.slug);
    if(!Number.isSafeInteger(o.amount_cents)||o.amount_cents<0)
      errors.push('invalid_price:'+o.slug);
    const expected=buyerDoors.live_buyer_home+'?offer='+encodeURIComponent(o.slug);
    if(!url(o.buyer_url)||o.buyer_url!==expected)errors.push('unapproved_or_missing_offer_url:'+o.slug);
    if(o.payment_receipt_state!=='not_observed')errors.push('unsupported_payment_receipt_claim:'+o.slug);
    return {slug:o.slug,offer_key:o.offer_key,amount_cents:o.amount_cents,
      currency:o.currency,form_url:o.buyer_url,provider_hosted_continuity:true,
      buyer_form_source_claim:o.buyer_form_state||'unknown',
      independently_verified_paid_receipt:false,fulfillment_delivered:false};
  });
  const direct=directDoors.products.map(p=>({
    slug:p.slug,source_state:p.state||'unknown',
    direct_callable_declared:p.direct_callable===true,
    verified_remote_mcp:url(p.mcp_url)?p.mcp_url:null,
    registry_published_claim:p.registry_published===true,
  }));
  if(offerRows.length&&(!url(buyerDoors.live_buyer_home)))errors.push('invalid_buyer_home');
  if(buyerDoors.revenue_verified_usd!==null)errors.push('nonverified_revenue_field');
  const counts={
    capability_source_count:capRows.length,
    sell_now_source_count:capRows.filter(c=>c.source_sell_now).length,
    sell_now_missing_owned_start_count:capRows.filter(c=>c.commercial_release_state==='HOLD_NO_OWNED_START').length,
    sell_now_owned_start_claim_count:capRows.filter(c=>c.customer_start_url).length,
    separately_advertised_selected_offers:offerRows.length,
    provider_verified_payments_observed_in_source:0,
    direct_specialist_products:direct.length,
    direct_callable_claim_count:direct.filter(c=>c.direct_callable_declared).length,
    direct_held_claim_count:direct.filter(c=>!c.direct_callable_declared).length,
    registry_product_count:registry.products.length,
  };
  return {ok:errors.length===0,schema:'evercraft.audit.commercial-topology.v1',
    evidence_class:'REPOSITORY_SNAPSHOT_ONLY',
    counts,errors,commercial_holds:capRows.filter(c=>c.commercial_release_state==='HOLD_NO_OWNED_START').map(c=>c.public_id),
    source_capabilities:capRows,approved_buyer_forms:offerRows,specialist_connection_claims:direct,
    release_note:'13 verified forms and 17 source sell_now capabilities are different populations; there is no automatic one-to-one mapping. Never substitute form GET, source offer label or MCP catalog entry for checkout, signed provider receipt, settlement or fulfillment.',
    limits:['Does not call live services or authenticate processor evidence.','Readiness and registry states are source claims, not provider or runtime attestations.','Live MCP catalog count, deployment hashes, services and credentials need independent receipts.']};
}
export function auditCommercialTopologyFromDisk(){
 return inspectCommercialTopology({
  capabilities:read('public/chum/capabilities.json'),
  buyerDoors:read('public/.well-known/evercraft-payments-buyer-doors.json'),
  directDoors:read('public/.well-known/evercraft-direct-door-readiness.json'),
  registry:read('registry/catalog.json'),
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=auditCommercialTopologyFromDisk();
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(!report.ok)process.exitCode=1;
}
