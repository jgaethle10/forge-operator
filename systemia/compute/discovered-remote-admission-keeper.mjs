import { setTimeout as sleep } from 'node:timers/promises';
import { discoverRemoteBrokerBeacons } from '../network/remote-broker-beacon.mjs';
import { RemoteAdmissionKeeper } from './remote-admission-keeper.mjs';

export class DiscoveredRemoteAdmissionKeeper {
  constructor({
    localCapacityEndpoint,
    localAllocatorToken,
    discoveryTimeoutMs=1_000,
    rediscoveryMs=15_000,
    retryBaseMs=2_000,
    fallbackBrokerUrls=[],
    brokerDiscovery=discoverRemoteBrokerBeacons,
    clock=()=>new Date(),
  }={}){
    if(!localCapacityEndpoint) throw new Error('localCapacityEndpoint is required');
    if(!localAllocatorToken) throw new Error('localAllocatorToken is required');
    if(typeof brokerDiscovery!=='function') throw new Error('brokerDiscovery is required');
    this.localCapacityEndpoint=String(localCapacityEndpoint);
    this.localAllocatorToken=String(localAllocatorToken);
    this.discoveryTimeoutMs=Math.max(100,Number(discoveryTimeoutMs||1_000));
    this.rediscoveryMs=Math.max(1_000,Number(rediscoveryMs||15_000));
    this.retryBaseMs=Math.max(250,Number(retryBaseMs||2_000));
    this.fallbackBrokerUrls=[...new Set((fallbackBrokerUrls||[]).map(String).map((v)=>v.trim()).filter(Boolean))]
      .map((value)=>{
        const url=new URL(value);
        if(url.protocol!=='https:'&&url.protocol!=='http:'){
          throw new Error('fallback_broker_url_protocol_invalid');
        }
        if(url.username||url.password||url.search||url.hash){
          throw new Error('fallback_broker_url_unsafe');
        }
        return url.toString().replace(/\/$/,'');
      });
    this.brokerDiscovery=brokerDiscovery;
    this.clock=clock;
    this.running=false;
    this.keeper=null;
    this.loopPromise=null;
    this.selectedBroker=null;
    this.lastDiscoveryAt=null;
    this.lastError=null;
    this.discoveryAttempts=0;
  }

  async #loop(){
    while(this.running){
      try{
        if(!this.keeper){
          this.discoveryAttempts+=1;
          this.lastDiscoveryAt=this.clock().toISOString();
          const found=await this.brokerDiscovery({timeoutMs:this.discoveryTimeoutMs});
          const selected=found[0]||(
            this.fallbackBrokerUrls.length
              ? {
                  gateway_node_id:'configured-fallback',
                  broker_endpoint:this.fallbackBrokerUrls[0],
                  expires_at:null,
                }
              : null
          );
          if(selected){
            this.selectedBroker={
              gateway_node_id:selected.gateway_node_id,
              broker_endpoint:selected.broker_endpoint,
              expires_at:selected.expires_at,
            };
            this.keeper=new RemoteAdmissionKeeper({
              brokerUrl:selected.broker_endpoint,
              localCapacityEndpoint:this.localCapacityEndpoint,
              localAllocatorToken:this.localAllocatorToken,
              retryBaseMs:this.retryBaseMs,
              clock:this.clock,
            });
            this.keeper.start();
            this.lastError=null;
          }else{
            this.lastError='no_local_remote_broker_beacon';
          }
        }else{
          const status=this.keeper.status();
          if(status.connected){
            this.lastError=null;
          }else if(status.attempts>=6&&status.last_error){
            await this.keeper.close();
            this.keeper=null;
            this.selectedBroker=null;
            this.lastError='selected_broker_degraded:'+status.last_error;
          }
        }
      }catch(error){
        this.lastError=String(error?.message||error);
      }
      await sleep(this.rediscoveryMs,undefined,{ref:false});
    }
  }

  start(){
    if(this.running) return this.status();
    this.running=true;
    this.loopPromise=this.#loop().catch((error)=>{
      this.lastError=String(error?.message||error);
    });
    return this.status();
  }

  status(){
    const inner=this.keeper?.status?.()||null;
    return {
      schema:'evercraft.local-organism.discovered-remote-admission-status.v1',
      configured:true,
      discovery_mode:'local_multicast',
      running:this.running,
      connected:inner?.connected===true,
      broker_endpoint:this.selectedBroker?.broker_endpoint||null,
      gateway_node_id:this.selectedBroker?.gateway_node_id||null,
      fallback_broker_count:this.fallbackBrokerUrls.length,
      enrollment_state:inner?.enrollment_state||'not_requested',
      enrollment_request_receipt:inner?.enrollment_request_receipt||null,
      node_id:inner?.node_id||null,
      device_fingerprint:inner?.device_fingerprint||null,
      attempts:inner?.attempts||0,
      discovery_attempts:this.discoveryAttempts,
      last_discovery_at:this.lastDiscoveryAt,
      last_error:inner?.last_error||this.lastError,
      public_ingress:false,
      local_compute_scope:'loopback_only',
      secure_envelope_schema:'evercraft.secure-envelope.v1',
    };
  }

  async waitForConnected({timeoutMs=30_000,pollMs=100}={}){
    const deadline=Date.now()+Math.max(100,Number(timeoutMs||30_000));
    while(Date.now()<deadline){
      const status=this.status();
      if(status.connected) return status;
      await sleep(Math.max(25,Number(pollMs||100)));
    }
    throw new Error('discovered_remote_admission_connect_timeout');
  }

  async close(){
    this.running=false;
    if(this.keeper){
      try{await this.keeper.close();}catch{}
      this.keeper=null;
    }
    this.loopPromise=null;
  }
}
