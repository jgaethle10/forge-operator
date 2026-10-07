import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { normalizeResourceNeed, planResourceField } from './resource-field.mjs';
import { discoverResourceFieldCandidates } from './resource-discovery.mjs';
import { buildLocalHostCandidate, createLocalHostSpawnAdapter } from './local-host-capacity.mjs';
import { buildComputeMarketAdapters } from './market-factory.mjs';
import { resourceNeedToComputeDemand } from './resource-acquirer.mjs';
import { normalizeComputeDemand, rankComputeOffers } from './compute-exchange.mjs';
import { advanceLocalHostLifecycle } from './local-host-lifecycle.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

function safeOffer(offer){
  return {
    offer_id:offer?.offer_id||null,
    provider_id:offer?.provider_id||null,
    market:offer?.market||null,
    access_class:offer?.access_class||null,
    resources:offer?.resources||null,
    placement:offer?.placement||null,
    trust:offer?.trust||null,
    economics:offer?.economics||null,
    quote_required:offer?.quote_required===true,
  };
}

async function discoverMarketOffers(adapters=[]){
  const offers=[];
  const diagnostics=[];
  for(const adapter of adapters||[]){
    const market=String(adapter?.market||'unknown');
    if(!adapter||typeof adapter.discover!=='function') continue;
    try{
      const result=await adapter.discover();
      const rows=Array.isArray(result?.offers)?result.offers:[];
      offers.push(...rows);
      diagnostics.push({
        market,
        state:'ready',
        offer_count:rows.length,
        receipt_hash:result?.receipt?.receipt_hash||null,
      });
    }catch(error){
      diagnostics.push({
        market,
        state:'unavailable',
        reason:String(error?.message||error),
        offer_count:0,
      });
    }
  }
  return {offers,diagnostics};
}

