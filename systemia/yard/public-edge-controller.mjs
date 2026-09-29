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
    browserDeploymentId='evercraft-control-room',
    browserEnabled=false,
    browserRequestedHostname='evercraft-control',
    browserStableHostname=true,
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
    this.browserDeploymentId=browserDeploymentId;
    this.browserEnabled=Boolean(browserEnabled);
    this.browserRequestedHostname=String(browserRequestedHostname||'evercraft-control');
    this.browserStableHostname=browserStableHostname===true;
    this.leaseTtlMs=Math.max(60000,Number(leaseTtlMs||3600000));
    this.renewEveryMs=Math.max(30000,Number(renewEveryMs||1800000));
    this.intervalMs=Math.max(5000,Number(intervalMs||60000));
    this.allowLoopbackProof=Boolean(allowLoopbackProof);
    this.binding=null;
    this.browserBinding=null;
    this.requestedHostname='';
    this.stableHostname=false;
    this.identityAttestationRequired=false;
    this.fieldEnrollmentRequired=false;
    this.fieldEnrollmentReceipt='';
    this.publicEdgeAdmissionReceipt='';
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
          this.browserBinding=persisted.browser_binding||null;
          this.browserEnabled=Boolean(persisted.browser_enabled??this.browserEnabled);
          this.browserRequestedHostname=String(persisted.browser_requested_hostname||this.browserRequestedHostname||'evercraft-control');
          this.browserStableHostname=Boolean(persisted.browser_stable_hostname??this.browserStableHostname);
          this.requestedHostname=String(persisted.requested_hostname||'');
          this.stableHostname=Boolean(persisted.stable_hostname);
          this.identityAttestationRequired=Boolean(persisted.identity_attestation_required);
          this.fieldEnrollmentRequired=Boolean(persisted.field_enrollment_required);
          this.fieldEnrollmentReceipt=String(persisted.field_enrollment_receipt||'');
          this.publicEdgeAdmissionReceipt=String(persisted.public_edge_admission_receipt||'');
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
      browser_deployment_id:this.browserDeploymentId,
      binding:this.binding,
      browser_binding:this.browserBinding,
      browser_enabled:this.browserEnabled,
      browser_requested_hostname:this.browserRequestedHostname||null,
      browser_stable_hostname:this.browserStableHostname,
      requested_hostname:this.requestedHostname||null,
      stable_hostname:this.stableHostname,
      identity_attestation_required:this.identityAttestationRequired,
      field_enrollment_required:this.fieldEnrollmentRequired,
      field_enrollment_receipt:this.fieldEnrollmentReceipt||null,
      public_edge_admission_receipt:this.publicEdgeAdmissionReceipt||null,
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
      browser_deployment_id:this.browserDeploymentId,
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
    browser={
      enabled:false,
      max_concurrency:2,
      requested_hostname:'evercraft-control',
      stable_hostname:true,
    },
    requestedHostname='evercraft-specialists',
    stableHostname=false,
    edgeRollbackTarget='none:first_install',
    specialistRollbackTarget='none:first_install',
    browserRollbackTarget='none:first_install',
    requireIdentityAttestation=false,
    requireFieldEnrollment=false,
  }={}){
    if(!/^[a-f0-9]{40}$/i.test(String(releaseRef||''))){
      throw new Error('release_ref_must_be_immutable_sha');
    }
    if(!capacityEndpoint) throw new Error('capacity_endpoint_required');

    let edgeRecord=null;
    let specialistRecord=null;
    let browserRecord=null;
    let broker=null;
    let fieldEnrollmentImport=null;
    const productionMode=String(edge.mode||'wildcard_https')==='wildcard_https';
    this.requestedHostname=String(requestedHostname||'evercraft-specialists');
    this.stableHostname=stableHostname===true;
    this.browserEnabled=browser?.enabled===true;
    this.browserRequestedHostname=String(browser?.requested_hostname||'evercraft-control');
    this.browserStableHostname=browser?.stable_hostname!==false;
    this.identityAttestationRequired=productionMode || Boolean(requireIdentityAttestation);
    this.fieldEnrollmentRequired=productionMode || Boolean(requireFieldEnrollment);

    try{
      if(this.fieldEnrollmentRequired){
        fieldEnrollmentImport=await this.yard.enrollFieldDeviceFromCapacity({
          capacityEndpoint,
          allocatorToken,
        });
        this.fieldEnrollmentReceipt=String(
          fieldEnrollmentImport.field_enrollment_receipt||''
        );
        this.publicEdgeAdmissionReceipt=String(
          fieldEnrollmentImport.public_edge_admission_receipt||''
        );
      }else{
        this.fieldEnrollmentReceipt='';
        this.publicEdgeAdmissionReceipt='';
      }
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
          fabric_catalog:Array.isArray(specialist.fabric_catalog)
            ? specialist.fabric_catalog
            : null,
          fabric_mcp_path:String(specialist.fabric_mcp_path||'/mcp'),
          openai_challenge_token:String(specialist.openai_challenge_token||''),
        },
        rollbackTarget:String(specialistRollbackTarget||'none:first_install'),
        leaseTtlMs:this.leaseTtlMs,
      });

      if(this.browserEnabled){
        browserRecord=await this.yard.deployRelease({
          deploymentId:this.browserDeploymentId,
          releaseRef,
          workloadClass:'systemia.evercraft-web-browser.v1',
          capacityEndpoint,
          allocatorToken,
          input:{
            max_concurrency:Math.max(1,Math.min(8,Number(browser?.max_concurrency||2))),
          },
          rollbackTarget:String(browserRollbackTarget||'none:first_install'),
          leaseTtlMs:this.leaseTtlMs,
        });
      }

      if(edgeRecord.receipt?.capacity_node_id!==specialistRecord.receipt?.capacity_node_id){
        throw new Error('edge_and_specialist_must_share_compute_node_for_loopback_upstream');
      }
      if(
        browserRecord &&
        edgeRecord.receipt?.capacity_node_id!==browserRecord.receipt?.capacity_node_id
      ){
        throw new Error('edge_and_browser_must_share_compute_node_for_loopback_upstream');
      }
      if(browserRecord && browserRecord.result?.auth_handoff_supported!==true){
        throw new Error('browser_authenticated_handoff_required');
      }

      let edgeAttestation=null;
      let specialistAttestation=null;
      let browserAttestation=null;
      let identityBinding=null;
      if(this.identityAttestationRequired){
        [edgeAttestation,specialistAttestation,browserAttestation]=await Promise.all([
          this.yard.attestDeployment(this.edgeDeploymentId),
          this.yard.attestDeployment(this.specialistDeploymentId),
          this.browserEnabled
            ? this.yard.attestDeployment(this.browserDeploymentId)
            : Promise.resolve(null),
        ]);
        if(edgeAttestation.identity_verified!==true){
          throw new Error('public_edge_identity_attestation_failed');
        }
        if(specialistAttestation.identity_verified!==true){
          throw new Error('specialist_identity_attestation_failed');
        }
        if(this.browserEnabled && browserAttestation?.identity_verified!==true){
          throw new Error('browser_identity_attestation_failed');
        }
        if(this.fieldEnrollmentRequired && edgeAttestation.field_verified!==true){
          throw new Error('public_edge_field_attestation_failed');
        }
        if(this.fieldEnrollmentRequired && specialistAttestation.field_verified!==true){
          throw new Error('specialist_field_attestation_failed');
        }
        if(this.fieldEnrollmentRequired && this.browserEnabled && browserAttestation?.field_verified!==true){
          throw new Error('browser_field_attestation_failed');
        }
        if(
          !edgeAttestation.device_fingerprint ||
          edgeAttestation.device_fingerprint!==specialistAttestation.device_fingerprint
        ){
          throw new Error('edge_specialist_device_attestation_mismatch');
        }
        if(
          this.browserEnabled &&
          edgeAttestation.device_fingerprint!==browserAttestation?.device_fingerprint
        ){
          throw new Error('edge_browser_device_attestation_mismatch');
        }
        identityBinding=await this.yard.bindSpecialistIdentityAttestation(
          this.specialistDeploymentId,
          {
            deviceFingerprint:edgeAttestation.device_fingerprint,
            edgeAttestationReceipt:edgeAttestation.receipt_hash,
            specialistAttestationReceipt:specialistAttestation.receipt_hash,
            fieldVerified:this.fieldEnrollmentRequired,
            fieldEnrollmentReceipt:this.fieldEnrollmentReceipt,
            publicEdgeAdmissionReceipt:this.publicEdgeAdmissionReceipt,
          }
        );
      }

      broker=new YardPublicRouteBroker({
        yard:this.yard,
        providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
        allowLoopbackProof:this.allowLoopbackProof,
      });
      this.binding=await broker.bindDeployment(this.specialistDeploymentId,{
        requestedHostname:this.requestedHostname,
        ttlMs:this.leaseTtlMs,
        stableHostname:this.stableHostname,
      });
      if(this.browserEnabled){
        this.browserBinding=await broker.bindDeployment(this.browserDeploymentId,{
          requestedHostname:this.browserRequestedHostname,
          ttlMs:this.leaseTtlMs,
          stableHostname:this.browserStableHostname,
        });
      }else{
        this.browserBinding=null;
      }

      if(productionMode && this.binding.route_verified!==true){
        throw new Error('public_https_route_verification_required');
      }
      if(productionMode && this.browserEnabled && this.browserBinding?.route_verified!==true){
        throw new Error('browser_public_https_route_verification_required');
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
      if(this.browserEnabled){
        this.yard.startLeaseKeeper(this.browserDeploymentId,{
          ttlMs:this.leaseTtlMs,
          renewEveryMs:this.renewEveryMs,
        });
      }

      return this.#result('provisioned',{
        runtime_fabric:'Evercraft Compute',
        edge_node_id:edgeRecord.receipt?.capacity_node_id||null,
        specialist_node_id:specialistRecord.receipt?.capacity_node_id||null,
        browser_node_id:browserRecord?.receipt?.capacity_node_id||null,
        edge_deployment_receipt:edgeRecord.receipt?.receipt_hash||null,
        specialist_deployment_receipt:specialistRecord.receipt?.receipt_hash||null,
        browser_deployment_receipt:browserRecord?.receipt?.receipt_hash||null,
        route_binding_receipt:this.binding.receipt_hash,
        browser_route_binding_receipt:this.browserBinding?.receipt_hash||null,
        route_scope:this.binding.route_scope,
        route_verified:this.binding.route_verified,
        origin:this.binding.origin,
        browser_enabled:this.browserEnabled,
        browser_origin:this.browserBinding?.origin||null,
        browser_route_scope:this.browserBinding?.route_scope||null,
        browser_route_verified:this.browserBinding?.route_verified===true,
        provider_transport:this.binding.provider_transport,
        identity_attestation_required:this.identityAttestationRequired,
        field_enrollment_required:this.fieldEnrollmentRequired,
        field_verified:this.fieldEnrollmentRequired
          ? edgeAttestation?.field_verified===true && specialistAttestation?.field_verified===true
          : null,
        field_enrollment_import_receipt:this.fieldEnrollmentRequired
          ? this.fieldEnrollmentReceipt||null
          : null,
        public_edge_admission_receipt:this.fieldEnrollmentRequired
          ? this.publicEdgeAdmissionReceipt||null
          : null,
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
        browser_attestation_receipt:this.identityAttestationRequired && this.browserEnabled
          ? browserAttestation?.receipt_hash||null
          : null,
        browser_identity_verified:this.identityAttestationRequired && this.browserEnabled
          ? browserAttestation?.identity_verified===true
          : null,
        specialist_identity_binding_receipt:this.identityAttestationRequired
          ? identityBinding?.compute_binding_receipt||null
          : null,
        founder_login_required:false,
      });
    }catch(error){
      if(this.browserBinding&&broker){
        try{ await broker.releaseBinding(this.browserBinding,{reason:'provision_failed'}); }catch{}
      }
      this.browserBinding=null;
      if(this.binding&&broker){
        try{ await broker.releaseBinding(this.binding,{reason:'provision_failed'}); }catch{}
      }
      this.binding=null;
      if(browserRecord){
        try{ await this.yard.stopDeployment(this.browserDeploymentId,{reason:'provision_failed'}); }catch{}
      }
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
    browser = { enabled: false },
    requestedHostname = 'evercraft-specialists',
    stableHostname = false,
    edgeRollbackTarget = 'none:first_install',
    specialistRollbackTarget = 'none:first_install',
    browserRollbackTarget = 'none:first_install',
    requireIdentityAttestation = true,
    requireFieldEnrollment = null,
  } = {}) {
    const resolution = await discoverEligibleCapacity({
      workloadClass: 'systemia.public-edge.v1',
      requiredWorkloads: [
        'systemia.public-edge.v1',
        'systemia.specialist-handoff-mcp.v1',
        ...(browser?.enabled===true ? ['systemia.evercraft-web-browser.v1'] : []),
      ],
      requiredPlacementLabels,
      requiredServiceCapabilities: ['public_edge'],
      requireAttestation: requireIdentityAttestation === true,
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
      browser,
      requestedHostname,
      stableHostname,
      edgeRollbackTarget,
      specialistRollbackTarget,
      browserRollbackTarget,
      requireIdentityAttestation,
      requireFieldEnrollment:
        requireFieldEnrollment === null
          ? String(edge?.mode||'wildcard_https') === 'wildcard_https'
          : requireFieldEnrollment,
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
    const browser=this.browserEnabled
      ? this.yard.deploymentStatus(this.browserDeploymentId)
      : null;
    if(!edge||!specialist||(this.browserEnabled&&!browser)){
      throw new Error('managed_deployment_state_missing');
    }
    if(
      edge.state!=='ready' ||
      specialist.state!=='ready' ||
      (this.browserEnabled&&browser.state!=='ready')
    ){
      throw new Error('managed_deployment_not_ready');
    }

    await Promise.all([
      this.yard.renewDeploymentLease(this.edgeDeploymentId,{ttlMs:this.leaseTtlMs}),
      this.yard.renewDeploymentLease(this.specialistDeploymentId,{ttlMs:this.leaseTtlMs}),
      ...(this.browserEnabled
        ? [this.yard.renewDeploymentLease(this.browserDeploymentId,{ttlMs:this.leaseTtlMs})]
        : []),
    ]);

    if(this.fieldEnrollmentRequired && (
      !this.fieldEnrollmentReceipt ||
      !this.publicEdgeAdmissionReceipt
    )){
      const resumeFieldImport=await this.yard.refreshFieldEnrollmentFromDeployment(
        this.edgeDeploymentId
      );
      this.fieldEnrollmentReceipt=String(
        resumeFieldImport.field_enrollment_receipt||''
      );
      this.publicEdgeAdmissionReceipt=String(
        resumeFieldImport.public_edge_admission_receipt||''
      );
    }

    if(this.identityAttestationRequired){
      const [edgeAttestation,specialistAttestation,browserAttestation]=await Promise.all([
        this.yard.attestDeployment(this.edgeDeploymentId),
        this.yard.attestDeployment(this.specialistDeploymentId),
        this.browserEnabled
          ? this.yard.attestDeployment(this.browserDeploymentId)
          : Promise.resolve(null),
      ]);
      if(
        edgeAttestation.identity_verified!==true ||
        specialistAttestation.identity_verified!==true ||
        (this.browserEnabled&&browserAttestation?.identity_verified!==true) ||
        (this.fieldEnrollmentRequired && edgeAttestation.field_verified!==true) ||
        (this.fieldEnrollmentRequired && specialistAttestation.field_verified!==true) ||
        (this.fieldEnrollmentRequired && this.browserEnabled && browserAttestation?.field_verified!==true) ||
        !edgeAttestation.device_fingerprint ||
        edgeAttestation.device_fingerprint!==specialistAttestation.device_fingerprint ||
        (this.browserEnabled && edgeAttestation.device_fingerprint!==browserAttestation?.device_fingerprint)
      ){
        throw new Error('controller_resume_identity_attestation_failed');
      }
      await this.yard.bindSpecialistIdentityAttestation(
        this.specialistDeploymentId,
        {
          deviceFingerprint:edgeAttestation.device_fingerprint,
          edgeAttestationReceipt:edgeAttestation.receipt_hash,
          specialistAttestationReceipt:specialistAttestation.receipt_hash,
          fieldVerified:this.fieldEnrollmentRequired,
          fieldEnrollmentReceipt:this.fieldEnrollmentReceipt,
          publicEdgeAdmissionReceipt:this.publicEdgeAdmissionReceipt,
        }
      );
    }

    const broker=new YardPublicRouteBroker({
      yard:this.yard,
      providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
      allowLoopbackProof:this.allowLoopbackProof,
    });

    const routeHealth=async(binding,deployment,deploymentId,service)=>{
      if(!binding) return {ok:false,state:'binding_missing'};
      if(binding.route_scope==='public_https'){
        const route=await this.yard.verifyRoute(deploymentId);
        return {ok:route.ok===true,state:route.state};
      }
      if(this.allowLoopbackProof&&binding.route_scope==='loopback_proof'){
        try{
          const health=await fetch(binding.origin+'/health').then(r=>r.json());
          const ok=
            health.ok===true &&
            health.service===service &&
            health.instance_id===deployment.result?.instance_id &&
            health.deployment_receipt_ref===deployment.receipt?.receipt_hash;
          return {
            ok,
            state:ok?'loopback_proof_healthy':'loopback_proof_mismatch'
          };
        }catch{
          return {ok:false,state:'loopback_proof_unreachable'};
        }
      }
      return {ok:false,state:'route_scope_not_admitted'};
    };

    const edgeHealth=await this.yard.verifyRoute(this.edgeDeploymentId);
    let specialistHealth=await routeHealth(
      this.binding,
      specialist,
      this.specialistDeploymentId,
      'specialist-handoff-mcp'
    );
    let browserHealth=this.browserEnabled
      ? await routeHealth(this.browserBinding,browser,this.browserDeploymentId,'evercraft-web-browser-edge')
      : {ok:true,state:'disabled'};

    if((!this.binding||!specialistHealth.ok)&&rebindIfNeeded){
      if(this.binding){
        try{ await broker.releaseBinding(this.binding,{reason:'controller_resume_rebind'}); }catch{}
      }
      this.binding=await broker.bindDeployment(this.specialistDeploymentId,{
        requestedHostname:this.requestedHostname||'evercraft-specialists',
        ttlMs:this.leaseTtlMs,
        stableHostname:this.stableHostname,
      });
      specialistHealth=await routeHealth(
        this.binding,
        specialist,
        this.specialistDeploymentId,
        'specialist-handoff-mcp'
      );
    }

    if(this.browserEnabled&&(!this.browserBinding||!browserHealth.ok)&&rebindIfNeeded){
      if(this.browserBinding){
        try{ await broker.releaseBinding(this.browserBinding,{reason:'control_room_resume_rebind'}); }catch{}
      }
      this.browserBinding=await broker.bindDeployment(this.browserDeploymentId,{
        requestedHostname:this.browserRequestedHostname||'evercraft-control',
        ttlMs:this.leaseTtlMs,
        stableHostname:this.browserStableHostname,
      });
      browserHealth=await routeHealth(
        this.browserBinding,
        browser,
        this.browserDeploymentId,
        'evercraft-web-browser-edge'
      );
    }

    if(!edgeHealth.ok||!specialistHealth.ok||(this.browserEnabled&&!browserHealth.ok)){
      throw new Error(
        'controller_resume_health_failed:'+
        edgeHealth.state+':'+
        specialistHealth.state+':'+
        browserHealth.state
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
    if(this.browserEnabled){
      this.yard.startLeaseKeeper(this.browserDeploymentId,{
        ttlMs:this.leaseTtlMs,
        renewEveryMs:this.renewEveryMs,
      });
    }

    return this.#result('resumed',{
      edge_health_state:edgeHealth.state,
      specialist_health_state:specialistHealth.state,
      browser_health_state:browserHealth.state,
      route_scope:this.binding.route_scope,
      route_verified:this.binding.route_verified,
      origin:this.binding.origin,
      browser_enabled:this.browserEnabled,
      browser_route_scope:this.browserBinding?.route_scope||null,
      browser_route_verified:this.browserBinding?.route_verified===true,
      browser_origin:this.browserBinding?.origin||null,
      route_binding_receipt:this.binding.receipt_hash,
      browser_route_binding_receipt:this.browserBinding?.receipt_hash||null,
      field_enrollment_required:this.fieldEnrollmentRequired,
      field_verified:this.fieldEnrollmentRequired ? true : null,
      field_enrollment_receipt:this.fieldEnrollmentRequired
        ? this.fieldEnrollmentReceipt||null
        : null,
      public_edge_admission_receipt:this.fieldEnrollmentRequired
        ? this.publicEdgeAdmissionReceipt||null
        : null,
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
      const browser=this.browserEnabled
        ? this.yard.deploymentStatus(this.browserDeploymentId)
        : null;
      if(
        !edge ||
        !specialist ||
        !this.binding ||
        (this.browserEnabled&&(!browser||!this.browserBinding))
      ){
        return this.#result('hold',{reason:'controller_not_fully_provisioned'});
      }

      const edgeHealth=await this.yard.verifyRoute(this.edgeDeploymentId);
      const routeHealth=async(binding,deployment,deploymentId,service)=>{
        if(binding.route_scope==='public_https'){
          const route=await this.yard.verifyRoute(deploymentId);
          return {ok:route.ok===true,state:route.state};
        }
        if(this.allowLoopbackProof&&binding.route_scope==='loopback_proof'){
          try{
            const health=await fetch(binding.origin+'/health').then(r=>r.json());
            const ok=
              health.ok===true &&
              health.service===service &&
              health.instance_id===deployment.result?.instance_id &&
              health.deployment_receipt_ref===deployment.receipt?.receipt_hash;
            return {
              ok,
              state:ok?'loopback_proof_healthy':'loopback_proof_mismatch'
            };
          }catch{
            return {ok:false,state:'loopback_proof_unreachable'};
          }
        }
        return {ok:false,state:'route_scope_not_admitted'};
      };

      const specialistHealth=await routeHealth(
        this.binding,
        specialist,
        this.specialistDeploymentId,
        'specialist-handoff-mcp'
      );
      const browserHealth=this.browserEnabled
        ? await routeHealth(
            this.browserBinding,
            browser,
            this.browserDeploymentId,
            'evercraft-web-browser-edge'
          )
        : {ok:true,state:'disabled'};

      if(!edgeHealth.ok||!specialistHealth.ok||(this.browserEnabled&&!browserHealth.ok)){
        return this.#result('hold',{
          reason:'managed_runtime_health_failed',
          edge_health_state:edgeHealth.state,
          specialist_health_state:specialistHealth.state,
          browser_health_state:browserHealth.state,
          route_scope:this.binding.route_scope,
          browser_route_scope:this.browserBinding?.route_scope||null,
        });
      }

      const renewals=await Promise.all([
        this.yard.renewDeploymentLease(this.edgeDeploymentId,{ttlMs:this.leaseTtlMs}),
        this.yard.renewDeploymentLease(this.specialistDeploymentId,{ttlMs:this.leaseTtlMs}),
        ...(this.browserEnabled
          ? [this.yard.renewDeploymentLease(this.browserDeploymentId,{ttlMs:this.leaseTtlMs})]
          : []),
      ]);
      const [edgeRenewal,specialistRenewal,browserRenewal]=renewals;

      return this.#result('healthy',{
        edge_health_state:edgeHealth.state,
        specialist_health_state:specialistHealth.state,
        browser_health_state:browserHealth.state,
        route_scope:this.binding.route_scope,
        route_verified:this.binding.route_verified,
        origin:this.binding.origin,
        browser_enabled:this.browserEnabled,
        browser_route_scope:this.browserBinding?.route_scope||null,
        browser_route_verified:this.browserBinding?.route_verified===true,
        browser_origin:this.browserBinding?.origin||null,
        edge_lease_renewal_receipt:edgeRenewal.receipt_hash,
        specialist_lease_renewal_receipt:specialistRenewal.receipt_hash,
        browser_lease_renewal_receipt:browserRenewal?.receipt_hash||null,
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
    if(this.browserEnabled) this.yard.stopLeaseKeeper(this.browserDeploymentId);

    let routeRelease=null;
    let browserRouteRelease=null;
    if(this.browserBinding){
      try{
        const broker=new YardPublicRouteBroker({
          yard:this.yard,
          providerClient:this.yard.publicRouteProviderClient(this.edgeDeploymentId),
          allowLoopbackProof:this.allowLoopbackProof,
        });
        browserRouteRelease=await broker.releaseBinding(this.browserBinding,{reason});
      }catch{}
    }
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

    for(const deploymentId of [
      ...(this.browserEnabled?[this.browserDeploymentId]:[]),
      this.specialistDeploymentId,
      this.edgeDeploymentId,
    ]){
      try{ await this.yard.stopDeployment(deploymentId,{reason}); }catch{}
    }

    const previousBinding=this.binding;
    const previousBrowserBinding=this.browserBinding;
    this.binding=null;
    this.browserBinding=null;
    return this.#result('stopped',{
      reason,
      released_origin:previousBinding?.origin||null,
      browser_released_origin:previousBrowserBinding?.origin||null,
      route_release_receipt:routeRelease?.receipt_hash||null,
      browser_route_release_receipt:browserRouteRelease?.receipt_hash||null,
    });
  }
}
