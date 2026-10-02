import {createHash} from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');

export function nodeSeedSnapshotToComputeOffer(node={}){
  const capacity=node?.capacity||{};
  if(node?.connected!==true) throw new Error('nodeseed_offer_requires_connected_node');
  if(capacity.protocol!=='evercraft.capacity.v1') throw new Error('nodeseed_capacity_protocol_invalid');
  if(capacity.runtime!=='Evercraft Compute') throw new Error('nodeseed_runtime_invalid');
  if(capacity.authorized!==true) throw new Error('nodeseed_offer_requires_authorized_session');
  if(capacity.session_attestation_verified!==true) throw new Error('nodeseed_offer_requires_verified_session_attestation');
  if(
    !capacity.device_fingerprint ||
    String(capacity.device_fingerprint)!==String(node.device_fingerprint||'')
  ){
    throw new Error('nodeseed_offer_device_fingerprint_mismatch');
  }
  const labels=[...(capacity.placement_labels||[])].map(x=>String(x).trim().toLowerCase());
  const workloads=[...(capacity.supported_workloads||[])].map(String).sort();
  if(!workloads.length) throw new Error('nodeseed_offer_workloads_required');

  const body={
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:'nodeseed:'+String(node.node_id||''),
    provider_id:String(node.node_id||''),
    market:'evercraft-nodeseed',
    access_class:'authorized_compute',
    endpoint:null,
    resources:{
      cpu_units:Math.max(0,Number(capacity.capacity_hint?.cpu_units||0)),
      memory_mb:Math.max(0,Number(capacity.capacity_hint?.memory_mb||0)),
      storage_gb:Math.max(0,Number(capacity.capacity_hint?.storage_gb||0)),
      gpu_count:0,
      gpu_models:[],
    },
    placement:{
      region:null,
      country:null,
      public_ingress:capacity.public_ingress===true,
      persistent_storage:labels.includes('persistent-storage'),
    },
    trust:{
      uptime_7d:Math.max(0,Math.min(1,Number(capacity.uptime_7d||0))),
      audited:false,
      valid_version:true,
      attested:true,
    },
    economics:{
      zero_cost:capacity.zero_cost===true,
      quoted:true,
      hourly_usd:0,
      total_usd:0,
      native_price:null,
    },
    quote_required:false,
    source_receipt:null,
    metadata:{
      source:'remote-capacity-broker',
      source_type:'evercraft-nodeseed',
      device_id:String(node.node_id||''),
      device_class:'general-compute',
      supported_workloads:workloads,
      placement_labels:labels,
      failure_domain:capacity.failure_domain||null,
      failure_domains:capacity.failure_domain
        ? {failure_domain:String(capacity.failure_domain).toLowerCase()}
        : {},
      current_connection_verified:true,
      session_attestation_verified:true,
      zero_cost_verified:capacity.zero_cost===true,
      public_ingress_verified:capacity.public_ingress===true,
      generic_container_runtime:labels.includes('generic-container-runtime'),
      max_concurrency:null,
      authorization_required:true,
      arbitrary_code_execution:false,
    },
    observed_at:node.last_seen_at||new Date().toISOString(),
  };
  if(!body.provider_id) throw new Error('nodeseed_offer_node_id_required');
  return {...body,offer_hash:sha(body)};
}

export function nodeSeedInventoryToComputeOffers({
  inventory,
  requireZeroCost=true,
}={}){
  if(![
    'evercraft.yard.remote-capacity-nodes.v1',
    'evercraft.saban.nodeseed-safe-inventory.v1'
  ].includes(inventory?.schema)){
    throw new Error('yard_or_saban_nodeseed_inventory_required');
  }
  const offers=[];
  const rejected=[];
  for(const node of inventory.nodes||[]){
    try{
      const offer=nodeSeedSnapshotToComputeOffer(node);
      if(requireZeroCost&&offer.economics.zero_cost!==true){
        rejected.push({node_id:node.node_id,reason:'zero_cost_required'});
        continue;
      }
      offers.push(offer);
    }catch(error){
      rejected.push({
        node_id:String(node?.node_id||''),
        reason:String(error?.message||error),
      });
    }
  }
  offers.sort((a,b)=>
    Number(b.placement.public_ingress)-Number(a.placement.public_ingress) ||
    b.resources.memory_mb-a.resources.memory_mb ||
    b.resources.cpu_units-a.resources.cpu_units ||
    a.offer_id.localeCompare(b.offer_id)
  );
  return {
    schema:'evercraft.saban.nodeseed-compute-resolution.v1',
    eligible_count:offers.length,
    rejected_count:rejected.length,
    offers,
    rejected,
    zero_spend_only:requireZeroCost===true,
    authority_material_exposed:false,
    generated_at:new Date().toISOString(),
  };
}
