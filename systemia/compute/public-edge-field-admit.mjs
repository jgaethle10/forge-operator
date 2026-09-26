#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validatePublicEdgeAdmission } from '../network/public-edge-tls.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function has(name){ return process.argv.includes(name); }
function readJson(file){ return JSON.parse(fs.readFileSync(file,'utf8')); }

function requireSafeEnvValue(name,value){
  const text=String(value||'').trim();
  if(!text) throw new Error(name+'_required');
  if(/[\r\n\0]/.test(text)||/\s/.test(text)){
    throw new Error(name+'_must_not_contain_whitespace');
  }
  return text;
}

function readEnvFile(file){
  const map=new Map();
  if(!fs.existsSync(file)) return map;
  for(const raw of fs.readFileSync(file,'utf8').split('\n')){
    const line=raw.trim();
    if(!line||line.startsWith('#')) continue;
    const index=line.indexOf('=');
    if(index<=0) continue;
    map.set(line.slice(0,index),line.slice(index+1));
  }
  return map;
}

function writeEnvFile(file,map){
  const lines=[...map.entries()].map(([key,value])=>`${key}=${value}`);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,lines.join('\n')+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
}

function copyTlsMaterial(source,destination,{mode}){
  const src=path.resolve(source);
  const dst=path.resolve(destination);
  fs.mkdirSync(path.dirname(dst),{recursive:true,mode:0o750});
  if(src!==dst) fs.copyFileSync(src,dst);
  fs.chmodSync(dst,mode);
  execFileSync('chown',['root:evercraft',dst],{stdio:'ignore'});
  return dst;
}

async function fetchJson(url,{timeoutMs=5000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{headers:{accept:'application/json'},signal:controller.signal});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data) throw new Error('http_'+response.status);
    return data;
  }finally{
    clearTimeout(timer);
  }
}

export function evaluatePublicEdgeFieldCandidate({
  fieldCandidate,
  nodeReceipt,
  baseDomain,
  tlsKeyPath,
  tlsCertPath,
  publicPort=443,
  now=Date.now(),
}={}){
  if(fieldCandidate?.schema!=='evercraft.node001.field-evidence-candidate.v1'){
    throw new Error('field_evidence_candidate_schema_invalid');
  }
  if(fieldCandidate.ready_for_yard_enrollment!==true){
    throw new Error('field_evidence_not_ready_for_yard_enrollment');
  }
  if(nodeReceipt?.schema!=='evercraft.compute.nodeseed-receipt.v1'){
    throw new Error('nodeseed_receipt_schema_invalid');
  }
  if(!/^sha256:[a-f0-9]{64}$/i.test(String(nodeReceipt.device_fingerprint||''))){
    throw new Error('nodeseed_device_fingerprint_invalid');
  }

  const admission=validatePublicEdgeAdmission({
    mode:'wildcard_https',
    baseDomain,
    tlsKeyPath,
    tlsCertPath,
    publicPort,
    minValidityMs:72*60*60*1000,
    now,
  });

  return {
    schema:'evercraft.node001.public-edge-field-candidate.v1',
    node_id:nodeReceipt.node_id,
    device_fingerprint:nodeReceipt.device_fingerprint,
    field_evidence_digest:fieldCandidate.evidence_digest||null,
    field_evidence_ready:true,
    public_edge_configuration_valid:true,
    base_domain:admission.tls.base_domain,
    public_port:admission.public_port,
    certificate_fingerprint256:admission.tls.certificate_fingerprint256,
    certificate_valid_from:admission.tls.certificate_valid_from,
    certificate_valid_to:admission.tls.certificate_valid_to,
    certificate_days_remaining:admission.tls.certificate_days_remaining,
    wildcard_hostname_match:Boolean(admission.tls.hostname_match),
    private_key_exposed:false,
    certificate_bytes_exposed:false,
    founder_login_required:false,
  };
}

const root=path.resolve(arg('--root','/var/lib/evercraft/nodeseed'));
const fieldFile=path.resolve(arg('--field-evidence',path.join(root,'field-evidence-candidate.json')));
const nodeReceiptFile=path.resolve(arg('--node-receipt',path.join(root,'nodeseed-receipt.json')));
const envFile=path.resolve(arg('--env-file','/etc/evercraft/nodeseed.env'));
const service=String(arg('--service','evercraft-nodeseed.service'));
const baseDomain=requireSafeEnvValue('base_domain',arg('--base-domain',process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN||''));
const sourceKey=path.resolve(requireSafeEnvValue('tls_key_path',arg('--tls-key-path',process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH||'')));
const sourceCert=path.resolve(requireSafeEnvValue('tls_cert_path',arg('--tls-cert-path',process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH||'')));
const publicPort=Number(arg('--public-port',process.env.EVERCRAFT_PUBLIC_EDGE_PORT||'443'));
const apply=has('--apply');

if(!fs.existsSync(fieldFile)) throw new Error('field_evidence_candidate_missing');
if(!fs.existsSync(nodeReceiptFile)) throw new Error('nodeseed_receipt_missing');

