#!/usr/bin/env node
/**
 * Independent public Fabric ingress monitor.
 *
 * Intentionally does not check editorial freshness, checkout, publishing,
 * provisioning, or any privileged tool. A green receipt means only that the
 * production HTTPS/MCP/attestation path answered from an external witness.
 * The full operator edge canary remains a separate release gate.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';
import { verifyNodeAttestation } from '../systemia/compute/device-identity.mjs';

const args=process.argv.slice(2);
const index=args.indexOf('--origin');
const input=index>=0?args[index+1]:'https://fabric.systemiacommandcenters.com';
if(!input) throw new Error('origin_required');
const url=new URL(input);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
  (url.pathname!==''&&url.pathname!=='/')||url.port||
  /(^|\.)base44\.app$/i.test(url.hostname)) throw new Error('public_https_origin_required');
const origin=url.origin;
const checks={};
const receipt={
  schema:'evercraft.fabric.public-ingress-monitor.v1',
  origin,verified:false,scope:'ingress_identity_and_read_only_mcp',
  journal_edition_verified:false,commerce_verified:false,
  observed_at:new Date().toISOString(),checks
};
let stage='public_dns';

function timeoutFetch(path,options={}){
  return fetch(origin+path,{
    ...options,redirect:'error',signal:AbortSignal.timeout(12000),
  });
}
async function json(path,options={}){
  const response=await timeoutFetch(path,{
    ...options,
    headers:{
      'accept':'application/json',
      'user-agent':'evercraft-ingress-monitor/1.0',
      ...(options.headers||{}),
    },
  });
  if(!response.ok) throw new Error('http_'+response.status+':'+path);
  const body=await response.json().catch(()=>null);
  if(!body) throw new Error('invalid_json:'+path);
  return body;
}
async function rpc(id,method,params={}){
  const body=await json('/mcp',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  });
  if(body.error||!body.result) throw new Error('rpc_failed:'+method);
  return body.result;
}
async function tcp(host,port){
  return new Promise((resolve,reject)=>{
    const socket=net.connect({host,port});
    const fail=e=>{socket.destroy();reject(e)};
    socket.setTimeout(6500,()=>fail(new Error('tcp_timeout:'+port)));
    socket.once('error',fail);
    socket.once('connect',()=>{socket.destroy();resolve()});
  });
}
async function trustedTls(host){
  return new Promise((resolve,reject)=>{
    const socket=tls.connect({host,port:443,servername:host,rejectUnauthorized:true},()=>{
      const cert=socket.getPeerCertificate();
      const expiry=Date.parse(cert.valid_to||'');
      if(!socket.authorized||!Number.isFinite(expiry)||expiry<=Date.now()){
        socket.destroy();reject(new Error('trusted_tls_invalid'));return;
      }
      socket.end();resolve();
    });
    socket.setTimeout(8000,()=>socket.destroy(new Error('tls_timeout')));
    socket.once('error',reject);
  });
}
try{
  const addresses=await dns.resolve4(url.hostname);
  if(!addresses.length) throw new Error('dns_no_ipv4');
  checks.public_dns=true;

  stage='public_tcp_80_443';
  await Promise.all([tcp(url.hostname,80),tcp(url.hostname,443)]);
  checks.public_tcp_80=true;checks.public_tcp_443=true;

  stage='trusted_tls';
  await trustedTls(url.hostname);
  checks.trusted_tls=true;

  stage='runtime_health';
  const health=await json('/health');
  if(health.ok!==true||health.edge_attestation_supported!==true){
    throw new Error('fabric_health_or_edge_attestation_unavailable');
  }
  checks.runtime_health=true;

  stage='sse_transport';
  const sse=await timeoutFetch('/mcp',{
    method:'GET',
    headers:{accept:'text/event-stream','user-agent':'Evercraft-ChatGPT-SSE-Canary/1.0'},
  });
  if(!sse.ok) throw new Error('mcp_sse_http_'+sse.status);
  if(!/^text\/event-stream/i.test(sse.headers.get('content-type')||'')){
    throw new Error('mcp_sse_invalid_content_type');
  }
  const sseText=await sse.text();
  if(!sseText.includes('evercraft-fabric')) throw new Error('mcp_sse_identity_missing');
  checks.sse_transport=true;

  stage='device_attestation';
  const nonce='ingress_'+randomBytes(18).toString('hex');
  const response=await json('/.well-known/evercraft-edge-attestation',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({nonce}),
  });
  if(response.ok!==true||!response.attestation) throw new Error('device_attestation_missing');
  const verified=verifyNodeAttestation({
    attestation:response.attestation,
    expectedNonce:nonce,maxAgeMs:60000,now:new Date()
  });
  if(verified.ok!==true||verified.field_claim!==false){
    throw new Error('device_attestation_invalid');
  }
  checks.device_attestation=true;

  stage='mcp_initialize';
  const initialized=await rpc(1,'initialize',{
    protocolVersion:'2025-03-26',capabilities:{},
    clientInfo:{name:'evercraft-public-ingress-monitor',version:'1'}
  });
  if(initialized.serverInfo?.name!=='evercraft-fabric') throw new Error('mcp_server_identity_invalid');
  checks.mcp_initialize=true;

  stage='mcp_tools_list';
  const listed=await rpc(2,'tools/list',{});
  const tools=listed.tools||[];
  for(const name of ['match_evercraft_capability','list_evercraft_capabilities','get_evercraft_connection_options']){
    const tool=tools.find(x=>x.name===name);
    if(!tool||tool.annotations?.readOnlyHint!==true||tool.annotations?.destructiveHint!==false){
      throw new Error('mcp_read_only_tool_contract_invalid:'+name);
    }
  }
  checks.mcp_tools_list=true;

  stage='mcp_read_only_roundtrip';
  const result=await rpc(3,'tools/call',{
    name:'match_evercraft_capability',
    arguments:{intent:'Find read-only Evercraft software capabilities for a small business',limit:2}
  });
  const content=result.structuredContent;
  if(result.isError!==false||content?.external_action_taken!==false||
     content?.transactional!==false||!Array.isArray(content?.matches)){
    throw new Error('mcp_read_only_roundtrip_invalid');
  }
  checks.mcp_read_only_roundtrip=true;

  receipt.verified=true;
  receipt.state='public_ingress_and_read_only_mcp_verified';
  console.log(JSON.stringify(receipt,null,2));
}catch(error){
  receipt.state='failed';
  receipt.failure_stage=stage;
  receipt.error=String(error?.message||error).slice(0,320);
  console.error(JSON.stringify(receipt,null,2));
  process.exitCode=1;
}
