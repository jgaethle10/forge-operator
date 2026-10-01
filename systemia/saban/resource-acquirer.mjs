import { createHash } from 'node:crypto';
import { planResourceField, normalizeResourceNeed } from './resource-field.mjs';
import { negotiateCompute, normalizeComputeDemand } from './compute-exchange.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function runtimeAuthorityFor(candidateId, authorities={}){
  if(authorities instanceof Map) return authorities.get(candidateId)||null;
  return authorities?.[candidateId]||null;
}

function adapterFor(candidate, adapters={}){
  if(adapters instanceof Map){
    return adapters.get(candidate.candidate_id)||
      adapters.get(candidate.source_kind)||
      null;
  }
  return adapters?.[candidate.candidate_id]||
    adapters?.[candidate.source_kind]||
    null;
}

function executionLease({
  candidate,
  authority,
  source='resource_field',
  receipt=null,
}={}){
  const endpoint=String(
    authority?.capacity_endpoint||
    authority?.endpoint||
    candidate?.metadata?.capacity_endpoint||
    ''
  ).trim();
  const allocatorToken=String(
    authority?.allocator_token||
    authority?.runtime_authority?.allocator_token||
    ''
  );
  if(!endpoint||!allocatorToken) return null;

  const body={
    schema:'evercraft.saban.resource-lease.v1',
    candidate_id:candidate.candidate_id,
    source,
    source_kind:candidate.source_kind,
    capacity_endpoint:endpoint,
    execution_ready:true,
    acquired_at:new Date().toISOString(),
    source_receipt:receipt||null,
  };
  const lease={...body,receipt_hash:sha(body)};
  Object.defineProperty(lease,'runtime_authority',{
    value:Object.freeze({allocator_token:allocatorToken}),
    enumerable:false,
    writable:false,
  });
  return lease;
}

export function resourceNeedToComputeDemand(needInput={},overrides={}){
  const need=normalizeResourceNeed(needInput);
  return normalizeComputeDemand({
    demand_id:overrides.demand_id||need.need_id,
    workload_class:overrides.workload_class||need.workload_class,
    container_image:overrides.container_image||null,
    cpu_units:overrides.cpu_units??need.resources.cpu_units,
    memory_mb:overrides.memory_mb??need.resources.memory_mb,
    storage_gb:overrides.storage_gb??need.resources.storage_gb,
    gpu_count:overrides.gpu_count??need.resources.gpu_units,
    gpu_models:overrides.gpu_models||need.resources.gpu_models||[],
    regions:overrides.regions||[],
    countries:overrides.countries||[],
    require_public_ingress:overrides.require_public_ingress===true,
    require_persistent_storage:overrides.require_persistent_storage===true,
    minimum_uptime_7d:overrides.minimum_uptime_7d||0,
    audited_only:overrides.audited_only===true,
    valid_version_only:overrides.valid_version_only!==false,
    prefer_zero_cost:overrides.prefer_zero_cost!==false,
    max_total_usd:overrides.max_total_usd??null,
    max_hourly_usd:overrides.max_hourly_usd??need.max_hourly_usd,
    market_price_ceiling:overrides.market_price_ceiling||{},
    duration_seconds:overrides.duration_seconds||3600,
    negotiation_level:overrides.negotiation_level||'lease',
  });
}

