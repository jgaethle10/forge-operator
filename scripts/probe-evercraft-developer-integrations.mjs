#!/usr/bin/env node
// Evercraft partner MCP canary: public/readonly probes only.
// Never calls a checkout-preparation tool, enters payment credentials, changes
// payment records, triggers fulfillment, or declares signed edge provenance.
import {readFileSync} from 'node:fs';

const source = new URL('../public/.well-known/evercraft-developer-integrations.json', import.meta.url);
const inventory = JSON.parse(readFileSync(source, 'utf8'));
const runLive = process.argv.includes('--live');
const strictRelease = process.argv.includes('--strict-release');
const expectedKeys = ['forensiscope','findmypart','eventwave','clip','web','discovery'];
const safeTools = {
  forensiscope:'get_forensiscope_capabilities',
  findmypart:'get_findmypart_capabilities',
  eventwave:'get_eventwave_capabilities',
  clip:'get_clip_capabilities',
  web:'get_web_capabilities',
  discovery:'list_evercraft_integrations'
};
const results = [];

function assert(condition, message) {
  if (!condition) throw Error(message);
}
function validateInventory() {
  assert(inventory.schema === 'evercraft.developer-integration-shelf.v1','wrong schema');
  assert(inventory.modules?.length === 6,'expected six discoverable modules');
  assert(inventory.entry.readonly && !inventory.entry.payments_created,'discovery must stay read-only');
  assert(inventory.commerce.authority === 'Evercraft Payments','wrong payment authority');
  assert(inventory.commerce.transaction_percentage_program === 'DESIGN_ONLY_NOT_ENABLED','never advertise fee split as live');
  assert(inventory.commerce.real_canonical_payment_receipt_verified === false,'do not assert settlement');
  assert(inventory.sovereign_fabric.release_attestation.startsWith('BLOCKED_'),'edge must remain release-gated');
  assert(JSON.stringify(inventory).indexOf('sk_live_') < 0,'credential detected');
  const names = new Set();
  for (const item of inventory.modules) {
    assert(expectedKeys.includes(item.key),'unrecognized module');
    assert(!names.has(item.key),'duplicate module');
    names.add(item.key);
    const url = new URL(item.mcp_url);
    assert(url.protocol === 'https:','MCP URL must use HTTPS');
    assert(Array.isArray(item.tools) && item.tools.includes(safeTools[item.key]),'missing safe live probe');
  }
  assert(expectedKeys.every(k=>names.has(k)),'expected modules missing');
  assert(new URL(inventory.entry.human_url).protocol === 'https:','invalid human entry');
  return true;
}
function decodeMcp(text) {
  if (text.trim().startsWith('{')) return JSON.parse(text);
  const data = text.split('\n').filter(line=>line.startsWith('data: ')).map(line=>line.slice(6));
  const record = data.find(line=>line.trim().startsWith('{'));
  if (!record) throw Error('unsupported_mcp_response');
  return JSON.parse(record);
}
async function rpc(url,id,method,params) {
  const res=await fetch(url,{
    method:'POST',
    redirect:'error',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream','user-agent':'Evercraft-PartnerReadiness-Readonly/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
    signal:AbortSignal.timeout(14000)
  });
  const packet=decodeMcp(await res.text());
  assert(res.status===200,'mcp_http_'+res.status);
  assert(!packet.error,'mcp_protocol_'+(packet.error?.message||'error'));
  return packet.result||{};
}
async function checkOne(module) {
  const start=Date.now(), faults=[];
  try {
    const init=await rpc(module.mcp_url,1,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'evercraft-readonly-canary',version:'1.0'}});
    if (!init.protocolVersion) faults.push('initialize_version_missing');
    const list=await rpc(module.mcp_url,2,'tools/list',{});
    const actual=(list.tools||[]).map(t=>t.name);
    for (const name of module.tools) if (!actual.includes(name)) faults.push('missing_tool_'+name);
    const probe=await rpc(module.mcp_url,3,'tools/call',{name:safeTools[module.key],arguments:{}});
    if (probe.isError) faults.push('readonly_capability_call_error');
    const data=probe.structuredContent||{};
    if (!Object.keys(data).length) faults.push('readonly_capability_response_missing');
    if (module.key==='discovery') {
      if (!Array.isArray(data.integrations)||data.integrations.length!==6) faults.push('directory_count_mismatch');
      if (data.payment_created!==false) faults.push('directory_payment_boundary_missing');
    }
    return {name:module.key,ok:faults.length===0,reported_tools:actual.length,required_tools:module.tools.length,duration_ms:Date.now()-start,failures:faults};
  } catch(error) {
    faults.push(String(error?.message||error).slice(0,240));
    return {name:module.key,ok:false,duration_ms:Date.now()-start,failures:faults};
  }
}
async function checkHumanPage() {
  try {
    const res=await fetch(inventory.entry.human_url,{headers:{accept:'text/html'},redirect:'error',signal:AbortSignal.timeout(12000)});
    const html=await res.text();
    const count=(html.match(/class="card"/g)||[]).length;
    const expected=['Build your thing','What are you building?','list_evercraft_integrations','match_evercraft_integration'];
    return {name:'developer_human_page',ok:res.status===200&&/text\/html/.test(res.headers.get('content-type')||'')&&count===6&&expected.every(x=>html.includes(x)),status:res.status,cards:count};
  }catch(error){return {name:'developer_human_page',ok:false,error:String(error?.message||error)}}
}
async function checkPaymentQuote() {
  try {
    const url='https://findmypart.base44.app/functions/evercraftPaymentsOps';
    const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'Evercraft-PartnerReadiness-Readonly/1.0'},body:JSON.stringify({action:'quote',offer_key:'evercraft_payments_founding_integration_750'}),signal:AbortSignal.timeout(13000)});
    const data=await res.json();
    return {name:'evercraft_payments_existing_pilot_quote',ok:res.status===200&&data.ok===true&&data.offer?.amount_cents===75000&&data.fulfillment?.ready===true,status:res.status,offer_price_cents:data.offer?.amount_cents,fulfillment_ready:data.fulfillment?.ready,checkout_attempted:false};
  }catch(error){return {name:'evercraft_payments_existing_pilot_quote',ok:false,error:String(error?.message||error),checkout_attempted:false}}
}
async function checkEdge() {
  try{
    const res=await fetch(inventory.sovereign_fabric.health_url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(11000),redirect:'error'});
    const data=await res.json();
    const bound=data.deployment_receipt_bound===true && !!data.deployment_receipt_ref;
    return {name:'fabric_exact_release_custody',http_status:res.status,public_health:res.status===200&&data.ok===true,deployment_receipt_bound:bound,status:bound?'attested_from_self_report_pending_independent_validation':'BLOCKED_MISSING_SIGNED_DEPLOYMENT_RECEIPT',independent_signature_verified:false,release_ready:false};
  }catch(error){return {name:'fabric_exact_release_custody',public_health:false,release_ready:false,status:'HEALTH_UNAVAILABLE',error:String(error?.message||error)}}
}
validateInventory();
if(runLive){
  for(let i=0;i<inventory.modules.length;i+=3)results.push(...await Promise.all(inventory.modules.slice(i,i+3).map(checkOne)));
  results.push(await checkHumanPage(),await checkPaymentQuote(),await checkEdge());
}
const required=results.filter(x=>x.name!=='fabric_exact_release_custody');
const requiredOk=required.every(x=>x.ok);
const edge=results.find(x=>x.name==='fabric_exact_release_custody');
const releaseGates={
developer_transport_and_human_entry:runLive?requiredOk:false,
external_partner_install_verified:false,
canonical_real_paid_receipt_verified:false,
merchant_owned_platform_fee_split_verified:false,
fabric_signed_artifact_and_independent_runtime_binding_verified:false
};
const output={schema:'evercraft.partner-integration-canary.v1',observed_at:new Date().toISOString(),mode:runLive?'public_readonly_live':'static_contract_validation',inventory_valid:true,connections_tested:runLive?inventory.modules.length:0,required_readonly_surfaces_ok:runLive?requiredOk:null,release_gates:releaseGates,commercial_release_ready:Object.values(releaseGates).every(Boolean),payment_created:false,transaction_fee_collected:false,results,caveat:'Safe discovery and quote probes only. This is not a proof of a paid charge, provider settlement, merchant payout, live percentage fee, fulfilled service or third-party partner install.'};
console.log(JSON.stringify(output,null,2));
if (runLive&&!requiredOk) process.exitCode=1;
if (strictRelease&&!output.commercial_release_ready) process.exitCode=2;
