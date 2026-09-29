import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

export function buildGolemOrderFromDemand(demand,{
  imageTag,
  paymentNetwork='polygon',
  subnetTag=null,
  maxStartPrice=0,
  maxCpuPerHourPrice=null,
  maxEnvPerHourPrice=null,
}={}){
  if(!demand||demand.schema!=='evercraft.saban.compute-demand.v1'){
    throw new Error('normalized_compute_demand_required');
  }
  const image=String(imageTag||demand.container_image||'').trim();
  if(!image) throw new Error('golem_image_tag_required');

  const hours=Math.max(1/60,Number(demand.duration_seconds||3600)/3600);
  const total=demand.economics.max_total_usd;
  const hourly=demand.economics.max_hourly_usd;
  const cpuCeiling=maxCpuPerHourPrice??hourly??(
    total==null?null:Number(total)/hours
  );
  if(cpuCeiling==null||!Number.isFinite(Number(cpuCeiling))){
    throw new Error('golem_price_ceiling_required');
  }

  const order={
    demand:{
      workload:{
        imageTag:image,
        minCpuCores:Math.max(1,Math.ceil(Number(demand.resources.cpu_units||1))),
        minMemGib:Math.max(0.125,Number(demand.resources.memory_mb||512)/1024),
        minStorageGib:Math.max(0.001,Number(demand.resources.storage_gb||0.001)),
      },
      ...(subnetTag?{subnetTag:String(subnetTag)}:{}),
    },
    market:{
      rentHours:hours,
      pricing:{
        model:'linear',
        maxStartPrice:Math.max(0,Number(maxStartPrice||0)),
        maxCpuPerHourPrice:Math.max(0,Number(cpuCeiling)),
        maxEnvPerHourPrice:Math.max(
          0,
          Number(maxEnvPerHourPrice??cpuCeiling)
        ),
      },
    },
    payment:{network:String(paymentNetwork)},
  };

  const body={
    schema:'evercraft.saban.golem-order.v1',
    demand_id:demand.demand_id,
    order,
    generated_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export function createGolemNegotiationSession({
  client,
  market='golem',
}={}){
  if(!client||typeof client.openDemand!=='function'){
    throw new Error('golem_client_required');
  }

  return {
    market,
    async open({demand}={}){
      return client.openDemand({demand});
    },
    async counter({demand,proposal,counter}={}){
      if(typeof client.counterProposal!=='function'){
        throw new Error('golem_counterproposal_not_supported');
      }
      return client.counterProposal({demand,proposal,counter});
    },
    async agree({demand,proposal,authority}={}){
      if(typeof client.proposeAgreement!=='function'){
        throw new Error('golem_agreement_not_supported');
      }
      return client.proposeAgreement({demand,proposal,authority});
    },
    async close({demand,proposal,reason}={}){
      if(typeof client.closeDemand==='function'){
        return client.closeDemand({demand,proposal,reason});
      }
      return null;
    },
  };
}
