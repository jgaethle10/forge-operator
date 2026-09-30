import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alievCapabilities,alievOffers,prepareAliEVHandoff,analyzeAliEVSite,executeAliEVMcp
} from './public-edge.mjs';

test('owned AliEV discovery contains no Base44 fallback',()=>{
  const caps=alievCapabilities({origin:'https://forge.example',siteSourceConfigured:false});
  assert.equal(caps.runtime,'yard_evercraft_compute');
  assert.equal(caps.base44_runtime_required,false);
  assert.equal(caps.capabilities.find((x)=>x.id==='analyze_ev_site').status,'owned_site_engine_required');
  assert.doesNotMatch(JSON.stringify(caps),/base44\.app/i);
});

test('offer catalog creates no transaction',()=>{
  const offers=alievOffers();
  assert.equal(offers.offers.length,4);
  assert.match(offers.payment_authority,/No offer is paid/);
});

test('paid handoff stays human review only',()=>{
  const handoff=prepareAliEVHandoff({offerKey:'site_report_299',address:'333 Strander Blvd, Tukwila, WA',origin:'https://forge.example',requestId:'req-1'});
  assert.equal(handoff.checkout_created,false);
  assert.equal(handoff.payment_created,false);
  assert.match(handoff.handoff_url,/forge\.example\/aliev\/review/);
});

test('owned site source rejects Base44 host',async()=>{
  await assert.rejects(
    analyzeAliEVSite({address:'333 Strander Blvd, Tukwila, WA',sourceUrl:'https://legacy.base44.app/functions/lookup',fetchImpl:async()=>{throw new Error('should not call');}}),
    /aliev_base44_site_source_prohibited/
  );
});

test('public screen preserves evidence distinctions',async()=>{
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>({
    matched_address:'333 Strander Blvd, Tukwila, WA',
    latitude:47.46,longitude:-122.25,country_code:'US',state:'WA',
    charger_source_status:'ok',
    chargers:[{name:'Station A',operator:'Example',distance_miles:1.2,source_url:'https://example.gov/a'}],
    public_signal_summary:{traffic_evidence:true,utility_evidence:false,program_evidence:true,observed_usage_evidence:false},
    retrieved_at:'2026-09-30T20:00:00Z'
  })});
  const result=await analyzeAliEVSite({address:'333 Strander Blvd, Tukwila, WA',sourceUrl:'https://owned.example/api/site',fetchImpl});
  assert.equal(result.evidence.charging_inventory.state,'OBSERVED_PUBLIC_INVENTORY');
  assert.equal(result.evidence.observed_usage_detail.state,'UNKNOWN');
  assert.equal(result.base44_runtime_used,false);
});

test('MCP exposes checkout-free safe surface',async()=>{
  const list=await executeAliEVMcp({jsonrpc:'2.0',id:1,method:'tools/list'});
  const names=list.result.tools.map((x)=>x.name);
  assert.deepEqual(names,['get_aliev_capabilities','get_aliev_offers','prepare_paid_handoff','analyze_ev_site']);
  assert.equal(names.some((name)=>/checkout|payment|status/i.test(name)),false);
});
