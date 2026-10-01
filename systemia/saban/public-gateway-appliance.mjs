#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { startOutboundCapacityBroker } from '../network/outbound-capacity-broker.mjs';
import { startRemoteBrokerBeacon } from '../network/remote-broker-beacon.mjs';
import { startFederatedServiceBridge } from '../network/federated-service-bridge.mjs';
import { YardOperator } from '../yard/operator.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const CODE_ROOT=path.resolve(path.dirname(MODULE_FILE),'../..');
const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function clean(value){return String(value??'').trim();}
function safeId(value){
  const id=clean(value).replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,120);
  if(!id) throw new Error('gateway_node_id_required');
  return id;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function firstLanIpv4(){
  for(const rows of Object.values(os.networkInterfaces())){
    for(const row of rows||[]){
      if(row.family!=='IPv4'||row.internal) continue;
      const ip=String(row.address||'');
      if(ip.startsWith('169.254.')) continue;
      return ip;
    }
  }
  return '';
}
function sourceReleaseRef(){
  const explicit=clean(process.env.EVERCRAFT_RELEASE_REF);
  if(/^[a-f0-9]{40}$/i.test(explicit)) return explicit;
  try{
    const value=execFileSync('git',['rev-parse','HEAD'],{
      cwd:CODE_ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']
    }).trim();
    if(/^[a-f0-9]{40}$/i.test(value)) return value;
  }catch{}
  throw new Error('gateway_release_ref_required');
}
function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}

