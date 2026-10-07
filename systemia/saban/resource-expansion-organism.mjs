import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { normalizeResourceNeed, planResourceField } from './resource-field.mjs';
import { discoverResourceFieldCandidates } from './resource-discovery.mjs';
import { buildLocalHostCandidate, createLocalHostSpawnAdapter, closeLocalHostCapacity } from './local-host-capacity.mjs';
import { executeCapacityReclamation } from './capacity-reclamation-executor.mjs';
import { buildComputeMarketAdapters } from './market-factory.mjs';
import { resourceNeedToComputeDemand } from './resource-acquirer.mjs';
import { normalizeComputeDemand, rankComputeOffers } from './compute-exchange.mjs';

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
          managed_capacity:{
            schema:'evercraft.saban.managed-capacity.v1',
            resource_id:'owned-spawn:'+String(localCandidate.candidate_id),
            offer_id:'nodeseed:'+String(localCandidate.candidate_id),
            provider_id:String(localCandidate.candidate_id),
            candidate_id:String(localCandidate.candidate_id),
            kind:'owned_spawn',
            state:'active',
            zero_cost:true,
            lifecycle_reclaimable:true,
            release_adapter:'local_owned_host',
            authority_basis:'explicit_evercraft_owned_host_configuration',
            workload_classes:[String(need.workload_class)],
            started_at:String(
              activated.started_at||
              (now instanceof Date?now:new Date(now)).toISOString()
            ),
            last_required_at:(now instanceof Date?now:new Date(now)).toISOString(),
            source_receipt:activated.receipt||null,
          },
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
  previousManagedCapacity=[],
  now=new Date(),
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
      now,
      ...deps,
    }));
  }
  const generatedAt=(now instanceof Date?now:new Date(now)).toISOString();
  const managedById=new Map();
  for(const row of previousManagedCapacity||[]){
    if(row?.schema!=='evercraft.saban.managed-capacity.v1'||!row.resource_id) continue;
    managedById.set(String(row.resource_id),{
      schema:'evercraft.saban.managed-capacity.v1',
      resource_id:String(row.resource_id),
      offer_id:String(row.offer_id||''),
      provider_id:String(row.provider_id||''),
      candidate_id:String(row.candidate_id||''),
      kind:String(row.kind||'unknown'),
      state:String(row.state||'unknown'),
      zero_cost:row.zero_cost===true,
      lifecycle_reclaimable:row.lifecycle_reclaimable===true,
      release_adapter:String(row.release_adapter||''),
      authority_basis:String(row.authority_basis||''),
      workload_classes:Array.isArray(row.workload_classes)
        ? [...new Set(row.workload_classes.map(String))].sort()
        : [],
      started_at:row.started_at?String(row.started_at):null,
      last_required_at:row.last_required_at?String(row.last_required_at):null,
      source_receipt:row.source_receipt?String(row.source_receipt):null,
      idle_since:row.idle_since?String(row.idle_since):null,
    });
  }
  const requiredResourceIds=new Set();
  for(const evaluation of evaluations){
    const managed=evaluation?.managed_capacity;
    if(managed?.resource_id){
      const resourceId=String(managed.resource_id);
      const prior=managedById.get(resourceId)||{};
      managedById.set(resourceId,{
        ...prior,
        ...managed,
        state:'active',
        idle_since:null,
        last_required_at:generatedAt,
      });
      requiredResourceIds.add(resourceId);
    }
    for(const candidateId of evaluation?.selected_candidates||[]){
      for(const [resourceId,row] of managedById){
        if(String(row.candidate_id||'')!==String(candidateId||'')) continue;
        managedById.set(resourceId,{
          ...row,
          state:'active',
          idle_since:null,
          last_required_at:generatedAt,
        });
        requiredResourceIds.add(resourceId);
      }
    }
  }
  for(const [resourceId,row] of managedById){
    if(requiredResourceIds.has(resourceId)) continue;
    managedById.set(resourceId,{
      ...row,
      state:'idle',
      idle_since:row.idle_since||generatedAt,
    });
  }
  const managedCapacity=[...managedById.values()]
    .sort((a,b)=>String(a.resource_id).localeCompare(String(b.resource_id)));

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
    managed_capacity:managedCapacity,
    managed_capacity_count:managedCapacity.length,
    paid_execution_authorized:false,
    market_order_created:false,
    paid_lease_created:false,
    generated_at:generatedAt,
  };
  return {...body,receipt_hash:sha(body)};
}

function cliArg(name,fallback=null){
  const index=process.argv.indexOf(name);
  return index>=0&&process.argv[index+1]?process.argv[index+1]:fallback;
}
function cliHas(name){return process.argv.includes(name);}

function provenSpawnedOwnedRows(rows=[]){
  return (rows||[]).filter(row=>
    row?.schema==='evercraft.saban.managed-capacity.v1' &&
    row.kind==='owned_spawn' &&
    row.zero_cost===true &&
    row.lifecycle_reclaimable===true &&
    row.release_adapter==='local_owned_host' &&
    row.authority_basis==='explicit_evercraft_owned_host_configuration' &&
    String(row.offer_id||'').startsWith('nodeseed:')
  );
}

