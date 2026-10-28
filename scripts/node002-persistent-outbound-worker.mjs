#!/usr/bin/env node
/**
 * Persistent, owner-controlled Node002 outbound worker.
 * Connects the existing physical loopback NodeSeed to the owner-authorized
 * public broker. It never enrolls a new identity or opens any inbound port.
 * Local agent enforcement allows only read-only probes and bounded SHA-256
 * registered work under short-lived authenticated leases.
 *
 * This is persistent within Linux/WSL's running lifetime. Booting Windows and
 * waking WSL itself are separate host responsibilities.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startOutboundNodeAgent} from '../systemia/network/outbound-node-agent.mjs';

const ROOT=path.join(os.homedir(),'.local','state','evercraft','organism');
const RECEIPT=path.join(ROOT,'compute','nodeseed-receipt.json');
const TOKEN=path.join(ROOT,'.secrets','allocator-token');
const STATE=path.join(ROOT,'outbound-worker','status.json');
const BROKER='https://fabric.systemiacommandcenters.com';
const NODE_ID='evercraft-node002-nextgen';
const BROKER_INSTANCE='remote_broker_8a9b5bfcec4231bd15ed375c';
const DEPLOYMENT_RECEIPT='e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c';
const WORKLOAD='systemia.content-hash.v1';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cleanErr=e=>String(e?.message||e||'unknown_error')
  .replace(/sha256:[a-f0-9]{64}/gi,'[redacted-sha256]')
  .replace(/https?:\/\/\S+/g,'[redacted-url]')
  .replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,100);

export function verifyNode002PersistentPreflight({receipt,capacity,health}={}) {
  const node=String(receipt?.node_id||'');
  if(receipt?.schema!=='evercraft.compute.nodeseed-receipt.v1'||
     node!==NODE_ID||
     !/^sha256:[a-f0-9]{64}$/i.test(String(receipt?.device_fingerprint||'')))
    throw Error('node002_physical_receipt_invalid');
  let endpoint;
  try {endpoint=new URL(String(receipt.endpoint||''))}
  catch{throw Error('node002_loopback_receipt_invalid')}
  const port=Number(endpoint.port);
  if(endpoint.protocol!=='http:'||!Number.isInteger(port)||port<1||port>65535)
    throw Error('node002_loopback_receipt_invalid');
  if(capacity?.protocol!=='evercraft.capacity.v1'||
     capacity?.node_id!==node||
     capacity?.device_fingerprint!==receipt.device_fingerprint ||
     !Array.isArray(capacity.supported_workloads)||
     !capacity.supported_workloads.includes(WORKLOAD))
    throw Error('node002_live_capacity_or_workload_mismatch');
  if(health?.ok!==true||
     health?.schema!=='evercraft.remote-capacity.broker-health.v1'||
     health?.runtime!=='Evercraft Compute'||
     health?.service!=='remote-capacity-broker'||
     health?.instance_id!==BROKER_INSTANCE||
     health?.deployment_receipt_bound!==true||
     health?.deployment_receipt_ref!==DEPLOYMENT_RECEIPT||
     health?.secure_envelope_schema!=='evercraft.secure-envelope.v1'||
     !Number.isInteger(health.authorized_devices)||
     health.authorized_devices<1)
    throw Error('public_broker_identity_or_owner_authorization_invalid');
  return {endpoint:'http://127.0.0.1:'+port,node_id:node};
}
async function getJson(url) {
  const r=await fetch(url,{headers:{accept:'application/json'},
    signal:AbortSignal.timeout(6000),redirect:'error'});
  if(r.status!==200)throw Error('worker_health_http_'+r.status);
  return r.json();
}
function writeStatus(record) {
  const file=STATE;
  const dir=path.dirname(file);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const body={
    schema:'evercraft.node002.persistent-outbound-worker-status.v1',
    node_id:NODE_ID,
    ...record,
    command_policy:'content-hash-only',
    workload_allowlist:[WORKLOAD],
    no_remote_exec:true,
    no_remote_fs:true,
    no_service_lifecycle:true,
    public_hp_listener:false,
    existing_shadow_telemetry_modified:false,
    secrets_included:false,
    observed_at:new Date().toISOString(),
  };
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(body,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,file);
}
async function preflight() {
  const stat=fs.statSync(TOKEN);
  if((stat.mode & 0o077)!==0)throw Error('allocator_token_permissions_too_broad');
  const receipt=JSON.parse(fs.readFileSync(RECEIPT,'utf8'));
  const uri=new URL(String(receipt.endpoint||''));
  if(uri.protocol!=='http:'||!uri.port)throw Error('unsafe_node002_endpoint');
  const endpoint='http://127.0.0.1:'+uri.port;
  const [capacity,health]=await Promise.all([
    getJson(endpoint+'/v1/capacity'),
    getJson(BROKER+'/v1/remote/health'),
  ]);
  return verifyNode002PersistentPreflight({receipt,capacity,health});
}
async function serve(){
  let running=true;
  let active=null;
  let attempt=0;
  const stop=()=>{running=false};
  process.on('SIGTERM',stop);
  process.on('SIGINT',stop);
  writeStatus({state:'starting',ready:false});
  while(running){
    let error=null;
    try{
      const checked=await preflight();
      const token=fs.readFileSync(TOKEN,'utf8').trim();
      if(token.length<16)throw Error('allocator_token_missing');
      active=await startOutboundNodeAgent({
        brokerUrl:BROKER,
        localCapacityEndpoint:checked.endpoint,
        localAllocatorToken:token,
        expectedNodeId:NODE_ID,
        commandPolicy:'content-hash-only',
        pollBackoffMs:250,
        preRegisterGuard:async()=>{await preflight()},
      });
      attempt=0;
      let errorSince=0;
      let lastBrokerPoll=0;
      writeStatus({state:'registered',ready:true,registered_at:active.status().registered_at});
      while(running){
        await pause(5000);
        if(!running)break;
        const status=active.status();
        const hasError=Boolean(status.last_error);
        if(hasError&&!errorSince)errorSince=Date.now();
        if(!hasError)errorSince=0;
        if(Date.now()-lastBrokerPoll>=20000){
          await preflight(); // independent live endpoint + pinned receipt guard
          lastBrokerPoll=Date.now();
        }
        writeStatus({
          state:hasError?'recovering':'registered',
          ready:!hasError,
          registered_at:status.registered_at,
          last_command_at:status.last_command_at,
          secure_commands_opened:status.secure_commands_opened,
          last_error_code:hasError?cleanErr(status.last_error):null,
        });
        if(errorSince&&Date.now()-errorSince>45000)
          throw Error('agent_poll_health_stale');
      }
    }catch(e){error=e}
    finally{
      if(active){try{await active.close()}catch{}active=null}
    }
    if(!running)break;
    attempt++;
    const backoff=Math.min(60000,Math.max(3000,3000*2**Math.min(5,attempt-1)));
    writeStatus({
      state:'retrying',
      ready:false,
      attempts_since_registration:attempt,
      last_error_code:cleanErr(error),
      retry_delay_ms:backoff,
    });
    await pause(backoff);
  }
  writeStatus({state:'stopped',ready:false});
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const mode=process.argv[2];
  if(process.argv.length!==3||!['--serve','--preflight','--status'].includes(mode)){
    console.error('usage: node scripts/node002-persistent-outbound-worker.mjs <--preflight|--serve|--status>');
    process.exit(2);
  }
  if(mode==='--status') {
    try{
      const s=JSON.parse(fs.readFileSync(STATE,'utf8'));
      console.log(JSON.stringify(s,null,2));
    }catch(e){console.error(JSON.stringify({state:'unknown',error:'no_worker_status_receipt'}));process.exitCode=1}
  } else if(mode==='--preflight'){
    preflight().then(r=>console.log(JSON.stringify({
      schema:'evercraft.node002.outbound-worker-preflight.v1',
      state:'eligible',node_id:r.node_id,
      local_endpoint_is_loopback:true,owner_broker_receipt_verified:true,
      enrolled_device_authority_unchanged:true,
      configured_policy:'content-hash-only',no_service_installed:true,
    },null,2))).catch(e=>{
      console.error(JSON.stringify({state:'hold',error_code:cleanErr(e)}));process.exitCode=1;
    });
  }else{
    serve().catch(e=>{
      writeStatus({state:'crashed',ready:false,last_error_code:cleanErr(e)});
      console.error(JSON.stringify({state:'crashed',error_code:cleanErr(e)}));
      process.exitCode=1;
    });
  }
}
