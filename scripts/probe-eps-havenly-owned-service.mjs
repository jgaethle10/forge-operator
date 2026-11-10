#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const required=[
 {kind:'owned-frontend',path:'/eps/',marker:'eps-continuity-20261017'},
 {kind:'owned-frontend',path:'/havenly/',marker:'havenly-continuity-20261017'},
 {kind:'owned-frontend',path:'/apps/eps-estimator/',marker:'EPS Precise Estimator'},
 {kind:'canonical',origin:'https://evercraftpropertyservices.com',path:'/',marker:'eps-continuity-20261017'},
 {kind:'canonical',origin:'https://havenlycleaning.com',path:'/',marker:'havenly-continuity-20261017'}
];
function cleanOrigin(input){
 if(!input)return null;
 const u=new URL(input);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||/(\.|^)base44\.app$/i.test(u.hostname))throw new Error('invalid_owned_origin');
 return u.origin;
}
export async function probeServiceContinuity({ownedOrigin,fetchImpl=fetch,output=null,timeoutMs=12000}={}){
 let origin=null,config_error=null;
 try{origin=cleanOrigin(ownedOrigin)}catch(e){config_error=String(e.message||e)}
 const targets=required.map(t=>({...t,origin:t.origin||origin}));
 const probes=await Promise.all(targets.map(async target=>{
  const base={kind:target.kind,origin:target.origin,path:target.path,verified:false};
  if(!target.origin)return {...base,state:'blocked_owned_origin_unconfigured'};
  try{
   const u=new URL(target.path,target.origin);
   const response=await fetchImpl(u.href,{redirect:'follow',signal:AbortSignal.timeout(timeoutMs),headers:{'accept':'text/html'}});
   const final=new URL(response.url||u.href);
   if(final.hostname!==u.hostname||final.protocol!=='https:')return {...base,state:'blocked_cross_origin_redirect',status:response.status};
   if(response.status!==200)return {...base,state:'blocked_http_status',status:response.status};
   const contentType=response.headers?.get?.('content-type')||'';
   const html=await response.text();
   if(!html.includes(target.marker))return {...base,state:'blocked_wrong_release',status:response.status,content_type:contentType};
   if(/base44\.app|@base44|base44Client|base44-prod/i.test(html))return {...base,state:'blocked_legacy_dependency',status:response.status};
   return {...base,state:'route_content_verified',verified:true,status:response.status};
  }catch(e){return {...base,state:'blocked_probe_error',error_kind:e?.name==='TimeoutError'?'timeout':'network_or_tls_error'}}
 }));
 const all=probes.every(p=>p.verified===true);
 const report={schema:'evercraft.eps-havenly.external-cutover-probe.v1',
  checked_at:new Date().toISOString(),source_release_ref:process.env.GITHUB_SHA||null,
  verified:all,state:all?'route_content_verified':'blocked',
  owned_origin_configured:origin!==null,owned_origin_configuration_error:config_error,
  checks:probes,
  caveat:'Routes and release markers alone do not verify backend intake, historical data migration, booking or payment functionality.',
  backend_intake_verified:false,data_reconciliation_verified:false,checkout_verified:false
 };
 if(output){const filename=path.resolve(output);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n')}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 probeServiceContinuity({ownedOrigin:process.env.EVERCRAFT_PUBLIC_SERVICE_ORIGIN||'',output:'artifacts/eps-havenly-continuity/live-probe.json'})
 .then(r=>{console.log(JSON.stringify({state:r.state,verified:r.verified,checks:r.checks.map(c=>({path:c.path,kind:c.kind,state:c.state,status:c.status}))}));if(!r.verified)process.exitCode=2})
 .catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1});
}
