#!/usr/bin/env node
// Cold-client canary for owned MCP remote URLs already observed in the Official Registry.
// Sends initialize and tools/list only. Never calls tools, creates checkout or credentials.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const OWNED_HOST='fabric.systemiacommandcenters.com';
export function parseRpcMessages(raw){
  const payloads=[raw,...String(raw).split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim())];
  return payloads.flatMap(x=>{try{const j=JSON.parse(x);return Array.isArray(j)?j:[j];}catch{return [];}})
}
function publicOwned(url){
  try{const u=new URL(url);return u.protocol==='https:'&&u.hostname===OWNED_HOST&&/^\/mcp(?:\/|$)/.test(u.pathname)&&!u.username&&!u.password&&!u.search;}catch{return false;}
}
async function rpc(fetchFn,url,payload,session){
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),12000);
  const headers={'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-03-26','user-agent':'Evercraft-Distribution-ColdClient/1.0'};
  if(session)headers['mcp-session-id']=session;
  try{
    const res=await fetchFn(url,{method:'POST',redirect:'error',headers,signal:controller.signal,body:JSON.stringify(payload)});
    const body=(await res.text()).slice(0,160000);
    return {status:res.status,ok:res.ok,messages:parseRpcMessages(body),session:res.headers.get('mcp-session-id')};
  }finally{clearTimeout(timeout);}
}
export async function checkOwnedMcp({receipt,fetchFn=fetch}){
  if(!receipt || !Array.isArray(receipt.servers)||!['OBSERVED','OBSERVED_WITH_FINDINGS'].includes(receipt.state))throw Error('verified_registry_observation_required');
  const candidates=receipt.servers.flatMap(s=>(s.remotes||[]).filter(r=>publicOwned(r.url)).map(r=>({name:s.name,url:r.url})));
  const unique=[...new Map(candidates.map(x=>[x.url,x])).values()].slice(0,8);
  const results=[];
  for(const candidate of unique){
    try{
      const init=await rpc(fetchFn,candidate.url,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'evercraft-distribution-canary',version:'1.0.0'}}});
      const initValid=init.ok&&init.messages.some(x=>x.result?.serverInfo?.name);
      let tools={ok:false,status:null,messages:[]};
      if(initValid)tools=await rpc(fetchFn,candidate.url,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}},init.session);
      const names=[...new Set(tools.messages.flatMap(x=>Array.isArray(x.result?.tools)?x.result.tools.map(t=>t.name).filter(t=>typeof t==='string'):[]))].sort();
      results.push({...candidate,init_status:init.status,initialize_valid:initValid,tools_status:tools.status,
        tools_list_valid:tools.ok&&names.length>0,tool_count:names.length,tool_names:names});
    }catch(e){results.push({...candidate,initialize_valid:false,tools_list_valid:false,error:e?.name==='AbortError'?'timeout':'request_failed'});}
  }
  return {schema:'evercraft.distribution.owned-mcp-cold-canary.v1',checked_at:new Date().toISOString(),target_count:unique.length,
    verified_count:results.filter(x=>x.initialize_valid&&x.tools_list_valid).length,
    results,truth_boundary:'Unauthenticated initialize+tools/list only; no tool call, buyer, checkout or revenue proof'};
}
const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
  const input=process.argv[2]||'/tmp/evercraft-registry-inspection.json';
  const output=process.argv[3]||'/tmp/evercraft-owned-mcp-cold-canary.json';
  const receipt=await checkOwnedMcp({receipt:JSON.parse(readFileSync(input,'utf8'))});
  writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({receipt_path:output,target_count:receipt.target_count,verified_count:receipt.verified_count,results:receipt.results.map(x=>({name:x.name,url:x.url,initialize_valid:x.initialize_valid,tools_list_valid:x.tools_list_valid,tool_count:x.tool_count,error:x.error}))},null,2));
  if(receipt.target_count===0||receipt.verified_count!==receipt.target_count)process.exitCode=1;
}