export async function evaluateResourceExpansionIntent({
  intent,
  acquisition={},
  poolOptions={},
  discoveryProvider=discoverResourceFieldCandidates,
  localCandidateProvider=buildLocalHostCandidate,
  localSpawnAdapterFactory=createLocalHostSpawnAdapter,
  marketFactory=buildComputeMarketAdapters,
  now=new Date(),
}={}){
  if(intent?.schema!=='evercraft.saban.resource-field-expansion-intent.v1'){
    throw new Error('resource_field_expansion_intent_required');
  }
  const need=normalizeResourceNeed(intent.need);
  const discovery=await discoveryProvider({
    need,
    discovery:poolOptions.discoveryOptions||{},
    allocatorToken:poolOptions.allocatorToken||'',
    allocatorTokens:poolOptions.allocatorTokens||{},
    timeoutMs:poolOptions.timeoutMs||1500,
  }).catch(error=>({
    schema:'evercraft.saban.resource-discovery.v1',
    candidates:[],
    rejected:[{reason:String(error?.message||error)}],
    runtime_authorities:new Map(),
    discovered_count:0,
    yard_eligible_count:0,
    attested_authorized_count:0,
    resolution_receipt:null,
  }));

  const localCandidate=localCandidateProvider({acquisition});
  const candidates=[
    ...(discovery.candidates||[]),
    ...(localCandidate?[localCandidate]:[]),
  ];
  let plan=planResourceField({need,candidates});
  const events=[{
    type:'resource_expansion.planned',
    state:plan.state,
    receipt_hash:plan.receipt_hash,
  }];

  if(plan.state==='ready'){
    const body={
      schema:'evercraft.saban.resource-expansion-evaluation.v1',
      intent_id:intent.intent_id,
      state:'ready_internal',
      execution_ready:true,
      selected_candidates:plan.selected_candidates,
      live_discovery:{
        discovered_count:discovery.discovered_count,
        attested_authorized_count:discovery.attested_authorized_count,
        rejected_count:(discovery.rejected||[]).length,
        receipt_hash:discovery.resolution_receipt||null,
      },
      local_host_candidate_added:Boolean(localCandidate),
      market_visibility:null,
      engineering_required:false,
      paid_execution_authorized:false,
      events,
      evaluated_at:(now instanceof Date?now:new Date(now)).toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  const selectedLocal=Boolean(
    localCandidate &&
    plan.selected_candidates?.includes(localCandidate.candidate_id)
  );
  if(plan.state==='spawn_required'&&selectedLocal){
    try{
      const adapter=localSpawnAdapterFactory({acquisition});
      const activated=await adapter.activate({
        need,
        candidate:localCandidate,
        assimilation:plan.assimilation?.find(row=>
          row.candidate_id===localCandidate.candidate_id
        )||null,
      });
      if(activated?.execution_ready===true&&activated?.capacity_endpoint){
        events.push({
          type:'resource_expansion.owned_host_spawned',
          candidate_id:localCandidate.candidate_id,
          capacity_endpoint:activated.capacity_endpoint,
        });
        const body={
          schema:'evercraft.saban.resource-expansion-evaluation.v1',
          intent_id:intent.intent_id,
          state:'owned_spawn_activated',
          execution_ready:true,
          selected_candidates:[localCandidate.candidate_id],
          live_discovery:{
            discovered_count:discovery.discovered_count,
            attested_authorized_count:discovery.attested_authorized_count,
            rejected_count:(discovery.rejected||[]).length,
            receipt_hash:discovery.resolution_receipt||null,
          },
          local_host_candidate_added:true,
          spawned_capacity_endpoint:String(activated.capacity_endpoint),
          allocator_authority_serialized:false,
          market_visibility:null,
          engineering_required:false,
          paid_execution_authorized:false,
          events,
          evaluated_at:(now instanceof Date?now:new Date(now)).toISOString(),
        };
        return {...body,receipt_hash:sha(body)};
      }
      events.push({type:'resource_expansion.owned_spawn_not_ready'});
    }catch(error){
      events.push({
        type:'resource_expansion.owned_spawn_failed',
        reason:String(error?.message||error),
      });
    }
  }

  const marketStack=await marketFactory({acquisition});
  const marketDiscovery=await discoverMarketOffers(marketStack.adapters);
  const zeroDemand=resourceNeedToComputeDemand(need,{
    negotiation_level:'discover',
    max_hourly_usd:0,
    prefer_zero_cost:true,
  });
  const zeroRanking=rankComputeOffers(zeroDemand,marketDiscovery.offers);
  const zeroOffers=zeroRanking.eligible
    .map(row=>row.offer)
    .filter(offer=>offer?.economics?.zero_cost===true);

  const broadDemand=normalizeComputeDemand({
    demand_id:need.need_id+':market-visibility',
    workload_class:need.workload_class,
    cpu_units:need.resources.cpu_units,
    memory_mb:need.resources.memory_mb,
    storage_gb:need.resources.storage_gb,
    gpu_count:need.resources.gpu_units,
    gpu_models:need.resources.gpu_models,
    negotiation_level:'discover',
    prefer_zero_cost:true,
    max_hourly_usd:null,
  });
  const broadRanking=rankComputeOffers(broadDemand,marketDiscovery.offers);
  const paidOffers=broadRanking.eligible
    .map(row=>row.offer)
    .filter(offer=>offer?.economics?.zero_cost!==true);

  let state='engineering_required';
  let engineeringRequired=true;
  if(zeroOffers.length){
    state='zero_cost_market_visible';
    engineeringRequired=false;
  }else if(paidOffers.length){
    state='paid_capacity_visible_authority_required';
    engineeringRequired=false;
  }

  const body={
    schema:'evercraft.saban.resource-expansion-evaluation.v1',
    intent_id:intent.intent_id,
    state,
    execution_ready:false,
    selected_candidates:[],
    live_discovery:{
      discovered_count:discovery.discovered_count,
      attested_authorized_count:discovery.attested_authorized_count,
      rejected_count:(discovery.rejected||[]).length,
      receipt_hash:discovery.resolution_receipt||null,
    },
    local_host_candidate_added:Boolean(localCandidate),
    market_visibility:{
      markets:marketStack.markets||[],
      diagnostics:[
        ...(marketStack.diagnostics||[]),
        ...(marketDiscovery.diagnostics||[]),
      ],
      zero_cost_eligible_count:zeroOffers.length,
      paid_eligible_count:paidOffers.length,
      top_zero_cost_offers:zeroOffers.slice(0,5).map(safeOffer),
      top_paid_offers:paidOffers.slice(0,5).map(safeOffer),
      discover_only:true,
    },
    engineering_required:engineeringRequired,
    next_action:
      state==='zero_cost_market_visible'
        ? 'negotiate_zero_cost_capacity_under_existing_authority'
        : state==='paid_capacity_visible_authority_required'
          ? 'request_demand_scoped_spend_authority_or_find_zero_cost_capacity'
          : 'expand_discovery_or_engineer_new_capacity_adapter',
    paid_execution_authorized:false,
    market_order_created:false,
    paid_lease_created:false,
    events,
    evaluated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export async function runResourceExpansionCycle({
  queue,
  acquisition={},
  poolOptions={},
  maxIntents=16,
  ...deps
}={}){
  if(queue?.schema!=='evercraft.saban.resource-field-expansion-queue.v1'){
    throw new Error('resource_field_expansion_queue_required');
  }
  const intents=[...(queue.intents||[])]
    .sort((a,b)=>
      Number(a.source!=='current_pressure')-Number(b.source!=='current_pressure') ||
      String(a.intent_id).localeCompare(String(b.intent_id))
    )
    .slice(0,Math.max(1,Math.floor(Number(maxIntents||16))));
  const evaluations=[];
  for(const intent of intents){
    evaluations.push(await evaluateResourceExpansionIntent({
      intent,
      acquisition,
      poolOptions,
      ...deps,
    }));
  }
  const body={
    schema:'evercraft.saban.resource-expansion-cycle.v1',
    considered:intents.length,
    ready_internal:evaluations.filter(x=>x.state==='ready_internal').length,
    owned_spawn_activated:evaluations.filter(x=>x.state==='owned_spawn_activated').length,
    zero_cost_market_visible:evaluations.filter(x=>x.state==='zero_cost_market_visible').length,
    paid_capacity_visible_authority_required:evaluations.filter(
      x=>x.state==='paid_capacity_visible_authority_required'
    ).length,
    engineering_required:evaluations.filter(x=>x.state==='engineering_required').length,
    evaluations,
    paid_execution_authorized:false,
    market_order_created:false,
    paid_lease_created:false,
    generated_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

function cliArg(name,fallback=null){
  const index=process.argv.indexOf(name);
  return index>=0&&process.argv[index+1]?process.argv[index+1]:fallback;
}
function cliHas(name){return process.argv.includes(name);}

async function runResidentExpansionOnce({root}={}){
  const queueFile=path.join(root,'resource-field-expansion-intents.json');
  const lifecycleFile=path.join(root,'local-host-lifecycle.json');
  const acquisition={
    auto_discover_markets:true,
    public_market_discovery:
      String(process.env.SABAN_PUBLIC_MARKET_DISCOVERY||'').toLowerCase()==='true',
    allow_local_host_bootstrap:
      String(process.env.EVERCRAFT_OWNED_HOST||'').toLowerCase()==='true',
    allow_local_host_auto_retire:
      String(process.env.SABAN_LOCAL_HOST_AUTO_RETIRE||'').toLowerCase()==='true',
    local_node_root:String(process.env.EVERCRAFT_LOCAL_NODE_ROOT||'').trim()||undefined,
    local_node_id:String(process.env.EVERCRAFT_LOCAL_NODE_ID||'').trim()||undefined,
  };
  const retireAfterCycles=Math.max(
    1,
    Math.floor(Number(process.env.SABAN_LOCAL_HOST_IDLE_RETIRE_CYCLES||15))
  );

  const finalize=async(cycle)=>{
    const previousLifecycle=fs.existsSync(lifecycleFile)
      ? JSON.parse(fs.readFileSync(lifecycleFile,'utf8'))
      : null;
    const lifecycle=await advanceLocalHostLifecycle({
      cycle,
      acquisition,
      previous:previousLifecycle,
      retireAfterCycles,
      now:new Date(),
    });
    atomicJson(lifecycleFile,lifecycle);

    const {receipt_hash:_previousReceipt,...cycleBody}=cycle;
    const body={
      ...cycleBody,
      local_host_lifecycle:{
        state:lifecycle.state,
        live:lifecycle.live,
        demand_present:lifecycle.demand_present,
        idle_cycles:lifecycle.idle_cycles,
        retire_after_cycles:lifecycle.retire_after_cycles,
        auto_retire_authorized:lifecycle.auto_retire_authorized,
        observed_idle:lifecycle.observed_idle,
        active_lease_count:lifecycle.active_lease_count??null,
        inflight_assignment_count:lifecycle.inflight_assignment_count??null,
        resident_service_count:lifecycle.resident_service_count??null,
        reclamation_executed:lifecycle.reclamation_executed===true,
        physical_host_shutdown:false,
        receipt_hash:lifecycle.receipt_hash,
      },
    };
    const receipt={...body,receipt_hash:sha(body)};
    atomicJson(path.join(root,'resource-field-expansion-state.json'),receipt);
    return receipt;
  };

  if(!fs.existsSync(queueFile)){
    const idle={
      schema:'evercraft.saban.resource-expansion-cycle.v1',
      state:'waiting_for_capacity_organism_queue',
      considered:0,
      ready_internal:0,
      owned_spawn_activated:0,
      zero_cost_market_visible:0,
      paid_capacity_visible_authority_required:0,
      engineering_required:0,
      evaluations:[],
      paid_execution_authorized:false,
      market_order_created:false,
      paid_lease_created:false,
      generated_at:new Date().toISOString(),
    };
    return finalize({...idle,receipt_hash:sha(idle)});
  }

  const queue=JSON.parse(fs.readFileSync(queueFile,'utf8'));
  const cycle=await runResourceExpansionCycle({
    queue,
    acquisition,
    poolOptions:{
      allocatorToken:String(process.env.EVERCRAFT_ALLOCATOR_TOKEN||''),
    },
  });
  return finalize(cycle);
}

async function main(){
  const root=path.resolve(
    process.env.SABAN_AMBIENT_STATE_DIR||
    path.join(os.homedir(),'.local/state/evercraft/saban-ambient')
  );
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const once=cliHas('--once');
  const intervalMs=Math.max(
    30_000,
    Number(
      cliArg(
        '--interval-ms',
        process.env.SABAN_RESOURCE_EXPANSION_INTERVAL_MS||120000
      )
    )
  );

  const emit=async()=>{
    const cycle=await runResidentExpansionOnce({root});
    process.stdout.write(JSON.stringify({
      schema:'evercraft.saban.resource-expansion-cycle-summary.v1',
      state:cycle.state||'evaluated',
      considered:cycle.considered,
      ready_internal:cycle.ready_internal,
      owned_spawn_activated:cycle.owned_spawn_activated,
      zero_cost_market_visible:cycle.zero_cost_market_visible,
      paid_capacity_visible_authority_required:
        cycle.paid_capacity_visible_authority_required,
      engineering_required:cycle.engineering_required,
      local_host_lifecycle_state:cycle.local_host_lifecycle?.state||null,
      local_host_auto_retire_authorized:cycle.local_host_lifecycle?.auto_retire_authorized===true,
      local_host_reclamation_executed:cycle.local_host_lifecycle?.reclamation_executed===true,
      paid_execution_authorized:false,
      receipt_hash:cycle.receipt_hash,
    })+'\n');
  };

  await emit();
  if(once) return;

  const timer=setInterval(()=>emit().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.resource-expansion-cycle-error.v1',
      error:String(error?.message||error),
      paid_execution_authorized:false,
      observed_at:new Date().toISOString(),
    })+'\n');
  }),intervalMs);

  const close=()=>{
    clearInterval(timer);
    process.exit(0);
  };
  process.on('SIGINT',close);
  process.on('SIGTERM',close);
  await new Promise(()=>{});
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.resource-expansion-error.v1',
      error:String(error?.message||error),
      paid_execution_authorized:false,
    })+'\n');
    process.exitCode=1;
  });
}
