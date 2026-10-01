import { createHash } from 'node:crypto';
import { resolveAmbientCapabilities } from './ambient-capability-resolver.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const uniq=(values)=>[...new Set((values||[]).map(v=>String(v).trim()).filter(Boolean))];

export function normalizeCapabilityRole(input={}){
  const roleId=String(input.role_id||'').trim();
  if(!roleId) throw new Error('capability_role_id_required');
  const body={
    schema:'evercraft.saban.capability-role.v1',
    role_id:roleId,
    kind:String(input.kind||'').trim(),
    operation:String(input.operation||'').trim(),
    required_protocols:uniq(input.required_protocols),
    required_locality_tags:uniq(input.required_locality_tags).map(x=>x.toLowerCase()),
    allowed_access_classes:uniq(
      input.allowed_access_classes?.length
        ? input.allowed_access_classes
        : ['authorized_compute']
    ),
    require_zero_cost:input.require_zero_cost!==false,
    require_attestation:input.require_attestation===true,
    require_owner_authorization:input.require_owner_authorization!==false,
    resources:{
      cpu_units:Math.max(0,Number(input.resources?.cpu_units||0)),
      memory_mb:Math.max(0,Number(input.resources?.memory_mb||0)),
      storage_gb:Math.max(0,Number(input.resources?.storage_gb||0)),
      bandwidth_mbps:Math.max(0,Number(input.resources?.bandwidth_mbps||0)),
    },
    continuity:{
      always_on:input.always_on===true,
      replicas:Math.max(1,Math.floor(Number(input.replicas||1))),
      distinct_failure_domains:input.distinct_failure_domains!==false&&Number(input.replicas||1)>1,
      max_observation_age_ms:Math.max(1000,Number(input.max_observation_age_ms||300000)),
    },
    private_data:input.private_data===true,
  };
  if(!body.kind) throw new Error('capability_role_kind_required');
  if(!body.operation) throw new Error('capability_role_operation_required');
  return body;
}

