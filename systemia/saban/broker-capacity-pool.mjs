import { createHash } from 'node:crypto';
import { runNodeSeedAssignmentPool } from './nodeseed-pool.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function labelsOf(node){
  return new Set((node?.capacity?.placement_labels||[]).map((v)=>String(v).trim().toLowerCase()));
}

function workloadsOf(node){
  return new Set((node?.capacity?.supported_workloads||[]).map(String));
}

export function classifyBrokerCapacity(nodes=[],{
  requiredWorkloads=['saban.multiplier-assignment.v1'],
  requiredNodeLabels=[],
  forbiddenNodeLabels=[],
  minimumNodeCpuUnits=0,
  minimumNodeMemoryMb=0,
  requireAttestation=true,
  requireZeroCost=false,
  requirePublicIngress=false,
}={}){
  const requiredWork=new Set(requiredWorkloads.map(String));
  const requiredLabels=new Set(requiredNodeLabels.map((v)=>String(v).trim().toLowerCase()));
  const forbiddenLabels=new Set(forbiddenNodeLabels.map((v)=>String(v).trim().toLowerCase()));
  const eligible=[];
  const rejected=[];

  for(const node of nodes||[]){
    let reason=null;
    const capacity=node?.capacity||{};
    const labels=labelsOf(node);
    const workloads=workloadsOf(node);
    const hint=capacity.capacity_hint||{};

    if(node?.connected!==true) reason='node_not_connected';
    else if(capacity.protocol!=='evercraft.capacity.v1') reason='capacity_protocol_mismatch';
    else if(capacity.runtime!=='Evercraft Compute') reason='runtime_mismatch';
    else if(requireAttestation && capacity.attestation_supported!==true) reason='attestation_not_supported';
    else if(requireAttestation && capacity.device_fingerprint!==node.device_fingerprint) reason='device_fingerprint_mismatch';
    else if(requireZeroCost && capacity.zero_cost!==true) reason='zero_cost_required';
    else if(requirePublicIngress && capacity.public_ingress!==true) reason='public_ingress_required';
    else if([...requiredWork].some((key)=>!workloads.has(key))) reason='workload_unsupported';
    else if([...requiredLabels].some((key)=>!labels.has(key))) reason='required_label_missing';
    else if([...forbiddenLabels].some((key)=>labels.has(key))) reason='forbidden_label_present';
    else if(Number(minimumNodeCpuUnits||0)>0 && Number(hint.cpu_units||0)<Number(minimumNodeCpuUnits)) reason='insufficient_cpu_capacity';
    else if(Number(minimumNodeMemoryMb||0)>0 && Number(hint.memory_mb||0)<Number(minimumNodeMemoryMb)) reason='insufficient_memory_capacity';

    if(reason){
      rejected.push({
        node_id:String(node?.node_id||''),
        device_fingerprint:String(node?.device_fingerprint||''),
        reason,
      });
    }else{
      eligible.push(node);
    }
  }

  eligible.sort((a,b)=>
    String(b.last_seen_at||'').localeCompare(String(a.last_seen_at||''))
  );

  return {eligible,rejected};
}

export async function resolveBrokerBackedSabanPool({
  yard,
  brokerDeploymentId,
  resourceProfile={},
}={}){
  if(!yard||typeof yard.listRemoteCapacityNodes!=='function'){
    throw new Error('yard_operator_required');
  }
  if(!brokerDeploymentId) throw new Error('broker_deployment_id_required');

  const inventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
  const classified=classifyBrokerCapacity(inventory.nodes||[],{
    requiredWorkloads:['saban.multiplier-assignment.v1'],
    requiredNodeLabels:resourceProfile.required_node_labels||[],
    forbiddenNodeLabels:resourceProfile.forbidden_node_labels||[],
    minimumNodeCpuUnits:resourceProfile.minimum_node_cpu_units||0,
    minimumNodeMemoryMb:resourceProfile.minimum_node_memory_mb||0,
    requireAttestation:resourceProfile.require_node_attestation!==false,
    requireZeroCost:resourceProfile.require_zero_cost===true,
    requirePublicIngress:resourceProfile.require_public_ingress===true,
  });

  const endpoints=[];
  const allocatorTokens={};
  const grants=[];
  for(const node of classified.eligible){
    const grant=await yard.remoteCapacityGrant(brokerDeploymentId,node.node_id);
    if(
      grant.node_id!==node.node_id ||
      grant.device_fingerprint!==node.device_fingerprint
    ){
      throw new Error('broker_capacity_grant_identity_mismatch');
    }
    endpoints.push(grant.capacity_endpoint);
    allocatorTokens[grant.capacity_endpoint]=grant.allocator_token;
    grants.push({
      node_id:grant.node_id,
      device_fingerprint:grant.device_fingerprint,
      capacity_endpoint:grant.capacity_endpoint,
      control_grant_receipt_hash:grant.control_grant_receipt_hash||null,
      public_route_receipt_hash:grant.public_route_receipt_hash||null,
    });
  }

  const receiptBody={
    schema:'evercraft.saban.broker-capacity-resolution.v1',
    broker_deployment_id:brokerDeploymentId,
    inventory_count:Number(inventory.count||0),
    eligible_count:classified.eligible.length,
    rejected:classified.rejected,
    grants:grants.map((grant)=>({
      node_id:grant.node_id,
      device_fingerprint:grant.device_fingerprint,
      control_grant_receipt_hash:grant.control_grant_receipt_hash,
      public_route_receipt_hash:grant.public_route_receipt_hash,
    })),
    authority_material_persisted:false,
    resolved_at:new Date().toISOString(),
  };
  const receipt={...receiptBody,receipt_hash:sha(receiptBody)};

  return {
    endpoints,
    allocatorTokens,
    grants,
    receipt,
  };
}

export async function runBrokerBackedSabanAssignmentPool({
  yard,
  brokerDeploymentId,
  resourceProfile={},
  ...poolOptions
}={}){
  const resolved=await resolveBrokerBackedSabanPool({
    yard,
    brokerDeploymentId,
    resourceProfile,
  });
  if(!resolved.endpoints.length){
    const error=new Error('no_authorized_remote_hardware_matches_saban_workload');
    error.resolution=resolved.receipt;
    throw error;
  }

  const result=await runNodeSeedAssignmentPool({
    ...poolOptions,
    endpoints:resolved.endpoints,
    discover:false,
    allocatorTokens:resolved.allocatorTokens,
    resourceProfile,
  });

  return {
    ...result,
    capacity_source:'systemia_remote_capacity_broker',
    capacity_resolution_receipt:resolved.receipt,
  };
}
