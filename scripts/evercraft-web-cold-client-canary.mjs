#!/usr/bin/env node
/* Evercraft Web cold-client acceptance; external owned HTTPS only.
 * EVERCRAFT_WEB_PUBLIC_MCP_URL=https://owned-host.example/mcp [EVERCRAFT_WEB_TEST_TOKEN=...] node scripts/evercraft-web-cold-client-canary.mjs
 * This canary does not publish, pay, log secrets, or authorize browser actions.
 */
import {writeFileSync} from 'node:fs';
const endpoint=process.env.EVERCRAFT_WEB_PUBLIC_MCP_URL||'';
const token=process.env.EVERCRAFT_WEB_TEST_TOKEN||'';
const output=process.env.EVERCRAFT_WEB_CANARY_OUTPUT||'evercraft-web-cold-client-result.json';
const report={schema:'evercraft.web.fetch.cold_client.v1',checked_at:new Date().toISOString(),
  mode:'external_owned_https',endpoint:null,checks:[],production_fetch_accepted:false};
function assert(name,condition,explanation){
  report.checks.push({name,passed:Boolean(condition)});
  if(!condition)throw Error(name+': '+explanation);
}
function parse(text){
  try{return JSON.parse(text)}catch{}
  for(const row of text.split(/\r?\n/))if(row.startsWith('data:')){
    try{return JSON.parse(row.slice(5).trim())}catch{}
  }
  throw Error('Invalid JSON-RPC response');
}
async function rpc(id,method,params){
  const headers={'content-type':'application/json',accept:'application/json, text/event-stream'};
  if(token)headers.authorization='Bearer '+token;
  const response=await fetch(report.endpoint,{method:'POST',headers,
    signal:AbortSignal.timeout(17000),
    body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  const body=(await response.text()).slice(0,1048576);
  if(response.status!==200)throw Error('HTTP '+response.status+' for '+method);
  const message=parse(body);
  if(message.error)throw Error('JSON-RPC error '+message.error.code);
  return message;
}
let rc=1;
try{
  const u=new URL(endpoint);
  assert('owned_public_https',u.protocol==='https:' &&
    !/(^|\.)base44\.app$/i.test(u.hostname) &&
    !/(^localhost$|\.localhost$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname),
    'requires deployed HTTPS, not a local or legacy provider address');
  assert('no_credentials_in_url',!u.username&&!u.password&&!u.search&&!u.hash,'no credentials or URL tokens');
  report.endpoint=u.origin+u.pathname;
  const init=await rpc(1,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'evercraft-external-canary',version:'1.0.0'}});
  assert('initialize',!!init.result?.serverInfo?.name,'missing serverInfo');
  const listed=await rpc(2,'tools/list',{});
  assert('fetch_tool',listed.result?.tools?.some(x=>x.name==='fetch_url'),'missing fetch_url tool');
  const fetched=await rpc(3,'tools/call',{name:'fetch_url',arguments:{url:'https://example.com/'}});
  const result=fetched.result?.structuredContent||{};
  assert('public_content',fetched.result?.isError!==true&&result.ok===true&&result.status===200 &&
    /Example Domain|domain is for use in documentation examples/i.test(JSON.stringify(fetched.result)),
    'public test did not fetch expected contents');
  assert('receipt_hashes',result.source_url_redacted==='https://example.com/' &&
    /^sha256:[a-f0-9]{64}$/.test(result.content_sha256||'') &&
    /^sha256:[a-f0-9]{64}$/.test(result.evidence_receipt_sha256||''),
    'must return source plus verifiable receipt fields');
  const denied=await rpc(4,'tools/call',{name:'fetch_url',arguments:{url:'http://127.0.0.1/latest/meta-data'}});
  assert('private_ip_denied',denied.result?.isError===true&&
    /private_or_reserved_target/.test(JSON.stringify(denied.result)), 'SSRF denial missing');
  report.production_fetch_accepted=true;rc=0;
}catch(e){report.failure=String(e.message||e).slice(0,220)}
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({evidence_file:output,pass:report.production_fetch_accepted,checks:report.checks,failure:report.failure||null},null,2));
process.exitCode=rc;
