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

export class RivetReportEdgeController {
  constructor({
    yard,
    stateDir,
    edgeDeploymentId='evercraft-public-edge',
    rivetDeploymentId='rivet-report-runtime',
    requestedHostname='rivet-reports',
    stableHostname=true,
    leaseTtlMs=3600000,
    renewEveryMs=1800000,
    allowLoopbackProof=false,
  }={}){
    if(!yard) throw new Error('yard_operator_required');
    if(!stateDir) throw new Error('rivet_report_edge_state_dir_required');
    this.yard=yard;
    this.stateDir=path.resolve(stateDir);
    this.edgeDeploymentId=edgeDeploymentId;
    this.rivetDeploymentId=rivetDeploymentId;
    this.requestedHostname=String(requestedHostname||'rivet-reports');
    this.stableHostname=stableHostname!==false;
    this.leaseTtlMs=Math.max(60000,Number(leaseTtlMs||3600000));
    this.renewEveryMs=Math.max(30000,Number(renewEveryMs||1800000));
    this.allowLoopbackProof=Boolean(allowLoopbackProof);
    this.binding=null;
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
    const file=this.#stateFile();
    if(fs.existsSync(file)){
      try{
        const persisted=JSON.parse(fs.readFileSync(file,'utf8'));
        if(persisted?.schema==='evercraft.rivet.report-edge-controller-state.v1'){
          this.binding=persisted.binding||null;
          this.requestedHostname=String(persisted.requested_hostname||this.requestedHostname);
          this.stableHostname=Boolean(persisted.stable_hostname??this.stableHostname);
        }
      }catch{}
    }
  }

  #stateFile(){ return path.join(this.stateDir,'rivet-report-edge-controller.json'); }

  #persist(extra={}){
    const body={
      schema:'evercraft.rivet.report-edge-controller-state.v1',
      edge_deployment_id:this.edgeDeploymentId,
      rivet_deployment_id:this.rivetDeploymentId,
      requested_hostname:this.requestedHostname,
      stable_hostname:this.stableHostname,
      binding:this.binding,
      updated_at:new Date().toISOString(),
      ...extra,
    };
    const record={...body,receipt_hash:sha(body)};
    atomicJson(this.#stateFile(),record);
    return record;
  }

