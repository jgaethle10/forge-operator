import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { YardPublicRouteBroker } from '../yard/public-route-broker.mjs';

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
  if(!['none','public_edge'].includes(route.mode)) throw new Error('route_mode_invalid');
  if(route.mode==='public_edge'){
    safeId(route.edge_deployment_id||'evercraft-public-edge');
    if(!clean(route.hostname)) throw new Error('public_route_hostname_required');
  }
  const health=spec.health||{};
  if(health.path&&!String(health.path).startsWith('/')) throw new Error('health_path_invalid');
  return spec;
}
function redactSpec(spec){
  return structuredClone(spec);
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

  async #probe(record,spec){
    const health=spec.health||{};
    if(!health.path) return {ok:true,state:'health_probe_not_required',body:null};
    const origin=clean(record?.result?.local_url);
    if(!origin) return {ok:false,state:'local_service_origin_missing',body:null};
    try{
      const response=await fetch(new URL(health.path,origin));
      const body=await response.json().catch(()=>null);
      const ok=response.ok&&body&&matchesExpected(body,health.expect||{ok:true});
      return {ok,state:ok?'healthy':'health_contract_mismatch',status:response.status,body};
    }catch(error){
      return {ok:false,state:'health_probe_failed',detail:String(error?.message||error),body:null};
    }
  }

  #broker(edgeDeploymentId){
    return new YardPublicRouteBroker({
      yard:this.yard,
      providerClient:this.yard.publicRouteProviderClient(edgeDeploymentId),
      allowLoopbackProof:this.allowLoopbackProof,
    });
  }

  async apply(spec,{capacityEndpoint='',allocatorToken=''}={}){
    assertSpec(spec);
    const serviceId=safeId(spec.service_id);
    const previous=this.#load(serviceId);
    const desiredHash=sha(redactSpec(spec));
    const leaseTtlMs=Math.max(60000,Number(spec.lease_ttl_ms||this.defaultLeaseTtlMs));
    const renewEveryMs=Math.max(30000,Number(spec.renew_every_ms||this.defaultRenewEveryMs));

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
      }
    }

    const candidateId=safeId(serviceId+'--'+clean(spec.release_ref).slice(0,12));
    let candidate=null;
    let binding=null;
    try{
      const args={
        deploymentId:candidateId,
        releaseRef:clean(spec.release_ref),
        workloadClass:clean(spec.workload_class),
        input:structuredClone(spec.input||{}),
        rollbackTarget:clean(spec.rollback_target),
        leaseTtlMs,
      };
      candidate=capacityEndpoint
        ? await this.yard.deployRelease({...args,capacityEndpoint,allocatorToken})
        : spec.capacity_source_deployment_id
          ? await this.yard.deploySiblingRelease({
              sourceDeploymentId:clean(spec.capacity_source_deployment_id),
              ...args,
            })
          : null;
      if(!candidate) throw new Error('capacity_endpoint_or_source_deployment_required');

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
        deployment_receipt:candidate.receipt?.receipt_hash||null,
        capacity_node_id:candidate.receipt?.capacity_node_id||null,
        instance_id:candidate.result?.instance_id||null,
        health,
        route:binding?{
          mode:'public_edge',
          origin:binding.origin,
          scope:binding.route_scope,
          verified:binding.route_verified===true,
          binding_receipt:binding.receipt_hash,
          edge_deployment_id:clean((spec.route||{}).edge_deployment_id||'evercraft-public-edge'),
        }:{mode:'none',origin:null,verified:false},
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
          if(previous.route?.binding_receipt&&previous.route?.edge_deployment_id){
            // Old route leases expire independently. Stop the old resident only after the new candidate is healthy and bound.
          }
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
      if(candidate){
        try{this.yard.stopLeaseKeeper(candidateId);}catch{}
        try{await this.yard.stopDeployment(candidateId,{reason:'hosting_candidate_failed'});}catch{}
      }
      const failed={
        schema:'evercraft.compute.hosted-service-state.v1',
        service_id:serviceId,
        state:previous?.state==='ready'?'ready':'failed',
        action:'candidate_rejected',
        desired_spec:redactSpec(spec),
        desired_spec_hash:desiredHash,
        active_deployment_id:previous?.active_deployment_id||null,
        active_release_ref:previous?.active_release_ref||null,
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

  async rollback(serviceId,{capacityEndpoint='',allocatorToken=''}={}){
    const current=this.#load(serviceId);
    if(!current?.previous?.desired_spec) throw new Error('rollback_spec_unavailable');
    const spec=structuredClone(current.previous.desired_spec);
    return await this.apply(spec,{capacityEndpoint,allocatorToken});
  }

  async remove(serviceId,{reason='operator_requested'}={}){
    const current=this.#load(serviceId);
    if(!current) return {ok:true,service_id:serviceId,state:'absent'};
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