async function activateSelected({
  plan,
  candidates,
  runtimeAuthorities,
  spawnAdapters,
  need,
  events,
}){
  const byId=new Map(candidates.map((candidate)=>[
    String(candidate.candidate_id||''),
    candidate,
  ]));
  const leases=[];

  for(const candidateId of plan.selected_candidates||[]){
    const candidate=byId.get(candidateId);
    if(!candidate){
      events.push({type:'resource.candidate_missing',candidate_id:candidateId});
      return null;
    }

    if(candidate.connected===true&&candidate.attested===true){
      const lease=executionLease({
        candidate,
        authority:runtimeAuthorityFor(candidateId,runtimeAuthorities),
        source:'resource_field_ready',
      });
      if(!lease){
        events.push({
          type:'resource.runtime_authority_missing',
          candidate_id:candidateId,
        });
        return null;
      }
      leases.push(lease);
      events.push({
        type:'resource.ready_capacity_claimed',
        candidate_id:candidateId,
        capacity_endpoint:lease.capacity_endpoint,
      });
      continue;
    }

    const adapter=adapterFor(candidate,spawnAdapters);
    if(!adapter||typeof adapter.activate!=='function'){
      events.push({
        type:'resource.spawn_adapter_missing',
        candidate_id:candidateId,
        source_kind:candidate.source_kind,
      });
      return null;
    }

    try{
      const activated=await adapter.activate({
        need,
        candidate:structuredClone(candidate),
        assimilation:plan.assimilation?.find((row)=>row.candidate_id===candidateId)||null,
      });
      if(activated?.execution_ready!==true){
        events.push({
          type:'resource.spawn_not_execution_ready',
          candidate_id:candidateId,
        });
        return null;
      }
      const lease=executionLease({
        candidate,
        authority:{
          capacity_endpoint:activated.capacity_endpoint,
          allocator_token:activated.runtime_authority?.allocator_token,
        },
        source:'resource_field_spawn',
        receipt:activated.receipt||activated.receipt_hash||null,
      });
      if(!lease){
        events.push({
          type:'resource.spawn_authority_invalid',
          candidate_id:candidateId,
        });
        return null;
      }
      leases.push(lease);
      events.push({
        type:'resource.spawn_activated',
        candidate_id:candidateId,
        capacity_endpoint:lease.capacity_endpoint,
      });
    }catch(error){
      events.push({
        type:'resource.spawn_failed',
        candidate_id:candidateId,
        reason:String(error?.message||error),
      });
      return null;
    }
  }

  return leases;
}

