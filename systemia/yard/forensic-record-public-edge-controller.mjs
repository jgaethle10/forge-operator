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

export class ForensicRecordPublicEdgeController {
  constructor({
    yard,
    stateDir,
    edgeDeploymentId='evercraft-public-edge',
    privateDeploymentId='forensic-record-runtime',
    publicDeploymentId='forensic-record-public-runtime',
    requestedHostname='files-companion-staging',
    stableHostname=true,
    leaseTtlMs=3600000,
    renewEveryMs=1800000,
    allowLoopbackProof=false,
  }={}){
    if(!yard) throw new Error('yard_operator_required');
    if(!stateDir) throw new Error('forensic_public_edge_state_dir_required');
    this.yard=yard;
    this.stateDir=path.resolve(stateDir);
    this.edgeDeploymentId=edgeDeploymentId;
    this.privateDeploymentId=privateDeploymentId;
    this.publicDeploymentId=publicDeploymentId;
    this.requestedHostname=String(requestedHostname||'files-companion-staging');
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
        if(persisted?.schema==='evercraft.forensic-record.public-edge-controller-state.v1'){
          this.binding=persisted.binding||null;
          this.requestedHostname=String(persisted.requested_hostname||this.requestedHostname);
          this.stableHostname=Boolean(persisted.stable_hostname??this.stableHostname);
        }
      }catch{}
    }
  }

  #stateFile(){ return path.join(this.stateDir,'forensic-record-public-edge-controller.json'); }

  #assertStagingHostname(value){
    const hostname=String(value||'').trim();
    if(!hostname) throw new Error('forensic_public_staging_hostname_required');
    if(/filescompanion\.com/i.test(hostname)){
      throw new Error('canonical_filescompanion_domain_cutover_forbidden_in_staging_controller');
    }
    return hostname;
  }

  #persist(extra={}){
    const body={
      schema:'evercraft.forensic-record.public-edge-controller-state.v1',
      edge_deployment_id:this.edgeDeploymentId,
      private_deployment_id:this.privateDeploymentId,
      public_deployment_id:this.publicDeploymentId,
      requested_hostname:this.requestedHostname,
      stable_hostname:this.stableHostname,
      canonical_domain_cutover:false,
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
      schema:'evercraft.forensic-record.public-edge-controller-result.v1',
      action,
      edge_deployment_id:this.edgeDeploymentId,
      private_deployment_id:this.privateDeploymentId,
      public_deployment_id:this.publicDeploymentId,
      canonical_domain_cutover:false,
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
      const route=await this.yard.verifyRoute(this.publicDeploymentId);
      return {ok:route.ok===true,state:route.state};
    }
    if(this.allowLoopbackProof&&this.binding.route_scope==='loopback_proof'){
      try{
        const health=await fetch(this.binding.origin+'/health').then(r=>r.json());
        const ok=
          health.ok===true &&
          health.service==='forensic-record-public-runtime' &&
          health.mode==='public_read_only' &&
          health.read_only===true &&
          health.public_safe_projection===true &&
          health.protected_domains_exposed===false &&
          health.write_routes_exposed===false &&
          health.seed_complete===true &&
          health.instance_id===record.result?.instance_id &&
          health.deployment_receipt_ref===record.receipt?.receipt_hash;
        return {ok,state:ok?'loopback_proof_healthy':'loopback_proof_mismatch'};
      }catch{
        return {ok:false,state:'loopback_proof_unreachable'};
      }
    }
    return {ok:false,state:'route_scope_not_admitted'};
  }

  async #assertPrivateRuntimeReady(){
    const edge=this.yard.deploymentStatus(this.edgeDeploymentId);
    const source=this.yard.deploymentStatus(this.privateDeploymentId);
    if(!edge||edge.state!=='ready') throw new Error('public_edge_not_ready');
    if(!source||source.state!=='ready') throw new Error('forensic_private_runtime_not_ready');
    if(source.receipt?.capacity_node_id!==edge.receipt?.capacity_node_id){
      throw new Error('forensic_private_runtime_and_public_edge_node_drift');
    }
    const local=await this.yard.verifyRoute(this.privateDeploymentId);
    const seeded=
      local.ok===true &&
      local.health?.seed_complete===true &&
      local.health?.seed_protected_entities_imported===false &&
      Number(local.health?.finding_rows||0)>0 &&
      local.health?.base44_runtime_required===false;
    if(!seeded) throw new Error('forensic_private_runtime_seed_not_verified');
    return {edge,source,local};
  }

  async provision({
    releaseRef,
    requestedHostname=this.requestedHostname,
    stableHostname=this.stableHostname,
    rollbackTarget='systemia:forensic-record-public-runtime-previous',
  }={}){
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))) throw new Error('release_ref_must_be_immutable_sha');
    const {edge}=await this.#assertPrivateRuntimeReady();
    this.requestedHostname=this.#assertStagingHostname(requestedHostname);
    this.stableHostname=stableHostname!==false;

    let record=null;
    let broker=null;
    try{
      record=await this.yard.deploySiblingRelease({
        sourceDeploymentId:this.edgeDeploymentId,
        deploymentId:this.publicDeploymentId,
        releaseRef,
        workloadClass:'systemia.forensic-record-public-runtime.v1',
        input:{require_seed:true},
        rollbackTarget:String(rollbackTarget||'systemia:forensic-record-public-runtime-previous'),
        leaseTtlMs:this.leaseTtlMs,
      });
      if(record.receipt?.capacity_node_id!==edge.receipt?.capacity_node_id){
        throw new Error('forensic_public_runtime_and_edge_must_share_compute_node');
      }

      broker=this.#broker();
      this.binding=await broker.bindDeployment(this.publicDeploymentId,{
        requestedHostname:this.requestedHostname,
        ttlMs:this.leaseTtlMs,
        stableHostname:this.stableHostname,
      });
      if(!this.allowLoopbackProof&&this.binding.route_verified!==true){
        throw new Error('forensic_public_staging_https_route_verification_required');
      }
      this.yard.startLeaseKeeper(this.publicDeploymentId,{
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
        public_read_only:true,
        safe_projection:true,
        canonical_domain_cutover:false,
        founder_login_required:false,
      });
    }catch(error){
      if(this.binding&&broker){
        try{await broker.releaseBinding(this.binding,{reason:'forensic_public_staging_provision_failed'});}catch{}
      }
      this.binding=null;
      if(record){
        try{await this.yard.stopDeployment(this.publicDeploymentId,{reason:'forensic_public_staging_provision_failed'});}catch{}
      }
      this.#persist({last_action:'provision_failed',last_error:String(error?.message||error)});
      throw error;
    }
  }

  async resume({rebindIfNeeded=true}={}){
    const {edge}=await this.#assertPrivateRuntimeReady();
    const record=this.yard.deploymentStatus(this.publicDeploymentId);
    if(!record||record.state!=='ready') throw new Error('forensic_public_runtime_not_ready');
    if(record.receipt?.capacity_node_id!==edge.receipt?.capacity_node_id){
      throw new Error('forensic_public_runtime_and_edge_node_drift');
    }
    await this.yard.renewDeploymentLease(this.publicDeploymentId,{ttlMs:this.leaseTtlMs});
    let health=await this.#routeHealth(record);
    if((!this.binding||!health.ok)&&rebindIfNeeded){
      const broker=this.#broker();
      if(this.binding){
        try{await broker.releaseBinding(this.binding,{reason:'forensic_public_staging_resume_rebind'});}catch{}
      }
      this.binding=await broker.bindDeployment(this.publicDeploymentId,{
        requestedHostname:this.requestedHostname,
        ttlMs:this.leaseTtlMs,
        stableHostname:this.stableHostname,
      });
      health=await this.#routeHealth(record);
    }
    if(!health.ok) throw new Error('forensic_public_staging_route_unhealthy:'+health.state);
    this.yard.startLeaseKeeper(this.publicDeploymentId,{
      ttlMs:this.leaseTtlMs,
      renewEveryMs:this.renewEveryMs,
    });
    this.#persist({last_action:'resumed'});
    return this.#result('resumed',{
      health_state:health.state,
      route_scope:this.binding.route_scope,
      route_verified:this.binding.route_verified===true,
      origin:this.binding.origin,
      public_read_only:true,
      canonical_domain_cutover:false,
      founder_login_required:false,
    });
  }

  async close({reason='operator_requested'}={}){
    this.yard.stopLeaseKeeper(this.publicDeploymentId);
    let release=null;
    const previous=this.binding;
    if(this.binding){
      try{release=await this.#broker().releaseBinding(this.binding,{reason});}catch{}
    }
    this.binding=null;
    try{await this.yard.stopDeployment(this.publicDeploymentId,{reason});}catch{}
    this.#persist({last_action:'stopped'});
    return this.#result('stopped',{
      reason,
      released_origin:previous?.origin||null,
      route_release_receipt:release?.receipt_hash||null,
    });
  }
}
