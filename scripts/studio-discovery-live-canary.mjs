#!/usr/bin/env node
// External read-only Studio discovery proof. MCP tools/call is used ONLY for
// capability matching and connection options; never inquiries, payments, sends.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ORIGIN='https://fabric.systemiacommandcenters.com';
const ID='fallen-studios-founding-commercial-v1';
const BUYER_URL='https://jgaethle10.github.io/forge-operator/commercial-studio/';
const INTENT='I want a $50 narrated 30-second commercial for my small business using my photos and logo';
const MAX_BYTES=256000;
async function publicJson(fetchImpl,url,options={}){
  const response=await fetchImpl(url,{
    redirect:'error',cache:'no-store',credentials:'omit',
    ...options,
    headers:{accept:'application/json',...(options.headers||{})},
    signal:AbortSignal.timeout(12000)
  });
  if(response.status!==200)throw Error('unexpected_http_status');
  const len=response.headers.get('content-length');
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_BYTES))throw Error('oversize_response');
  if(!response.body?.getReader)throw Error('stream_unavailable');
  const reader=response.body.getReader(),parts=[];let bytes=0;
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES)throw Error('oversize_response');
      parts.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(!body||typeof body!=='object')throw Error('invalid_body');
  return body;
}
async function rpc(fetchImpl,id,name,args){
  const data=await publicJson(fetchImpl,ORIGIN+'/mcp',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',
      params:{name,arguments:args}})
  });
  if(data.error)throw Error('mcp_error');
  const value=data.result?.structuredContent;
  if(value?.ok!==true||value.transactional!==false||
      value.external_action_taken!==false)throw Error('unsafe_or_unknown_mcp_contract');
  return value;
}
export async function observeStudioDiscovery({fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
  const result={
    schema:'evercraft.studio.live-discovery-release-canary.v1',
    observed_at:now(),origin:ORIGIN,capability:ID,
    state:'NOT_YET_VERIFIED',stage:'UNOBSERVED',
    source_release_ref:null,capability_count:null,
    matched_ids:[],matches_as_first:false,
    exact_first_party_inquiry:false,checkout_available:false,
    paid_order_verified:false,buyer_inquiry_submitted:false,
    customer_contacted:false,media_transferred:false,findings:[]
  };
  try{
    const h=await publicJson(fetchImpl,ORIGIN+'/health');
    const ref=String(h.source_release_ref||'');
    if(/^[0-9a-f]{40}$/i.test(ref))result.source_release_ref=ref;
    if(Number.isSafeInteger(h.capability_count))result.capability_count=h.capability_count;
  }catch{result.findings.push('PUBLIC_HEALTH_UNOBSERVED');}
  try{
    const found=await rpc(fetchImpl,1,'match_evercraft_capability',
      {intent:INTENT,limit:5});
    if(!Array.isArray(found.matches))throw Error('matches_unavailable');
    result.matched_ids=found.matches.slice(0,5).map(x=>String(x.public_id||''));
    result.matches_as_first=result.matched_ids[0]===ID;
  }catch{
    result.stage='MCP_MATCH_UNAVAILABLE';
    result.findings.push('READ_ONLY_MCP_MATCH_UNOBSERVED');return result;
  }
  try{
    const detail=await rpc(fetchImpl,2,'get_evercraft_connection_options',
      {public_id:ID});
    result.exact_first_party_inquiry=detail.public_id===ID&&
      Array.isArray(detail.connections)&&
      detail.connections.some(x=>x.type==='website'&&x.url===BUYER_URL);
    result.checkout_available=detail.buyer_checkout_available===true;
    if(!result.exact_first_party_inquiry||
       detail.human_offer_url!==null||
       detail.buyer_checkout_available!==false||
       detail.state!=='human_project_brief_only'){
      result.stage='CATALOG_CONNECTION_MISMATCH';
      result.findings.push('COMMERCIAL_CONNECTION_OR_AUTHORITY_MISMATCH');
      return result;
    }
  }catch{
    result.stage='CAPABILITY_MISSING_OR_DETAIL_UNAVAILABLE';
    result.findings.push('FALLEN_STUDIOS_CAPABILITY_NOT_OBSERVED');return result;
  }
  if(!result.matches_as_first){
    result.stage='BUYER_MATCH_RANKING_MISMATCH';
    result.findings.push('FALLEN_STUDIOS_NOT_TOP_BUYER_MATCH');
    return result;
  }
  result.stage='READ_ONLY_DISCOVERY_CONFIRMED';
  result.state='LIVE_DISCOVERY_VERIFIED';
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const receipt=await observeStudioDiscovery();
  const filename=process.env.STUDIO_DISCOVERY_RECEIPT||
    '/tmp/evercraft-studio-live-discovery.json';
  fs.writeFileSync(filename,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({receipt_path:filename,...receipt},null,2));
  if(process.argv.includes('--gate')&&receipt.state!=='LIVE_DISCOVERY_VERIFIED')process.exitCode=1;
}
