#!/usr/bin/env node
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { createHash, randomBytes } from 'node:crypto';
import { verifyNodeAttestation } from '../systemia/compute/device-identity.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');
const clean=(v)=>String(v??'').trim();
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const origin=clean(arg('--origin','https://fabric.systemiacommandcenters.com')).replace(/\/+$/,'');
const url=new URL(origin);
if(url.protocol!=='https:') throw new Error('operator_public_edge_requires_https');
if(/(^|\.)base44\.app$/i.test(url.hostname)) throw new Error('operator_public_edge_must_not_use_base44');
if(url.pathname!=='/'&&url.pathname!=='') throw new Error('origin_must_not_include_path');

async function inspectTls(hostname){
  return await new Promise((resolve,reject)=>{
    const socket=tls.connect({
      host:hostname,
      port:443,
      servername:hostname,
      rejectUnauthorized:true,
    },()=>{
      try{
        const cert=socket.getPeerCertificate(true);
        if(!cert||!cert.fingerprint256) throw new Error('tls_peer_certificate_unavailable');
        const validTo=Date.parse(cert.valid_to||'');
        if(!Number.isFinite(validTo)||validTo<=Date.now()) throw new Error('tls_certificate_expired_or_unreadable');
        resolve({
          authorized:socket.authorized===true,
          authorization_error:socket.authorizationError||null,
          fingerprint256:cert.fingerprint256,
          subject:cert.subject||null,
          issuer:cert.issuer||null,
          valid_from:cert.valid_from||null,
          valid_to:cert.valid_to||null,
          days_remaining:Number(((validTo-Date.now())/86400000).toFixed(2)),
        });
      }catch(error){reject(error);}
      finally{socket.end();}
    });
    socket.setTimeout(10000,()=>socket.destroy(new Error('tls_probe_timeout')));
    socket.once('error',reject);
  });
}

