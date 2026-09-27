#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runLocalLennox } from './lennox-engine.mjs';
import { closeOwnedBrowserEngine, runOwnedBrowserLennox } from './browser-engine.mjs';

const catalogPath='public/.well-known/evercraft-machine-catalog.json';
const personasPath='systemia/customer-gauntlet/personas.json';
const policyPath='systemia/customer-gauntlet/policy.json';
const outDir='artifacts/customer-gauntlet';
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
const personas=JSON.parse(fs.readFileSync(personasPath,'utf8'));
const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));

const gateway=String(process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY || 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway');
const bridgeUrl=String(process.env.RAVEN_NEXUS_CUSTOMER_BRIDGE_URL || '').replace(/\/$/,'');
const bridgeToken=String(process.env.RAVEN_NEXUS_CUSTOMER_BRIDGE_TOKEN || '');
const requireInteractive=String(process.env.CUSTOMER_GAUNTLET_REQUIRE_NEXUS || 'false')==='true';
const requireBrowser=String(process.env.CUSTOMER_GAUNTLET_REQUIRE_BROWSER || 'false')==='true';
const allowSandboxPurchase=String(process.env.CUSTOMER_GAUNTLET_SANDBOX_PURCHASE || 'false')==='true';
const timeoutMs=20000;
const sha=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');

async function request(url,{json=false}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  try{
    const r=await fetch(url,{redirect:'follow',headers:{accept:json?'application/json':'text/html,application/json,text/plain;q=0.8,*/*;q=0.2','user-agent':'Evercraft-Lennox-Gauntlet/1.0'},signal:controller.signal});
    const text=await r.text();
    let body=null; try{body=JSON.parse(text)}catch{}
    return {ok:r.ok,status:r.status,final_url:r.url,content_type:r.headers.get('content-type')||'',bytes:Buffer.byteLength(text),text,body,latency_ms:Date.now()-started};
  }catch(error){
    return {ok:false,status:0,final_url:String(url),content_type:'',bytes:0,text:'',body:null,latency_ms:Date.now()-started,error:error instanceof Error?error.message:String(error)};
  }finally{clearTimeout(timer)}
}

function obviousFailure(res){
  const s=String(res?.text||'').toLowerCase();
  return !res?.ok || !res?.bytes || /application error|internal server error|not found|404|something went wrong|unexpected error/.test(s.slice(0,5000));
}

function severity(code){
  for(const [level,codes] of Object.entries(policy.severity||{})) if(codes.includes(code)) return level;
  return 'P2';
}

async function runBridgeLennox(offer,persona){
  if(!bridgeUrl || !bridgeToken) return null;
  const payload={
    schema:'evercraft.customer-gauntlet.request.v1',
    session_isolation:'new_clean_customer',
    persona,
    offer:{public_id:offer.public_id,name:offer.name,pricing:offer.pricing,public_url:offer.public_url},
    constraints:{
      no_brand_privilege:true,
      no_prior_session:true,
      no_live_charge:!allowSandboxPurchase,
      sandbox_payment_only:true,
      no_external_messages:true,
      capture:['screenshots','console_errors','network_failures','dom_summary','checkout_state','payment_verification','entitlement_state','fulfillment_state','receipt_state']
    }
  };
  try{
    const r=await fetch(bridgeUrl+'/v1/customer-gauntlet',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':`Bearer ${bridgeToken}`},
      body:JSON.stringify(payload)
    });
    const body=await r.json().catch(()=>({status:'FAILED',error:'non_json_bridge_response'}));
    return {...body,http_status:r.status,engine:body.engine||'raven_nexus_customer_bridge'};
  }catch(error){
    return {
      status:'FAILED',
      engine:'raven_nexus_customer_bridge',
      error:error instanceof Error?error.message:String(error),
      findings:[{
        code:'browser_runtime_failure',
        severity:'P1',
        stage:'owned_browser',
        detail:error instanceof Error?error.message:String(error)
      }]
    };
  }
}

