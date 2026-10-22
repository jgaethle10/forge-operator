#!/usr/bin/env node
/**
 * Evercraft Payments commercial release boundary, October 2026.
 *
 * The legacy-hosted forms returned HTTP 402 in October 17 external testing.
 * Read-only MCP discovery remaining healthy is not a live checkout.
 * This audit NEVER requests legacy checkout, creates an order, issues an
 * invoice, changes a DNS record, or upgrades an old 200 to current evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const ORIGIN='https://fabric.systemiacommandcenters.com';
const HELD='held_provider_http_402_requires_new_payment_receipt';
const REASON='evercraft_public_commercial_mcp_http402_20261017';
const HEADERS={'accept':'application/json','user-agent':'Evercraft-Payment-Release-Gate-ReadOnly/1.0'};
const readJson=file=>JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));

export function assessCommercialReleaseState({connections,health,buyerCatalog,crosswalk,asOf}={}){
  if(!Array.isArray(connections)||!health||!buyerCatalog||!crosswalk)
    throw new Error('commercial_release_evidence_missing');
  const failures=[];
  const findings=[];
  const seen=new Set();
  const maps=Array.isArray(crosswalk.capabilities)?crosswalk.capabilities:[];
  const offers=Array.isArray(buyerCatalog.offers)?buyerCatalog.offers:[];
  if(crosswalk.schema!=='evercraft.fabric.verified-human-handoffs.v1'||maps.length!==4)
    failures.push('crosswalk_scope_changed');
  if(buyerCatalog.schema!=='evercraft.payments.public-buyer-doors.v1'||offers.length!==13)
    failures.push('buyer_catalog_scope_changed');
  if(buyerCatalog.revenue_verified_usd!==null)
    failures.push('unverified_revenue_claim_in_source');
  if(buyerCatalog.buyer_link_observation?.provider_receipt_observed!==false)
    failures.push('legacy_snapshot_misstates_provider_receipt');
  const historic=offers.filter(o=>typeof o.buyer_url==='string'&&o.buyer_url.length);
  if(historic.length)findings.push('historical_buyer_urls_exist_in_public_source_do_not_promote');
  for(const item of connections){
    if(!item||typeof item.public_id!=='string'){failures.push('invalid_live_connection_result');continue}
    if(seen.has(item.public_id))failures.push('duplicate_live_capability:'+item.public_id);
    seen.add(item.public_id);
    if(!maps.some(m=>m.public_id===item.public_id))
      failures.push('unexpected_live_capability:'+item.public_id);
    if(item.ok!==true||item.transactional!==false||item.external_action_taken!==false)
      failures.push('mcp_no_longer_read_only:'+item.public_id);
    if(item.buyer_checkout_available!==false||item.human_buyer_options_state!==HELD||
      item.checkout_suppression_reason!==REASON||
      item.human_offer_url!==null||
      !Array.isArray(item.human_buyer_options)||item.human_buyer_options.length!==0||
      !Array.isArray(item.owned_human_buyer_options)||item.owned_human_buyer_options.length!==0)
      failures.push('checkout_quarantine_missing_or_modified:'+item.public_id);
  }
  for(const map of maps){
    if(!seen.has(map.public_id))failures.push('missing_live_capability:'+map.public_id);
  }
  if(health.ok!==true||!Number.isSafeInteger(health.capability_count)||health.capability_count<1)
    failures.push('public_fabric_health_unverified');
  // A healthy owned service can still lack a configured and receipt-backed
  // provider. No one may release a buyer URL from this read-only script.
  if(health.checkout_provider_paid_verified===true)
    failures.push('unverified_provider_paid_health_claim');
  const ownedState=health.checkout_operational_state??'unknown';
  if(health.human_offer_checkout_enabled===true||
     health.checkout_purchase_intent_configured===true||
     health.checkout_direct_offer_ops_configured===true||
     ownedState==='owned_transport_requires_independent_checkout_canary'){
    findings.push('owned_payment_transport_configured_requires_separate_provider_reconciliation');
  }
  const failuresUnique=[...new Set(failures)].sort();
  return {
    schema:'evercraft.payments.commercial-release-hold.v1',
    observed_at:asOf||new Date().toISOString(),
    safety_ok:failuresUnique.length===0,
    state:failuresUnique.length===0?'HELD_SAFE_NOT_COMMERCIALLY_READY':'SAFETY_OR_SOURCE_DRIFT',
    payment_route_publishable:false,
    commercial_checkout_ready:false,
    human_buyer_options_published:0,
    capabilities_checked:seen.size,
    historic_public_source_buyer_urls:historic.length,
    owned_checkout_operational_state:ownedState,
    source_release_ref:health.source_release_ref||null,
    signed_deployment_receipt_verified:false,
    provider_paid_receipt_verified:false,
    settlement_verified:false,
    fulfillment_verified:false,
    external_action_taken:false,
    failures:failuresUnique,findings,
    caveats:[
      'A safe quarantine is NOT a successful checkout. Provider HTTP 402 remains a commercial P0.',
      'Historic buyer_url fields in the catalog are archival references, NOT a current availability claim.',
      'Only authenticated provider readback and canonical paid/fulfillment receipts can reopen transactions.',
    ],
  };
}
async function jsonFrom(url,options={}){
  const result=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(16000),...options});
  if(result.status!==200)throw new Error('public_observation_http_'+result.status);
  return result.json();
}
async function connectionFor(id){
  const response=await jsonFrom(ORIGIN+'/mcp',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json','user-agent':'Evercraft-Payment-Release-Gate-ReadOnly/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
      params:{name:'get_evercraft_connection_options',arguments:{public_id:id}}}),
  });
  const value=response?.result?.structuredContent;
  if(response?.error||response?.result?.isError||value?.public_id!==id)
    throw new Error('public_mcp_read_only_connection_failed:'+id);
  return value;
}
export async function collectCommercialReleaseState(){
  const crosswalk=readJson('public/.well-known/evercraft-fabric-human-buyer-handoffs.json');
  const buyerCatalog=readJson('public/.well-known/evercraft-payments-buyer-doors.json');
  const [health,connections]=await Promise.all([
    jsonFrom(ORIGIN+'/health',{headers:HEADERS}),
    Promise.all(crosswalk.capabilities.map(c=>connectionFor(c.public_id))),
  ]);
  return assessCommercialReleaseState({connections,health,buyerCatalog,crosswalk});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=await collectCommercialReleaseState();
    console.log(JSON.stringify(result,null,2));
    if(!result.safety_ok)process.exitCode=1;
  }catch(error){
    console.error(JSON.stringify({
      schema:'evercraft.payments.commercial-release-hold.v1',
      safety_ok:false,state:'PUBLIC_OBSERVATION_UNAVAILABLE',
      commercial_checkout_ready:false,
      reason:String(error?.message||error).slice(0,260)
    },null,2));
    process.exitCode=1;
  }
}
