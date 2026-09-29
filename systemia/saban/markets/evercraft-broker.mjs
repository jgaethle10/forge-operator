import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const mb=(value)=>Number(value||0);
const labels=(node)=>new Set(
  (node?.capacity?.placement_labels||[]).map((x)=>String(x).trim().toLowerCase())
);

export function createEvercraftBrokerMarketAdapter({
  yard,
  brokerDeploymentId,
}={}){
  if(!yard||typeof yard.listRemoteCapacityNodes!=='function'){
    throw new Error('yard_operator_required');
  }
  if(!brokerDeploymentId) throw new Error('broker_deployment_id_required');

  return {
    market:'evercraft-broker',

    async discover({demand}={}){
      const inventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
      const offers=[];
      for(const node of inventory.nodes||[]){
        if(node?.connected!==true) continue;
        const capacity=node.capacity||{};
        const hint=capacity.capacity_hint||{};
        const nodeLabels=labels(node);
        const supportedWorkloads=new Set(capacity.supported_workloads||[]);
        if(
          demand?.workload_class &&
          !supportedWorkloads.has(String(demand.workload_class))
        ) continue;
        offers.push({
          offer_id:`evercraft-broker:${node.node_id}`,
          provider_id:String(node.node_id),
          market:'evercraft-broker',
          access_class:nodeLabels.has('personal-compute')
            ? 'authorized_compute'
            : 'voluntary_compute',
          endpoint:null,
          resources:{
            cpu_units:Number(hint.cpu_units||0),
            memory_mb:mb(hint.memory_mb),
            storage_gb:Number(hint.storage_gb||0),
            gpu_count:Number(hint.gpu_units||hint.gpu_count||0),
            gpu_models:hint.gpu_models||[],
          },
          placement:{
            region:null,
            country:null,
            public_ingress:capacity.public_edge?.ready===true,
            persistent_storage:nodeLabels.has('persistent-storage'),
          },
          trust:{
            uptime_7d:1,
            audited:true,
            valid_version:true,
            attested:capacity.attestation_supported===true &&
              capacity.device_fingerprint===node.device_fingerprint,
          },
          economics:{
            zero_cost:true,
            quoted:true,
            hourly_usd:0,
            total_usd:0,
            native_price:null,
          },
          quote_required:false,
          metadata:{
            node_id:String(node.node_id),
            device_fingerprint:String(node.device_fingerprint||''),
            placement_labels:[...nodeLabels],
            supported_workloads:capacity.supported_workloads||[],
            last_seen_at:node.last_seen_at||null,
          },
        });
      }

      const body={
        schema:'evercraft.saban.market-discovery.v1',
        market:'evercraft-broker',
        broker_deployment_id:brokerDeploymentId,
        connected_offer_count:offers.length,
        observed_at:new Date().toISOString(),
      };
      return {offers,receipt:{...body,receipt_hash:sha(body)}};
    },

    async lease({demand,offer}={}){
      const nodeId=String(offer?.metadata?.node_id||offer?.provider_id||'');
      if(!nodeId) throw new Error('evercraft_broker_node_id_missing');
      const grant=await yard.remoteCapacityGrant(brokerDeploymentId,nodeId);
      if(grant.node_id!==nodeId){
        throw new Error('evercraft_broker_grant_identity_mismatch');
      }
      if(
        offer?.metadata?.device_fingerprint &&
        grant.device_fingerprint!==offer.metadata.device_fingerprint
      ){
        throw new Error('evercraft_broker_grant_fingerprint_mismatch');
      }

      const body={
        schema:'evercraft.saban.broker-capacity-acquisition.v1',
        demand_id:demand.demand_id,
        market:'evercraft-broker',
        node_id:grant.node_id,
        device_fingerprint:grant.device_fingerprint,
        capacity_endpoint:grant.capacity_endpoint,
        zero_cost:true,
        execution_ready:true,
        workload_class:demand.workload_class,
        acquired_at:new Date().toISOString(),
        control_grant_receipt_hash:grant.control_grant_receipt_hash||null,
        public_route_receipt_hash:grant.public_route_receipt_hash||null,
      };
      const result={
        ...body,
        receipt:sha(body),
      };
      Object.defineProperty(result,'runtime_authority',{
        value:Object.freeze({allocator_token:grant.allocator_token}),
        enumerable:false,
        writable:false,
      });
      return result;
    },
  };
}
