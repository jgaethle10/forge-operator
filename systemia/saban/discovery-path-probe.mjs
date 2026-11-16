#!/usr/bin/env node
// Saban cold-client probes. Profiles emulate protocol clients, not provider decisions.
// Fixed read-only MCP methods only. No orders, payments, provider API spend or messages.
import fs from 'node:fs';
import path from 'node:path';
const origin=process.env.EVERCRAFT_PROBE_ORIGIN||'https://fabric.systemiacommandcenters.com';
const out=process.env.EVERCRAFT_PROBE_OUT||'artifacts/saban/discovery-path';
const intents=[
 ['website-audit','My website gets traffic but nobody contacts us','audit-center-website-audit-machine-v1'],
 ['ibmi-rescue','Map our IBM i AS/400 estate before upgrading','ibmi-rescue-v1'],
 ['findmypart','Source an identified discontinued obsolete machine part','findmypart-paid-hunt-v1']
];
const profiles=[['json-client','application/json'],['streamable-http-client','application/json, text/event-stream']];
function decode(text){
 try{return JSON.parse(text)}catch{}
 for(const line of text.split('\n').reverse()){if(line.startsWith('data:'))try{return JSON.parse(line.slice(5))}catch{}}
 throw Error('unreadable_rpc_response');
}
async function rpc(accept,method,params={}){
 const r=await fetch(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept,'user-agent':'Evercraft-Saban-ColdClient/1.0'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
 const raw=await r.text();
 if(!r.ok)throw Error('rpc_http_'+r.status);
 const body=decode(raw);
 if(body.error)throw Error('rpc_json_'+(body.error?.code||'error'));
 const result=body.result;return result?.structuredContent|| (result?.content?.[0]?.text?JSON.parse(result.content[0].text):result);
}
const receipt={schema:'evercraft.saban.discovery-path.v1',observed_at:new Date().toISOString(),origin,provider_recommendation_observed:false,checkout_created:false,payment_attempted:false,profiles:[],surfaces:[]};
for(const [name,accept] of profiles){
 const row={name,simulated_client:true,initialized:false,tools:[],intents:[],errors:[],latency_ms:{},failed_stage:null};
 let stage='initialize';
 const measured=async(label,action)=>{
   stage=label;
   const start=Date.now();
   try{return await action()}finally{row.latency_ms[label]=Date.now()-start;}
 };
 try{
  const initialized=await measured('initialize',()=>rpc(accept,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'Saban discovery protocol probe',version:'1.0'}}));row.initialized=!!initialized.serverInfo;
  const list=await measured('tools_list',()=>rpc(accept,'tools/list'));row.tools=(list.tools||[]).map(t=>t.name);
  for(const [slug,intent,expected] of intents){
   const matches=await measured('match_'+slug,()=>rpc(accept,'tools/call',{name:'match_evercraft_capability',arguments:{intent,limit:1}}));
   const match=matches.matches?.[0];
   const options=await measured('connections_'+slug,()=>rpc(accept,'tools/call',{name:'get_evercraft_connection_options',arguments:{public_id:expected}}));
   const url=options.human_offer_url||match?.human_offer_url||null;
   const expectedUrl='https://fabric.systemiacommandcenters.com/offers/'+slug;
   row.intents.push({intent,expected,matched:match?.public_id||null,match_ok:match?.public_id===expected,human_offer_url:url,offer_link_ok:url===expectedUrl,start_url_state:match?.start_url_state||null});
  }
 }catch(e){row.errors.push(String(e?.message||e).slice(0,200));row.failed_stage=stage;}
 receipt.profiles.push(row);
}
await Promise.all(['/llms.txt','/.well-known/evercraft-chum.json','/offers','/offers.json','/robots.txt','/sitemap.xml','/health'].map(async surface=>{
 const start=Date.now();
 try{const r=await fetch(origin+surface,{signal:AbortSignal.timeout(15000)});receipt.surfaces.push({path:surface,status:r.status,latency_ms:Date.now()-start});}catch(e){receipt.surfaces.push({path:surface,status:0,latency_ms:Date.now()-start,error:String(e?.name||'fetch_failed')});}
}));
const requiredTools=['list_evercraft_capabilities','match_evercraft_capability','get_evercraft_connection_options'];
receipt.ok=receipt.profiles.every(p=>p.initialized&&requiredTools.every(t=>p.tools.includes(t))&&p.errors.length===0&&p.intents.length===intents.length&&p.intents.every(i=>i.match_ok&&i.offer_link_ok))&&receipt.surfaces.every(s=>s.status===200);
receipt.summary={
 profiles_verified:receipt.profiles.filter(p=>p.initialized&&p.errors.length===0&&requiredTools.every(t=>p.tools.includes(t))).length,
 profiles_total:profiles.length,
 surface_http_200:receipt.surfaces.filter(s=>s.status===200).length,
 surfaces_total:receipt.surfaces.length,
 http_429_observed:receipt.profiles.some(p=>p.errors.some(e=>e.includes('rpc_http_429')))||receipt.surfaces.some(s=>s.status===429),
 provider_plugin_invocation_verified:false,
 provider_recommendation_observed:false,
 status:receipt.ok?'owned_mcp_protocol_verified':'owned_mcp_protocol_incomplete'
};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));if(!receipt.ok)process.exitCode=1;