function ownedReclamationAuthority({
  managedCapacity=[],
  acquisition={},
  expansionQueue=null,
  now=new Date(),
}={}){
  if(acquisition.allow_local_host_bootstrap!==true) return null;
  if((expansionQueue?.intents||[]).length>0) return null;
  const offerIds=provenSpawnedOwnedRows(managedCapacity)
    .map(row=>String(row.offer_id))
    .sort();
  if(!offerIds.length) return null;
  const nowDate=now instanceof Date?now:new Date(now);
  return {
    schema:'evercraft.saban.capacity-reclamation-authority.v1',
    authority_id:'resource-expansion-owned-lifecycle:'+
      sha(offerIds).replace('sha256:','').slice(0,20),
    approved:true,
    allowed_actions:['stop_spawned_owned_capacity'],
    allowed_offer_ids:offerIds,
    expires_at:new Date(nowDate.getTime()+5*60*1000).toISOString(),
  };
}

function priorCompletedOfferIds(previousReclamation,managedCapacity=[]){
  const completed=new Set(
    previousReclamation?.schema==='evercraft.saban.capacity-reclamation-run.v1'
      ? (previousReclamation.completed_offer_ids||[]).map(String)
      : []
  );
  const priorRunMs=Date.parse(String(previousReclamation?.executed_at||''))||0;
  for(const row of managedCapacity||[]){
    const started=Date.parse(String(row?.started_at||''))||0;
    if(started>priorRunMs) completed.delete(String(row.offer_id||''));
  }
  return [...completed].sort();
}

export async function runResidentExpansionOnce({
  root,
  env=process.env,
  closeOwnedSpawn=null,
}={}){
  const stateFile=path.join(root,'resource-field-expansion-state.json');
  const previousState=fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile,'utf8'))
    : null;
  const queueFile=path.join(root,'resource-field-expansion-intents.json');
  const queue=fs.existsSync(queueFile)
    ? JSON.parse(fs.readFileSync(queueFile,'utf8'))
    : {
        schema:'evercraft.saban.resource-field-expansion-queue.v1',
        intents:[],
      };
  const lifecycleFile=path.join(root,'capacity-lifecycle-ledger.json');
  const lifecycleLedger=fs.existsSync(lifecycleFile)
    ? JSON.parse(fs.readFileSync(lifecycleFile,'utf8'))
    : {
        schema:'evercraft.saban.capacity-lifecycle-ledger.v1',
        entries:[],
        receipt_hash:null,
      };
  const reclamationFile=path.join(root,'capacity-reclamation-state.json');
  const previousReclamation=fs.existsSync(reclamationFile)
    ? JSON.parse(fs.readFileSync(reclamationFile,'utf8'))
    : null;
  const acquisition={
    auto_discover_markets:true,
    public_market_discovery:
      String(env.SABAN_PUBLIC_MARKET_DISCOVERY||'').toLowerCase()==='true',
    allow_local_host_bootstrap:
      String(env.EVERCRAFT_OWNED_HOST||'').toLowerCase()==='true',
    local_node_root:String(env.EVERCRAFT_LOCAL_NODE_ROOT||'').trim()||undefined,
    local_node_id:String(env.EVERCRAFT_LOCAL_NODE_ID||'').trim()||undefined,
  };
  const managedCapacity=previousState?.managed_capacity||[];
  const authority=ownedReclamationAuthority({
    managedCapacity,
    acquisition,
    expansionQueue:queue,
    now:new Date(),
  });
  const bindings={};
  for(const row of provenSpawnedOwnedRows(managedCapacity)){
    bindings[String(row.offer_id)]={
      spawned_owned:true,
      stop:async()=>{
        const closed=closeOwnedSpawn
          ? await closeOwnedSpawn(row)
          : await closeLocalHostCapacity({acquisition,env});
        if(closed!==true&&closed?.closed!==true){
          throw new Error('owned_spawn_close_not_confirmed');
        }
        return {
          receipt:sha({
            resource_id:row.resource_id,
            offer_id:row.offer_id,
            action:'stop_spawned_owned_capacity',
            closed:true,
          }),
        };
      },
    };
  }
  const reclamation=await executeCapacityReclamation({
    lifecycleLedger,
    authority,
    bindings,
    completedOfferIds:priorCompletedOfferIds(previousReclamation,managedCapacity),
    now:new Date(),
  });
  const retiredOfferIds=new Set(
    (reclamation.results||[])
      .filter(row=>
        row.action==='stop_spawned_owned_capacity' &&
        row.state==='completed'
      )
      .map(row=>String(row.offer_id))
  );
  const previousManaged=managedCapacity
    .filter(row=>!retiredOfferIds.has(String(row.offer_id||'')));

  const cycleBase=await runResourceExpansionCycle({
    queue,
    acquisition,
    previousManagedCapacity:previousManaged,
    poolOptions:{
      allocatorToken:String(process.env.EVERCRAFT_ALLOCATOR_TOKEN||''),
    },
  });
  const {receipt_hash:_cycleHash,...cycleWithoutHash}=cycleBase;
  const body={
    ...cycleWithoutHash,
    state:(queue.intents||[]).length
      ? 'evaluated'
      : 'waiting_for_capacity_organism_queue',
    reclamation:{
      considered:reclamation.considered,
      completed_count:reclamation.completed_count,
      held_count:reclamation.held_count,
      uncertain_count:reclamation.uncertain_count,
      reconciliation_required:reclamation.reconciliation_required,
      authority_issued:authority?.approved===true,
      authority_scope:authority
        ? {
            actions:[...authority.allowed_actions],
            offer_ids:[...authority.allowed_offer_ids],
          }
        : null,
      blocked_by_expansion_pressure:(queue.intents||[]).length>0,
      paid_release_binding_present:false,
      receipt_hash:reclamation.receipt_hash,
    },
  };
  const cycle={...body,receipt_hash:sha(body)};
  atomicJson(stateFile,cycle);
  atomicJson(reclamationFile,reclamation);
  return cycle;
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
