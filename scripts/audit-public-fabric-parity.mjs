#!/usr/bin/env node
/**
 * Evercraft public source -> live Fabric parity observation.
 * Public GET + MCP read-only tools/call ONLY. Never calls a payment endpoint.
 * Audit verdict is not proof of financial processing or permission to deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const ORIGIN='https://fabric.systemiacommandcenters.com';
const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const tms=x=>Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
function uniq(xs){return [...new Set(xs)].sort()}
const htmlRoute=(c)=>{
 const u=new URL(c.public_url);
 return u.hostname==='fabric.systemiacommandcenters.com'&&
  u.pathname===('/capabilities/'+c.public_id);
};

export function assessFabricParity({
 source,liveIds,health,observations,exceptions,now='2026-10-15T17:00:00Z'
}={}){
 const findings=[];
 if(!Array.isArray(source?.capabilities)||!Array.isArray(liveIds)||
   !Array.isArray(observations)||!exceptions||typeof health!=='object')
  throw new Error('parity_source_or_observation_missing');
 const sourceIds=source.capabilities.map(c=>c.public_id).sort();
 const live=uniq(liveIds);
 if(sourceIds.length!==new Set(sourceIds).size) findings.push('duplicate_source_public_id');
 if(liveIds.length!==live.length) findings.push('duplicate_live_public_id');
 const missing=sourceIds.filter(id=>!live.includes(id));
 const extra=live.filter(id=>!sourceIds.includes(id));
 const known=exceptions.known_source_only_capabilities||[];
 const exempt=new Set(known);
 const expired=!Number.isFinite(tms(exceptions.expires_at))||tms(now)>=tms(exceptions.expires_at);
 if(expired&&missing.length) findings.push('source_live_exception_expired');
 for(const id of missing)if(!exempt.has(id))findings.push('unexpected_live_catalog_missing:'+id);
 for(const id of extra)findings.push('unexpected_live_catalog_extra:'+id);
 if(health?.ok!==true) findings.push('public_fabric_health_not_ok');
 if(!Number.isInteger(health?.capability_count)||health.capability_count!==live.length)
  findings.push('health_catalog_count_mismatch');
 const seen=new Set();
 for(const obs of observations){
  if(seen.has(obs.public_id))findings.push('duplicate_route_check:'+obs.public_id);
  seen.add(obs.public_id);
  const row=source.capabilities.find(x=>x.public_id===obs.public_id);
  if(!row){findings.push('route_not_in_source:'+obs.public_id);continue}
  if(obs.url!==row.public_url)findings.push('route_url_mismatch:'+obs.public_id);
  const accepted404=obs.status===404&&exempt.has(obs.public_id)&&
    missing.includes(obs.public_id)&&!expired&&
    (exceptions.known_nonworking_public_routes||[]).includes(obs.url);
  if(obs.status!==200&&!accepted404)findings.push('advertised_url_not_200:'+obs.public_id+':'+obs.status);
  if(obs.status===200&&obs.html_identity_verified===false&&htmlRoute(row))
    findings.push('owned_capability_page_content_mismatch:'+obs.public_id);
 }
 for(const id of sourceIds)if(!seen.has(id))findings.push('source_route_not_checked:'+id);
 // Missing deployment evidence does not make the endpoint down. It blocks
 // release attestation and must be displayed independently of reachability.
 const sourceRefBound=health.source_release_ref_bound===true&&
   typeof health.source_release_ref==='string'&&
   /^[a-f0-9]{40}$/i.test(health.source_release_ref);
 const deploymentBound=health.deployment_receipt_bound===true&&
   typeof health.deployment_receipt_ref==='string'&&
   /^(?:sha256:)?[a-f0-9]{64}$/i.test(health.deployment_receipt_ref);
 return {
  schema:'evercraft.audit.fabric-source-to-live-parity.v1',
  observed_at:now,ok:findings.length===0,findings:uniq(findings),
  source_capabilities:sourceIds.length,live_mcp_capabilities:live.length,
  source_only_ids:missing,live_only_ids:extra,route_checked_count:observations.length,
  route_ok_count:observations.filter(x=>x.status===200).length,
  known_404_exception_count:observations.filter(x=>x.status===404&&exempt.has(x.public_id)).length,
  source_release_ref_bound:sourceRefBound,
  deployment_receipt_bound:deploymentBound,
  release_lineage_state:sourceRefBound&&deploymentBound?'RECEIPTS_REPORTED_NOT_INDEPENDENTLY_VERIFIED':'HOLD_MISSING_DEPLOYMENT_LINEAGE',
  checkout_end_to_end_verified:false,paid_receipt_verified:false,
  financial_action_taken:false,
  limits:['200 HTML or catalog match is not a provider paid receipt.',
   'Reported deploy references require separate signature, artifact hash and production attestation validation.',
   'Known 404 exception is temporary monitoring tolerance, never an approved live route.'],
 };
}

export function fabricParityProbeFailureReceipt(error,{now=new Date().toISOString()}={}){
 const causeCode=String(error?.cause?.code||error?.code||'EXTERNAL_PROBE_FAILED');
 const reason=String(error?.message||'external_probe_failed').slice(0,240);
 return {
  schema:'evercraft.audit.fabric-source-to-live-parity.v1',
  observed_at:now,
  ok:false,
  state:'HOLD_EXTERNAL_PROBE_FAILURE',
  findings:['external_parity_probe_failed'],
  error:'external_parity_probe_failed',
  reason,
  cause_code:/^[A-Z0-9_]{3,64}$/.test(causeCode)?causeCode:'EXTERNAL_PROBE_FAILED',
  source_capabilities:null,
  live_mcp_capabilities:null,
  source_only_ids:[],
  live_only_ids:[],
  route_checked_count:0,
  route_ok_count:0,
  known_404_exception_count:0,
  source_release_ref_bound:false,
  deployment_receipt_bound:false,
  release_lineage_state:'HOLD_PUBLIC_ORIGIN_UNVERIFIED',
  checkout_end_to_end_verified:false,
  paid_receipt_verified:false,
  financial_action_taken:false,
  limits:['A failed external fetch cannot prove the origin is down, only that this vantage point did not verify it.',
   'No public capability route, device, deployment, or payment is admitted based on this receipt.'],
 };
}

const timeout=ms=>AbortSignal.timeout(ms);
async function getJson(url){
 const r=await fetch(url,{headers:{'accept':'application/json','user-agent':'Evercraft-ReadOnly-ParityCanary/1.0'},signal:timeout(15000)});
 if(!r.ok)throw new Error('read_http_'+r.status+':'+url);
 return r.json();
}
async function getMcpList(){
 const r=await fetch(ORIGIN+'/mcp',{
  method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'Evercraft-ReadOnly-ParityCanary/1.0'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_evercraft_capabilities',arguments:{limit:100}}}),
  signal:timeout(16000),
 });
 if(!r.ok)throw new Error('mcp_http_'+r.status);
 const body=await r.json();
 const out=body?.result?.structuredContent;
 if(body?.error||body?.result?.isError||out?.transactional!==false||out?.external_action_taken!==false||
   !Array.isArray(out.capabilities))throw new Error('mcp_read_only_catalog_unverified');
 return out.capabilities.map(c=>c.public_id);
}
async function observe(row){
 try{
  const requested=new URL(row.public_url);
  if(requested.protocol!=='https:')return {public_id:row.public_id,url:row.public_url,status:'invalid_https'};
  const r=await fetch(row.public_url,{method:'GET',headers:{'accept':'text/html','user-agent':'Evercraft-ReadOnly-ParityCanary/1.0'},signal:timeout(13000)});
  const body=(await r.text()).slice(0,100000);
  const strictPath=requested.hostname==='fabric.systemiacommandcenters.com'&&requested.pathname===('/capabilities/'+row.public_id);
  return {public_id:row.public_id,url:row.public_url,status:r.status,
    html_identity_verified:strictPath?body.toLowerCase().includes(row.public_id.toLowerCase()):null,
    content_type:r.headers.get('content-type')||null};
 }catch(e){
  return {public_id:row.public_id,url:row.public_url,status:'network_error',reason:e?.name||'unknown'};
 }
}
async function inBatches(items,n,fn){
 const out=[];for(let i=0;i<items.length;i+=n)out.push(...await Promise.all(items.slice(i,i+n).map(fn)));return out;
}
export async function collectLiveFabricParity({now=new Date().toISOString()}={}){
 const source=read('public/chum/capabilities.json');
 const exceptions=read('audits/fabric-parity-known-exceptions-2026-10-15.json');
 const [health,liveIds,observations]=await Promise.all([
  getJson(ORIGIN+'/health'),getMcpList(),inBatches(source.capabilities,7,observe)
 ]);
 return assessFabricParity({source,health,liveIds,observations,exceptions,now});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await collectLiveFabricParity();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ok)process.exitCode=1;
 }catch(e){
  const receipt=fabricParityProbeFailureReceipt(e);
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  console.error(JSON.stringify({
    ok:false,error:receipt.error,reason:receipt.reason,cause_code:receipt.cause_code
  }));
  process.exitCode=1;
 }
}
