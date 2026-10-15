#!/usr/bin/env node
// External GET-only P0 canary. No checkout creation, buyer data, payment or fulfillment.
import { readFileSync } from 'node:fs';

const buyer=JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-payments-buyer-doors.json',import.meta.url),'utf8'));
const chum=JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-chum.json',import.meta.url),'utf8'));
const llms=readFileSync(new URL('../public/llms.txt',import.meta.url),'utf8');
const forbiddenHost='jgaethle10.github.io';
const expectedHome='https://findmypart.base44.app/functions/evercraftBuy';
const expectedDirectory='https://fabric.systemiacommandcenters.com/capabilities';

function assert(condition,message){if(!condition)throw new Error(message)}
function uri(s){const u=new URL(s);assert(u.protocol==='https:','https_required');return u}
async function get(url,expectedType='text/html'){
 const req=uri(url);
 const res=await fetch(req,{
  method:'GET',
  redirect:'manual',
  headers:{accept:'text/html,application/json,text/plain','user-agent':'Evercraft-P0-ReadOnly-BuyerDoorCanary/1.0'},
  signal:AbortSignal.timeout(12000)
 });
 const type=res.headers.get('content-type')||'';
 const data=(await res.text()).slice(0,240000);
 return {status:res.status,type,data};
}
const results=[];
function record(slug,ok,reasons){results.push({slug,ok,reasons})}
const inCatalog=(u)=>uri(u).hostname==='findmypart.base44.app';
const missing=(data,needle)=>data.includes(needle)?null:'missing_'+needle.slice(0,40);
if(buyer.live_buyer_home!==expectedHome)throw new Error('wrong_live_buyer_home');
if(chum.public_entrypoints.live_machine_catalog!==expectedDirectory)throw new Error('wrong_public_catalog');
if(chum.public_entrypoints.human_conversion!==expectedHome)throw new Error('wrong_public_human_conversion');
if(llms.includes('https://'+forbiddenHost+'/forge-operator/chum/'))
 throw new Error('llms_references_known_404_host');
if(JSON.stringify(chum).includes('https://'+forbiddenHost+'/forge-operator/chum/'))
 throw new Error('chum_references_known_404_host');
if(!Array.isArray(buyer.offers)||buyer.offers.length!==13) throw new Error('unexpected_offer_count');
const capabilities=JSON.parse(readFileSync(new URL('../public/chum/capabilities.json',import.meta.url),'utf8')).capabilities;
const urls=[['buyer_home',expectedHome,'Evercraft Payments'],
 ['catalog',expectedDirectory,'Evercraft'],
 ...buyer.offers.map(o=>['offer:'+o.slug,o.buyer_url,o.slug]),
 ...capabilities.map(c=>['capability:'+c.public_id,'https://fabric.systemiacommandcenters.com/capabilities/'+encodeURIComponent(c.public_id),'Evercraft'])
];
for(let i=0;i<urls.length;i+=4){
 const responses=await Promise.all(urls.slice(i,i+4).map(async([slug,url,needle])=>{
  const reasons=[];
  try{
   if(slug.startsWith('offer:')){
    const o=buyer.offers.find(x=>'offer:'+x.slug===slug);
    const u=uri(url);
    if(!inCatalog(url)||u.pathname!=='/functions/evercraftBuy'||u.searchParams.get('offer')!==o.slug||[...u.searchParams].length!==1)
     reasons.push('bad_offer_url');
    const response=await get(url);
    if(response.status!==200) reasons.push('http_'+response.status);
    if(!response.type.includes('text/html')) reasons.push('not_html');
    for(const fragment of ['<form method="post"','name="offer" value="'+o.slug+'"','name="email"','name="detail"','Continue to secure checkout','$'+(o.amount_cents/100).toLocaleString('en-US')]){
     const miss=missing(response.data,fragment);if(miss)reasons.push(miss);
    }
   }else{
    const response=await get(url);
    if(response.status!==200)reasons.push('http_'+response.status);
    if(!response.type.includes('text/html'))reasons.push('not_html');
    if(!response.data.includes(needle))reasons.push('missing_brand');
   }
  }catch(e){reasons.push(String(e?.name||'request_error'))}
  return {slug,ok:reasons.length===0,reasons};
 }));
 for(const r of responses)record(r.slug,r.ok,r.reasons);
}
const passed=results.filter(x=>x.ok).length;
console.log(JSON.stringify({
 schema:'evercraft.payments.chatgpt-commercial-route-canary.v1',
 observed_at:new Date().toISOString(),method:'GET_ONLY',
 checkout_created:false,payment_attempted:false,provider_paid_verified:false,
 urls_tested:results.length,urls_passed:passed,urls_failed:results.length-passed,
 results,
 caveat:'GET/HTML form health only. No current checkout POST, provider session, paid receipt, enrollment, settlement or Shipping delivery verified.'
},null,2));
if(passed!==results.length)process.exitCode=1;
