import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { YardPublicRouteBroker } from '../yard/public-route-broker.mjs';
import { resolveEvercraftRemoteCapacity } from './capacity-fabric.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function clean(value){return String(value??'').trim();}
function safeId(value){
  const id=clean(value);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,95}$/.test(id)) throw new Error('service_id_invalid');
  return id;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function deepHasSecretValue(value,key=''){
  const lower=String(key||'').toLowerCase();
  if(/(?:secret|token|password|private.?key|api.?key|credential)/i.test(lower)){
    if(value!==null&&value!==undefined&&String(value)!=='') return true;
  }
  if(Array.isArray(value)) return value.some((x)=>deepHasSecretValue(x,key));
  if(value&&typeof value==='object'){
    return Object.entries(value).some(([k,v])=>deepHasSecretValue(v,k));
  }
  return false;
}
function assertSpec(spec){
  if(!spec||spec.schema!=='evercraft.compute.service-spec.v1') throw new Error('service_spec_schema_invalid');
  safeId(spec.service_id);
  if(!/^[a-f0-9]{40}$/i.test(clean(spec.release_ref))) throw new Error('release_ref_must_be_immutable_sha');
  if(!clean(spec.workload_class)) throw new Error('workload_class_required');
  if(!clean(spec.rollback_target)) throw new Error('rollback_target_required');
  if(deepHasSecretValue(spec.input||{})) throw new Error('secret_material_must_not_be_embedded_in_service_spec');
  const route=spec.route||{mode:'none'};
  if(!['none','public_edge','federated_public_edge'].includes(route.mode)) throw new Error('route_mode_invalid');
  if(route.mode==='public_edge'||route.mode==='federated_public_edge'){
    safeId(route.edge_deployment_id||'evercraft-public-edge');
    if(!clean(route.hostname)) throw new Error('public_route_hostname_required');
  }
  const placement=spec.placement||{mode:'local'};
  if(!['local','remote_broker'].includes(placement.mode||'local')) throw new Error('placement_mode_invalid');
  if(placement.mode==='remote_broker'&&!clean(placement.broker_deployment_id)) throw new Error('broker_deployment_id_required');
  const health=spec.health||{};
  if(health.path&&!String(health.path).startsWith('/')) throw new Error('health_path_invalid');
  return spec;
}
function redactSpec(spec){
  return structuredClone(spec);
}
function resolvedInput(spec){
  const input=structuredClone(spec.input||{});
  for(const [field,envNameRaw] of Object.entries(spec.input_env||{})){
    const envName=clean(envNameRaw);
    if(!/^[A-Z][A-Z0-9_]{1,127}$/.test(envName)) throw new Error('input_env_name_invalid');
    const value=process.env[envName];
    if(value===undefined||value==='') throw new Error('required_input_env_missing:'+envName);
    input[field]=value;
  }
  return input;
}
function matchesExpected(actual,expected){
  for(const [key,value] of Object.entries(expected||{})){
    if(actual?.[key]!==value) return false;
  }
  return true;
}