export async function acquireResourceCapacity({
  need:needInput,
  candidates=[],
  runtimeAuthorities={},
  spawnAdapters={},
  marketAdapters=[],
  quoteAuthority=null,
  leaseAuthority=null,
  computeDemand=null,
  computeDemandOverrides={},
}={}){
  const need=normalizeResourceNeed(needInput||{});
  const plan=planResourceField({need,candidates});
  const events=[{
    type:'resource.field_planned',
    state:plan.state,
    selected_candidates:plan.selected_candidates,
    receipt_hash:plan.receipt_hash,
  }];

  if(plan.state==='ready'||plan.state==='spawn_required'){
    const leases=await activateSelected({
      plan,
      candidates,
      runtimeAuthorities,
      spawnAdapters,
      need,
      events,
    });
    if(leases?.length){
      const body={
        schema:'evercraft.saban.resource-acquisition.v1',
        state:'ready',
        mode:'resource_field',
        need_id:need.need_id,
        resource_field_receipt:plan.receipt_hash,
        lease_count:leases.length,
        leases:leases.map((lease)=>({
          candidate_id:lease.candidate_id,
          source:lease.source,
          source_kind:lease.source_kind,
          capacity_endpoint:lease.capacity_endpoint,
          execution_ready:lease.execution_ready,
          receipt_hash:lease.receipt_hash,
        })),
        exchange:null,
        events,
        completed_at:new Date().toISOString(),
      };
      return {
        ...body,
        execution_leases:leases,
        receipt_hash:sha(body),
      };
    }
    events.push({
      type:'resource.field_execution_unavailable',
      outcome:'continue_to_compute_exchange',
    });
  }else{
    events.push({
      type:'resource.scarcity',
      outcome:'continue_to_compute_exchange',
      scarcity_signal:plan.scarcity_signal,
    });
  }

  const demand=computeDemand?.schema==='evercraft.saban.compute-demand.v1'
    ? structuredClone(computeDemand)
    : resourceNeedToComputeDemand(need,computeDemandOverrides);

  const exchange=await negotiateCompute({
    demand,
    adapters:marketAdapters,
    quoteAuthority,
    leaseAuthority,
  });
  events.push(...(exchange.events||[]).map((event)=>({
    ...event,
    source:'compute_exchange',
  })));

  const marketLease=exchange.lease;
  if(
    marketLease?.execution_ready===true&&
    marketLease.capacity_endpoint&&
    marketLease.runtime_authority?.allocator_token
  ){
    const candidate={
      candidate_id:String(
        exchange.selected_offer?.provider_id||
        exchange.selected_offer?.offer_id||
        'compute-exchange'
      ),
      source_kind:'provider_instance',
      metadata:{capacity_endpoint:marketLease.capacity_endpoint},
    };
    const lease=executionLease({
      candidate,
      authority:{
        capacity_endpoint:marketLease.capacity_endpoint,
        allocator_token:marketLease.runtime_authority.allocator_token,
      },
      source:'compute_exchange',
      receipt:marketLease.receipt||null,
    });
    const body={
      schema:'evercraft.saban.resource-acquisition.v1',
      state:'ready',
      mode:'compute_exchange',
      need_id:need.need_id,
      resource_field_receipt:plan.receipt_hash,
      lease_count:1,
      leases:[{
        candidate_id:lease.candidate_id,
        source:lease.source,
        source_kind:lease.source_kind,
        capacity_endpoint:lease.capacity_endpoint,
        execution_ready:true,
        receipt_hash:lease.receipt_hash,
      }],
      exchange:{
        demand_hash:demand.demand_hash,
        negotiation_receipt:exchange.receipt_hash,
        market:exchange.selected_offer?.market||null,
        provider_id:exchange.selected_offer?.provider_id||null,
      },
      events,
      completed_at:new Date().toISOString(),
    };
    return {
      ...body,
      execution_leases:[lease],
      exchange,
      receipt_hash:sha(body),
    };
  }

  if(marketLease?.execution_ready===true){
    const selectedMarket=String(
      exchange.selected_offer?.market||
      marketLease.market||
      ''
    ).toLowerCase();
    const selectedAdapter=marketAdapters.find((adapter)=>
      String(adapter?.market||'').toLowerCase()===selectedMarket
    );
    if(selectedAdapter&&typeof selectedAdapter.execute==='function'){
      const body={
        schema:'evercraft.saban.resource-acquisition.v1',
        state:'ready',
        mode:'compute_exchange_adapter',
        execution_kind:'negotiated_adapter',
        need_id:need.need_id,
        resource_field_receipt:plan.receipt_hash,
        lease_count:0,
        leases:[],
        exchange:{
          demand_hash:demand.demand_hash,
          negotiation_receipt:exchange.receipt_hash,
          market:selectedMarket||null,
          provider_id:exchange.selected_offer?.provider_id||marketLease.provider_id||null,
          lease_receipt:marketLease.receipt||null,
        },
        events,
        completed_at:new Date().toISOString(),
      };
      const result={
        ...body,
        execution_leases:[],
        exchange,
        receipt_hash:sha(body),
      };
      Object.defineProperty(result,'adapter_execution',{
        value:Object.freeze({
          adapter:selectedAdapter,
          lease:marketLease,
        }),
        enumerable:false,
        writable:false,
      });
      return result;
    }
  }

  const body={
    schema:'evercraft.saban.resource-acquisition.v1',
    state:'held',
    mode:'unresolved',
    need_id:need.need_id,
    resource_field_receipt:plan.receipt_hash,
    lease_count:0,
    leases:[],
    exchange:{
      demand_hash:demand.demand_hash,
      negotiation_receipt:exchange.receipt_hash,
      selected_market:exchange.selected_offer?.market||null,
      selected_provider:exchange.selected_offer?.provider_id||null,
      manual_reconciliation_required:exchange.manual_reconciliation_required===true,
    },
    engineering_required:true,
    next_action:exchange.manual_reconciliation_required===true
      ? 'reconcile_uncertain_external_lease_before_retry'
      : 'expand_resource_discovery_or_create_capacity_adapter',
    events,
    completed_at:new Date().toISOString(),
  };
  return {
    ...body,
    execution_leases:[],
    exchange,
    receipt_hash:sha(body),
  };
}
