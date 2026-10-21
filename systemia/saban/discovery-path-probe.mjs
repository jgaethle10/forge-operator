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
 const body=decode(await r.text());if(!r.ok||body.error)throw Error('rpc_'+r.status+'_'+(body.error?.message||''));
 const result=body.result;return result?.structuredContent|| (result?.content?.[0]?.text?JSON.parse(result.content[0].text):result);
}
const receipt={schema:'evercraft.saban.discovery-path.v1',observed_at:new Date().toISOString(),origin,provider_recommendation_observed:false,checkout_created:false,payment_attempted:false,profiles:[],surfaces:[]};
for(const [name,accept] of profiles){
 const row={name,simulated_client:true,initialized:false,tools:[],intents:[],errors:[]};
 try{
  const initialized=await rpc(accept,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'Saban discovery protocol probe',version:'1.0'}});row.initialized=!!initialized.serverInfo;
  const list=await rpc(accept,'tools/list');row.tools=(list.tools||[]).map(t=>t.name);
  for(const [slug,intent,expected] of intents){
   const matches=await rpc(accept,'tools/call',{name:'match_evercraft_capability',arguments:{intent,limit:1}});
   const match=matches.matches?.[0];
   const options=await rpc(accept,'tools/call',{name:'get_evercraft_connection_options',arguments:{public_id:expected}});
   const expectedUrl='https://fabric.systemiacommandcenters.com/offers/'+slug;
   // A catalog offer landing URL is not a verified buyer checkout. The
   // provider HTTP 402 hold must remain consistent between matching and
   // connection-options calls, even for a cold machine consumer.
   const buyerHeld=options.human_offer_url===null&&options.buyer_checkout_available===false&&
     match?.human_offer_url===null&&match?.buyer_checkout_available===false&&
     options.human_buyer_options_state==='held_provider_http_402_requires_new_payment_receipt'&&
     match?.human_buyer_options_state===options.human_buyer_options_state;
   const pageLabeled=match?.advertised_offer_page_url===expectedUrl&&
     match?.advertised_offer_page_state==='catalog_route_only_not_live_checkout_proof';
   row.intents.push({
     intent,expected,matched:match?.public_id||null,match_ok:match?.public_id===expected,
     human_offer_url:null,buyer_checkout_available:false,
     checkout_held_correctly:buyerHeld,advertised_offer_page_url:match?.advertised_offer_page_url||null,
     catalog_page_labeled_correctly:pageLabeled,start_url_state:match?.start_url_state||null
   });
  }
 }catch(e){row.errors.push(e.message)}
 receipt.profiles.push(row);
}
await Promise.all(['/llms.txt','/.well-known/evercraft-chum.json','/offers','/offers.json','/robots.txt','/sitemap.xml','/health'].map(async surface=>{
 try{const r=await fetch(origin+surface,{signal:AbortSignal.timeout(15000)});receipt.surfaces.push({path:surface,status:r.status});}catch(e){receipt.surfaces.push({path:surface,status:0,error:e.message})}
}));
receipt.ok=receipt.profiles.every(p=>p.initialized&&p.errors.length===0&&p.intents.length===intents.length&&p.intents.every(i=>i.match_ok&&i.checkout_held_correctly&&i.catalog_page_labeled_correctly))&&receipt.surfaces.every(s=>s.status===200);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));if(!receipt.ok)process.exitCode=1;
