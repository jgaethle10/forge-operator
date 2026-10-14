#!/usr/bin/env node
// Safe read-only external ingress check. This is not a consumer-agent selection
// benchmark, a payment test, or evidence of OpenAI app installation.
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const MCP_PATH='/mcp';
const url=ORIGIN+MCP_PATH;
const expected=[
  'match_evercraft_capability',
  'list_evercraft_capabilities',
  'get_evercraft_connection_options',
];
const MAX_RESPONSE_BYTES=1024*1024;
const receipt={
  schema:'evercraft.fabric.external-discovery-probe.v1',
  observed_at:new Date().toISOString(),
  endpoint:url,
  source:'independent_github_runner',
  verified:false,
  tests:{},
  failed_stage:null,
  failed_reason:null,
  secrets_collected:false,
  payment_or_mutation_performed:false,
};
let sessionId=null;
let nextId=1;
let ibmiPublicId=null;

function parseJsonOrSse(raw,contentType) {
  if(contentType.includes('text/event-stream')) {
    const events=raw.split(/\r?\n\r?\n/);
    for(const event of events){
      const data=event.split(/\r?\n/).filter(l=>l.startsWith('data:'))
        .map(l=>l.slice(5).trim()).join('\n');
      if(!data||data==='[DONE]')continue;
      try{
        const packet=JSON.parse(data);
        if(packet.jsonrpc==='2.0')return packet;
      }catch{}
    }
    throw new Error('mcp_sse_jsonrpc_packet_missing');
  }
  return JSON.parse(raw);
}
async function rpc(method,params={}) {
  const id=nextId++;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const headers={
      'content-type':'application/json',
      'accept':'application/json, text/event-stream',
      'mcp-protocol-version':'2025-03-26',
      'user-agent':'EvercraftExternalDiscoveryCanary/1.0',
    };
    if(sessionId)headers['mcp-session-id']=sessionId;
    const response=await fetch(url,{
      method:'POST',redirect:'manual',headers,
      body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
      signal:controller.signal,
    });
    if(response.status>=300&&response.status<400)throw new Error('mcp_redirect_forbidden_'+response.status);
    if(!response.ok)throw new Error('mcp_http_'+response.status);
    const contentType=(response.headers.get('content-type')||'').toLowerCase();
    if(!/application\/json|text\/event-stream/.test(contentType)){
      throw new Error('mcp_unexpected_content_type');
    }
    const raw=await response.text();
    if(Buffer.byteLength(raw)>MAX_RESPONSE_BYTES)throw new Error('mcp_response_oversized');
    const payload=parseJsonOrSse(raw,contentType);
    if(payload.id!==id)throw new Error('mcp_jsonrpc_id_mismatch');
    if(payload.error||!payload.result)throw new Error('mcp_rpc_error');
    const session=response.headers.get('mcp-session-id');
    if(session)sessionId=session;
    return payload.result;
  }finally{clearTimeout(timer);}
}
async function stage(name,fn) {
  try {
    const details=await fn();
    receipt.tests[name]={passed:true,...details};
  }catch(error) {
    receipt.tests[name]={passed:false};
    receipt.failed_stage=name;
    receipt.failed_reason=String(error?.message||error).slice(0,140);
    throw error;
  }
}
try{
  await stage('initialize',async()=>{
    const result=await rpc('initialize',{
      protocolVersion:'2025-03-26',
      capabilities:{},
      clientInfo:{name:'evercraft-external-discovery-probe',version:'1.0.0'},
    });
    if(result?.serverInfo?.name!=='evercraft-fabric')throw new Error('wrong_mcp_server_identity');
    return {server_name:result.serverInfo.name,protocol_version:result.protocolVersion||null};
  });
  await stage('tools_list',async()=>{
    const result=await rpc('tools/list');
    const tools=Array.isArray(result?.tools)?result.tools:[];
    const names=tools.map(t=>t.name);
    const missing=expected.filter(n=>!names.includes(n));
    if(missing.length)throw new Error('missing_read_only_fabric_tools');
    const advertised=tools.filter(t=>expected.includes(t.name));
    if(advertised.some(t=>t.annotations?.readOnlyHint!==true||t.annotations?.destructiveHint===true)){
      throw new Error('unsafe_discovery_tool_annotation');
    }
    return {expected_tools:expected,enumerated_tool_count:tools.length};
  });
  await stage('brand_blind_match',async()=>{
    const result=await rpc('tools/call',{name:'match_evercraft_capability',arguments:{
      intent:'Our company operates IBM i 7.4 and needs an evidence-based support-transition and upgrade risk assessment before changing production.',
      limit:5,
    }});
    if(result.isError===true)throw new Error('mcp_match_tool_error');
    const data=result.structuredContent||{};
    if(data.transactional===true||data.external_action_taken===true||data.payment_created===true){
      throw new Error('unexpected_transactional_result');
    }
    if(!Array.isArray(data.matches))throw new Error('mcp_match_structured_matches_missing');
    const match=data.matches.find(m=>/ibm.?i|ibmi|as.?400/i.test(
      String(m.public_id||'')+' '+String(m.name||'')
    ));
    if(!match?.public_id)throw new Error('ibmi_specialist_not_matched');
    ibmiPublicId=String(match.public_id);
    return {matches_count:data.matches.length,matched_public_id:ibmiPublicId,read_only:true};
  });
  await stage('connection_options',async()=>{
    if(!ibmiPublicId)throw new Error('matching_specialist_id_missing');
    const result=await rpc('tools/call',{
      name:'get_evercraft_connection_options',
      arguments:{public_id:ibmiPublicId},
    });
    if(result.isError===true)throw new Error('mcp_connection_options_tool_error');
    const data=result.structuredContent||{};
    if(data.public_id!==ibmiPublicId||!Array.isArray(data.connections)){
      throw new Error('mcp_connection_options_schema_invalid');
    }
    if(data.transactional===true||data.external_action_taken===true){
      throw new Error('mcp_connection_options_exceeded_read_authority');
    }
    const stale=data.connections.filter(c=>/\.base44\.app\/|\/\/base44\.app\//i.test(String(c.url||'')));
    if(stale.length)throw new Error('mcp_connection_options_retired_provider_regression');
    return {public_id:ibmiPublicId,connections_count:data.connections.length,read_only:true};
  });
  receipt.verified=true;
}catch{}
finally{
  const file=process.env.EVERCRAFT_PROBE_RECEIPT||'artifacts/fabric-external-discovery-probe.json';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  if(!receipt.verified)process.exitCode=1;
}
