#!/usr/bin/env node
/**
 * Public-safe CI evidence from the real, temporary owned Fetch MCP runtime.
 * NOT proof of a persistent production service.
 * No tokens, cookies, query strings, internal topology or secrets in artifact.
 */
import {startOwnedWebFetchMcp} from './server.mjs';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const target='https://example.com/';
const out=resolve(process.env.EVERCRAFT_WEB_DEMO_RECEIPT_PATH||'artifacts/evercraft-web-ci-fetch-receipt.json');
const token=randomBytes(32).toString('hex');
const report={
  schema:'evercraft.web.fetch.ci-demonstration.v1',
  context:'ephemeral_github_runner_not_production',
  endpoint_state:'loopback_only_temporary',
  customer_access_verified:false,
  browser_available:false,
  search_available:false,
  source_url:target,
  checked_at:new Date().toISOString(),
  tests:{},
  public_content:null,
};
const send = async (base,id,method,params)=>{
  const response=await fetch(base+'/mcp',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
    signal:AbortSignal.timeout(20000),
  });
  if(response.status!==200) throw Error('mcp_http_'+response.status);
  const data=await response.json();
  if(data.error)throw Error('jsonrpc_'+data.error.code);
  return data.result;
};
let service;
try {
  service=await startOwnedWebFetchMcp({token,maxConcurrent:1,maxRequestsPerMinute:10});
  report.tests.health_local_only=service.url.startsWith('http://127.0.0.1:');
  const init=await send(service.url,1,'initialize',{protocolVersion:'2025-03-26'});
  report.tests.initialized=init.serverInfo?.name==='evercraft-web-owned-fetch-candidate';
  const catalog=await send(service.url,2,'tools/list',{});
  report.tests.fetch_discoverable=catalog.tools?.some(t=>t.name==='fetch_url')===true;
  report.tests.browser_not_advertised=!catalog.tools?.some(t=>/browser|search|agent/i.test(t.name));
  const fetched=await send(service.url,3,'tools/call',{name:'fetch_url',arguments:{url:target}});
  const row=fetched.structuredContent;
  report.tests.actual_https_fetch=fetched.isError!==true&&row?.ok===true&&row?.status===200&&row?.source_url_redacted===target;
  report.tests.receipt_hashes=/^sha256:[a-f0-9]{64}$/.test(row?.content_sha256||'')&&
    /^sha256:[a-f0-9]{64}$/.test(row?.evidence_receipt_sha256||'');
  report.public_content={
    source_url_redacted:row?.source_url_redacted,
    title:String(row?.title||'').slice(0,100),
    excerpt:String(row?.text||'').slice(0,280),
    retrieved_at:row?.retrieved_at||null,
    http_status:row?.status,
    content_sha256:row?.content_sha256,
    evidence_receipt_sha256:row?.evidence_receipt_sha256,
  };
  const denied=await send(service.url,4,'tools/call',{
    name:'fetch_url',arguments:{url:'http://127.0.0.1/latest/meta-data'},
  });
  report.tests.private_target_denied=denied.isError===true&&
    /private_or_reserved_target/.test(JSON.stringify(denied));
  if(Object.values(report.tests).some(v=>v!==true))throw Error('acceptance_check_failed');
  report.ci_demonstration_passed=true;
} catch(err) {
  report.ci_demonstration_passed=false;
  report.error=String(err?.message||err).slice(0,160);
  process.exitCode=1;
} finally {
  await service?.close();
  mkdirSync(dirname(out),{recursive:true});
  writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({
    artifact:out,
    pass:report.ci_demonstration_passed,
    conditions:report.tests,
    context:report.context,
    customer_access_verified:report.customer_access_verified,
    error:report.error||null,
  },null,2));
}