async function runInteractive(offer,persona,{reviewUrl,buyerUrl}={}){
  const local=await runLocalLennox({offer,persona,reviewUrl,buyerUrl,timeoutMs});
  const browser=await runOwnedBrowserLennox({offer,persona,reviewUrl,buyerUrl,timeoutMs});
  const bridge=await runBridgeLennox(offer,persona);
  const findings=[
    ...(Array.isArray(local.findings)?local.findings:[]),
    ...(Array.isArray(browser?.findings)?browser.findings:[]),
    ...(Array.isArray(bridge?.findings)?bridge.findings:[])
  ];
  const blockedChecks=new Set(local.blocked_checks||[]);
  for(const completed of browser?.checks_completed||[]) blockedChecks.delete(completed);
  for(const blocked of browser?.blocked_checks||[]) blockedChecks.add(blocked);
  for(const completed of bridge?.checks_completed||[]) blockedChecks.delete(completed);
  for(const blocked of bridge?.blocked_checks||[]) blockedChecks.add(blocked);
  const severe=findings.some(f=>f.severity==='P0'||f.severity==='P1');
  const browserCompleted=String(browser?.status||'').startsWith('COMPLETED');
  const status=severe
    ? 'COMPLETED_WITH_FINDINGS'
    : browserCompleted || local?.owned_execution
      ? 'COMPLETED_PARTIAL'
      : 'BLOCKED';
  return {
    status,
    engine:bridge
      ? 'raven_nexus_lennox_browser_bridge_hybrid_v1'
      : browserCompleted
        ? 'raven_nexus_lennox_owned_browser_v1'
        : local.engine,
    owned_execution:true,
    local,
    browser,
    bridge,
    findings,
    checks_completed:[...new Set([
      ...(local.checks_completed||[]),
      ...(browser?.checks_completed||[]),
      ...(bridge?.checks_completed||[])
    ])],
    blocked_checks:[...blockedChecks],
    interactive_depth:bridge
      ? 'owned_browser_plus_bridge_plus_protocol'
      : browserCompleted
        ? 'owned_browser_plus_protocol'
        : 'owned_protocol'
  };
}

const offers=(catalog.offers||[]).filter(o=>o?.public_id&&o?.commercial_state==='sell_now');
const results=[];
for(const offer of offers){
  const offerUrl=new URL(gateway); offerUrl.searchParams.set('action','offer'); offerUrl.searchParams.set('public_id',offer.public_id);
  const reviewUrl=new URL(gateway); reviewUrl.searchParams.set('view','service'); reviewUrl.searchParams.set('public_id',offer.public_id);
  const machine=await request(offerUrl,{json:true});
  const review=await request(reviewUrl);
  const continuation=machine.body?.continuation||null;
  const buyerUrl=typeof continuation?.buyer_url==='string'?continuation.buyer_url.trim():'';
  const buyer=buyerUrl?await request(buyerUrl):null;

  const findings=[];
  if(obviousFailure(machine)) findings.push({code:'broken_cta',severity:severity('broken_cta'),stage:'offer',detail:`HTTP ${machine.status}`});
  if(obviousFailure(review)) findings.push({code:'broken_cta',severity:severity('broken_cta'),stage:'review',detail:`HTTP ${review.status}`});
  if(continuation?.mode==='direct_checkout_capable' && (!buyerUrl || obviousFailure(buyer))) findings.push({code:'dead_checkout',severity:severity('dead_checkout'),stage:'buyer',detail:buyerUrl?`HTTP ${buyer?.status}`:'buyer_url_missing'});

  const personaResults=await Promise.all(personas.personas.map(async persona => ({
    persona_id:persona.id,
    ...await runInteractive(offer,persona,{reviewUrl:reviewUrl.toString(),buyerUrl})
  })));
  for(const p of personaResults){
    for(const f of Array.isArray(p.findings)?p.findings:[]) findings.push({...f,persona_id:p.persona_id,severity:f.severity||severity(f.code)});
  }

  const highest=findings.some(f=>f.severity==='P0')?'P0':findings.some(f=>f.severity==='P1')?'P1':findings.length?'P2':null;
  const interactiveBlocked=personaResults.every(p=>p.status==='BLOCKED');
  const visualBlocked=personaResults.filter(p=>(p.blocked_checks||[]).some(x=>['rendered_screenshot_capture','visual_clipping','javascript_console_errors','keyboard_tab_order','broken_image_scan','blank_state_scan','rendered_brand_metadata'].includes(x))).length;
  const paymentBlocked=personaResults.filter(p=>(p.blocked_checks||[]).includes('provider_payment_verification')).length;
  const fulfillmentBlocked=personaResults.filter(p=>(p.blocked_checks||[]).includes('fulfillment_verification')).length;
  results.push({
    public_id:offer.public_id,name:offer.name,pricing:offer.pricing,
    doorway:{offer_status:machine.status,review_status:review.status,buyer_status:buyer?.status??null,buyer_url:buyerUrl||null},
    interactive:{blocked:interactiveBlocked,visual_blocked:visualBlocked,payment_blocked:paymentBlocked,fulfillment_blocked:fulfillmentBlocked,personas:personaResults},
    findings,highest_severity:highest,
    disposition:highest==='P0'?'QUARANTINE':highest==='P1'?'REPAIR_REQUIRED':'OPEN'
  });
}

