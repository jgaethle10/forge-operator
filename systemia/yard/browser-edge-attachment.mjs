import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { YardPublicRouteBroker } from './public-route-broker.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

export class BrowserEdgeAttachment {
  constructor({
    yard,
    stateDir,
    edgeDeploymentId='evercraft-public-edge',
    browserDeploymentId='evercraft-web-browser',
    leaseTtlMs=3600000,
    renewEveryMs=1800000,
    intervalMs=60000,
    allowLoopbackProof=false,
    providerClient=null,
  }={}){
    if(!yard) throw new Error('yard_operator_required');
    if(!stateDir) throw new Error('browser_edge_state_dir_required');
    this.yard=yard;
    this.stateDir=path.resolve(stateDir);
    this.edgeDeploymentId=edgeDeploymentId;
    this.browserDeploymentId=browserDeploymentId;
    this.leaseTtlMs=Math.max(60000,Number(leaseTtlMs||3600000));
    this.renewEveryMs=Math.max(30000,Number(renewEveryMs||1800000));
    this.intervalMs=Math.max(5000,Number(intervalMs||60000));
    this.allowLoopbackProof=Boolean(allowLoopbackProof);
    this.providerClient=providerClient;
    this.binding=null;
    this.requestedHostname='evercraft-browser';
    this.timer=null;
    this.inFlight=false;
    this.sequence=0;
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
    this.#load();
  }

