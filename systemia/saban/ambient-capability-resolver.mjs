import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const ACCESS_CLASSES=new Set([
  'public_observation',
  'open_protocol',
  'voluntary_compute',
  'authorized_compute',
  'commercial_capacity',
]);

const ACTIVE_KINDS=new Set([
  'compute',
  'storage',
  'network_egress',
  'network_ingress',
  'actuation',
]);

function normalizeCapability(input={}){
  const id=String(input.id||'').trim();
  if(!id) throw new Error('capability_id_required');
  const accessClass=String(input.access_class||'').trim();
  if(!ACCESS_CLASSES.has(accessClass)) throw new Error('access_class_invalid');
  const kind=String(input.kind||'observation').trim();
  const operations=[...new Set((input.operations||[]).map(String))].sort();
  return {
    schema:'evercraft.ambient-capability.v1',
    id,
    source_type:String(input.source_type||'unknown'),
    access_class:accessClass,
    kind,
    operations,
    endpoint:input.endpoint?String(input.endpoint):null,
    protocol:input.protocol?String(input.protocol):null,
    locality:input.locality||null,
    cost:input.cost??null,
    terms_ref:input.terms_ref?String(input.terms_ref):null,
    owner_ref:input.owner_ref?String(input.owner_ref):null,
    observed_at:input.observed_at||new Date().toISOString(),
    metadata:input.metadata&&typeof input.metadata==='object'?input.metadata:{},
  };
}

function usageDecision(capability,requestedOperation){
  const op=String(requestedOperation||'').trim();
  if(!op) return {allowed:false,reason:'operation_required'};
  if(!capability.operations.includes(op)){
    return {allowed:false,reason:'operation_not_advertised'};
  }

  if(capability.access_class==='public_observation'){
    return op==='observe'
      ? {allowed:true,reason:'public_observation'}
      : {allowed:false,reason:'public_observation_is_read_only'};
  }

  if(capability.access_class==='open_protocol'){
    const passive=new Set(['observe','receive','resolve','query_public','subscribe_public']);
    return passive.has(op)
      ? {allowed:true,reason:'open_protocol_public_operation'}
      : {allowed:false,reason:'open_protocol_active_control_not_declared'};
  }

  if(capability.access_class==='voluntary_compute'){
    if(!capability.endpoint) return {allowed:false,reason:'voluntary_compute_endpoint_missing'};
    if(!capability.terms_ref) return {allowed:false,reason:'voluntary_compute_terms_missing'};
    return {allowed:true,reason:'voluntary_compute_offer'};
  }

  if(capability.access_class==='commercial_capacity'){
    if(!capability.endpoint) return {allowed:false,reason:'commercial_capacity_endpoint_missing'};
    if(!capability.terms_ref) return {allowed:false,reason:'commercial_capacity_terms_missing'};
    return {allowed:true,reason:'commercial_capacity_offer'};
  }

  if(capability.access_class==='authorized_compute'){
    if(!capability.owner_ref) return {allowed:false,reason:'authorization_reference_missing'};
    return {allowed:true,reason:'authorized_capacity'};
  }

  return {allowed:false,reason:'unsupported_access_class'};
}

export function resolveAmbientCapabilities({
  capabilities=[],
  requestedOperation,
  requestedKinds=[],
  requiredProtocols=[],
}={}){
  const kinds=new Set(requestedKinds.map(String));
  const protocols=new Set(requiredProtocols.map(String));
  const eligible=[];
  const rejected=[];

  for(const raw of capabilities){
    let capability;
    try{ capability=normalizeCapability(raw); }
    catch(error){
      rejected.push({id:String(raw?.id||''),reason:String(error?.message||error)});
      continue;
    }

    if(kinds.size && !kinds.has(capability.kind)){
      rejected.push({id:capability.id,reason:'kind_mismatch'});
      continue;
    }
    if(protocols.size && !protocols.has(capability.protocol)){
      rejected.push({id:capability.id,reason:'protocol_mismatch'});
      continue;
    }

    const decision=usageDecision(capability,requestedOperation);
    if(!decision.allowed){
      rejected.push({id:capability.id,reason:decision.reason});
      continue;
    }

    eligible.push({
      ...capability,
      decision_reason:decision.reason,
      active_capability:ACTIVE_KINDS.has(capability.kind),
    });
  }

  const receiptBody={
    schema:'evercraft.ambient-capability-resolution.v1',
    requested_operation:String(requestedOperation||''),
    eligible_count:eligible.length,
    rejected_count:rejected.length,
    eligible:eligible.map((x)=>({
      id:x.id,
      access_class:x.access_class,
      kind:x.kind,
      protocol:x.protocol,
      decision_reason:x.decision_reason,
    })),
    rejected,
    resolved_at:new Date().toISOString(),
  };

  return {
    eligible,
    rejected,
    receipt:{...receiptBody,receipt_hash:sha(receiptBody)},
  };
}

export const AmbientCapabilityAccessClasses=Object.freeze([...ACCESS_CLASSES]);