await closeOwnedBrowserEngine();

const receipt={
  schema:'evercraft.customer-gauntlet.receipt.v1',
  generated_at:new Date().toISOString(),
  doctrine:{
    owned_test_engine:true,
    third_party_test_engine:false,
    live_charge_attempted:false,
    sandbox_purchase_enabled:allowSandboxPurchase,
    payment_not_inferred:true,
    fulfillment_not_inferred:true
  },
  summary:{
    sell_now_offers:offers.length,
    open:results.filter(r=>r.disposition==='OPEN').length,
    repair_required:results.filter(r=>r.disposition==='REPAIR_REQUIRED').length,
    quarantined:results.filter(r=>r.disposition==='QUARANTINE').length,
    owned_protocol_executor:true,
    interactive_bridge_configured:Boolean(bridgeUrl&&bridgeToken),
    owned_browser_required:requireBrowser,
    owned_browser_available:results.some(r=>r.interactive.personas.some(p=>p.browser?.available===true)),
    owned_browser_completed:results.reduce((n,r)=>n+r.interactive.personas.filter(p=>String(p.browser?.status||'').startsWith('COMPLETED')).length,0),
    browser_screenshots_captured:results.reduce((n,r)=>n+r.interactive.personas.filter(p=>Boolean(p.browser?.screenshot_ref)).length,0),
    interactive_blocked:results.filter(r=>r.interactive.blocked).length,
    local_lennox_completed:results.reduce((n,r)=>n+r.interactive.personas.filter(p=>p.local?.owned_execution===true).length,0),
    visual_browser_blocked:results.reduce((n,r)=>n+r.interactive.visual_blocked,0),
    sandbox_payment_blocked:allowSandboxPurchase?0:results.reduce((n,r)=>n+r.interactive.payment_blocked,0),
    fulfillment_verification_blocked:results.reduce((n,r)=>n+r.interactive.fulfillment_blocked,0)
  },
  results
};
receipt.receipt_sha256=sha(JSON.stringify(receipt));
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(outDir+'/latest.json',JSON.stringify(receipt,null,2)+'\n');
const rows=results.map(r=>`| ${r.name} | ${r.doorway.offer_status} | ${r.doorway.review_status} | ${r.doorway.buyer_status??'n/a'} | ${r.highest_severity||'none'} | ${r.disposition} | ${r.interactive.blocked?'BLOCKED':'ran'} |`);
fs.writeFileSync(outDir+'/latest.md',[
  '# Evercraft Customer Gauntlet','',
  `Generated: ${receipt.generated_at}`,
  `Sell-now offers: ${receipt.summary.sell_now_offers}`,
  `Open: ${receipt.summary.open}`,
  `Repair required: ${receipt.summary.repair_required}`,
  `Quarantined: ${receipt.summary.quarantined}`,
  `Owned Lennox protocol executor: ${receipt.summary.owned_protocol_executor}`,
  `Interactive Raven Nexus browser bridge configured: ${receipt.summary.interactive_bridge_configured}`,
  `Owned headless browser available: ${receipt.summary.owned_browser_available}`,
  `Owned browser persona runs: ${receipt.summary.owned_browser_completed}`,
  `Browser screenshots captured: ${receipt.summary.browser_screenshots_captured}`,
  `Local Lennox persona runs: ${receipt.summary.local_lennox_completed}`,
  `Visual/browser checks still blocked: ${receipt.summary.visual_browser_blocked}`,
  `Sandbox payment checks blocked: ${receipt.summary.sandbox_payment_blocked}`,
  `Fulfillment verification checks blocked: ${receipt.summary.fulfillment_verification_blocked}`,'',
  '| Offer | Offer | Review | Buyer | Highest | Disposition | Lennox |',
  '|---|---:|---:|---:|---|---|---|',...rows,'',
  '> BLOCKED is never treated as PASS. Automated runs do not perform live charges.',''
].join('\n'));
console.log(JSON.stringify(receipt.summary));
if(receipt.summary.quarantined>0 || receipt.summary.repair_required>0 || (requireInteractive && receipt.summary.interactive_blocked>0) || (requireBrowser && receipt.summary.visual_browser_blocked>0)) process.exit(1);
