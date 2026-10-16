#!/usr/bin/env node
// Read-only transport canary. No POST, payment session, referral lead, or user data.
const ORIGIN='https://findmypart.base44.app';
const routes=[
 {name:'one-time hunt intake',path:'/FindMyPart?src=forge_fieldguide&offer=deep-hunt'},
 {name:'free Part Check',path:'/free-part-check?src=forge_fieldguide'},
 {name:'self-service shop referral',path:'/PartnerWithFindMyPart?src=forge_fieldguide'}
];
const observed_at_utc=new Date().toISOString(),results=[];
for(const route of routes){
 const target=new URL(route.path,ORIGIN);
 try{
  const response=await fetch(target,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(12000),headers:{'accept':'text/html'}});
  const finalUrl=new URL(response.url);
  const contentType=response.headers.get('content-type')||'';
  // SPA HTML 200 is a transport check, not a proof that the route component, a checkout, or data writes work.
  const ok=response.status===200 && finalUrl.origin===ORIGIN && contentType.toLowerCase().includes('text/html');
  results.push({name:route.name,ok,http_status:response.status,final_path:finalUrl.pathname,content_type:contentType,error:null});
 }catch(error){
  results.push({name:route.name,ok:false,http_status:null,final_path:null,content_type:null,error:String(error?.name||'network_error')});
 }
}
const report={schema:'evercraft.findmypart.public-buyer-transport-canary.v1',observed_at_utc,method:'GET only; no forms, writes, sessions, charges, or credentials',evidence_boundary:'HTTP 200 and HTML content-type confirm transport only. This does not prove app UI functionality, payment, delivery, migration, signups or a sale.',results,all_transport_checks_passed:results.every(x=>x.ok)};
console.log(JSON.stringify(report,null,2));
if(!report.all_transport_checks_passed)process.exitCode=1;