const fieldCandidate=readJson(fieldFile);
const nodeReceipt=readJson(nodeReceiptFile);
const candidate=evaluatePublicEdgeFieldCandidate({
  fieldCandidate,
  nodeReceipt,
  baseDomain,
  tlsKeyPath:sourceKey,
  tlsCertPath:sourceCert,
  publicPort,
});

let runtimeAdvertisementVerified=false;
let capacityReceipt=null;
let applied=false;

if(apply){
  if(typeof process.getuid==='function'&&process.getuid()!==0){
    throw new Error('public_edge_field_apply_requires_root');
  }

  const tlsDir=path.resolve(arg('--tls-dir','/etc/evercraft/tls'));
  const keyDest=path.join(tlsDir,'public-edge-key.pem');
  const certDest=path.join(tlsDir,'public-edge-cert.pem');
  const installedKey=copyTlsMaterial(sourceKey,keyDest,{mode:0o640});
  const installedCert=copyTlsMaterial(sourceCert,certDest,{mode:0o644});

  const env=readEnvFile(envFile);
  const labels=new Set(
    String(env.get('EVERCRAFT_NODE_LABELS')||'')
      .split(',')
      .map(x=>x.trim().toLowerCase())
      .filter(Boolean)
  );
  labels.add('public-edge');
  labels.add('gateway');

  env.set('EVERCRAFT_NODE_LABELS',[...labels].sort().join(','));
  env.set('EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN',candidate.base_domain);
  env.set('EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH',requireSafeEnvValue('installed_tls_key_path',installedKey));
  env.set('EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH',requireSafeEnvValue('installed_tls_cert_path',installedCert));
  env.set('EVERCRAFT_PUBLIC_EDGE_PORT',String(candidate.public_port));
  writeEnvFile(envFile,env);

  if(candidate.public_port<1024){
    const dropInDir='/etc/systemd/system/'+service+'.d';
    fs.mkdirSync(dropInDir,{recursive:true,mode:0o755});
    fs.writeFileSync(
      path.join(dropInDir,'public-edge.conf'),
      '[Service]\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE\nAmbientCapabilities=CAP_NET_BIND_SERVICE\n',
      {mode:0o644}
    );
  }

  execFileSync('systemctl',['daemon-reload'],{stdio:'ignore'});
  execFileSync('systemctl',['restart',service],{stdio:'ignore'});
  execFileSync('systemctl',['is-active','--quiet',service],{stdio:'ignore'});

  const refreshedReceipt=readJson(nodeReceiptFile);
  const endpoint=new URL(refreshedReceipt.endpoint);
  const localCapacity=`http://127.0.0.1:${endpoint.port}/v1/capacity`;
  const capacity=await fetchJson(localCapacity,{timeoutMs:5000});
  const edge=capacity?.capacity_hint?.services?.public_edge;
  const labelsNow=new Set(capacity?.placement_labels||[]);

  runtimeAdvertisementVerified=Boolean(
    capacity?.protocol==='evercraft.capacity.v1' &&
    capacity?.attestation_supported===true &&
    capacity?.device_fingerprint===candidate.device_fingerprint &&
    labelsNow.has('public-edge') &&
    labelsNow.has('gateway') &&
    edge?.configured===true &&
    edge?.ready===true &&
    edge?.public_https===true &&
    edge?.base_domain===candidate.base_domain &&
    Number(edge?.public_port)===candidate.public_port &&
    edge?.certificate_fingerprint256===candidate.certificate_fingerprint256
  );

  if(!runtimeAdvertisementVerified){
    throw new Error('public_edge_runtime_advertisement_verification_failed');
  }

  capacityReceipt={
    node_id:capacity.node_id,
    device_fingerprint:capacity.device_fingerprint,
    placement_labels:[...(capacity.placement_labels||[])].sort(),
    public_edge:{
      ready:true,
      public_https:true,
      base_domain:edge.base_domain,
      public_port:edge.public_port,
      certificate_fingerprint256:edge.certificate_fingerprint256,
      certificate_valid_to:edge.certificate_valid_to,
    },
    attestation_supported:true,
  };
  applied=true;
}

const body={
  ...candidate,
  applied,
  runtime_advertisement_verified:runtimeAdvertisementVerified,
  capacity_receipt:capacityReceipt,
  ready_for_public_edge_enrollment:Boolean(
    applied&&runtimeAdvertisementVerified&&candidate.public_edge_configuration_valid
  ),
  external_dns_verified:false,
  public_reachability_verified:false,
  external_canary_required:true,
  observed_at:new Date().toISOString(),
};
const receipt={...body,receipt_hash:sha(body)};

if(apply){
  const out=path.resolve(arg('--out',path.join(root,'public-edge-admission-receipt.json')));
  fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
}

console.log(JSON.stringify(receipt,null,2));
process.exit(receipt.ready_for_public_edge_enrollment||!apply?0:6);