export class SabanPublicGatewayAppliance {
  constructor({
    stateDir,
    gatewayNodeId='saban-gateway-'+os.hostname(),
    releaseRef=sourceReleaseRef(),
    domain='',
    brokerHost='0.0.0.0',
    brokerPort=8794,
    brokerAdvertiseHost=firstLanIpv4(),
    bridgeHost='127.0.0.1',
    bridgePort=8795,
    commissioning=true,
    commissioningMs=5*60_000,
    commissioningNodePrefix='chromebook-',
    reconcileMs=2_000,
    leaseTtlMs=60*60_000,
    renewEveryMs=30*60_000,
  }={}){
    if(!stateDir) throw new Error('gateway_state_dir_required');
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))){
      throw new Error('gateway_release_ref_must_be_immutable_sha');
    }
    if(!brokerAdvertiseHost) throw new Error('gateway_lan_address_required');
    this.stateDir=path.resolve(stateDir);
    this.gatewayNodeId=safeId(gatewayNodeId);
    this.releaseRef=String(releaseRef);
    this.domain=clean(domain);
    this.brokerHost=String(brokerHost||'0.0.0.0');
    this.brokerPort=Math.max(1,Number(brokerPort||8794));
    this.brokerAdvertiseHost=String(brokerAdvertiseHost);
    this.bridgeHost=String(bridgeHost||'127.0.0.1');
    this.bridgePort=Math.max(1,Number(bridgePort||8795));
    this.commissioning=commissioning===true;
    this.commissioningMs=Math.max(30_000,Number(commissioningMs||5*60_000));
    this.commissioningNodePrefix=String(commissioningNodePrefix||'chromebook-');
    this.reconcileMs=Math.max(500,Number(reconcileMs||2_000));
    this.leaseTtlMs=Math.max(120_000,Number(leaseTtlMs||60*60_000));
    this.renewEveryMs=Math.max(60_000,Number(renewEveryMs||30*60_000));
    this.broker=null;
    this.beacon=null;
    this.yard=null;
    this.fabric=null;
    this.relay=null;
    this.bridge=null;
    this.running=false;
    this.loopPromise=null;
    this.startedAt=0;
    this.lastError=null;
    this.lastAction='starting';
    this.lastAuthorizedReceipt=null;
    this.selectedNodeId=null;
    this.sequence=0;
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
  }

  #stateFile(){return path.join(this.stateDir,'gateway-state.json');}

  #record(action,extra={}){
    const body={
      schema:'evercraft.saban.public-gateway-state.v1',
      sequence:++this.sequence,
      gateway_node_id:this.gatewayNodeId,
      domain:this.domain||null,
      broker_endpoint:this.broker
        ? 'http://'+this.brokerAdvertiseHost+':'+Number(new URL(this.broker.endpoint).port)
        : null,
      bridge_origin:this.bridge?.url||null,
      selected_remote_node_id:this.selectedNodeId,
      action,
      running:this.running,
      commissioning_active:this.commissioning&&
        Date.now()-this.startedAt<this.commissioningMs,
      authorized_device_count:this.broker?.authorizedDevices?.().length||0,
      connected_node_count:this.broker?.snapshot?.().nodes?.filter((x)=>x.connected).length||0,
      fabric_deployment_receipt:this.fabric?.receipt?.receipt_hash||null,
      service_relay_receipt:this.relay?.receipt_hash||null,
      relay_token_persisted:false,
      allocator_authority_persisted:false,
      named_cloud_required:false,
      last_error:this.lastError,
      observed_at:new Date().toISOString(),
      ...extra,
    };
    const record={...body,receipt_hash:sha(body)};
    atomicJson(this.#stateFile(),record);
    this.lastAction=action;
    return record;
  }

  async start(){
    if(this.running) return this.status();
    this.startedAt=Date.now();
    this.running=true;
    this.yard=new YardOperator({stateDir:path.join(this.stateDir,'yard')});
    this.broker=await startOutboundCapacityBroker({
      host:this.brokerHost,
      port:this.brokerPort,
      stateDir:path.join(this.stateDir,'broker'),
      capacityFreshMs:20_000,
      commandTimeoutMs:20_000,
      pollWaitMs:1_000,
    });
    const actualPort=Number(new URL(this.broker.endpoint).port);
    const advertiseEndpoint='http://'+this.brokerAdvertiseHost+':'+actualPort;
    this.beacon=await startRemoteBrokerBeacon({
      gatewayNodeId:this.gatewayNodeId,
      brokerEndpoint:advertiseEndpoint,
    });
    this.#record('broker_ready',{
      broker_bind_scope:this.brokerHost==='0.0.0.0'?'lan':'explicit',
      broker_advertise_endpoint:advertiseEndpoint,
    });
    this.loopPromise=this.#loop();
    return this.status();
  }

  async #maybeCommission(){
    if(!this.commissioning) return false;
    if(Date.now()-this.startedAt>=this.commissioningMs) return false;
    if(this.broker.authorizedDevices().length>0) return false;
    const pending=this.broker.pendingEnrollmentRequests()
      .filter((request)=>
        request.identity_attested===true&&
        String(request.node_id||'').startsWith(this.commissioningNodePrefix)
      );
    if(pending.length!==1) return false;
    const request=pending[0];
    const approvalRef=
      'saban-gateway-local-commissioning:'+
      this.gatewayNodeId+':'+
      String(request.request_receipt_hash||'').slice(-24);
    const receipt=this.broker.authorizeDevice({
      deviceFingerprint:request.device_fingerprint,
      nodeId:request.node_id,
      approvalRef,
    });
    this.lastAuthorizedReceipt=receipt.receipt_hash;
    this.#record('device_commissioned',{
      commissioned_node_id:request.node_id,
      commissioned_device_fingerprint:request.device_fingerprint,
      commissioning_receipt:receipt.receipt_hash,
      commissioning_scope:'single_attested_local_enrollment',
    });
    return true;
  }

  #eligibleNodes(){
    return (this.broker.snapshot().nodes||[])
      .filter((node)=>
        node.connected===true&&
        node.capacity?.attestation_supported===true&&
        node.capacity?.device_fingerprint===node.device_fingerprint&&
        Array.isArray(node.capacity?.supported_workloads)&&
        node.capacity.supported_workloads.includes('systemia.fabric-local-mcp.v1')&&
        Array.isArray(node.capacity?.placement_labels)&&
        node.capacity.placement_labels.includes('outbound-only')
      )
      .sort((a,b)=>
        String(b.last_seen_at||'').localeCompare(String(a.last_seen_at||''))||
        String(a.node_id).localeCompare(String(b.node_id))
      );
  }

  async #bridgeHealthy(){
    if(!this.bridge) return false;
    try{
      const response=await fetch(this.bridge.url+'/health',{
        headers:{accept:'application/json'},
        signal:AbortSignal.timeout(3_000),
      });
      const body=await response.json().catch(()=>null);
      return response.ok&&
        body?.ok===true&&
        body?.service==='evercraft-fabric-local'&&
        body?.runtime==='Evercraft Compute'&&
        body?.base44_transport_enabled===false;
    }catch{
      return false;
    }
  }

  async #teardownRelay(reason){
    if(this.bridge){
      try{await this.bridge.close();}catch{}
      this.bridge=null;
    }
    if(this.relay){
      try{this.broker.releaseServiceRelay(this.relay.relay_id,reason);}catch{}
      this.relay=null;
    }
    if(this.fabric){
      try{this.yard.stopLeaseKeeper('saban-gateway-fabric');}catch{}
      try{
        await this.yard.stopDeployment('saban-gateway-fabric',{reason});
      }catch{}
      this.fabric=null;
    }
    this.selectedNodeId=null;
  }

  async #ensureRelay(){
    if(await this.#bridgeHealthy()){
      if(this.lastAction!=='ready'){
        this.#record('ready',{
          public_reverse_proxy_target:'http://127.0.0.1:'+this.bridgePort,
          transport:'evercraft.outbound-capacity.v1',
        });
      }
      return true;
    }

    if(this.bridge||this.relay||this.fabric){
      await this.#teardownRelay('gateway_reconcile');
    }

    const eligible=this.#eligibleNodes();
    if(!eligible.length){
      if(this.lastAction!=='waiting_for_private_compute'){
        this.#record('waiting_for_private_compute');
      }
      return false;
    }

    const selected=eligible[0];
    const grant=this.broker.controlGrant(selected.node_id);
    if(!grant?.capacity_endpoint||!grant?.allocator_token){
      this.#record('waiting_for_control_grant',{selected_remote_node_id:selected.node_id});
      return false;
    }

    this.selectedNodeId=selected.node_id;
    this.fabric=await this.yard.deployRelease({
      deploymentId:'saban-gateway-fabric',
      releaseRef:this.releaseRef,
      workloadClass:'systemia.fabric-local-mcp.v1',
      capacityEndpoint:grant.capacity_endpoint,
      allocatorToken:grant.allocator_token,
      input:{port:0},
      rollbackTarget:'saban-gateway:fabric-previous',
      leaseTtlMs:this.leaseTtlMs,
    });
    this.yard.startLeaseKeeper('saban-gateway-fabric',{
      ttlMs:this.leaseTtlMs,
      renewEveryMs:this.renewEveryMs,
    });

    this.relay=await this.broker.createServiceRelay({
      nodeId:selected.node_id,
      serviceId:this.fabric.result.service_id,
      ttlMs:Math.min(this.leaseTtlMs,60*60_000),
    });

    const actualBrokerPort=Number(new URL(this.broker.endpoint).port);
    this.bridge=await startFederatedServiceBridge({
      relayUrl:
        'http://127.0.0.1:'+actualBrokerPort+this.relay.proxy_path,
      relayToken:this.relay.relay_token,
      host:this.bridgeHost,
      port:this.bridgePort,
    });

    const healthy=await this.#bridgeHealthy();
    if(!healthy){
      throw new Error('gateway_fabric_bridge_health_failed');
    }
    this.#record('ready',{
      selected_remote_node_id:selected.node_id,
      selected_device_fingerprint:selected.device_fingerprint,
      public_reverse_proxy_target:'http://127.0.0.1:'+this.bridgePort,
      transport:'evercraft.outbound-capacity.v1',
      remote_compute_scope:'private_outbound_only',
      gateway_compute_scope:'public_ingress_only',
      chromeos_host_forward_required:false,
    });
    return true;
  }

  async #loop(){
    while(this.running){
      try{
        await this.#maybeCommission();
        await this.#ensureRelay();
        this.lastError=null;
      }catch(error){
        this.lastError=String(error?.message||error);
        this.#record('degraded');
      }
      await sleep(this.reconcileMs);
    }
  }

  status(){
    return {
      schema:'evercraft.saban.public-gateway-status.v1',
      ok:this.running&&this.lastAction==='ready'&&!this.lastError,
      running:this.running,
      action:this.lastAction,
      gateway_node_id:this.gatewayNodeId,
      domain:this.domain||null,
      broker_endpoint:this.broker
        ? 'http://'+this.brokerAdvertiseHost+':'+Number(new URL(this.broker.endpoint).port)
        : null,
      bridge_origin:this.bridge?.url||null,
      selected_remote_node_id:this.selectedNodeId,
      authorized_device_count:this.broker?.authorizedDevices?.().length||0,
      connected_node_count:this.broker?.snapshot?.().nodes?.filter((x)=>x.connected).length||0,
      commissioning_active:this.commissioning&&
        Date.now()-this.startedAt<this.commissioningMs,
      last_authorization_receipt:this.lastAuthorizedReceipt,
      last_error:this.lastError,
      chromeos_host_forward_required:false,
      named_cloud_required:false,
    };
  }

  async close(){
    this.running=false;
    try{await this.loopPromise;}catch{}
    await this.#teardownRelay('gateway_shutdown');
    if(this.beacon){
      try{await this.beacon.close();}catch{}
      this.beacon=null;
    }
    if(this.broker){
      try{await this.broker.close();}catch{}
      this.broker=null;
    }
    this.#record('stopped');
  }
}

