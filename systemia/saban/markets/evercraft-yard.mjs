import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const labels=(node)=>new Set(
  (node?.capacity?.placement_labels||[])
    .map((value)=>String(value).trim().toLowerCase())
    .filter(Boolean)
);

export function createEvercraftYardMarketAdapter({yard}={}){
  if(!yard||typeof yard.listPrivateCapacityNodes!=='function'){
    throw new Error('yard_private_capacity_inventory_required');
  }
  if(typeof yard.privateCapacityGrant!=='function'){
    throw new Error('yard_private_capacity_grant_required');
  }

  return {
    market:'evercraft-yard',
    routing_priority:5,

    async discover({demand}={}){
      const inventory=await yard.listPrivateCapacityNodes();
      const offers=[];
      for(const node of inventory.nodes||[]){
        if(node?.connected!==true) continue;
        const capacity=node.capacity||{};
        if(capacity.zero_cost!==true) continue;
        const nodeLabels=labels(node);
        const supported=new Set(capacity.supported_workloads||[]);
        if(
          demand?.workload_class &&
          !supported.has(String(demand.workload_class))
        ) continue;
        const hint=capacity.capacity_hint||{};
        offers.push({
          offer_id:`evercraft-yard:${node.node_id}`,
          provider_id:String(node.node_id),
          market:'evercraft-yard',
          routing_priority:5,
          access_class:'authorized_compute',
          endpoint:null,
          resources:{
            cpu_units:Number(hint.cpu_units||0),
            memory_mb:Number(hint.memory_mb||0),
            storage_gb:Number(hint.storage_gb||0),
            gpu_count:Number(hint.gpu_units||hint.gpu_count||0),
            gpu_models:hint.gpu_models||[],
          },
          placement:{
            region:null,
            country:null,
            public_ingress:capacity.public_ingress===true,
            persistent_storage:nodeLabels.has('persistent-storage'),
          },
          trust:{
            uptime_7d:1,
            audited:true,
            valid_version:true,
            attested:
              capacity.authorized===true &&
              capacity.session_attestation_verified===true &&
              String(capacity.device_fingerprint||'')===
                String(node.device_fingerprint||''),
          },
          economics:{
            zero_cost:capacity.zero_cost===true,
            quoted:true,
            hourly_usd:capacity.zero_cost===true?0:null,
            total_usd:capacity.zero_cost===true?0:null,
            native_price:null,
          },
          quote_required:false,
          metadata:{
            node_id:String(node.node_id),
            device_fingerprint:String(node.device_fingerprint||''),
            placement_labels:[...nodeLabels],
            supported_workloads:capacity.supported_workloads||[],
          },
        });
      }
      const body={
        schema:'evercraft.saban.market-discovery.v1',
        market:'evercraft-yard',
        private_authorized_offer_count:offers.length,
        authority_material_exposed:false,
        observed_at:new Date().toISOString(),
      };
      return {
        offers,
        receipt:{
          ...body,
          receipt_hash:sha(body),
          yard_inventory_receipt:inventory.receipt?.receipt_hash||null,
        },
      };
    },

    async lease({demand,offer}={}){
      const nodeId=String(offer?.metadata?.node_id||offer?.provider_id||'');
      if(!nodeId) throw new Error('evercraft_yard_node_id_missing');
      if(offer?.economics?.zero_cost!==true){
        throw new Error('evercraft_yard_zero_spend_required');
      }

      const grant=await yard.privateCapacityGrant(nodeId);
      if(grant.node_id!==nodeId){
        throw new Error('evercraft_yard_grant_identity_mismatch');
      }
      if(
        offer?.metadata?.device_fingerprint &&
        grant.device_fingerprint!==offer.metadata.device_fingerprint
      ){
        throw new Error('evercraft_yard_grant_fingerprint_mismatch');
      }
      const allocatorToken=
        grant?.runtime_authority?.allocator_token||'';
      if(!grant.capacity_endpoint||!allocatorToken){
        throw new Error('evercraft_yard_runtime_authority_missing');
      }

      const body={
        schema:'evercraft.saban.yard-capacity-acquisition.v1',
        demand_id:demand.demand_id,
        market:'evercraft-yard',
        provider_id:nodeId,
        node_id:nodeId,
        device_fingerprint:grant.device_fingerprint,
        capacity_endpoint:grant.capacity_endpoint,
        zero_cost:true,
        execution_ready:true,
        workload_class:demand.workload_class,
        acquired_at:new Date().toISOString(),
        yard_grant_receipt_hash:grant.receipt_hash||null,
      };
      const result={...body,receipt:sha(body)};
      Object.defineProperty(result,'runtime_authority',{
        value:Object.freeze({allocator_token:allocatorToken}),
        enumerable:false,
        writable:false,
      });
      return result;
    },
  };
}
