#!/usr/bin/env node
/**
 * External, read-only, non-transactional Fabric MCP canary.
 * Network success is a live tool-use receipt, never agent selection or payment proof.
 */
import fs from 'node:fs';
import path from 'node:path';
import { verifiedReadonlyUniversalMcp } from '../systemia/chum/verified-universal-mcp.mjs';

const OUTPUT = 'artifacts/chum/owned-fabric-readonly-mcp-canary.json';
const distribution = JSON.parse(fs.readFileSync('distribution/machine-commerce-distribution.json','utf8'));
const endpoint = verifiedReadonlyUniversalMcp(distribution);
const receipt = {
  schema: 'evercraft.fabric.external-readonly-mcp-canary.v1',
  checked_at: new Date().toISOString(),
  origin: endpoint || null,
  status: 'held',
  discovery_only: true,
  agent_selected_evercraft: false,
  checkout_created: false,
  payment_attempted: false,
  payment_verified: false,
  checks: {},
};
function persist(){
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
function extract(text){
  try{return JSON.parse(text);}catch{}
  for(const line of String(text).split(/\r?\n/)){
    if(!line.startsWith('data:')) continue;
    try {
      const parsed=JSON.parse(line.slice(5).trim());
      if(parsed && (parsed.result!==undefined || parsed.error!==undefined)) return parsed;
    } catch{}
  }
  throw new Error('invalid_mcp_json_or_sse');
}
async function rpc(id,method,params){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        accept:'application/json, text/event-stream',
        'user-agent':'Evercraft-External-ReadOnly-MCP-Canary/1.0'
      },
      body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
      redirect:'error',
      signal:controller.signal
    });
    const raw=await response.text();
    if(!response.ok) throw new Error('mcp_http_'+response.status+'_'+method);
    const body=extract(raw);
    if(body.error) throw new Error('mcp_rpc_error_'+method);
    if(!body.result) throw new Error('mcp_missing_result_'+method);
    return body.result;
  } finally {clearTimeout(timer);}
}

try{
  if(!endpoint) throw new Error('no_receipted_owned_readonly_mcp');
  const initialized=await rpc(1,'initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'evercraft-external-readonly-canary',version:'1.0'}
  });
  if(!initialized.serverInfo?.name) throw new Error('server_info_missing');
  receipt.checks.initialize={pass:true,server_name:String(initialized.serverInfo.name).slice(0,100)};
  const listed=await rpc(2,'tools/list',{});
  const tools=Array.isArray(listed.tools)?listed.tools:[];
  const listing=tools.find(x=>x?.name==='list_evercraft_capabilities');
  if(!listing) throw new Error('public_list_tool_absent');
  receipt.checks.tools_list={pass:true,count:tools.length,expected_public_tool_present:true};
  const response=await rpc(3,'tools/call',{name:'list_evercraft_capabilities',arguments:{limit:1}});
  if(response.isError===true) throw new Error('public_readonly_call_error');
  const content=Array.isArray(response.content)?response.content:[];
  if(!content.length && !response.structuredContent) throw new Error('public_readonly_result_empty');
  receipt.checks.public_tool_call={pass:true,has_content:Boolean(content.length||response.structuredContent)};
  // Exercise a real buyer problem against the live public matcher.
  // This is proof of tool-level retrieval, NOT model-originated selection.
  const matched=await rpc(4,'tools/call',{
    name:'match_evercraft_capability',
    arguments:{
      intent:'We operate an IBM i 7.4 system with RPG jobs and vendor integrations. Standard support changed and we need dependency, compatibility and rollback risks before upgrading.',
      limit:5
    }
  });
  if(matched.isError===true) throw new Error('public_match_tool_error');
  const candidates=matched.structuredContent?.matches||[];
  const ibmi=candidates.find(x=>x.public_id==='ibmi-rescue-v1');
  receipt.checks.ibm_i_74_semantic_match={
    pass:Boolean(ibmi),
    match_count:candidates.length,
    matching_public_id:ibmi?.public_id||null,
    rank:ibmi?candidates.findIndex(x=>x.public_id==='ibmi-rescue-v1')+1:null,
    selection_authority:'server_side_matching_only'
  };
  if(!ibmi) throw new Error('ibmi_74_not_found_in_live_public_matcher');

  const options=await rpc(5,'tools/call',{
    name:'get_evercraft_connection_options',
    arguments:{public_id:'ibmi-rescue-v1'}
  });
  if(options.isError===true||options.structuredContent?.public_id!=='ibmi-rescue-v1'){
    throw new Error('ibmi_74_public_connection_options_missing');
  }
  receipt.checks.ibm_i_public_connection_options={
    pass:true,
    connection_types:(options.structuredContent?.connections||[]).map(x=>x.type).slice(0,12),
    transactional:false,
    paid_execution_not_verified:true
  };
  receipt.status='pass';
}catch(error){
  receipt.status='fail';
  receipt.error=String(error?.message||error).slice(0,250);
} finally {
  persist();
}
if(receipt.status!=='pass') process.exitCode=1;
