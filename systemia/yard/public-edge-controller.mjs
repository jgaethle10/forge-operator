import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { YardPublicRouteBroker } from './public-route-broker.mjs';
import { discoverEligibleCapacity, allocatorTokenForOffer } from './capacity-resolver.mjs';

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
    this.requestedHostname='';
    this.identityAttestationRequired=false;
    this.timer=null;
    this.inFlight=false;
    this.sequence=0;
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
    const persistedFile=this.#stateFile();
    if(fs.existsSync(persistedFile)){
      try{
        const persisted=JSON.parse(fs.readFileSync(persistedFile,'utf8'));
        if(persisted?.schema==='evercraft.yard.public-edge-controller-state.v1'){
          this.binding=persisted.binding||null;
          this.requestedHostname=String(persisted.requested_hostname||'');
          this.identityAttestationRequired=Boolean(persisted.identity_attestation_required);
          this.sequence=Math.max(0,Number(persisted.sequence||0));
        }
      }catch{}
    }
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
      requested_hostname:this.requestedHostname||null,
      identity_attestation_required:this.identityAttestationRequired,
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
    requireIdentityAttestation=false,
  }={}){
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))){
      throw new Error('release_ref_must_be_immutable_sha');
    }
    if(!capacityEndpoint) throw new Error('capacity_endpoint_required');

    let edgeRecord=null;
    let specialistRecord=null;
    let broker=null;
    this.requestedHostname=String(requestedHostname||'evercraft-specialists');
    this.identityAttestationRequired=Boolean(requireIdentityAttestation);

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

      let edgeAttestation=null;
      let specialistAttestation=null;
      if(this.identityAttestationRequired){
        [edgeAttestation,specialistAttestation]=await Promise.all([
          this.yard.attestDeployment(this.edgeDeploymentId),
          this.yard.attestDeployment(this.specialistDeploymentId),
        ]);
        if(edgeAttestation.identity_verified!==true){
          throw new Error('public_edge_identity_attestation_failed');
        }
        if(specialistAttestation.identity_verified!==true){
          throw new Error('specialist_identity_attestation_failed');
        }
        if(
          !edgeAttestation.device_fingerprint ||
          edgeAttestation.device_fingerprint!==specialistAttestation.device_fingerprint
        ){
          throw new Error('edge_specialist_device_attestation_mismatch');
        }
      }

      broker=new YardPublicRouteBroker({
        yard:this.yard,
        providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
        allowLoopbackProof:this.allowLoopbackProof,
      });
      this.binding=await broker.bindDeployment(this.specialistDeploymentId,{
        requestedHostname:this.requestedHostname,
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
        identity_attestation_required:this.identityAttestationRequired,
        identity_verified:this.identityAttestationRequired
          ? edgeAttestation?.identity_verified===true && specialistAttestation?.identity_verified===true
          : null,
        device_fingerprint:this.identityAttestationRequired
          ? edgeAttestation?.device_fingerprint||null
          : null,
        edge_attestation_receipt:this.identityAttestationRequired
          ? edgeAttestation?.receipt_hash||null
          : null,
        specialist_attestation_receipt:this.identityAttestationRequired
          ? specialistAttestation?.receipt_hash||null
          : null,
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

  async provisionDiscovered({
    releaseRef,
    discovery = {},
    allocatorToken = '',
    allocatorTokens = {},
    endpointTimeoutMs = 750,
    requiredPlacementLabels = ['public-edge'],
    edge = { mode: 'wildcard_https' },
    specialist = {},
    requestedHostname = 'evercraft-specialists',
    edgeRollbackTarget = 'none:first_install',
    specialistRollbackTarget = 'none:first_install',
    requireIdentityAttestation = true,
  } = {}) {
    const resolution = await discoverEligibleCapacity({
      workloadClass: 'systemia.public-edge.v1',
      requiredWorkloads: [
        'systemia.public-edge.v1',
        'systemia.specialist-handoff-mcp.v1',
      ],
      requiredPlacementLabels,
      requiredServiceCapabilities: ['public_edge'],
      discovery,
      endpointTimeoutMs,
    });
    if (!resolution.selected) {
      const error = new Error('no_edge_ready_evercraft_capacity_discovered');
      error.resolution = resolution;
      throw error;
    }

    const selectedToken = allocatorTokenForOffer(resolution.selected, {
      allocatorToken,
      allocatorTokens,
    });
    if (
      resolution.selected.allocation_auth === 'bearer' &&
      !selectedToken
    ) {
      const error = new Error('allocator_authority_unavailable_for_edge_ready_capacity');
      error.resolution = resolution;
      throw error;
    }

    const provisioned = await this.provision({
      releaseRef,
      capacityEndpoint: resolution.selected.endpoint,
      allocatorToken: selectedToken,
      edge,
      specialist,
      requestedHostname,
      edgeRollbackTarget,
      specialistRollbackTarget,
      requireIdentityAttestation,
    });

    return {
      ...provisioned,
      discovery: {
        schema: resolution.schema,
        receipt_hash: resolution.receipt_hash,
        selected_node_id: resolution.selected.node_id,
        selected_endpoint: resolution.selected.endpoint,
        eligible_count: resolution.eligible_count,
        discovered_count: resolution.discovered_count,
        requirements: resolution.requirements,
      },
    };
  }

  async resume({rebindIfNeeded=true}={}){
    const edge=this.yard.deploymentStatus(this.edgeDeploymentId);
    const specialist=this.yard.deploymentStatus(this.specialistDeploymentId);
    if(!edge||!specialist) throw new Error('managed_deployment_state_missing');
    if(edge.state!=='ready'||specialist.state!=='ready'){
      throw new Error('managed_deployment_not_ready');
    }

    await Promise.all([
      this.yard.renewDeploymentLease(this.edgeDeploymentId,{ttlMs:this.leaseTtlMs}),
      this.yard.renewDeploymentLease(this.specialistDeploymentId,{ttlMs:this.leaseTtlMs}),
    ]);

    if(this.identityAttestationRequired){
      const [edgeAttestation,specialistAttestation]=await Promise.all([
        this.yard.attestDeployment(this.edgeDeploymentId),
        this.yard.attestDeployment(this.specialistDeploymentId),
      ]);
      if(
        edgeAttestation.identity_verified!==true ||
        specialistAttestation.identity_verified!==true ||
        !edgeAttestation.device_fingerprint ||
        edgeAttestation.device_fingerprint!==specialistAttestation.device_fingerprint
      ){
        throw new Error('controller_resume_identity_attestation_failed');
      }
    }

    const broker=new YardPublicRouteBroker({
      yard:this.yard,
      providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
      allowLoopbackProof:this.allowLoopbackProof,
    });

    const routeHealth=async()=>{
      if(!this.binding) return {ok:false,state:'binding_missing'};
      if(this.binding.route_scope==='public_https'){
        const route=await this.yard.verifyRoute(this.specialistDeploymentId);
        return {ok:route.ok===true,state:route.state};
      }
      if(this.allowLoopbackProof&&this.binding.route_scope==='loopback_proof'){
        try{
          const health=await fetch(this.binding.origin+'/health').then(r=>r.json());
          const ok=
            health.ok===true &&
            health.service==='specialist-handoff-mcp' &&
            health.instance_id===specialist.result?.instance_id &&
            health.deployment_receipt_ref===specialist.receipt?.receipt_hash;
          return {ok,state:ok?'loopback_proof_healthy':'loopback_proof_mismatch'};
        }catch{
          return {ok:false,state:'loopback_proof_unreachable'};
        }
      }
      return {ok:false,state:'route_scope_not_admitted'};
    };

    const edgeHealth=await this.yard.verifyRoute(this.edgeDeploymentId);
    let specialistHealth=await routeHealth();

    if((!this.binding||!specialistHealth.ok)&&rebindIfNeeded){
      if(this.binding){
        try{ await broker.releaseBinding(this.binding,{reason:'controller_resume_rebind'}); }catch{}
      }
      this.binding=await broker.bindDeployment(this.specialistDeploymentId,{
        requestedHostname:this.requestedHostname||'evercraft-specialists',
        ttlMs:this.leaseTtlMs,
      });
      specialistHealth=await routeHealth();
    }

    if(!edgeHealth.ok||!specialistHealth.ok){
      throw new Error(
        'controller_resume_health_failed:'+edgeHealth.state+':'+specialistHealth.state
      );
    }

    this.yard.startLeaseKeeper(this.edgeDeploymentId,{
      ttlMs:this.leaseTtlMs,
      renewEveryMs:this.renewEveryMs,
    });
    this.yard.startLeaseKeeper(this.specialistDeploymentId,{
      ttlMs:this.leaseTtlMs,
      renewEveryMs:this.renewEveryMs,
    });

    return this.#result('resumed',{
      edge_health_state:edgeHealth.state,
      specialist_health_state:specialistHealth.state,
      route_scope:this.binding.route_scope,
      route_verified:this.binding.route_verified,
      origin:this.binding.origin,
      route_binding_receipt:this.binding.receipt_hash,
      founder_login_required:false,
    });
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
