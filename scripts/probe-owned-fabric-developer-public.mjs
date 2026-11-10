#!/usr/bin/env node
// External public acceptance for the owned Fabric developer directory.
// Never creates a payment, invokes paid tools, or treats a hash as a signature.
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const origin=String(process.env.EVERCRAFT_FABRIC_ORIGIN||'https://fabric.systemiacommandcenters.com').replace(/\/+$/,'');
const expected=String(process.env.EVERCRAFT_EXPECTED_RELEASE_SHA||'').trim().toLowerCase();
const artifact=process.env.EVERCRAFT_PROBE_RECEIPT_PATH||'';
const parsed=new URL(origin);
if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('origin_must_be_https_origin');
if(expected && !/^[a-f0-9]{40}$/.test(expected))throw Error('expected_sha_must_be_40_hex');

const rows=[];
const timeoutMs=14000;
function add(name,ok,fields={}){rows.push({name,ok:Boolean(ok),...fields})}
function extract(s){
 if(s.trim().startsWith('{'))return JSON.parse(s);
 const line=s.split('\n').find(l=>l.startsWith('data: ')&&l.slice(6).trim().startsWith('{'));
 if(!line)throw Error('unsupported_mcp_payload');
 return JSON.parse(line.slice(6));
}
async function fetchSafe(url,options={}){
 const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(timeoutMs),...options});
 return res;
}
async function rpc(id,method,params){
 const res=await fetchSafe(origin+'/mcp',{method:'POST',
   headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 if(res.status!==200)throw Error('mcp_http_'+res.status);
 const p=extract(await res.text());
 if(p.error)throw Error('mcp_protocol_error');
 return p.result||{};
}

let health=null;
try {
 const res=await fetchSafe(origin+'/health');
 health=res.status===200?await res.json():null;
 const isFabric=health?.ok===true&&health?.service==='evercraft-fabric-local';
 const observed=String(health?.source_release_ref||'').toLowerCase();
 add('fabric_health',isFabric,{http:res.status,source_release_ref:observed||null,
   deployment_receipt_bound:health?.deployment_receipt_bound===true,
   source_matches_expected:expected?observed===expected:null});
 if(expected)add('exact_source_revision',observed===expected,{expected,observed});
} catch(e){add('fabric_health',false,{error:String(e?.message||e)})}

try {
 const res=await fetchSafe(origin+'/developers',{headers:{accept:'text/html'}});
 const html=(await res.text()).slice(0,400000);
 const expectedPhrases=['Build your thing','Borrow what is proven','Specialist integration status','Evercraft Payments'];
 const valid=res.status===200&&/text\/html/.test(res.headers.get('content-type')||'')&&
   expectedPhrases.every(s=>html.includes(s))&&!/\.base44\.app/i.test(html)&&
   (html.match(/SPECIALIST HELD/g)||[]).length===6;
 add('owned_developer_html',valid,{http:res.status,held_cards:(html.match(/SPECIALIST HELD/g)||[]).length,
   bytes:html.length,old_provider_url_exposed:/\.base44\.app/i.test(html)});
} catch(e){add('owned_developer_html',false,{error:String(e?.message||e)})}

try {
 const res=await fetchSafe(origin+'/developers.json',{headers:{accept:'application/json'}});
 const j=res.status===200?await res.json():{};
 const entries=j.legacy_specialists||[];
 const ok=res.status===200&&j.schema==='evercraft.fabric.owned-developer-entry.v1'&&
   j.enabled_mcp?.url===origin+'/mcp'&&j.purchases_created===false&&
   j.commerce?.create_checkout_available_here===false&&
   entries.length===6&&entries.every(x=>x.do_not_route_new_users&&x.mcp_url===null);
 add('owned_developer_json',ok,{http:res.status,specialists:entries.length,
  published_capabilities:j.reported_capabilities??null,payments_created:j.purchases_created??null});
} catch(e){add('owned_developer_json',false,{error:String(e?.message||e)})}

try {
 const init=await rpc(1,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'evercraft-external-owned-probe',version:'1'}});
 const tools=(await rpc(2,'tools/list',{})).tools||[];
 const names=tools.map(t=>t.name);
 const need=['match_evercraft_capability','list_evercraft_capabilities','get_evercraft_connection_options'];
 add('owned_fabric_mcp_protocol',Boolean(init.protocolVersion)&&need.every(n=>names.includes(n)),{tools:names});
 const result=await rpc(3,'tools/call',{name:'get_evercraft_connection_options',arguments:{public_id:'findmypart-paid-hunt-v1'}});
 const j=result.structuredContent||{};
 add('buyer_handoff_quarantine',j.ok===true&&j.transactional===false&&
  j.buyer_checkout_available===false&&
  j.human_buyer_options_state==='held_provider_http_402_requires_new_payment_receipt'&&
  Array.isArray(j.human_buyer_options)&&j.human_buyer_options.length===0&&
  Array.isArray(j.owned_human_buyer_options)&&j.owned_human_buyer_options.length===0&&
  !j.human_offer_url,
  {returned_buyer_options:j.human_buyer_options?.length??null,
   checkout_available:j.buyer_checkout_available??null});
}catch(e){add('owned_fabric_mcp_protocol',false,{error:String(e?.message||e)});}

const receipt={
 schema:'evercraft.owned-developer.external-acceptance.v1',
 observed_at:new Date().toISOString(),
 origin,
 expected_source_sha:expected||null,
 status:rows.every(r=>r.ok)?'read_only_public_acceptance_pass':'blocked',
 public_read_only_usable:rows.every(r=>r.ok),
 deployment_signature_independently_verified:false,
 full_commercial_release_approved:false,
 real_payment_verified:false,
 external_partner_installation_verified:false,
 checks:rows
};
const serialized=JSON.stringify(receipt,null,2)+'\n';
if(artifact){mkdirSync(dirname(resolve(artifact)),{recursive:true});writeFileSync(resolve(artifact),serialized)}
console.log(serialized);
if(!receipt.public_read_only_usable)process.exitCode=1;
