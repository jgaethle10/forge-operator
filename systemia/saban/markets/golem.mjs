import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createGolemSdkClient } from '../golem-requestor/client.mjs';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
} from '../multiplier.mjs';

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

function portableIdentity(demand){
  return String(demand?.execution?.portable_worker_id||'').trim();
}

function portableSoftware(demand){
  return String(demand?.execution?.software_id||'').trim();
}

function resolvePortableWorker(software,expectedWorkerId){
  const registry=loadMultiplicationRegistry(
    path.resolve(process.cwd(),'systemia/saban/multiplication-registry.json')
  );
  const contract=resolveMultiplicationContract(software,registry);
  const golem=contract?.portable_execution?.golem;
  if(golem?.enabled!==true) throw new Error('golem_software_not_portable');
  if(String(golem.worker_id||'')!==String(expectedWorkerId||'')){
    throw new Error('golem_portable_worker_identity_mismatch');
  }
  const portableRoot=path.resolve(
    process.cwd(),
    'systemia/saban/portable-workers'
  );
  const workerPath=path.resolve(process.cwd(),String(golem.worker_file||''));
  const relative=path.relative(portableRoot,workerPath);
  if(relative.startsWith('..')||path.isAbsolute(relative)){
    throw new Error('golem_portable_worker_path_outside_registry_root');
  }
  if(!fs.existsSync(workerPath)||!fs.statSync(workerPath).isFile()){
    throw new Error('golem_portable_worker_file_missing');
  }
  if(golem.arbitrary_shell!==false){
    throw new Error('golem_portable_worker_arbitrary_shell_must_be_false');
  }
  return {
    contract,
    worker_id:String(golem.worker_id),
    worker_version:String(golem.worker_version||''),
    worker_path:workerPath,
    image_tag:String(golem.image_tag||''),
    network_access:golem.network_access===true,
    arbitrary_shell:false,
  };
}

function portableContractForDemand(demand){
  const workerId=portableIdentity(demand);
  const software=portableSoftware(demand);
  if(!workerId||!software) return null;
  const portable=resolvePortableWorker(software,workerId);
  if(
    demand.execution?.portable_worker_version &&
    String(demand.execution.portable_worker_version)!==portable.worker_version
  ){
    throw new Error('golem_portable_worker_version_mismatch');
  }
  if(String(demand.container_image||'')!==portable.image_tag){
    throw new Error('golem_portable_image_mismatch');
  }
  return {
    ...portable,
    software_id:software,
  };
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
      const portable=portableContractForDemand(demand);
      if(!portable){
        const body={
          schema:'evercraft.saban.golem-discovery.v1',
          market:'golem',
          offer_count:0,
          portable_worker_required:true,
          live_yagna_client:false,
          observed_at:new Date().toISOString(),
        };
        return {offers:[],receipt:{...body,receipt_hash:sha(body)}};
      }
      const runtime=await getClient();
      const order=buildGolemOrder(demand);
      const rows=await runtime.scan({order,timeoutMs:scanTimeoutMs});
      const offers=(rows||[]).map((row)=>offerFromScan(row,demand)).filter(Boolean);
      const body={
        schema:'evercraft.saban.golem-discovery.v1',
        market:'golem',
        offer_count:offers.length,
        payment_network:order.payment.network,
        portable_software_id:portable.software_id,
        portable_worker_id:portable.worker_id,
        live_yagna_client:true,
        observed_at:new Date().toISOString(),
      };
      return {offers,receipt:{...body,receipt_hash:sha(body)}};
    },

    async requestQuotes({demand,offer,authority}={}){
      const portable=portableContractForDemand(demand);
      if(!portable) throw new Error('golem_portable_worker_required');
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
      const portable=portableContractForDemand(demand);
      if(!portable) throw new Error('golem_portable_worker_required');
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
        portable_software_id:portable.software_id,
        portable_worker_id:portable.worker_id,
        portable_worker_version:portable.worker_version,
        portable_image_tag:portable.image_tag,
        execution_ready:true,
        execution_fabric:'evercraft.golem-portable-worker.v1',
        max_concurrency:1,
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

    async execute({
      lease,
      workload_class,
      input,
      idempotency_key=null,
      checkpoint=null,
    }={}){
      if(lease?.execution_ready!==true) throw new Error('golem_lease_not_execution_ready');
      if(workload_class!=='saban.multiplier-assignment.v1'){
        throw new Error('golem_workload_class_not_supported');
      }
      const software=String(input?.software||'');
      const assignment=input?.assignment;
      if(!software||!assignment) throw new Error('golem_registered_assignment_required');
      if(software!==String(lease.portable_software_id||'')){
        throw new Error('golem_lease_software_mismatch');
      }
      const portable=resolvePortableWorker(software,lease.portable_worker_id);
      if(portable.image_tag!==String(lease.portable_image_tag||'')){
        throw new Error('golem_lease_image_mismatch');
      }
      const runtime=lease.runtime_authority?.client||runtimeClient;
      const rental=lease.runtime_authority?.rental;
      if(!runtime||!rental) throw new Error('golem_runtime_authority_missing');
      const receipt=await runtime.executePortableWorker({
        rental,
        localWorkerPath:portable.worker_path,
        payload:{
          schema:'evercraft.saban.portable-assignment.v1',
          portable_worker_id:portable.worker_id,
          portable_worker_version:portable.worker_version,
          software,
          assignment,
          idempotency_key:idempotency_key||assignment.idempotency_key||null,
          checkpoint:checkpoint||null,
        },
      });
      if(receipt.portable_worker_id!==portable.worker_id){
        throw new Error('golem_portable_receipt_worker_mismatch');
      }
      if(receipt.software_id!==software){
        throw new Error('golem_portable_receipt_software_mismatch');
      }
      return {
        schema:'evercraft.saban.golem-portable-execution.v1',
        provider_id:lease.provider_id,
        portable_worker_id:portable.worker_id,
        result:receipt,
        checkpoint:receipt.checkpoint||null,
        result_receipt:receipt.receipt_hash,
      };
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
