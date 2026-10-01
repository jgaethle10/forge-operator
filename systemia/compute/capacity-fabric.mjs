function clean(value){return String(value??'').trim();}
function labels(node){return new Set((node?.capacity?.placement_labels||[]).map(v=>clean(v).toLowerCase()).filter(Boolean));}
function workloads(node){return new Set((node?.capacity?.supported_workloads||[]).map(v=>clean(v)).filter(Boolean));}

export function classifyEvercraftCapacity(nodes=[],{
  workloadClass='',
  requiredNodeLabels=[],
  forbiddenNodeLabels=[],
  minimumNodeCpuUnits=0,
  minimumNodeMemoryMb=0,
  requireAttestation=true,
  preferredNodeId='',
  excludeNodeIds=[],
}={}){
  const eligible=[],rejected=[];
  const work=clean(workloadClass);
  const required=new Set(requiredNodeLabels.map(v=>clean(v).toLowerCase()).filter(Boolean));
  const forbidden=new Set(forbiddenNodeLabels.map(v=>clean(v).toLowerCase()).filter(Boolean));
  const excludedNodes=new Set(excludeNodeIds.map(clean).filter(Boolean));
  for(const node of nodes||[]){
    const capacity=node?.capacity||{};
    const nodeLabels=labels(node),supported=workloads(node);
    let reason='';
    if(excludedNodes.has(clean(node?.node_id))) reason='node_explicitly_excluded';
    else if(node?.connected!==true) reason='node_not_connected';
    else if(capacity.protocol!=='evercraft.capacity.v1') reason='capacity_protocol_mismatch';
    else if(capacity.runtime!=='Evercraft Compute') reason='runtime_mismatch';
    else if(requireAttestation&&capacity.attestation_supported!==true) reason='attestation_not_supported';
    else if(requireAttestation&&clean(capacity.device_fingerprint)!==clean(node?.device_fingerprint)) reason='device_fingerprint_mismatch';
    else if(work&&!supported.has(work)) reason='workload_unsupported';
    else if([...required].some(x=>!nodeLabels.has(x))) reason='required_label_missing';
    else if([...forbidden].some(x=>nodeLabels.has(x))) reason='forbidden_label_present';
    else if(Number(minimumNodeCpuUnits||0)>0&&Number(capacity.capacity_hint?.cpu_units||0)<Number(minimumNodeCpuUnits)) reason='insufficient_cpu_capacity';
    else if(Number(minimumNodeMemoryMb||0)>0&&Number(capacity.capacity_hint?.memory_mb||0)<Number(minimumNodeMemoryMb)) reason='insufficient_memory_capacity';

    if(reason){
      rejected.push({node_id:clean(node?.node_id),device_fingerprint:clean(node?.device_fingerprint),reason});
    }else eligible.push(node);
  }

  eligible.sort((a,b)=>{
    const ap=clean(a?.node_id)===clean(preferredNodeId)?1:0;
    const bp=clean(b?.node_id)===clean(preferredNodeId)?1:0;
    if(ap!==bp)return bp-ap;
    const am=Number(a?.capacity?.capacity_hint?.memory_mb||0);
    const bm=Number(b?.capacity?.capacity_hint?.memory_mb||0);
    if(am!==bm)return bm-am;
    const ac=Number(a?.capacity?.capacity_hint?.cpu_units||0);
    const bc=Number(b?.capacity?.capacity_hint?.cpu_units||0);
    if(ac!==bc)return bc-ac;
    return clean(b?.last_seen_at).localeCompare(clean(a?.last_seen_at));
  });

  return {eligible,rejected};
}

export async function resolveEvercraftRemoteCapacity({
  yard,
  brokerDeploymentId,
  workloadClass,
  resourceProfile={},
  preferredNodeId='',
  excludeNodeIds=[],
  allowLoopbackProof=false,
}={}){
  if(!yard||typeof yard.listRemoteCapacityNodes!=='function') throw new Error('yard_operator_required');
  if(!clean(brokerDeploymentId)) throw new Error('broker_deployment_id_required');
  if(!clean(workloadClass)) throw new Error('workload_class_required');

  const inventory=await yard.listRemoteCapacityNodes(clean(brokerDeploymentId));
  const classified=classifyEvercraftCapacity(inventory.nodes||[],{
    workloadClass,
    requiredNodeLabels:resourceProfile.required_node_labels||[],
    forbiddenNodeLabels:resourceProfile.forbidden_node_labels||[],
    minimumNodeCpuUnits:resourceProfile.minimum_node_cpu_units||0,
    minimumNodeMemoryMb:resourceProfile.minimum_node_memory_mb||0,
    requireAttestation:resourceProfile.require_node_attestation!==false,
    preferredNodeId,
    excludeNodeIds,
  });
  const selected=classified.eligible[0]||null;
  if(!selected){
    const error=new Error('no_remote_capacity_matches_service');
    error.resolution={
      schema:'evercraft.compute.capacity-resolution.v1',
      broker_deployment_id:clean(brokerDeploymentId),
      workload_class:clean(workloadClass),
      inventory_count:Number(inventory.count||0),
      eligible_count:0,
      rejected:classified.rejected,
    };
    throw error;
  }
  const grant=await yard.remoteCapacityGrant(clean(brokerDeploymentId),selected.node_id,{allowLoopbackProof});
  if(clean(grant.node_id)!==clean(selected.node_id)||clean(grant.device_fingerprint)!==clean(selected.device_fingerprint)){
    throw new Error('remote_capacity_grant_identity_mismatch');
  }
  return {
    schema:'evercraft.compute.capacity-resolution.v1',
    broker_deployment_id:clean(brokerDeploymentId),
    workload_class:clean(workloadClass),
    node_id:clean(selected.node_id),
    device_fingerprint:clean(selected.device_fingerprint),
    capacity_endpoint:grant.capacity_endpoint,
    allocator_token:grant.allocator_token,
    control_grant_receipt_hash:grant.control_grant_receipt_hash||null,
    public_route_receipt_hash:grant.public_route_receipt_hash||null,
    inventory_count:Number(inventory.count||0),
    eligible_count:classified.eligible.length,
    rejected:classified.rejected,
    selected_capacity:{
      cpu_units:Number(selected?.capacity?.capacity_hint?.cpu_units||0),
      memory_mb:Number(selected?.capacity?.capacity_hint?.memory_mb||0),
      placement_labels:selected?.capacity?.placement_labels||[],
    },
  };
}