  #stateFile(){
    return path.join(this.stateDir,'browser-edge-attachment.json');
  }

  #load(){
    const file=this.#stateFile();
    if(!fs.existsSync(file)) return;
    try{
      const persisted=JSON.parse(fs.readFileSync(file,'utf8'));
      if(persisted?.schema!=='evercraft.yard.browser-edge-state.v1') return;
      this.binding=persisted.binding||null;
      this.requestedHostname=String(persisted.requested_hostname||'evercraft-browser');
      this.sequence=Math.max(0,Number(persisted.sequence||0));
    }catch{}
  }

  #persist(extra={}){
    const body={
      schema:'evercraft.yard.browser-edge-state.v1',
      edge_deployment_id:this.edgeDeploymentId,
      browser_deployment_id:this.browserDeploymentId,
      binding:this.binding,
      requested_hostname:this.requestedHostname,
      allow_loopback_proof:this.allowLoopbackProof,
      sequence:this.sequence,
      updated_at:new Date().toISOString(),
      ...extra,
    };
    const record={...body,receipt_hash:sha(body)};
    atomicJson(this.#stateFile(),record);
    return record;
  }

  #result(action,data={}){
    const body={
      schema:'evercraft.yard.browser-edge-result.v1',
      action,
      sequence:++this.sequence,
      edge_deployment_id:this.edgeDeploymentId,
      browser_deployment_id:this.browserDeploymentId,
      observed_at:new Date().toISOString(),
      ...data,
    };
    const result={...body,receipt_hash:sha(body)};
    this.#persist({last_result:result});
    return result;
  }

  #broker(){
    if(this.providerClient){
      return new YardPublicRouteBroker({
        yard:this.yard,
        providerClient:this.providerClient,
        allowLoopbackProof:this.allowLoopbackProof,
      });
    }
    const edge=this.yard.deploymentStatus(this.edgeDeploymentId);
    if(!edge||edge.state!=='ready'){
      throw new Error('evercraft_public_edge_deployment_required');
    }
    return new YardPublicRouteBroker({
      yard:this.yard,
      providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
      allowLoopbackProof:this.allowLoopbackProof,
    });
  }

  async provision({
    releaseRef,
    capacityEndpoint,
    allocatorToken='',
    requestedHostname='evercraft-browser',
    maxConcurrency=2,
    rollbackTarget='systemia:auto-browser-previous',
  }={}){
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))){
      throw new Error('release_ref_must_be_immutable_sha');
    }
    if(!capacityEndpoint) throw new Error('capacity_endpoint_required');
    this.requestedHostname=String(requestedHostname||'evercraft-browser').trim()||'evercraft-browser';

    let browserRecord=null;
    let binding=null;
    const broker=this.#broker();
    try{
      browserRecord=await this.yard.deployRelease({
        deploymentId:this.browserDeploymentId,
        releaseRef,
        workloadClass:'systemia.evercraft-web-browser.v1',
        capacityEndpoint,
        allocatorToken,
        input:{max_concurrency:Math.max(1,Math.min(8,Number(maxConcurrency)||2))},
        rollbackTarget,
        leaseTtlMs:this.leaseTtlMs,
      });

      binding=await broker.bindDeployment(this.browserDeploymentId,{
        requestedHostname:this.requestedHostname,
        stableHostname:true,
        ttlMs:this.leaseTtlMs,
      });

      if(!this.allowLoopbackProof){
        if(binding.route_scope!=='public_https'||binding.route_verified!==true){
          throw new Error('browser_public_https_route_not_verified');
        }
      }

      this.binding=binding;
      this.yard.startLeaseKeeper(this.browserDeploymentId,{
        ttlMs:this.leaseTtlMs,
        renewEveryMs:this.renewEveryMs,
      });

      return this.#result('provisioned',{
        runtime_fabric:'Evercraft Compute',
        workload_class:'systemia.evercraft-web-browser.v1',
        route_scope:binding.route_scope,
        route_verified:binding.route_verified,
        origin:binding.origin,
        deployment_receipt:browserRecord.receipt?.receipt_hash||null,
        public_route_receipt:binding.public_route_receipt_hash||null,
        route_binding_receipt:binding.receipt_hash,
        raw_worker_publicly_exposed:false,
        founder_login_required:false,
      });
    }catch(error){
      if(binding){
        try{ await broker.releaseBinding(binding,{reason:'browser_edge_provision_failed'}); }catch{}
      }
      if(browserRecord){
        try{ await this.yard.stopDeployment(this.browserDeploymentId,{reason:'browser_edge_provision_failed'}); }catch{}
      }
      this.binding=null;
      this.#persist({last_error:String(error?.message||error)});
      throw error;
    }
  }

  async resume({rebindIfNeeded=true}={}){
    const record=this.yard.deploymentStatus(this.browserDeploymentId);
    if(!record||record.state!=='ready'){
      return this.#result('hold',{reason:'browser_deployment_not_ready'});
    }

    const broker=this.#broker();
    let health=await this.yard.verifyRoute(this.browserDeploymentId);
    if((!health.ok||!this.binding)&&rebindIfNeeded){
      if(this.binding){
        try{ await broker.releaseBinding(this.binding,{reason:'browser_edge_resume_rebind'}); }catch{}
      }
      this.binding=await broker.bindDeployment(this.browserDeploymentId,{
        requestedHostname:this.requestedHostname,
        stableHostname:true,
        ttlMs:this.leaseTtlMs,
      });
      health=await this.yard.verifyRoute(this.browserDeploymentId);
    }

    const acceptable=
      health.ok===true ||
      (
        this.allowLoopbackProof&&
        this.binding?.route_scope==='loopback_proof'&&
        health.state==='public_route_unbound'
      );
    if(!acceptable){
      throw new Error('browser_edge_resume_health_failed:'+String(health.state||'unknown'));
    }

    this.yard.startLeaseKeeper(this.browserDeploymentId,{
      ttlMs:this.leaseTtlMs,
      renewEveryMs:this.renewEveryMs,
    });

    return this.#result('resumed',{
      route_scope:this.binding?.route_scope||null,
      route_verified:this.binding?.route_verified===true,
      origin:this.binding?.origin||null,
      browser_health_state:health.state,
    });
  }

  async tick(){
    if(this.inFlight) return this.#result('hold',{reason:'browser_edge_tick_in_flight'});
    this.inFlight=true;
    try{
      const record=this.yard.deploymentStatus(this.browserDeploymentId);
      if(!record||!this.binding){
        return this.#result('hold',{reason:'browser_edge_not_fully_provisioned'});
      }
      const health=await this.yard.verifyRoute(this.browserDeploymentId);
      const healthy=health.ok===true;
      if(!healthy){
        return this.#result('hold',{
          reason:'browser_public_route_health_failed',
          route_scope:this.binding.route_scope,
          browser_health_state:health.state,
        });
      }
      const renewal=await this.yard.renewDeploymentLease(
        this.browserDeploymentId,
        {ttlMs:this.leaseTtlMs}
      );
      return this.#result('healthy',{
        route_scope:this.binding.route_scope,
        route_verified:this.binding.route_verified===true,
        origin:this.binding.origin,
        browser_health_state:health.state,
        lease_renewal_receipt:renewal.receipt_hash,
      });
    }finally{
      this.inFlight=false;
    }
  }

  start({immediate=true}={}){
    if(this.timer) return;
    if(immediate) this.tick().catch(()=>{});
    this.timer=setInterval(()=>this.tick().catch(()=>{}),this.intervalMs);
    this.timer.unref?.();
  }

  stop(){
    if(this.timer) clearInterval(this.timer);
    this.timer=null;
  }

  async close({reason='operator_requested'}={}){
    this.stop();
    this.yard.stopLeaseKeeper(this.browserDeploymentId);
    let released=null;
    if(this.binding){
      try{
        released=await this.#broker().releaseBinding(this.binding,{reason});
      }catch{}
    }
    try{ await this.yard.stopDeployment(this.browserDeploymentId,{reason}); }catch{}
    const previous=this.binding;
    this.binding=null;
    return this.#result('stopped',{
      reason,
      released_origin:previous?.origin||null,
      route_release_receipt:released?.receipt_hash||null,
    });
  }
}
