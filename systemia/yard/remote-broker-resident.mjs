#!/usr/bin/env node
/**
 * Supervises a private Node001 broker as a receipt-bound Yard / Compute
 * workload. Does NOT expose broker routes or authorize real remote devices.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {YardOperator} from './operator.mjs';

const CODE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DEFAULT_ROOT='/var/lib/evercraft/nodeseed';
const DEPLOYMENT='evercraft-remote-broker-resident';
const WORKLOAD='systemia.remote-capacity-broker.v1';
const PORT=8797;
const LEASE_TTL=120000;
const RENEW_INTERVAL=30000;

function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function safeJson(file){try{return readJson(file)}catch{return null}}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,file);
}
export function loopbackFromReceipt(receipt){
  if(receipt?.schema!=='evercraft.compute.nodeseed-receipt.v1'||
    !/^[a-zA-Z0-9._-]{1,128}$/.test(String(receipt.node_id||''))||
    !/^sha256:[a-f0-9]{64}$/i.test(String(receipt.device_fingerprint||''))){
    throw Error('nodeseed_receipt_identity_invalid');
  }
  let url;
  try{url=new URL(String(receipt.endpoint||''));}catch{throw Error('nodeseed_endpoint_invalid')}
  if(url.protocol!=='http:'||url.username||url.password||url.pathname!=='/'||
     !Number.isInteger(Number(url.port))||Number(url.port)<1||Number(url.port)>65535){
    throw Error('nodeseed_endpoint_invalid');
  }
  // Never send NodeSeed allocator authority to its advertised LAN address.
  return 'http://127.0.0.1:'+url.port;
}
export function verifyCapacity(receipt,capacity){
  if(capacity?.protocol!=='evercraft.capacity.v1'||
     capacity.node_id!==receipt?.node_id||
     capacity.device_fingerprint!==receipt?.device_fingerprint||
     !Array.isArray(capacity.supported_workloads)||
     !capacity.supported_workloads.includes(WORKLOAD)){
    throw Error('live_nodeseed_capacity_identity_or_workload_mismatch');
  }
  return true;
}
export function verifyBrokerHealth(health,record){
  if(health?.ok!==true||health.service!=='remote-capacity-broker'||
     health.runtime!=='Evercraft Compute'||
     health.instance_id!==record?.result?.instance_id||
     health.deployment_receipt_bound!==true||
     health.deployment_receipt_ref!==record?.receipt?.receipt_hash||
     health.secure_envelope_schema!=='evercraft.secure-envelope.v1'){
    throw Error('resident_broker_health_identity_or_receipt_mismatch');
  }
  return true;
}
function sourceDigest(){
  const inputs=[
    path.join(CODE_ROOT,'systemia/compute/runtime-node.mjs'),
    path.join(CODE_ROOT,'systemia/network/outbound-capacity-broker.mjs'),
    path.join(CODE_ROOT,'systemia/yard/operator.mjs'),
    fileURLToPath(import.meta.url),
  ];
  const h=crypto.createHash('sha256');
  for(const f of inputs){
    h.update(path.relative(CODE_ROOT,f));h.update('\0');
    h.update(fs.readFileSync(f));h.update('\0');
  }
  return 'sha256:'+h.digest('hex');
}
async function getJson(url){
  const response=await fetch(url,{
    headers:{accept:'application/json'},signal:AbortSignal.timeout(4000),
  });
  if(!response.ok)throw Error('local_http_'+response.status);
  return response.json();
}

export async function startPrivateBroker({
  root=DEFAULT_ROOT,
  allocatorToken=process.env.EVERCRAFT_ALLOCATOR_TOKEN||'',
  port=PORT,
  requirePhysical=true,
  releaseRef=null,
}={}){
  const nodeRoot=path.resolve(root);
  if(requirePhysical&&nodeRoot!==DEFAULT_ROOT)throw Error('physical_nodeseed_root_required');
  if(!allocatorToken)throw Error('existing_nodeseed_allocator_authority_required');
  if(!Number.isInteger(port)||port<0||port>65535||(requirePhysical&&port!==PORT)){
    throw Error('resident_broker_port_invalid');
  }
  const receipt=readJson(path.join(nodeRoot,'nodeseed-receipt.json'));
  const endpoint=loopbackFromReceipt(receipt);
  const capacity=await getJson(endpoint+'/v1/capacity');
  verifyCapacity(receipt,capacity);
  const privateRoot=path.join(nodeRoot,'remote-broker-resident');
  const yard=new YardOperator({stateDir:path.join(privateRoot,'yard')});
  const existing=yard.deploymentStatus(DEPLOYMENT);
  let record=null;
  let mode='deployed';
  if(existing?.state==='ready'){
    let health=null;
    try{
      const url='http://127.0.0.1:'+port+'/v1/remote/health';
      health=await getJson(url);
    }catch{}
    if(health){
      // A different live process on the reserved port is never adopted.
      verifyBrokerHealth(health,existing);
      const renewed=await yard.renewDeploymentLease(DEPLOYMENT,{ttlMs:LEASE_TTL});
      if(renewed.ok!==true)throw Error('resident_broker_resume_lease_failed');
      record=existing;
      mode='resumed';
    }
  }
  if(!record){
    record=await yard.deployRelease({
      deploymentId:DEPLOYMENT,
      releaseRef:releaseRef||sourceDigest(),
      workloadClass:WORKLOAD,
      capacityEndpoint:endpoint,
      allocatorToken,
      input:{
        state_root:path.join(privateRoot,'broker'),
        port,authorized_devices:{},
      },
      rollbackTarget:'stop_private_broker_without_public_route',
      leaseTtlMs:LEASE_TTL,
    });
  }
  const localUrl=record.result?.local_url;
  if(!localUrl||new URL(localUrl).hostname!=='127.0.0.1'){
    throw Error('broker_must_listen_on_loopback');
  }
  const health=await getJson(localUrl+'/v1/remote/health');
  verifyBrokerHealth(health,record);
  if(mode==='deployed'&&!existing&&health.authorized_devices!==0){
    throw Error('fresh_broker_unexpected_authorized_devices');
  }
  const route=await yard.verifyRoute(DEPLOYMENT);
  if(route.ok!==false||route.state!=='public_route_unbound'||
     route.local_health_ok!==true){
    throw Error('private_broker_route_boundary_invalid');
  }
  function writeStatus(state,extra={}){
    const status={
      schema:'evercraft.remote-capacity.private-resident-status.v1',
      state,mode,node_id:receipt.node_id,
      broker_instance_id:record.result.instance_id,
      deployment_receipt_hash:record.receipt.receipt_hash,
      source_ref:record.receipt.release_ref,
      observed_at:new Date().toISOString(),
      local_broker_health_verified:state==='healthy',
      public_https_verified:false,
      production_remote_device_authorized_by_this_runner:false,
      remote_agent_enabled_by_this_runner:false,
      public_edge_changed:false,
      ...extra,
    };
    atomicJson(path.join(privateRoot,'status.json'),status);
    return status;
  }
  writeStatus('healthy',{lease_expires_at:record.lease?.expires_at||null});
  return {yard,record,localUrl,mode,writeStatus};
}

export async function supervisePrivateBroker(options={}){
  const broker=await startPrivateBroker(options);
  console.log(JSON.stringify(broker.writeStatus('healthy'),null,2));
  let closing=false,inFlight=false;
  let ticker=null;
  async function stop(reason){
    if(closing)return;
    closing=true;
    if(ticker)clearInterval(ticker);
    try{await broker.yard.stopDeployment(DEPLOYMENT,{reason:'supervisor_'+reason})}catch{}
    broker.writeStatus('stopped',{reason,local_broker_health_verified:false});
  }
  process.once('SIGTERM',()=>stop('sigterm').finally(()=>process.exit(0)));
  process.once('SIGINT',()=>stop('sigint').finally(()=>process.exit(0)));
  ticker=setInterval(async()=>{
    if(inFlight||closing)return;
    inFlight=true;
    try{
      const renewed=await broker.yard.renewDeploymentLease(DEPLOYMENT,{ttlMs:LEASE_TTL});
      if(renewed.ok!==true)throw Error('lease_renewal_not_ok');
      const route=await broker.yard.verifyRoute(DEPLOYMENT);
      if(route.ok!==false||route.state!=='public_route_unbound'||
         route.local_health_ok!==true)throw Error('broker_local_route_not_healthy');
      verifyBrokerHealth(
        await getJson(broker.localUrl+'/v1/remote/health'),broker.record
      );
      broker.writeStatus('healthy',{lease_expires_at:renewed.expires_at});
    }catch(e){
      broker.writeStatus('degraded',{
        reason:String(e?.message||e).slice(0,100),local_broker_health_verified:false,
      });
      console.error(JSON.stringify({state:'degraded',reason:'broker_lease_or_health_failed'}));
      process.exitCode=1;
      await stop('lease_or_health_failed');
      process.exit(1);
    }finally{inFlight=false;}
  },RENEW_INTERVAL);
  return broker;
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const action=process.argv[2];
  if(process.argv.length!==3||!['--run','--status'].includes(action)){
    console.error('usage: remote-broker-resident.mjs --run|--status');
    process.exit(2);
  }
  if(action==='--status'){
    console.log(JSON.stringify(
      safeJson(path.join(DEFAULT_ROOT,'remote-broker-resident/status.json'))||
        {state:'not_deployed',public_https_verified:false},null,2
    ));
  }else{
    supervisePrivateBroker().catch(e=>{
      console.error(JSON.stringify({
        state:'failed_closed',reason:String(e?.message||e).slice(0,120),
        public_https_verified:false,
      }));
      process.exit(1);
    });
  }
}
