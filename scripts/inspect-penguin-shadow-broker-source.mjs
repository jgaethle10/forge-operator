#!/usr/bin/env node
// Read-only physical source/identity audit for Penguin NodeSeed.
// Never reads or prints allocator tokens, process arguments, unit environment,
// historical control grants, or device authorization values.
// Source hashes are ON-DISK identities, not proof of already-loaded JS bytes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const ROOT='/var/lib/evercraft/nodeseed';
const SOURCE='/opt/evercraft/forge-operator';
const CANDIDATE='32656150e433db42d00e0725507601dfa1b5641e';
const FILES=[
  ['systemia/compute/runtime-node.mjs','4aa6962f723f6dab5f603a2ced3d9c44dc12ffac'],
  ['systemia/network/outbound-capacity-broker.mjs','a1f0f1926abc014629587434cdd28517eed67221'],
  ['systemia/yard/operator.mjs','5f2b5d35b090d2d2bcc6cd2d846487d73f2e3b1b'],
];
const MAX=512*1024;

function systemd(unit,field){
  return execFileSync('systemctl',['show',unit,'-p',field,'--value'],{
    encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore'],
  }).trim();
}
function jsonRegular(file){
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>MAX)
    throw Error('untrusted_receipt_file');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function onDiskHash(file){
  try{
    const st=fs.lstatSync(file);
    if(!st.isFile()||st.isSymbolicLink()||st.size>16*1024*1024)
      return {present:false,regular:false};
    const data=fs.readFileSync(file);
    const sha=createHash('sha1').update(
      Buffer.from('blob '+data.length+'\0')
    ).update(data).digest('hex');
    return {present:true,regular:true,git_blob_sha1:sha};
  }catch{return {present:false,regular:false};}
}
function capacityLoopback(receipt){
  const u=new URL(String(receipt?.endpoint||''));
  const port=Number(u.port);
  if(u.protocol!=='http:'||!Number.isInteger(port)||port<1||port>65535||
     u.username||u.password||
     (u.pathname!=='/'&&u.pathname!=='')||
     u.search||u.hash)throw Error('node_receipt_endpoint_invalid');
  return 'http://127.0.0.1:'+port;
}
async function localJson(url){
  const res=await fetch(url,{headers:{accept:'application/json'},
    signal:AbortSignal.timeout(4000)});
  if(!res.ok)throw Error('local_http_'+res.status);
  return res.json();
}
export async function auditPenguinShadowCutover({
  receiptPath=path.join(ROOT,'nodeseed-receipt.json'),
}={}){
  const receipt=jsonRegular(receiptPath);
  const origin=capacityLoopback(receipt);
  const [capacity,health]=await Promise.all([
    localJson(origin+'/v1/capacity'),
    localJson(origin+'/v1/health'),
  ]);
  const units=['evercraft-nodeseed.service',
    'evercraft-remote-broker-resident.service',
    'evercraft-saban-dispatch.timer']
    .map(unit=>({
      unit,
      active:systemd(unit,'ActiveState'),
      enabled:systemd(unit,'UnitFileState'),
    }));
  const nodeService=units[0],legacy=units[1],dispatch=units[2];
  const pid=Number(systemd(nodeService.unit,'MainPID'));
  const processPresent=Number.isInteger(pid)&&pid>0&&
    fs.existsSync('/proc/'+pid);
  const code=FILES.map(([rel,expected])=>{
    const found=onDiskHash(path.join(SOURCE,rel));
    return {
      file:rel,
      present:found.present,
      disk_git_blob_sha1:found.git_blob_sha1||null,
      matches_candidate:found.git_blob_sha1===expected,
    };
  });
  const identityOk=
    receipt.schema==='evercraft.compute.nodeseed-receipt.v1' &&
    capacity.protocol==='evercraft.capacity.v1' &&
    capacity.node_id===receipt.node_id &&
    capacity.device_fingerprint===receipt.device_fingerprint &&
    health.ok===true&&health.node_id===receipt.node_id&&
    health.runtime==='Evercraft Compute';
  const workloadOk=Array.isArray(capacity.supported_workloads)&&
    capacity.supported_workloads.includes(
      'systemia.remote-capacity-broker.v1'
    );
  const services=health.resident_services;
  const countValid=Number.isInteger(services)&&services>=0;
  const noActivationChange=nodeService.active==='active'&&
    legacy.active==='inactive'&&legacy.enabled==='disabled'&&
    dispatch.active==='active';
  return {
    schema:'evercraft.penguin.live-runtime-provenance-gate.v1',
    read_only:true,
    physical_canary_run_authorized:false,
    candidate_source_commit:CANDIDATE,
    node:{
      live_identity_matches_receipt:identityOk,
      broker_workload_supported:workloadOk,
      observed_resident_service_count:countValid?services:null,
      source_process_running:processPresent,
      source_process_pid_reported:false,
      on_disk_source_is_loaded_source_unproven:true,
    },
    protected_services:units,
    on_disk_sources:code,
    all_three_sources_match_candidate:code.every(c=>c.matches_candidate),
    physical_readiness_preflight_pass:
      identityOk&&workloadOk&&countValid&&processPresent&&noActivationChange,
    existing_code_exact_provenance_unverified:true,
    credentials_read:false,
    private_authorizations_read:false,
    services_changed:false,
    no_enrollment_performed:true,
  };
}

const direct=process.argv[1]&&
  path.resolve(process.argv[1])===new URL(import.meta.url).pathname;
if(direct){
  auditPenguinShadowCutover().then(report=>{
    console.log(JSON.stringify(report,null,2));
    if(!report.physical_readiness_preflight_pass)process.exitCode=3;
  }).catch(error=>{
    console.error(JSON.stringify({
      schema:'evercraft.penguin.live-runtime-provenance-error.v1',
      error:String(error?.message||'audit_failed').slice(0,120),
      physical_canary_run_authorized:false,
      read_only:true,
    }));
    process.exitCode=3;
  });
}
