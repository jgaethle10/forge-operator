export function createYardVoluntaryLeaseResolver({
  yard,
  brokerDeploymentId,
}={}){
  if(!yard||typeof yard.remoteCapacityGrant!=='function'){
    throw new Error('yard_operator_required');
  }
  if(!brokerDeploymentId) throw new Error('broker_deployment_id_required');

  return async function resolveVoluntaryLease({
    provider,
    offer,
  }={}){
    const nodeId=String(provider?.provider_id||offer?.provider_id||'').trim();
    const fingerprint=String(provider?.fingerprint||'').trim();
    if(!nodeId) throw new Error('voluntary_yard_node_id_required');
    if(!fingerprint) throw new Error('voluntary_yard_fingerprint_required');

    const grant=await yard.remoteCapacityGrant(brokerDeploymentId,nodeId);
    if(String(grant?.node_id||'')!==nodeId){
      throw new Error('voluntary_yard_node_identity_mismatch');
    }
    if(String(grant?.device_fingerprint||'')!==fingerprint){
      throw new Error('voluntary_yard_device_fingerprint_mismatch');
    }
    if(!grant?.capacity_endpoint||!grant?.allocator_token){
      throw new Error('voluntary_yard_execution_grant_incomplete');
    }

    return {
      execution_endpoint:String(grant.capacity_endpoint),
      transport:'evercraft-nodeseed',
      execution_ready:true,
      authority:Object.freeze({
        allocator_token:grant.allocator_token,
      }),
      control_grant_receipt_hash:grant.control_grant_receipt_hash||null,
      public_route_receipt_hash:grant.public_route_receipt_hash||null,
    };
  };
}
