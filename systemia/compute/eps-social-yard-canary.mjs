#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startLocalOrganism } from './local-organism.mjs';

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const hash=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function writeJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
async function waitJson(file,timeoutMs=60000){
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
    if(fs.existsSync(file)){
      try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
    }
    await sleep(250);
  }
  return null;
}

const outFile=path.resolve(arg('--out','artifacts/base44-exit/eps-social-yard-canary.json'));
const clipUrl=String(process.env.EVERCRAFT_CLIP_EPS_INGRESS_URL||'').trim();
const sourceSecretFile=String(process.env.SYSTEMIA_CLIP_SHARED_SECRET_FILE||'').trim();
const releaseRef=String(process.env.EVERCRAFT_RELEASE_REF||process.env.GITHUB_SHA||'').trim();

if(!/^[a-f0-9]{40}$/i.test(releaseRef)) throw new Error('immutable release SHA required');

const legacyProviderHost=(value)=>{
  try{
    const host=new URL(String(value||'')).hostname.toLowerCase();
    return host==='base44.app'||host.endsWith('.base44.app');
  }catch{return false;}
};

if(!clipUrl){
  const held={
    schema:'evercraft.systemia.eps-social-yard-canary.v1',
    observed_at:new Date().toISOString(),
    verified:false,
    state:'held_no_owned_clip_ingress',
    runtime:'Evercraft Compute',
    deployment_surface:'Yard Operator',
    control_plane:'Systemia Core',
    named_cloud_required:false,
    persistent_runtime_proven:false,
    external_action_taken:false
  };
  held.receipt_hash='sha256:'+hash(held);
  writeJson(outFile,held);
  console.log(JSON.stringify(held,null,2));
  process.exit(0);
}
if(legacyProviderHost(clipUrl)){
  const blocked={
    schema:'evercraft.systemia.eps-social-yard-canary.v1',
    observed_at:new Date().toISOString(),
    verified:false,
    state:'blocked_legacy_provider_ingress',
    runtime:'Evercraft Compute',
    deployment_surface:'Yard Operator',
    control_plane:'Systemia Core',
    named_cloud_required:false,
    persistent_runtime_proven:false,
    external_action_taken:false
  };
  blocked.receipt_hash='sha256:'+hash(blocked);
  writeJson(outFile,blocked);
  console.error(JSON.stringify(blocked,null,2));
  process.exit(1);
}
if(!sourceSecretFile||!fs.existsSync(sourceSecretFile)){
  const held={
    schema:'evercraft.systemia.eps-social-yard-canary.v1',
    observed_at:new Date().toISOString(),
    verified:false,
    state:'held_no_clip_secret_file',
    runtime:'Evercraft Compute',
    deployment_surface:'Yard Operator',
    control_plane:'Systemia Core',
    named_cloud_required:false,
    persistent_runtime_proven:false,
    external_action_taken:false
  };
  held.receipt_hash='sha256:'+hash(held);
  writeJson(outFile,held);
  console.log(JSON.stringify(held,null,2));
  process.exit(0);
}

const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'evercraft-eps-yard-canary-'));
let organism=null;
let exitCode=0;
try{
  organism=await startLocalOrganism({
    root,
    nodeId:'eps-social-canary-'+String(process.env.GITHUB_RUN_ID||process.pid),
    releaseRef,
    heartbeatTargetSeconds:300,
    graceSeconds:90,
    clipEpsIngressUrl:clipUrl,
    clipSharedSecretFile:sourceSecretFile,
    placementLabels:['ephemeral','private','outbound-only','ci-canary']
  });

  const epsFile=path.join(root,'compute','services','systemia-core','workspace','eps-social-continuity','latest.json');
  const eps=await waitJson(epsFile);
  const health=await organism.health();
  const valid=Boolean(eps&&eps.ok===true&&['no_op','published_verified'].includes(String(eps.result||''))&&health.ok===true);

  const receipt={
    schema:'evercraft.systemia.eps-social-yard-canary.v1',
    observed_at:new Date().toISOString(),
    verified:valid,
    state:valid?'verified':'failed',
    runtime:'Evercraft Compute',
    deployment_surface:'Yard Operator',
    control_plane:'Systemia Core',
    capacity_protocol:'evercraft.capacity.v1',
    substrate_class:'authorized_ephemeral_compute',
    named_cloud_required:false,
    persistent_runtime_proven:false,
    source_release_ref:releaseRef,
    node_id:organism.seed.node_id,
    device_fingerprint:organism.seed.device_fingerprint,
    kaidance_deployment_receipt:organism.kaidance.receipt.receipt_hash,
    systemia_core_deployment_receipt:organism.core.receipt.receipt_hash,
    eps_result:eps?.result||null,
    eps_receipt_ref:eps?.receipt_ref||null,
    eps_published:eps?.published===true,
    eps_verified:eps?.verified===true,
    eps_no_op:eps?.no_op===true,
    eps_reason:eps?.reason||null,
    eps_http_status:eps?.http_status??null,
    clip_endpoint_host:eps?.endpoint_host||new URL(clipUrl).hostname,
    oidc_subject_binding:'repository_owner_id+repository_id+ref',
    oidc_debug_revision:'auth-header-v5',
    secret_persisted_in_public_receipt:false,
    base44_scheduler_retirement_authorized_by_this_canary:false
  };
  receipt.receipt_hash='sha256:'+hash(receipt);
  writeJson(outFile,receipt);
  console.log(JSON.stringify(receipt,null,2));
  if(!valid) exitCode=1;
}finally{
  if(organism){try{await organism.close();}catch{}}
  try{fs.rmSync(root,{recursive:true,force:true});}catch{}
}
process.exitCode=exitCode;
