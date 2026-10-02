import { createHash } from 'node:crypto';
import { createGolemSdkClient } from '../golem-requestor/client.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const n=(value,fallback)=>{
  const out=Number(value);
  return Number.isFinite(out)?out:fallback;
};

export function buildGolemOrder(demand,{
  providerId=null,
}={}){
  const imageTag=String(demand?.container_image||'').trim();
  if(!imageTag) throw new Error('golem_container_image_required');
  const ceiling=demand?.economics?.market_price_ceiling||{};
  const rentHours=Math.max(1/60,Number(demand.duration_seconds||3600)/3600);
  const pricing={
    model:'linear',
    maxStartPrice:Math.max(0,n(ceiling.golem_max_start_glm,1)),
    maxCpuPerHourPrice:Math.max(0,n(ceiling.golem_max_cpu_per_hour_glm,1)),
    maxEnvPerHourPrice:Math.max(0,n(ceiling.golem_max_env_per_hour_glm,1)),
  };
  const market={rentHours,pricing};
  if(providerId){
    market.offerProposalFilter=(proposal)=>
      String(proposal?.provider?.id||'')===String(providerId);
  }
  return {
    demand:{
      workload:{
        imageTag,
        minCpuThreads:Math.max(1,Math.ceil(Number(demand.resources?.cpu_units||1))),
        minMemGib:Math.max(0.25,Number(demand.resources?.memory_mb||512)/1024),
        minStorageGib:Math.max(0.1,Number(demand.resources?.storage_gb||1)),
      },
      ...(ceiling.golem_subnet_tag?{subnetTag:String(ceiling.golem_subnet_tag)}:{}),
    },
    market,
    payment:{
      network:String(ceiling.golem_payment_network||'hoodi'),
    },
  };
}

export function estimateGolemCeilingGlm(demand,order){
  const rentHours=Number(order?.market?.rentHours||Number(demand.duration_seconds||3600)/3600);
  const p=order?.market?.pricing||{};
  const threads=Math.max(1,Math.ceil(Number(demand.resources?.cpu_units||1)));
  return Number((
    Number(p.maxStartPrice||0)+
    rentHours*(
      threads*Number(p.maxCpuPerHourPrice||0)+
      Number(p.maxEnvPerHourPrice||0)
    )
  ).toFixed(9));
}

function proposalProvider(row){
  return {
    id:String(row?.provider?.id||row?.provider_id||row?.providerId||''),
    name:String(row?.provider?.name||row?.provider_name||row?.providerName||'')||null,
  };
}

function offerFromScan(row,demand){
  const provider=proposalProvider(row);
  if(!provider.id) return null;
  const order=buildGolemOrder(demand,{providerId:provider.id});
  const ceilingGlm=estimateGolemCeilingGlm(demand,order);
  return {
    offer_id:`golem:${provider.id}`,
    provider_id:provider.id,
    market:'golem',
    access_class:'commercial_capacity',
    endpoint:null,
    resources:{
      cpu_units:Number(demand.resources.cpu_units),
      memory_mb:Number(demand.resources.memory_mb),
      storage_gb:Number(demand.resources.storage_gb),
      gpu_count:Number(demand.resources.gpu_count),
      gpu_models:[...(demand.resources.gpu_models||[])],
    },
    placement:{
      region:null,
      country:null,
      public_ingress:false,
      persistent_storage:false,
    },
    trust:{
      uptime_7d:0,
      audited:false,
      valid_version:true,
      attested:false,
    },
    economics:{
      zero_cost:false,
      quoted:false,
      hourly_usd:null,
      total_usd:null,
      native_price:{
        denom:'GLM',
        ceiling_total_glm:ceilingGlm,
        pricing_model:'linear',
      },
    },
    quote_required:true,
    metadata:{
      provider_name:provider.name,
      demand_matched_by_golem_market:true,
      payment_network:order.payment.network,
    },
  };
}

