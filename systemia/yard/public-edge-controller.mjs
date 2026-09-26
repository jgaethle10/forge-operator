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

export class PublicEdgeController {
  constructor({
    yard,
    stateDir,
    edgeDeploymentId='evercraft-public-edge',
    specialistDeploymentId='evercraft-specialist-handoff',
    leaseTtlMs=3600000,
    renewEveryMs=1800000,
    intervalMs=60000,
    allowLoopbackProof=false,
  }={}){
    if(!yard) throw new Error('yard_operator_required');
    if(!stateDir) throw new Error('public_edge_controller_state_dir_required');
    this.yard=yard;
    this.stateDir=path.resolve(stateDir);
    this.edgeDeploymentId=edgeDeploymentId;
    this.specialistDeploymentId=specialistDeploymentId;
    this.leaseTtlMs=Math.max(60000,Number(leaseTtlMs||3600000));
    this.renewEveryMs=Math.max(30000,Number(renewEveryMs||1800000));
    this.intervalMs=Math.max(5000,Number(intervalMs||60000));
    this.allowLoopbackProof=Boolean(allowLoopbackProof);
    this.binding=null;
    this.timer=null;
    this.inFlight=false;
    this.sequence=0;
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
  }

  #stateFile(){
    return path.join(this.stateDir,'public-edge-controller.json');
  }

  #persist(extra={}){
    const body={
      schema:'evercraft.yard.public-edge-controller-state.v1',
      edge_deployment_id:this.edgeDeploymentId,
      specialist_deployment_id:this.specialistDeploymentId,
      binding:this.binding,
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
      schema:'evercraft.yard.public-edge-controller-result.v1',
      action,
      sequence:++this.sequence,
      edge_deployment_id:this.edgeDeploymentId,
      specialist_deployment_id:this.specialistDeploymentId,
      observed_at:new Date().toISOString(),
      ...data,
    };
    const result={...body,receipt_hash:sha(body)};
    this.#persist({last_result:result});
    return result;
  }

  async provision({
    releaseRef,
    capacityEndpoint,
    allocatorToken='',
    edge={
      mode:'wildcard_https',
      base_domain:'',
      tls_key_path:'',
      tls_cert_path:'',
      public_host:'0.0.0.0',
      public_port:443,
    },
    specialist={
      gateway_url:'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway',
    },
    requestedHostname='evercraft-specialists',
    edgeRollbackTarget='none:first_install',
    specialistRollbackTarget='none:first_install',
  }={}){
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))){
      throw new Error('release_ref_must_be_immutable_sha');
    }
    if(!capacityEndpoint) throw new Error('capacity_endpoint_required');

    let edgeRecord=null;
    let specialistRecord=null;
    let broker=null;

    try{
      edgeRecord=await this.yard.deployRelease({
        deploymentId:this.edgeDeploymentId,
        releaseRef,
        workloadClass:'systemia.public-edge.v1',
        capacityEndpoint,
        allocatorToken,
        input:{
          mode:String(edge.mode||'wildcard_https'),
          control_host:'127.0.0.1',
          control_port:0,
          public_host:String(edge.public_host||'0.0.0.0'),
          public_port:Number(edge.public_port||443),
          base_domain:String(edge.base_domain||''),
          tls_key_path:String(edge.tls_key_path||''),
          tls_cert_path:String(edge.tls_cert_path||''),
          allow_private_upstream:false,
        },
        rollbackTarget:String(edgeRollbackTarget||'none:first_install'),
        leaseTtlMs:this.leaseTtlMs,
      });

      specialistRecord=await this.yard.deployRelease({
        deploymentId:this.specialistDeploymentId,
        releaseRef,
        workloadClass:'systemia.specialist-handoff-mcp.v1',
        capacityEndpoint,
        allocatorToken,
        input:{
          gateway_url:String(specialist.gateway_url||''),
        },
        rollbackTarget:String(specialistRollbackTarget||'none:first_install'),
        leaseTtlMs:this.leaseTtlMs,
      });

      if(edgeRecord.receipt?.capacity_node_id!==specialistRecord.receipt?.capacity_node_id){
        throw new Error('edge_and_specialist_must_share_compute_node_for_loopback_upstream');
      }

      broker=new YardPublicRouteBroker({
        yard:this.yard,
        providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
        allowLoopbackProof:this.allowLoopbackProof,
      });
      this.binding=await broker.bindDeployment(this.specialistDeploymentId,{
        requestedHostname,
        ttlMs:this.leaseTtlMs,
      });

      const productionMode=String(edge.mode||'wildcard_https')==='wildcard_https';
      if(productionMode && this.binding.route_verified!==true){
        throw new Error('public_https_route_verification_required');
      }
      if(!productionMode && !this.allowLoopbackProof){
        throw new Error('proof_route_not_authorized');
      }

      this.yard.startLeaseKeeper(this.edgeDeploymentId,{
        ttlMs:this.leaseTtlMs,
        renewEveryMs:this.renewEveryMs,
      });
      this.yard.startLeaseKeeper(this.specialistDeploymentId,{
        ttlMs:this.leaseTtlMs,
        renewEveryMs:this.renewEveryMs,
      });

      return this.#result('provisioned',{
        runtime_fabric:'Evercraft Compute',
        edge_node_id:edgeRecord.receipt?.capacity_node_id||null,
        specialist_node_id:specialistRecord.receipt?.capacity_node_id||null,
        edge_deployment_receipt:edgeRecord.receipt?.receipt_hash||null,
        specialist_deployment_receipt:specialistRecord.receipt?.receipt_hash||null,
        route_binding_receipt:this.binding.receipt_hash,
        route_scope:this.binding.route_scope,
        route_verified:this.binding.route_verified,
        origin:this.binding.origin,
        provider_transport:this.binding.provider_transport,
        founder_login_required:false,
      });
    }catch(error){
      if(this.binding&&broker){
        try{ await broker.releaseBinding(this.binding,{reason:'provision_failed'}); }catch{}
      }
      this.binding=null;
      if(specialistRecord){
        try{ await this.yard.stopDeployment(this.specialistDeploymentId,{reason:'provision_failed'}); }catch{}
      }
      if(edgeRecord){
        try{ await this.yard.stopDeployment(this.edgeDeploymentId,{reason:'provision_failed'}); }catch{}
      }
      throw error;
    }
  }

  async tick(){
    if(this.inFlight){
      return this.#result('hold',{reason:'controller_tick_in_flight'});
    }
    this.inFlight=true;
    try{
      const edge=this.yard.deploymentStatus(this.edgeDeploymentId);
      const specialist=this.yard.deploymentStatus(this.specialistDeploymentId);
      if(!edge||!specialist||!this.binding){
        return this.#result('hold',{reason:'controller_not_fully_provisioned'});
      }

      const edgeHealth=await this.yard.verifyRoute(this.edgeDeploymentId);
      let specialistHealthy=false;
      let specialistState='unknown';

      if(this.binding.route_scope==='public_https'){
        const route=await this.yard.verifyRoute(this.specialistDeploymentId);
        specialistHealthy=route.ok===true;
        specialistState=route.state;
      }else if(this.allowLoopbackProof&&this.binding.route_scope==='loopback_proof'){
        try{
          const health=await fetch(this.binding.origin+'/health').then(r=>r.json());
          specialistHealthy=
            health.ok===true &&
            health.service==='specialist-handoff-mcp' &&
            health.instance_id===specialist.result?.instance_id &&
            health.deployment_receipt_ref===specialist.receipt?.receipt_hash;
          specialistState=specialistHealthy?'loopback_proof_healthy':'loopback_proof_mismatch';
        }catch(error){
          specialistState='loopback_proof_unreachable';
        }
      }

      if(!edgeHealth.ok||!specialistHealthy){
        return this.#result('hold',{
          reason:'managed_runtime_health_failed',
          edge_health_state:edgeHealth.state,
          specialist_health_state:specialistState,
          route_scope:this.binding.route_scope,
        });
      }

      const [edgeRenewal,specialistRenewal]=await Promise.all([
        this.yard.renewDeploymentLease(this.edgeDeploymentId,{ttlMs:this.leaseTtlMs}),
        this.yard.renewDeploymentLease(this.specialistDeploymentId,{ttlMs:this.leaseTtlMs}),
      ]);

      return this.#result('healthy',{
        edge_health_state:edgeHealth.state,
        specialist_health_state:specialistState,
        route_scope:this.binding.route_scope,
        route_verified:this.binding.route_verified,
        origin:this.binding.origin,
        edge_lease_renewal_receipt:edgeRenewal.receipt_hash,
        specialist_lease_renewal_receipt:specialistRenewal.receipt_hash,
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
    this.yard.stopLeaseKeeper(this.edgeDeploymentId);
    this.yard.stopLeaseKeeper(this.specialistDeploymentId);

    let routeRelease=null;
    if(this.binding){
      try{
        const broker=new YardPublicRouteBroker({
          yard:this.yard,
          providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
          allowLoopbackProof:this.allowLoopbackProof,
        });
        routeRelease=await broker.releaseBinding(this.binding,{reason});
      }catch{}
    }

    for(const deploymentId of [this.specialistDeploymentId,this.edgeDeploymentId]){
      try{ await this.yard.stopDeployment(deploymentId,{reason}); }catch{}
    }

    const previousBinding=this.binding;
    this.binding=null;
    return this.#result('stopped',{
      reason,
      released_origin:previousBinding?.origin||null,
      route_release_receipt:routeRelease?.receipt_hash||null,
    });
  }
}
