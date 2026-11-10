// A running Forge instance acceptance probe for the *owned* EverMaps route.
// This does not deploy or authorize release. Intentionally permits either fresh
// NIFC data or an explicit 503; never interprets stale/unknown as current.
const originRaw=process.env.EVERMAPS_SMOKE_ORIGIN||'http://127.0.0.1:3000';
const url=new URL(originRaw);
if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
  (/\.base44\.app$/i.test(url.hostname))||
  !(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))){
  console.error('BLOCKED: probe requires a clean owned HTTPS origin or loopback HTTP');
  process.exit(2);
}
const origin=url.origin;
const observations={};
async function get(path,{expectType=null,timeout=22000}={}){
 const response=await fetch(origin+path,{redirect:'manual',headers:{Accept:'*/*'},signal:AbortSignal.timeout(timeout)});
 if(response.status>=300 && response.status<400)throw Error(path+': redirect was not authorized');
 const body=await response.text();
 if(body.length>5e6)throw Error(path+': unexpectedly large body');
 if(expectType && !(response.headers.get('content-type')||'').includes(expectType))
  throw Error(path+': wrong content type '+response.headers.get('content-type'));
 return {status:response.status,body,headers:response.headers};
}
function ensure(test,message){if(!test)throw Error('BLOCKED: '+message)}
try{
 let ready=false;
 for(let attempt=0;attempt<30;attempt++){
  try{
   const reply=await get('/api/health',{timeout:2000});
   if(reply.status===200){ready=true;break;}
  }catch{/* Forge production container is still starting. */}
  await new Promise(done=>setTimeout(done,1000));
 }
 ensure(ready,'Forge production container failed startup health readiness');
 const html=await get('/evermaps/',{expectType:'text/html'});
 ensure(html.status===200,'EverMaps HTML not HTTP 200');
 ensure(html.body.includes('EverMaps | Evercraft Owned Preview'),'EverMaps ownership page missing');
 ensure(html.body.includes('OWNED RUNTIME PREVIEW'),'stage label missing');
 ensure(html.body.includes('noindex,nofollow'),'indexing remains held');
 const js=await get('/evermaps/app.js',{expectType:'javascript'});
 ensure(js.status===200 && js.body.includes("fetch('/api/evermaps/incidents/pnw'"),
  'browser JS not bound to first-party owned API');
 const css=await get('/evermaps/style.css',{expectType:'text/css'});
 ensure(css.status===200 && css.body.includes('.em-map'),'map stylesheet missing');
 for(const [label,value] of [['html',html.body],['js',js.body],['css',css.body]]){
  ensure(!/base44/i.test(value),label+' retains external legacy dependency');
 }
 observations.static_assets={html:html.status,js:js.status,css:css.status};
 const health=await get('/api/evermaps/source-health',{expectType:'application/json'});
 ensure(health.status===200,'owned source health is not available');
 const status=JSON.parse(health.body);
 ensure(status.schema==='evercraft.evermaps.incident-source-health.v1','wrong health schema');
 ensure(status.third_party_app_builder_dependency===false,'legacy source dependency exposed');
 observations.source_health=status.state;
 const incident=await get('/api/evermaps/incidents/pnw',{expectType:'application/json',timeout:25000});
 ensure([200,503].includes(incident.status),'incident endpoint must be 200 or explicit 503');
 const data=JSON.parse(incident.body);
 if(incident.status===200){
  ensure(data.schema==='evercraft.evermaps.incident-observations.v1','incident payload schema mismatch');
  ensure(data.guarantees?.current_feed_is_burning_confirmation===false,'active-flame deception');
  ensure(data.guarantees?.zero_records_proves_zero_fires===false,'zero-count deception');
  ensure(Array.isArray(data.records)&&data.count===data.records.length,'reported count mismatch');
  ensure(data.records.every(r=>r.evidence_state==='SOURCE_REPORTED_INCIDENT_NOT_BURNING_CONFIRMATION'),
   'incident source status untruthful');
  observations.source_records=data.count;
 }else{
  ensure(data.status==='SOURCE_UNAVAILABLE'&&data.count===null
   &&Array.isArray(data.records)&&data.records.length===0,'unavailable feed was not fail-closed');
  observations.source_records='withheld_due_to_source_unavailable';
 }
 observations.incident_http=incident.status;
 const receipt={schema:'evercraft.evermaps.owned-http-smoke.v1',state:'PASS',
  origin,observed_at_utc:new Date().toISOString(),...observations,
  source_operational_status:incident.status===200?'source-reported':'unavailable',
  actual_burning_status:'NOT_VERIFIED',physical_browser_qa:'NOT_TESTED',
  deployment_authorized:false};
 console.log(JSON.stringify(receipt,null,2));
}catch(error){
 const receipt={schema:'evercraft.evermaps.owned-http-smoke.v1',state:'BLOCKED',origin,
  observed_at_utc:new Date().toISOString(),reason:String(error?.message||error).slice(0,400),
  observations,deployment_authorized:false};
 console.error(JSON.stringify(receipt,null,2));
 process.exitCode=1;
}