export async function createGolemMarketAdapter({
  client=null,
  clientOptions={},
  scanTimeoutMs=5000,
}={}){
  let runtimeClient=client;
  const getClient=async()=>{
    if(!runtimeClient) runtimeClient=await createGolemSdkClient(clientOptions);
    return runtimeClient;
  };

  return {
    market:'golem',

    async discover({demand}={}){
      const runtime=await getClient();
      const order=buildGolemOrder(demand);
      const rows=await runtime.scan({order,timeoutMs:scanTimeoutMs});
      const offers=(rows||[]).map((row)=>offerFromScan(row,demand)).filter(Boolean);
      const body={
        schema:'evercraft.saban.golem-discovery.v1',
        market:'golem',
        offer_count:offers.length,
        payment_network:order.payment.network,
        live_yagna_client:true,
        observed_at:new Date().toISOString(),
      };
      return {offers,receipt:{...body,receipt_hash:sha(body)}};
    },

    async requestQuotes({demand,offer,authority}={}){
      if(authority?.allow_market_orders!==true){
        throw new Error('golem_market_order_authority_required');
      }
      const runtime=await getClient();
      const order=buildGolemOrder(demand,{providerId:offer.provider_id});
      const rows=await runtime.scan({order,timeoutMs:scanTimeoutMs});
      const matched=(rows||[]).find((row)=>
        proposalProvider(row).id===String(offer.provider_id)
      );
      if(!matched) throw new Error('golem_provider_quote_unavailable');
      const quoted=offerFromScan(matched,demand);
      quoted.offer_id=`golem-quote:${offer.provider_id}`;
      quoted.quote_required=false;
      quoted.economics.quoted=true;
      quoted.metadata={
        ...quoted.metadata,
        quote_scan:true,
      };
      const body={
        schema:'evercraft.saban.golem-quote-round.v1',
        demand_id:demand.demand_id,
        provider_id:offer.provider_id,
        ceiling_total_glm:quoted.economics.native_price.ceiling_total_glm,
        payment_network:order.payment.network,
        observed_at:new Date().toISOString(),
      };
      return {
        schema:body.schema,
        offers:[quoted],
        receipt:{...body,receipt_hash:sha(body)},
      };
    },

    async lease({demand,offer,authority}={}){
      if(authority?.allow_spend!==true){
        throw new Error('golem_spend_authority_required');
      }
      const order=buildGolemOrder(demand,{providerId:offer.provider_id});
      const ceilingGlm=estimateGolemCeilingGlm(demand,order);
      const approvedGlm=Number(authority.max_total_glm);
      if(!Number.isFinite(approvedGlm)||approvedGlm<0){
        throw new Error('golem_glm_spend_ceiling_required');
      }
      if(ceilingGlm>approvedGlm){
        throw new Error('golem_glm_spend_ceiling_exceeded');
      }

      const runtime=await getClient();
      const acquired=await runtime.rentOne({
        order,
        providerId:offer.provider_id,
      });
      const body={
        schema:'evercraft.saban.golem-lease.v1',
        market:'golem',
        demand_id:demand.demand_id,
        provider_id:offer.provider_id,
        payment_network:order.payment.network,
        maximum_cost_glm:ceilingGlm,
        approved_maximum_glm:approvedGlm,
        execution_ready:false,
        execution_hold:'registered_saban_worker_image_not_yet_wired',
        acquired_at:new Date().toISOString(),
      };
      const result={...body,receipt:sha(body)};
      Object.defineProperty(result,'runtime_authority',{
        value:Object.freeze({
          client:runtime,
          rental:acquired.rental,
        }),
        enumerable:false,
        writable:false,
      });
      return result;
    },

    async release({lease}={}){
      const runtime=lease?.runtime_authority?.client||runtimeClient;
      const rental=lease?.runtime_authority?.rental;
      if(!runtime||!rental) return null;
      return runtime.release({rental});
    },

    async close(){
      if(runtimeClient?.close) await runtimeClient.close();
      runtimeClient=null;
    },
  };
}