async function main(){
  const stateDir=path.resolve(arg(
    '--state',
    process.env.EVERCRAFT_GATEWAY_STATE_DIR||
      path.join(os.homedir(),'.local','state','evercraft','public-gateway')
  ));
  const appliance=new SabanPublicGatewayAppliance({
    stateDir,
    gatewayNodeId:arg(
      '--node-id',
      process.env.EVERCRAFT_GATEWAY_NODE_ID||'saban-gateway-'+os.hostname()
    ),
    releaseRef:arg('--release-ref',sourceReleaseRef()),
    domain:arg('--domain',process.env.EVERCRAFT_PUBLIC_HOST||''),
    brokerHost:arg('--broker-host',process.env.EVERCRAFT_GATEWAY_BROKER_HOST||'0.0.0.0'),
    brokerPort:Number(arg('--broker-port',process.env.EVERCRAFT_GATEWAY_BROKER_PORT||'8794')),
    brokerAdvertiseHost:arg(
      '--advertise-host',
      process.env.EVERCRAFT_GATEWAY_LAN_HOST||firstLanIpv4()
    ),
    bridgePort:Number(arg('--bridge-port',process.env.EVERCRAFT_GATEWAY_BRIDGE_PORT||'8795')),
    commissioning:
      String(process.env.EVERCRAFT_GATEWAY_COMMISSIONING||'true').toLowerCase()!=='false',
    commissioningMs:Number(
      process.env.EVERCRAFT_GATEWAY_COMMISSIONING_MS||String(5*60_000)
    ),
    commissioningNodePrefix:
      process.env.EVERCRAFT_GATEWAY_COMMISSIONING_NODE_PREFIX||'chromebook-',
  });
  await appliance.start();
  process.stdout.write(JSON.stringify({...appliance.status(),observed_at:new Date().toISOString()})+'\n');

  let closing=false;
  const close=async()=>{
    if(closing) return;
    closing=true;
    await appliance.close();
    process.exit(0);
  };
  process.on('SIGINT',()=>close().catch(()=>process.exit(1)));
  process.on('SIGTERM',()=>close().catch(()=>process.exit(1)));
  await new Promise(()=>{});
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch((error)=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.public-gateway-error.v1',
      error:error instanceof Error?error.message:String(error),
      chromeos_host_forward_required:false,
      named_cloud_required:false,
    })+'\n');
    process.exitCode=1;
  });
}