  #result(action,data={}){
    const body={
      schema:'evercraft.rivet.report-edge-controller-result.v1',
      action,
      edge_deployment_id:this.edgeDeploymentId,
      rivet_deployment_id:this.rivetDeploymentId,
      observed_at:new Date().toISOString(),
      ...data,
    };
    return {...body,receipt_hash:sha(body)};
  }

  #broker(){
    return new YardPublicRouteBroker({
      yard:this.yard,
      providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
      allowLoopbackProof:this.allowLoopbackProof,
    });
  }

  async #routeHealth(record){
    if(!this.binding) return {ok:false,state:'binding_missing'};
    if(this.binding.route_scope==='public_https'){
      const route=await this.yard.verifyRoute(this.rivetDeploymentId);
      return {ok:route.ok===true,state:route.state};
    }
    if(this.allowLoopbackProof&&this.binding.route_scope==='loopback_proof'){
      try{
        const health=await fetch(this.binding.origin+'/health').then(r=>r.json());
        const ok=
          health.ok===true &&
          health.service==='rivet-yard-report-runtime' &&
          health.instance_id===record.result?.instance_id &&
          health.deployment_receipt_bound===true &&
          health.deployment_receipt_ref===record.receipt?.receipt_hash;
        return {ok,state:ok?'loopback_proof_healthy':'loopback_proof_mismatch'};
      }catch{
        return {ok:false,state:'loopback_proof_unreachable'};
      }
    }
    return {ok:false,state:'route_scope_not_admitted'};
  }

  async provision({
    releaseRef,
    capacityEndpoint,
    allocatorToken='',
    sourceUrl='',
    stateRoot='',
    requestedHostname=this.requestedHostname,
    stableHostname=this.stableHostname,
    rollbackTarget='systemia:rivet-report-runtime-previous',
  }={}){
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))) throw new Error('release_ref_must_be_immutable_sha');
    if(!capacityEndpoint) throw new Error('capacity_endpoint_required');
    const edge=this.yard.deploymentStatus(this.edgeDeploymentId);
    if(!edge||edge.state!=='ready') throw new Error('public_edge_not_ready');
    this.requestedHostname=String(requestedHostname||'rivet-reports');
    this.stableHostname=stableHostname!==false;

    let record=null;
    let broker=null;
    try{
      record=await this.yard.deployRelease({
        deploymentId:this.rivetDeploymentId,
        releaseRef,
        workloadClass:'systemia.rivet-report-runtime.v1',
        capacityEndpoint,
        allocatorToken,
        input:{
          ...(stateRoot?{state_root:String(stateRoot)}:{}),
          ...(sourceUrl?{source_url:String(sourceUrl)}:{}),
        },
        rollbackTarget:String(rollbackTarget||'systemia:rivet-report-runtime-previous'),
        leaseTtlMs:this.leaseTtlMs,
      });
      if(record.receipt?.capacity_node_id!==edge.receipt?.capacity_node_id){
        throw new Error('edge_and_rivet_must_share_compute_node_for_loopback_upstream');
      }

      broker=this.#broker();
      this.binding=await broker.bindDeployment(this.rivetDeploymentId,{
        requestedHostname:this.requestedHostname,
        ttlMs:this.leaseTtlMs,
        stableHostname:this.stableHostname,
      });
      if(!this.allowLoopbackProof&&this.binding.route_verified!==true){
        throw new Error('rivet_public_https_route_verification_required');
      }
      this.yard.startLeaseKeeper(this.rivetDeploymentId,{
        ttlMs:this.leaseTtlMs,
        renewEveryMs:this.renewEveryMs,
      });
      this.#persist({last_action:'provisioned'});
      return this.#result('provisioned',{
        runtime_fabric:'Evercraft Compute',
        node_id:record.receipt?.capacity_node_id||null,
        deployment_receipt:record.receipt?.receipt_hash||null,
        route_binding_receipt:this.binding.receipt_hash,
        route_scope:this.binding.route_scope,
        route_verified:this.binding.route_verified===true,
        origin:this.binding.origin,
        authenticated_report_api:true,
        founder_login_required:false,
      });
    }catch(error){
      if(this.binding&&broker){
        try{await broker.releaseBinding(this.binding,{reason:'rivet_report_provision_failed'});}catch{}
      }
      this.binding=null;
      if(record){
        try{await this.yard.stopDeployment(this.rivetDeploymentId,{reason:'rivet_report_provision_failed'});}catch{}
      }
      this.#persist({last_action:'provision_failed',last_error:String(error?.message||error)});
      throw error;
    }
  }

  async resume({rebindIfNeeded=true}={}){
    const edge=this.yard.deploymentStatus(this.edgeDeploymentId);
    const record=this.yard.deploymentStatus(this.rivetDeploymentId);
    if(!edge||edge.state!=='ready') throw new Error('public_edge_not_ready');
    if(!record||record.state!=='ready') throw new Error('rivet_report_runtime_not_ready');
    if(record.receipt?.capacity_node_id!==edge.receipt?.capacity_node_id){
      throw new Error('edge_and_rivet_node_drift');
    }
    await this.yard.renewDeploymentLease(this.rivetDeploymentId,{ttlMs:this.leaseTtlMs});
    let health=await this.#routeHealth(record);
    if((!this.binding||!health.ok)&&rebindIfNeeded){
      const broker=this.#broker();
      if(this.binding){
        try{await broker.releaseBinding(this.binding,{reason:'rivet_report_resume_rebind'});}catch{}
      }
      this.binding=await broker.bindDeployment(this.rivetDeploymentId,{
        requestedHostname:this.requestedHostname,
        ttlMs:this.leaseTtlMs,
        stableHostname:this.stableHostname,
      });
      health=await this.#routeHealth(record);
    }
    if(!health.ok) throw new Error('rivet_report_route_unhealthy:'+health.state);
    this.yard.startLeaseKeeper(this.rivetDeploymentId,{
      ttlMs:this.leaseTtlMs,
      renewEveryMs:this.renewEveryMs,
    });
    this.#persist({last_action:'resumed'});
    return this.#result('resumed',{
      health_state:health.state,
      route_scope:this.binding.route_scope,
      route_verified:this.binding.route_verified===true,
      origin:this.binding.origin,
      authenticated_report_api:true,
      founder_login_required:false,
    });
  }

  async tick(){
    const record=this.yard.deploymentStatus(this.rivetDeploymentId);
    if(!record||record.state!=='ready'||!this.binding){
      return this.#result('hold',{reason:'rivet_report_edge_not_fully_provisioned'});
    }
    const health=await this.#routeHealth(record);
    if(!health.ok){
      return this.#result('hold',{reason:'rivet_report_route_unhealthy',health_state:health.state});
    }
    const renewal=await this.yard.renewDeploymentLease(this.rivetDeploymentId,{ttlMs:this.leaseTtlMs});
    return this.#result('healthy',{
      health_state:health.state,
      route_scope:this.binding.route_scope,
      route_verified:this.binding.route_verified===true,
      origin:this.binding.origin,
      lease_renewal_receipt:renewal.receipt_hash,
    });
  }

  async close({reason='operator_requested'}={}){
    this.yard.stopLeaseKeeper(this.rivetDeploymentId);
    let release=null;
    const previous=this.binding;
    if(this.binding){
      try{release=await this.#broker().releaseBinding(this.binding,{reason});}catch{}
    }
    this.binding=null;
    try{await this.yard.stopDeployment(this.rivetDeploymentId,{reason});}catch{}
    this.#persist({last_action:'stopped'});
    return this.#result('stopped',{
      reason,
      released_origin:previous?.origin||null,
      route_release_receipt:release?.receipt_hash||null,
    });
  }
}