async function timedFetch(target,options={},timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(target,{...options,signal:controller.signal,redirect:'follow'});}
  finally{clearTimeout(timer);}
}
async function getText(path){
  const r=await timedFetch(origin+path,{headers:{'user-agent':'Evercraft-Operator-Edge-Canary/1.0'}});
  if(!r.ok) throw new Error('http_'+r.status+':'+path);
  return {response:r,text:await r.text()};
}
async function getJson(path){
  const r=await timedFetch(origin+path,{headers:{accept:'application/json','user-agent':'Evercraft-Operator-Edge-Canary/1.0'}});
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body) throw new Error('json_http_'+r.status+':'+path);
  return body;
}
async function rpc(id,method,params={}){
  const r=await timedFetch(origin+'/mcp',{
    method:'POST',
    headers:{'content-type':'application/json','user-agent':'Evercraft-Operator-Edge-Canary/1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body) throw new Error('mcp_http_'+r.status+':'+method);
  if(body.error) throw new Error('mcp_'+method+':'+clean(body.error.message));
  return body.result;
}

const started=new Date().toISOString();
const receipt={
  schema:'evercraft.operator-public-edge.external-canary.v1',
  origin,
  hostname:url.hostname,
  trust_class:'operator_authorized_public_edge',
  physical_field_certified:false,
  founder_login_required:false,
  base44_transport_required:false,
  verified:false,
  checks:{},
  observed_at:started,
};

try{
  const addresses=await dns.resolve4(url.hostname);
  if(!addresses.length) throw new Error('public_dns_no_ipv4');
  receipt.dns_ipv4=addresses;
  receipt.checks.public_dns=true;

  const tlsPeer=await inspectTls(url.hostname);
  if(tlsPeer.authorized!==true) throw new Error('tls_peer_not_authorized');
  receipt.tls=tlsPeer;
  receipt.checks.trusted_tls=true;

  const home=await getText('/');
  if(!/Evercraft Fabric|Bring the problem\./i.test(home.text)) throw new Error('fabric_home_identity_missing');
  receipt.checks.customer_surface=true;

  for(const path of ['/support','/privacy','/terms']){
    const page=await getText(path);
    if(!/text\/html/i.test(page.response.headers.get('content-type')||'')) throw new Error('policy_not_html:'+path);
  }
  receipt.checks.policy_surfaces=true;

  const health=await getJson('/health');
  if(health.ok!==true) throw new Error('health_not_ok');
  if(health.service!=='evercraft-fabric-local') throw new Error('unexpected_fabric_service');
  if(health.server!=='evercraft-fabric') throw new Error('unexpected_fabric_server');
  if(health.read_only!==true||health.transactional!==false||health.external_action_authority!==false){
    throw new Error('fabric_authority_boundary_failed');
  }
  if(health.base44_transport_enabled!==false) throw new Error('base44_transport_enabled');
  if(Number(health.capability_count)<40) throw new Error('capability_count_below_floor');
  receipt.health={
    service:health.service,
    server:health.server,
    version:health.version||null,
    capability_count:Number(health.capability_count),
    read_only:true,
    transactional:false,
    external_action_authority:false,
    base44_transport_enabled:false,
    edge_attestation_supported:health.edge_attestation_supported===true,
  };
  receipt.checks.runtime_health=true;
  if(health.edge_attestation_supported!==true) throw new Error('edge_attestation_not_supported');

  const nonce='edge_'+randomBytes(18).toString('hex');
  const attestationResponse=await timedFetch(origin+'/.well-known/evercraft-edge-attestation',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json','user-agent':'Evercraft-Operator-Edge-Canary/1.0'},
    body:JSON.stringify({nonce}),
  },10000);
  const attestationBody=await attestationResponse.json().catch(()=>null);
  if(!attestationResponse.ok||attestationBody?.ok!==true||!attestationBody?.attestation){
    throw new Error('edge_attestation_endpoint_failed');
  }
  const verifiedAttestation=verifyNodeAttestation({
    attestation:attestationBody.attestation,
    expectedNonce:nonce,
    maxAgeMs:60000,
    now:new Date(),
  });
  if(verifiedAttestation.ok!==true) throw new Error('edge_attestation_invalid:'+clean(verifiedAttestation.reason));
  if(verifiedAttestation.field_claim!==false) throw new Error('edge_attestation_may_not_claim_field_status');
  receipt.edge_attestation_verified=true;
  receipt.device_fingerprint=verifiedAttestation.device_fingerprint;
  receipt.node_id=verifiedAttestation.node_id;
  receipt.attestation_observed_at=verifiedAttestation.observed_at;
  receipt.attestation_boot_id_hash=verifiedAttestation.boot_id_hash||null;
  receipt.physical_field_claim=false;
  receipt.checks.device_attestation=true;

  const init=await rpc(1,'initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'evercraft-operator-edge-canary',version:'1'},
  });
  if(init?.serverInfo?.name!=='evercraft-fabric') throw new Error('mcp_identity_mismatch');
  receipt.checks.mcp_initialize=true;

  const tools=await rpc(2,'tools/list',{});
  const names=(tools?.tools||[]).map(x=>clean(x.name));
  for(const expected of ['match_evercraft_capability','list_evercraft_capabilities','get_evercraft_connection_options']){
    if(!names.includes(expected)) throw new Error('mcp_tool_missing:'+expected);
  }
  receipt.mcp_tools=names;
  receipt.checks.mcp_tools=true;

  const catalog=await rpc(3,'tools/call',{
    name:'list_evercraft_capabilities',
    arguments:{limit:100},
  });
  const payload=catalog?.structuredContent||null;
  if(!payload||Number(payload.total)<40) throw new Error('fabric_catalog_unavailable');
  if(payload.transactional!==false||payload.external_action_taken!==false) throw new Error('fabric_catalog_side_effect_boundary_failed');
  if(/base44\.app/i.test(JSON.stringify(payload.capabilities||[]))) throw new Error('base44_route_leaked_into_catalog');
  receipt.catalog_total=Number(payload.total);
  receipt.checks.public_catalog=true;

  receipt.verified=true;
  receipt.state='public_https_verified';
  receipt.public_https_verified=true;
  receipt.mcp_verified=true;
  receipt.external_route_verified=true;
  receipt.receipt_hash=sha({...receipt,receipt_hash:undefined});
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}catch(error){
  receipt.state='verification_failed';
  receipt.error=error instanceof Error?error.message:String(error);
  receipt.public_https_verified=false;
  receipt.mcp_verified=false;
  receipt.external_route_verified=false;
  receipt.receipt_hash=sha({...receipt,receipt_hash:undefined});
  process.stderr.write(JSON.stringify(receipt,null,2)+'\n');
  process.exitCode=1;
}