function metadata(cap){return cap.metadata&&typeof cap.metadata==='object'?cap.metadata:{};}
function localityTags(cap){
  const m=metadata(cap);
  return new Set([
    ...(m.locality_tags||[]),
    ...(m.placement_labels||[]),
    cap.locality,
    m.region,
    m.country,
  ].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
}
function failureDomain(cap){
  const m=metadata(cap);
  return String(
    m.failure_domain||
    m.gateway_identity||
    m.site_id||
    m.network_id||
    cap.owner_ref||
    cap.id
  );
}

function capacityValue(cap,key){
  const m=metadata(cap);
  const resources=m.resources||{};
  if(key==='bandwidth_mbps') return Math.max(0,Number(
    resources.bandwidth_mbps??
    m.bandwidth_mbps??
    m.network_speed_mbps??
    0
  ));
  return Math.max(0,Number(resources[key]||0));
}

function evaluateCapability(role,cap,nowMs){
  const reasons=[];
  if(!role.allowed_access_classes.includes(String(cap.access_class||''))) reasons.push('access_class_not_allowed');
  if(role.private_data&&cap.access_class!=='authorized_compute') reasons.push('private_data_requires_authorized_capacity');
  if(role.require_owner_authorization&&cap.access_class==='authorized_compute'&&!cap.owner_ref){
    reasons.push('owner_authorization_required');
  }
  if(role.require_zero_cost&&Number(cap.cost||0)>0) reasons.push('nonzero_cost_rejected');

  const m=metadata(cap);
  if(role.require_attestation&&m.attested!==true) reasons.push('attestation_required');
  if(role.continuity.always_on&&['opportunistic','sleepy','intermittent'].includes(String(m.duty_cycle||'').toLowerCase())){
    reasons.push('always_on_required');
  }

  const tags=localityTags(cap);
  if(role.required_locality_tags.some(x=>!tags.has(x))) reasons.push('required_locality_missing');

  const observed=Date.parse(String(cap.observed_at||''))||0;
  const ageMs=Math.max(0,nowMs-observed);
  if(ageMs>role.continuity.max_observation_age_ms) reasons.push('capability_stale');

  for(const [key,min] of Object.entries(role.resources)){
    if(Number(min||0)>0&&capacityValue(cap,key)<Number(min)){
      reasons.push('insufficient_'+key);
    }
  }

  let score=0;
  if(!reasons.length){
    if(cap.access_class==='authorized_compute') score+=2000;
    if(m.attested===true) score+=1000;
    if(Number(cap.cost||0)===0) score+=5000;
    score+=role.required_locality_tags.filter(x=>tags.has(x)).length*300;
    score-=Math.min(500,Math.round(ageMs/1000));
    if(m.micro_node===true&&['observation','network_egress','network_ingress','actuation'].includes(role.kind)) score+=100;
  }

  return {
    eligible:reasons.length===0,
    reasons,
    score,
    age_ms:ageMs,
    failure_domain:failureDomain(cap),
    capability:cap,
  };
}

export function composeCapabilityFabric({
  roles=[],
  capabilities=[],
  now=new Date(),
}={}){
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  if(!Number.isFinite(nowMs)) throw new Error('capability_fabric_now_invalid');

  const normalizedRoles=roles.map(normalizeCapabilityRole);
  const assignments=[];
  const held=[];

  for(const role of normalizedRoles){
    const resolved=resolveAmbientCapabilities({
      capabilities,
      requestedOperation:role.operation,
      requestedKinds:[role.kind],
      requiredProtocols:role.required_protocols,
    });

    const evaluated=resolved.eligible
      .map(cap=>evaluateCapability(role,cap,nowMs))
      .filter(x=>x.eligible)
      .sort((a,b)=>b.score-a.score||String(a.capability.id).localeCompare(String(b.capability.id)));

    const domains=new Set();
    for(let replica=0;replica<role.continuity.replicas;replica++){
      const chosen=evaluated.find(x=>
        !role.continuity.distinct_failure_domains||!domains.has(x.failure_domain)
      );
      if(!chosen){
        held.push({
          role_id:role.role_id,
          replica_index:replica,
          reason:'no_eligible_capability',
          resolver_rejections:resolved.rejected,
          evaluated_rejections:resolved.eligible
            .map(cap=>evaluateCapability(role,cap,nowMs))
            .filter(x=>!x.eligible)
            .map(x=>({id:x.capability.id,reasons:x.reasons})),
        });
        continue;
      }
      domains.add(chosen.failure_domain);
      assignments.push({
        role_id:role.role_id,
        replica_index:replica,
        capability_id:chosen.capability.id,
        source_type:chosen.capability.source_type,
        access_class:chosen.capability.access_class,
        kind:chosen.capability.kind,
        protocol:chosen.capability.protocol,
        endpoint:chosen.capability.endpoint,
        failure_domain:chosen.failure_domain,
        score:chosen.score,
        zero_cost:Number(chosen.capability.cost||0)===0,
        owner_authorized:Boolean(chosen.capability.owner_ref),
      });
    }
  }

  const required=normalizedRoles.reduce((n,r)=>n+r.continuity.replicas,0);
  const body={
    schema:'evercraft.saban.capability-fabric-plan.v1',
    state:assignments.length===required?'ready':'held',
    role_count:normalizedRoles.length,
    required_assignments:required,
    completed_assignments:assignments.length,
    held_assignments:held.length,
    assignments,
    held,
    zero_spend:assignments.every(x=>x.zero_cost===true),
    visibility_is_not_authorization:true,
    cross_device_resource_fiction:false,
    generated_at:new Date(nowMs).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export function rivetAliEvCapabilityRoles(){
  return [
    normalizeCapabilityRole({
      role_id:'public-network-ingress',
      kind:'network_ingress',
      operation:'receive',
      allowed_access_classes:['authorized_compute','voluntary_compute'],
      require_zero_cost:true,
      require_owner_authorization:true,
      replicas:2,
      distinct_failure_domains:true,
      always_on:true,
      resources:{bandwidth_mbps:10},
    }),
    normalizeCapabilityRole({
      role_id:'source-network-egress',
      kind:'network_egress',
      operation:'query_public',
      allowed_access_classes:['authorized_compute','open_protocol'],
      require_zero_cost:true,
      require_owner_authorization:false,
      resources:{bandwidth_mbps:5},
    }),
    normalizeCapabilityRole({
      role_id:'durable-source-storage',
      kind:'storage',
      operation:'store',
      allowed_access_classes:['authorized_compute'],
      require_zero_cost:true,
      require_owner_authorization:true,
      require_attestation:true,
      always_on:true,
      private_data:true,
      resources:{storage_gb:150},
    }),
    normalizeCapabilityRole({
      role_id:'physical-world-observation',
      kind:'observation',
      operation:'observe',
      allowed_access_classes:['authorized_compute','public_observation','open_protocol'],
      require_zero_cost:true,
      require_owner_authorization:false,
    }),
  ];
}