export class EvercraftHostingControlPlane {
  constructor({
    yard,
    stateDir,
    allowLoopbackProof=false,
    defaultLeaseTtlMs=3600000,
    defaultRenewEveryMs=1800000,
  }={}){
    if(!yard) throw new Error('yard_operator_required');
    if(!stateDir) throw new Error('hosting_state_dir_required');
    this.yard=yard;
    this.stateDir=path.resolve(stateDir);
    this.allowLoopbackProof=Boolean(allowLoopbackProof);
    this.defaultLeaseTtlMs=Math.max(60000,Number(defaultLeaseTtlMs||3600000));
    this.defaultRenewEveryMs=Math.max(30000,Number(defaultRenewEveryMs||1800000));
    fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});
    fs.mkdirSync(path.join(this.stateDir,'services'),{recursive:true,mode:0o700});
  }

  #file(serviceId){return path.join(this.stateDir,'services',safeId(serviceId)+'.json');}
  #ledger(){return path.join(this.stateDir,'hosting-receipts.jsonl');}
  #load(serviceId){
    const file=this.#file(serviceId);
    return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  }
  #save(record){
    atomicJson(this.#file(record.service_id),record);
    fs.appendFileSync(this.#ledger(),JSON.stringify({
      schema:'evercraft.compute.hosting-receipt.v1',
      service_id:record.service_id,
      state:record.state,
      active_deployment_id:record.active_deployment_id||null,
      active_release_ref:record.active_release_ref||null,
      route_origin:record.route?.origin||null,
      route_verified:record.route?.verified===true,
      deployment_receipt:record.deployment_receipt||null,
      at:new Date().toISOString(),
      record_hash:sha(record),
    })+'\n',{mode:0o600});
    return record;
  }

  status(serviceId){return this.#load(serviceId);}

  async #probeOrigin(origin,health={}){
    if(!health.path) return {ok:true,state:'health_probe_not_required',body:null};
    if(!clean(origin)) return {ok:false,state:'service_origin_missing',body:null};
    try{
      const response=await fetch(new URL(health.path,origin));
      const body=await response.json().catch(()=>null);
      const ok=response.ok&&body&&matchesExpected(body,health.expect||{ok:true});
      return {ok,state:ok?'healthy':'health_contract_mismatch',status:response.status,body};
    }catch(error){
      return {ok:false,state:'health_probe_failed',detail:String(error?.message||error),body:null};
    }
  }

  async #probe(record,spec){
    const health=spec.health||{};
    if(!health.path) return {ok:true,state:'health_probe_not_required',body:null};
    const direct=await this.#probeOrigin(record?.result?.local_url,health);
    if(direct.ok) return direct;
    try{
      const verified=await this.yard.verifyRoute(record.deployment_id);
      const body=verified?.health||null;
      const managementReachable=verified?.ok===true||verified?.local_health_ok===true;
      const ok=Boolean(managementReachable&&body&&matchesExpected(body,health.expect||{ok:true}));
      return {
        ok,
        state:ok?'healthy_via_yard_management':direct.state,
        body,
        management_state:verified?.state||null,
      };
    }catch(error){
      return {...direct,management_detail:String(error?.message||error)};
    }
  }

  async #probeRelay(relay,health={}){
    if(!health.path) return {ok:true,state:'health_probe_not_required',body:null};
    try{
      const response=await fetch(relay.relay_url,{
        method:'POST',
        headers:{authorization:'Bearer '+relay.relay_token,'content-type':'application/json'},
        body:JSON.stringify({method:'GET',path:health.path,headers:{accept:'application/json'},body_base64:''})
      });
      const envelope=await response.json().catch(()=>null);
      if(!response.ok||!envelope?.ok) return {ok:false,state:'relay_probe_failed',status:response.status,body:envelope};
      const body=JSON.parse(Buffer.from(String(envelope.body_base64||''),'base64').toString('utf8')||'null');
      const ok=Number(envelope.status||0)>=200&&Number(envelope.status||0)<300&&body&&matchesExpected(body,health.expect||{ok:true});
      return {ok,state:ok?'healthy_via_remote_relay':'health_contract_mismatch',status:Number(envelope.status||0),body};
    }catch(error){
      return {ok:false,state:'relay_probe_failed',detail:String(error?.message||error),body:null};
    }
  }

  #broker(edgeDeploymentId){
    return new YardPublicRouteBroker({
      yard:this.yard,
      providerClient:this.yard.publicRouteProviderClient(edgeDeploymentId),
      allowLoopbackProof:this.allowLoopbackProof,
    });
  }

  async #releaseRouteArtifacts(route,{reason='hosting_replacement'}={}){
    if(!route||route.mode==='none') return;
    if(route.route_lease_id&&route.edge_deployment_id){
      try{
        await this.#broker(route.edge_deployment_id).releaseBinding({
          route_lease_id:route.route_lease_id,
          deployment_id:route.bridge_deployment_id||route.deployment_id||null,
          origin:route.origin||null,
        },{reason});
      }catch{}
    }
    if(route.bridge_deployment_id){
      try{this.yard.stopLeaseKeeper(route.bridge_deployment_id);}catch{}
      try{await this.yard.stopDeployment(route.bridge_deployment_id,{reason});}catch{}
    }
    if(route.relay_id&&route.broker_deployment_id){
      try{
        await this.yard.releaseRemoteServiceRelay(route.broker_deployment_id,route.relay_id,{reason});
      }catch{}
    }
  }

  async apply(spec,{capacityEndpoint='',allocatorToken=''}={}){
    assertSpec(spec);
    const serviceId=safeId(spec.service_id);
    const previous=this.#load(serviceId);
    const desiredHash=sha(redactSpec(spec));
    const leaseTtlMs=Math.max(60000,Number(spec.lease_ttl_ms||this.defaultLeaseTtlMs));
    const renewEveryMs=Math.max(30000,Number(spec.renew_every_ms||this.defaultRenewEveryMs));

    let previousHealthFailed=false;
    let failedActiveNodeId='';
    if(previous?.state==='ready'&&previous.desired_spec_hash===desiredHash){
      const current=this.yard.deploymentStatus(previous.active_deployment_id);
      if(current?.state==='ready'){
        const health=await this.#probe(current,spec);
        if(health.ok){
          return this.#save({
            ...previous,
            last_reconciled_at:new Date().toISOString(),
            health,
            action:'unchanged',
          });
        }
        previousHealthFailed=true;
        failedActiveNodeId=clean(previous.capacity_node_id||current.receipt?.capacity_node_id);
      }else{
        previousHealthFailed=true;
        failedActiveNodeId=clean(previous.capacity_node_id);
      }
    }

    const deploymentGeneration=Math.max(1,Number(previous?.deployment_generation||0)+1);
    const candidateId=safeId(serviceId+'--'+desiredHash.replace(/^sha256:/,'').slice(0,10)+'--g'+deploymentGeneration);
    let candidate=null;
    let binding=null;
    let placementResolution=null;
    let remoteRelay=null;
    let bridge=null;
    let bridgeId='';
    try{
      const args={
        deploymentId:candidateId,
        releaseRef:clean(spec.release_ref),
        workloadClass:clean(spec.workload_class),
        input:resolvedInput(spec),
        rollbackTarget:clean(spec.rollback_target),
        leaseTtlMs,
      };
      const placement=spec.placement||{mode:'local'};
      if(capacityEndpoint){
        candidate=await this.yard.deployRelease({...args,capacityEndpoint,allocatorToken});
        placementResolution={mode:'explicit_capacity',node_id:candidate.receipt?.capacity_node_id||null};
      }else if(placement.mode==='remote_broker'){
        placementResolution=await resolveEvercraftRemoteCapacity({
          yard:this.yard,
          brokerDeploymentId:clean(placement.broker_deployment_id),
          workloadClass:clean(spec.workload_class),
          resourceProfile:placement.resource_profile||{},
          preferredNodeId:clean(placement.preferred_node_id),
          excludeNodeIds:failedActiveNodeId?[failedActiveNodeId]:[],
          allowLoopbackProof:this.allowLoopbackProof,
        });
        candidate=await this.yard.deployRelease({
          ...args,
          capacityEndpoint:placementResolution.capacity_endpoint,
          allocatorToken:placementResolution.allocator_token,
        });
      }else if(spec.capacity_source_deployment_id){
        candidate=await this.yard.deploySiblingRelease({
          sourceDeploymentId:clean(spec.capacity_source_deployment_id),
          ...args,
        });
        placementResolution={mode:'sibling',node_id:candidate.receipt?.capacity_node_id||null};
      }
      if(!candidate) throw new Error('capacity_endpoint_source_deployment_or_remote_placement_required');

      const health=await this.#probe(candidate,spec);
      if(!health.ok) throw new Error('candidate_health_gate_failed:'+health.state);

      const routeSpec=spec.route||{mode:'none'};
      if(routeSpec.mode==='public_edge'){
        const edgeDeploymentId=clean(routeSpec.edge_deployment_id||'evercraft-public-edge');
        const edge=this.yard.deploymentStatus(edgeDeploymentId);
        if(!edge||edge.state!=='ready') throw new Error('public_edge_not_ready');
        if(edge.receipt?.capacity_node_id!==candidate.receipt?.capacity_node_id){
          throw new Error('public_edge_and_service_must_share_compute_node');
        }
        binding=await this.#broker(edgeDeploymentId).bindDeployment(candidateId,{
          requestedHostname:clean(routeSpec.hostname),
          ttlMs:leaseTtlMs,
          stableHostname:routeSpec.stable_hostname!==false,
        });
        if(!this.allowLoopbackProof&&binding.route_verified!==true){
          throw new Error('public_https_route_verification_required');
        }
      }else if(routeSpec.mode==='federated_public_edge'){
        if((spec.placement||{}).mode!=='remote_broker') throw new Error('federated_public_edge_requires_remote_broker_placement');
        const brokerDeploymentId=clean(spec.placement.broker_deployment_id);
        const edgeDeploymentId=clean(routeSpec.edge_deployment_id||'evercraft-public-edge');
        const edge=this.yard.deploymentStatus(edgeDeploymentId);
        if(!edge||edge.state!=='ready') throw new Error('public_edge_not_ready');
        if(edge.receipt?.capacity_node_id===candidate.receipt?.capacity_node_id){
          throw new Error('federated_route_requires_distinct_remote_compute_node');
        }
        remoteRelay=await this.yard.createRemoteServiceRelay(brokerDeploymentId,{
          nodeId:candidate.receipt?.capacity_node_id,
          serviceId:candidate.result?.service_id,
          ttlMs:leaseTtlMs,
          allowLoopbackProof:this.allowLoopbackProof,
        });
        const relayedHealth=await this.#probeRelay(remoteRelay,spec.health||{});
        if(!relayedHealth.ok) throw new Error('remote_relay_health_gate_failed:'+relayedHealth.state);

        bridgeId=safeId('bridge--'+desiredHash.replace(/^sha256:/,'').slice(0,12)+'--'+serviceId.slice(0,50));
        bridge=await this.yard.deploySiblingRelease({
          sourceDeploymentId:edgeDeploymentId,
          deploymentId:bridgeId,
          releaseRef:clean(spec.release_ref),
          workloadClass:'systemia.federated-service-bridge.v1',
          input:{relay_url:remoteRelay.relay_url,relay_token:remoteRelay.relay_token},
          rollbackTarget:'hosting:federated-bridge-previous',
          leaseTtlMs,
        });
        const throughBridge=await this.#probeOrigin(bridge.result?.local_url,spec.health||{});
        if(!throughBridge.ok) throw new Error('federated_bridge_upstream_health_gate_failed:'+throughBridge.state);

        binding=await this.#broker(edgeDeploymentId).bindDeployment(bridgeId,{
          requestedHostname:clean(routeSpec.hostname),
          ttlMs:leaseTtlMs,
          stableHostname:routeSpec.stable_hostname!==false,
        });
        if(!this.allowLoopbackProof&&binding.route_verified!==true){
          throw new Error('public_https_route_verification_required');
        }
        this.yard.startLeaseKeeper(bridgeId,{ttlMs:leaseTtlMs,renewEveryMs});
      }

      this.yard.startLeaseKeeper(candidateId,{ttlMs:leaseTtlMs,renewEveryMs});

      const record={
        schema:'evercraft.compute.hosted-service-state.v1',
        service_id:serviceId,
        state:'ready',
        action:previous?'promoted':'created',
        desired_spec:redactSpec(spec),
        desired_spec_hash:desiredHash,
        active_deployment_id:candidateId,
        active_release_ref:clean(spec.release_ref),
        deployment_generation:deploymentGeneration,
        deployment_receipt:candidate.receipt?.receipt_hash||null,
        capacity_node_id:candidate.receipt?.capacity_node_id||null,
        instance_id:candidate.result?.instance_id||null,
        health,
        placement:placementResolution?{
          mode:(spec.placement||{}).mode==='remote_broker'?'remote_broker':placementResolution.mode,
          node_id:candidate.receipt?.capacity_node_id||placementResolution.node_id||null,
          device_fingerprint:candidate.receipt?.capacity_device_fingerprint||placementResolution.device_fingerprint||null,
          broker_deployment_id:clean((spec.placement||{}).broker_deployment_id)||null,
          control_grant_receipt_hash:placementResolution.control_grant_receipt_hash||null,
        }:{mode:'unknown',node_id:candidate.receipt?.capacity_node_id||null},
        route:binding?{
          mode:(spec.route||{}).mode,
          origin:binding.origin,
          scope:binding.route_scope,
          verified:binding.route_verified===true,
          binding_receipt:binding.receipt_hash,
          route_lease_id:binding.route_lease_id||null,
          edge_deployment_id:clean((spec.route||{}).edge_deployment_id||'evercraft-public-edge'),
          bridge_deployment_id:bridge?.deployment_id||null,
          relay_id:remoteRelay?.relay_id||null,
          broker_deployment_id:clean((spec.placement||{}).broker_deployment_id)||null,
          remote_node_id:candidate.receipt?.capacity_node_id||null,
        }:{mode:'none',origin:null,verified:false},
        compatibility_binding:
          clean(spec.workload_class)==='systemia.rivet-report-runtime.v1' && binding
            ? {
                schema:'evercraft.rivet.compatibility-binding.v1',
                reports_url:new URL('/v1/reports',binding.origin).toString(),
                health_url:new URL('/health',binding.origin).toString(),
                route_verified:binding.route_verified===true,
                credential_source_env:'RIVET_YARD_TEAM_TOKEN',
                target_app:'RIVET Base44 compatibility bridge',
                target_secret_names:{
                  url:'RIVET_YARD_GATEWAY_URL',
                  token:'RIVET_YARD_GATEWAY_TOKEN',
                },
                secret_value_embedded:false,
              }
            : null,
        previous:previous?{
          desired_spec:previous.desired_spec,
          deployment_id:previous.active_deployment_id,
          release_ref:previous.active_release_ref,
          route:previous.route||null,
        }:null,
        created_at:previous?.created_at||new Date().toISOString(),
        updated_at:new Date().toISOString(),
      };
      this.#save(record);

      if(previous?.active_deployment_id&&previous.active_deployment_id!==candidateId){
        try{
          await this.#releaseRouteArtifacts(previous.route,{reason:'hosting_blue_green_promoted'});
          this.yard.stopLeaseKeeper(previous.active_deployment_id);
          await this.yard.stopDeployment(previous.active_deployment_id,{reason:'hosting_blue_green_promoted'});
        }catch{}
      }
      return record;
    }catch(error){
      if(binding){
        try{
          const edgeId=clean((spec.route||{}).edge_deployment_id||'evercraft-public-edge');
          await this.#broker(edgeId).releaseBinding(binding,{reason:'hosting_candidate_failed'});
        }catch{}
      }
      if(bridge){
        try{this.yard.stopLeaseKeeper(bridgeId);}catch{}
        try{await this.yard.stopDeployment(bridgeId,{reason:'hosting_candidate_failed'});}catch{}
      }
      if(remoteRelay){
        try{
          await this.yard.releaseRemoteServiceRelay(clean((spec.placement||{}).broker_deployment_id),remoteRelay.relay_id,{reason:'hosting_candidate_failed'});
        }catch{}
      }
      if(candidate){
        try{this.yard.stopLeaseKeeper(candidateId);}catch{}
        try{await this.yard.stopDeployment(candidateId,{reason:'hosting_candidate_failed'});}catch{}
      }
      const preserveActive=previous?.state==='ready'&&previous?.active_deployment_id&&!previousHealthFailed;
      const failed={
        schema:'evercraft.compute.hosted-service-state.v1',
        service_id:serviceId,
        state:preserveActive?'ready':previousHealthFailed?'degraded':'failed',
        action:'candidate_rejected',
        desired_spec:preserveActive?previous.desired_spec:redactSpec(spec),
        desired_spec_hash:preserveActive?previous.desired_spec_hash:desiredHash,
        last_attempted_spec:redactSpec(spec),
        last_attempted_spec_hash:desiredHash,
        active_deployment_id:previous?.active_deployment_id||null,
        active_release_ref:previous?.active_release_ref||null,
        deployment_generation:Number(previous?.deployment_generation||0),
        deployment_receipt:previous?.deployment_receipt||null,
        capacity_node_id:previous?.capacity_node_id||null,
        instance_id:previous?.instance_id||null,
        health:previous?.health||null,
        route:previous?.route||{mode:'none',origin:null,verified:false},
        previous:previous?.previous||null,
        last_error:String(error?.message||error),
        created_at:previous?.created_at||new Date().toISOString(),
        updated_at:new Date().toISOString(),
      };
      this.#save(failed);
      throw error;
    }
  }

  async reconcile(serviceId,{capacityEndpoint='',allocatorToken=''}={}){
    const current=this.#load(serviceId);
    if(!current?.desired_spec) throw new Error('hosted_service_spec_unavailable');
    return await this.apply(structuredClone(current.desired_spec),{capacityEndpoint,allocatorToken});
  }

  async reconcileAll(){
    const results=[];
    for(const name of fs.readdirSync(path.join(this.stateDir,'services'))){
      if(!name.endsWith('.json')) continue;
      const serviceId=name.slice(0,-5);
      try{
        const record=await this.reconcile(serviceId);
        results.push({service_id:serviceId,ok:true,state:record.state,action:record.action});
      }catch(error){
        const current=this.#load(serviceId);
        results.push({
          service_id:serviceId,
          ok:false,
          state:current?.state||'unknown',
          error:String(error?.message||error)
        });
      }
    }
    return {
      schema:'evercraft.compute.hosting-reconcile.v1',
      service_count:results.length,
      healthy_count:results.filter(x=>x.ok&&x.state==='ready').length,
      degraded_count:results.filter(x=>!x.ok||x.state==='degraded').length,
      results,
      reconciled_at:new Date().toISOString(),
    };
  }

  async rollback(serviceId,{capacityEndpoint='',allocatorToken=''}={}){
    const current=this.#load(serviceId);
    if(!current?.previous?.desired_spec) throw new Error('rollback_spec_unavailable');
    const spec=structuredClone(current.previous.desired_spec);
    return await this.apply(spec,{capacityEndpoint,allocatorToken});
  }

  async remove(serviceId,{reason='operator_requested'}={}){
    const current=this.#load(serviceId);
    if(!current) return {ok:true,service_id:serviceId,state:'absent'};
    await this.#releaseRouteArtifacts(current.route,{reason});
    if(current.active_deployment_id){
      this.yard.stopLeaseKeeper(current.active_deployment_id);
      try{await this.yard.stopDeployment(current.active_deployment_id,{reason});}catch{}
    }
    const next={...current,state:'stopped',action:'removed',updated_at:new Date().toISOString()};
    this.#save(next);
    return next;
  }
}

export function validateEvercraftServiceSpec(spec){
  assertSpec(spec);
  return true;
}
