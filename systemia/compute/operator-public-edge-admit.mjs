#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODULE_FILE=fileURLToPath(import.meta.url);
const clean=(v)=>String(v??'').trim();
const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
function readJson(file){
  if(!fs.existsSync(file)) throw new Error('required_file_missing:'+file);
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function validSha(value){return /^sha256:[a-f0-9]{64}$/i.test(clean(value));}
function receiptHashValid(receipt){
  if(!receipt||typeof receipt!=='object'||!validSha(receipt.receipt_hash))return false;
  const {receipt_hash,...body}=receipt;
  return sha(body)===receipt_hash;
}
function serviceState(name,{user=false}={}){
  const base=user?['--user']:[];
  const active=execFileSync('systemctl',[...base,'is-active',name],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  const enabled=execFileSync('systemctl',[...base,'is-enabled',name],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  return {name,scope:user?'user':'system',active,enabled};
}
async function fetchLocalHealth(url){
  const parsed=new URL(url);
  if(parsed.protocol!=='http:'||!['127.0.0.1','localhost','::1'].includes(parsed.hostname)){
    throw new Error('local_health_must_use_loopback_http');
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch(parsed,{headers:{accept:'application/json'},signal:controller.signal});
    const body=await response.json().catch(()=>null);
    if(!response.ok||!body) throw new Error('local_fabric_health_unavailable');
    return body;
  }finally{clearTimeout(timer);}
}

export function evaluateOperatorPublicEdgeAdmission({
  nodeReceipt,
  externalCanary,
  localHealth,
  serviceStates=[],
  operatorRef='',
  expectedOrigin='https://fabric.systemiacommandcenters.com',
  routerMapRequired=true,
}={}){
  if(nodeReceipt?.schema!=='evercraft.compute.nodeseed-receipt.v1') throw new Error('nodeseed_receipt_schema_invalid');
  if(!validSha(nodeReceipt.device_fingerprint)) throw new Error('nodeseed_device_fingerprint_invalid');
  if(externalCanary?.schema!=='evercraft.operator-public-edge.external-canary.v1') throw new Error('external_canary_schema_invalid');
  if(!receiptHashValid(externalCanary)) throw new Error('external_canary_receipt_hash_invalid');
  if(externalCanary.verified!==true||externalCanary.public_https_verified!==true||externalCanary.external_route_verified!==true){
    throw new Error('external_public_https_not_verified');
  }
  if(externalCanary.trust_class!=='operator_authorized_public_edge') throw new Error('external_canary_trust_class_invalid');
  const origin=clean(externalCanary.origin).replace(/\/+$/,'');
  if(origin!==clean(expectedOrigin).replace(/\/+$/,'')) throw new Error('external_canary_origin_mismatch');
  const parsed=new URL(origin);
  if(parsed.protocol!=='https:'||/(^|\.)base44\.app$/i.test(parsed.hostname)) throw new Error('owned_https_origin_required');
  if(!externalCanary.tls?.authorized||!clean(externalCanary.tls?.fingerprint256)) throw new Error('trusted_tls_peer_required');

  if(localHealth?.ok!==true||localHealth?.service!=='evercraft-fabric-local'||localHealth?.server!=='evercraft-fabric'){
    throw new Error('local_fabric_identity_invalid');
  }
  if(localHealth.read_only!==true||localHealth.transactional!==false||localHealth.external_action_authority!==false){
    throw new Error('local_fabric_authority_boundary_invalid');
  }
  if(localHealth.base44_transport_enabled!==false) throw new Error('local_fabric_base44_transport_enabled');
  if(Number(localHealth.capability_count)<40) throw new Error('local_fabric_capability_floor_failed');

  const byName=new Map(serviceStates.map(x=>[clean(x.name),x]));
  for(const name of ['evercraft-fabric.service','evercraft-public-edge.service']){
    const state=byName.get(name);
    if(!state||state.active!=='active'||!['enabled','enabled-runtime','static'].includes(state.enabled)){
      throw new Error('resident_service_not_ready:'+name);
    }
  }
  if(routerMapRequired){
    const timer=byName.get('evercraft-router-map.timer');
    if(!timer||timer.active!=='active'||!['enabled','enabled-runtime','static'].includes(timer.enabled)){
      throw new Error('router_map_residency_not_ready');
    }
  }

  const ref=clean(operatorRef);
  if(!ref) throw new Error('operator_ref_required');

  const body={
    schema:'evercraft.operator-public-edge-admission.v1',
    trust_class:'operator_authorized_public_edge',
    state:'production_edge_admitted',
    node_id:clean(nodeReceipt.node_id),
    device_fingerprint:clean(nodeReceipt.device_fingerprint),
    operator_authorized:true,
    operator_ref_hash:sha(ref),
    physical_field_certified:false,
    virtualized_environment:true,
    node001_claimed:false,
    origin,
    hostname:parsed.hostname,
    public_https_verified:true,
    trusted_tls_verified:true,
    tls_peer_fingerprint256:clean(externalCanary.tls.fingerprint256),
    external_canary_receipt_ref:externalCanary.receipt_hash,
    external_route_verified:true,
    mcp_verified:externalCanary.mcp_verified===true,
    local_runtime_verified:true,
    resident_services_verified:true,
    router_map_residency_verified:routerMapRequired,
    base44_transport_required:false,
    public_edge_configuration_valid:true,
    runtime_advertisement_verified:true,
    ready_for_public_edge_enrollment:true,
    cryptographic_external_device_binding:false,
    device_binding_state:'operator_local_identity_plus_independent_external_route',
    identity_boundary_note:'This receipt binds an Evercraft NodeSeed identity and local resident Fabric services to an independently verified public HTTPS route under operator authorization. It does not claim physical Node 001 certification or cryptographic proof that the external TCP peer is the NodeSeed key.',
    private_key_exposed:false,
    certificate_bytes_exposed:false,
    founder_login_required:false,
    admitted_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export async function runOperatorPublicEdgeAdmitCli(){
  const organismRoot=path.resolve(arg('--organism-root',path.join(os.homedir(),'.local/state/evercraft/organism')));
  const nodeReceiptFile=path.resolve(arg('--node-receipt',path.join(organismRoot,'compute','nodeseed-receipt.json')));
  const canaryFile=path.resolve(arg('--external-canary','artifacts/fabric-operator-edge-canary.json'));
  const out=path.resolve(arg('--out',path.join(organismRoot,'operator-public-edge-admission.json')));
  const expectedOrigin=clean(arg('--origin','https://fabric.systemiacommandcenters.com'));
  const operatorRef=clean(arg('--operator-ref','founder-authorized-chromebook-edge'));
  const localHealthUrl=clean(arg('--local-health','http://127.0.0.1:8787/health'));
  const noRouterMap=process.argv.includes('--no-router-map-required');

  const nodeReceipt=readJson(nodeReceiptFile);
  const externalCanary=readJson(canaryFile);
  const localHealth=await fetchLocalHealth(localHealthUrl);
  const states=[
    serviceState('evercraft-fabric.service'),
    serviceState('evercraft-public-edge.service'),
    ...(!noRouterMap?[serviceState('evercraft-router-map.timer')]:[]),
  ];

  const receipt=evaluateOperatorPublicEdgeAdmission({
    nodeReceipt,externalCanary,localHealth,serviceStates:states,operatorRef,expectedOrigin,
    routerMapRequired:!noRouterMap,
  });
  fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});
  fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE;
if(direct){
  runOperatorPublicEdgeAdmitCli().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.operator-public-edge-admit-error.v1',
      error:error instanceof Error?error.message:String(error),
      physical_node001_claimed:false,
      founder_login_required:false,
    },null,2)+'\n');
    process.exitCode=7;
  });
}
