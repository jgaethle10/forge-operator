import { createAkashMarketAdapter } from './markets/akash.mjs';
import { createEvercraftBrokerMarketAdapter } from './markets/evercraft-broker.mjs';
import { createEvercraftVoluntaryMarketAdapter } from './markets/evercraft-voluntary.mjs';
import { createGolemMarketAdapter } from './markets/golem.mjs';

export async function buildSabanComputeMarketStack({
  yard=null,
  brokerDeploymentId='',
  voluntaryEndpoint='',
  voluntaryControlHeaders=null,
  includeAkash=true,
  akash={},
  includeGolem=false,
  golem={},
}={}){
  const adapters=[];
  const inventory=[];

  if(yard&&brokerDeploymentId){
    const adapter=createEvercraftBrokerMarketAdapter({
      yard,
      brokerDeploymentId,
    });
    adapter.routing_priority=10;
    adapters.push(adapter);
    inventory.push({
      market:'evercraft-broker',
      class:'owned_or_authorized',
      priority:10,
      execution_capable:true,
      configured:true,
    });
  }

  if(voluntaryEndpoint){
    const adapter=createEvercraftVoluntaryMarketAdapter({
      endpoint:voluntaryEndpoint,
      controlHeaders:voluntaryControlHeaders,
    });
    adapter.routing_priority=20;
    adapters.push(adapter);
    inventory.push({
      market:'evercraft-voluntary',
      class:'voluntary',
      priority:20,
      execution_capable:true,
      configured:true,
    });
  }

  if(includeGolem){
    const adapter=await createGolemMarketAdapter(golem);
    adapter.routing_priority=30;
    adapters.push(adapter);
    inventory.push({
      market:'golem',
      class:'decentralized',
      priority:30,
      execution_capable:true,
      portable_workloads_only:true,
      configured:true,
    });
  }

  if(includeAkash){
    const adapter=createAkashMarketAdapter(akash);
    adapter.routing_priority=40;
    adapters.push(adapter);
    inventory.push({
      market:'akash',
      class:'commercial_or_decentralized',
      priority:40,
      execution_capable:true,
      configured:true,
      execution_requires_market_credentials:true,
    });
  }

  return {
    schema:'evercraft.saban.compute-market-stack.v1',
    adapters,
    inventory,
    doctrine:{
      order:[
        'evercraft-broker',
        'evercraft-voluntary',
        'golem',
        'akash',
      ],
      lower_priority_number_preferred:true,
      eligibility_and_budget_still_required:true,
      external_execution_requires_explicit_offer_or_market_terms:true,
      visibility_is_not_authorization:true,
    },
  };
}
