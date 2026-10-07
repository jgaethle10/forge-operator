import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const LEVELS=new Map([
  ['discover',0],
  ['quote',1],
  ['lease',2],
]);

const n=(value,fallback=0)=>{
  const out=Number(value);
  return Number.isFinite(out)?out:fallback;
};

const uniq=(values)=>[...new Set((values||[]).map((v)=>String(v).trim()).filter(Boolean))];

export function normalizeComputeDemand(input={}){
  const negotiationLevel=String(input.negotiation_level||'discover').trim().toLowerCase();
  if(!LEVELS.has(negotiationLevel)) throw new Error('invalid_negotiation_level');

  const cpu=Math.max(0.001,n(input.cpu_units,1));
  const memory=Math.max(1,Math.floor(n(input.memory_mb,512)));
  const storage=Math.max(0,Math.floor(n(input.storage_gb,0)));
  const gpu=Math.max(0,Math.floor(n(input.gpu_count,0)));
  const duration=Math.max(60,Math.floor(n(input.duration_seconds,3600)));

  const body={
    schema:'evercraft.saban.compute-demand.v1',
    demand_id:String(input.demand_id||'').trim()||`demand-${Date.now()}`,
    workload_class:String(input.workload_class||'saban.multiplier-assignment.v1').trim(),
    container_image:input.container_image?String(input.container_image).trim():null,
    resources:{
      cpu_units:cpu,
      memory_mb:memory,
      storage_gb:storage,
      gpu_count:gpu,
      gpu_models:uniq(input.gpu_models).map((x)=>x.toLowerCase()),
    },
    placement:{
      regions:uniq(input.regions),
      countries:uniq(input.countries).map((x)=>x.toUpperCase()),
      require_public_ingress:input.require_public_ingress===true,
      require_persistent_storage:input.require_persistent_storage===true,
    },
    trust:{
      minimum_uptime_7d:Math.max(0,Math.min(1,n(input.minimum_uptime_7d,0))),
      audited_only:input.audited_only===true,
      valid_version_only:input.valid_version_only!==false,
    },
    economics:{
      prefer_zero_cost:input.prefer_zero_cost!==false,
      max_total_usd:input.max_total_usd==null?null:Math.max(0,n(input.max_total_usd)),
      max_hourly_usd:input.max_hourly_usd==null?null:Math.max(0,n(input.max_hourly_usd)),
      market_price_ceiling:input.market_price_ceiling&&typeof input.market_price_ceiling==='object'
        ? structuredClone(input.market_price_ceiling)
        : {},
    },
    duration_seconds:duration,
    negotiation_level:negotiationLevel,
    created_at:new Date().toISOString(),
  };

  return {...body,demand_hash:sha(body)};
}

export function normalizeComputeOffer(input={}){
  const body={
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:String(input.offer_id||'').trim(),
    provider_id:String(input.provider_id||'').trim(),
    market:String(input.market||'unknown').trim().toLowerCase(),
    access_class:String(input.access_class||'commercial_capacity').trim(),
    endpoint:input.endpoint?String(input.endpoint).trim():null,
    resources:{
      cpu_units:Math.max(0,n(input.resources?.cpu_units)),
      memory_mb:Math.max(0,n(input.resources?.memory_mb)),
      storage_gb:Math.max(0,n(input.resources?.storage_gb)),
      gpu_count:Math.max(0,n(input.resources?.gpu_count)),
      gpu_models:uniq(input.resources?.gpu_models).map((x)=>x.toLowerCase()),
    },
    placement:{
      region:input.placement?.region?String(input.placement.region):null,
      country:input.placement?.country?String(input.placement.country).toUpperCase():null,
      public_ingress:input.placement?.public_ingress===true,
      persistent_storage:input.placement?.persistent_storage===true,
    },
    trust:{
      uptime_7d:Math.max(0,Math.min(1,n(input.trust?.uptime_7d))),
      audited:input.trust?.audited===true,
      valid_version:input.trust?.valid_version===true,
      attested:input.trust?.attested===true,
    },
    economics:{
      zero_cost:input.economics?.zero_cost===true,
      quoted:input.economics?.quoted===true,
      hourly_usd:input.economics?.hourly_usd==null?null:Math.max(0,n(input.economics.hourly_usd)),
      total_usd:input.economics?.total_usd==null?null:Math.max(0,n(input.economics.total_usd)),
      native_price:input.economics?.native_price||null,
    },
    quote_required:input.quote_required===true,
    source_receipt:input.source_receipt||null,
    metadata:input.metadata&&typeof input.metadata==='object'?structuredClone(input.metadata):{},
    observed_at:input.observed_at||new Date().toISOString(),
  };
  if(!body.offer_id) throw new Error('offer_id_required');
  if(!body.provider_id) throw new Error('provider_id_required');
  return {...body,offer_hash:sha(body)};
}

export function evaluateComputeOffer(demandInput,offerInput){
  const demand=demandInput?.schema==='evercraft.saban.compute-demand.v1'
    ? demandInput
    : normalizeComputeDemand(demandInput);
  const offer=offerInput?.schema==='evercraft.saban.compute-offer.v1'
    ? offerInput
    : normalizeComputeOffer(offerInput);

  const reasons=[];
  const dr=demand.resources, or=offer.resources;
  if(or.cpu_units<dr.cpu_units) reasons.push('insufficient_cpu');
  if(or.memory_mb<dr.memory_mb) reasons.push('insufficient_memory');
  if(or.storage_gb<dr.storage_gb) reasons.push('insufficient_storage');
  if(or.gpu_count<dr.gpu_count) reasons.push('insufficient_gpu_count');
  if(dr.gpu_models.length && !dr.gpu_models.some((m)=>or.gpu_models.includes(m))){
    reasons.push('required_gpu_model_missing');
  }

  if(demand.placement.require_public_ingress&&!offer.placement.public_ingress){
    reasons.push('public_ingress_required');
  }
  if(demand.placement.require_persistent_storage&&!offer.placement.persistent_storage){
    reasons.push('persistent_storage_required');
  }
  if(demand.placement.countries.length&&
     !demand.placement.countries.includes(String(offer.placement.country||'').toUpperCase())){
    reasons.push('country_mismatch');
  }
  if(demand.placement.regions.length&&
     !demand.placement.regions.includes(String(offer.placement.region||''))){
    reasons.push('region_mismatch');
  }

  if(offer.trust.uptime_7d<demand.trust.minimum_uptime_7d) reasons.push('uptime_below_floor');
  if(demand.trust.audited_only&&!offer.trust.audited) reasons.push('audit_required');
  if(demand.trust.valid_version_only&&!offer.trust.valid_version) reasons.push('valid_version_required');

  const maxHourly=demand.economics.max_hourly_usd;
  const maxTotal=demand.economics.max_total_usd;
  if(maxHourly!=null&&offer.economics.hourly_usd!=null&&offer.economics.hourly_usd>maxHourly){
    reasons.push('hourly_budget_exceeded');
  }
  if(maxTotal!=null&&offer.economics.total_usd!=null&&offer.economics.total_usd>maxTotal){
    reasons.push('total_budget_exceeded');
  }

  let score=0;
  if(!reasons.length){
    if(demand.economics.prefer_zero_cost&&offer.economics.zero_cost) score+=1000;
    score+=Math.round(offer.trust.uptime_7d*200);
    if(offer.trust.attested) score+=80;
    if(offer.trust.audited) score+=50;
    if(offer.trust.valid_version) score+=30;
    score+=Math.min(100,Math.floor((or.cpu_units/Math.max(0.001,dr.cpu_units))*10));
    score+=Math.min(100,Math.floor((or.memory_mb/Math.max(1,dr.memory_mb))*5));
    if(offer.economics.hourly_usd!=null){
      score-=Math.min(500,Math.round(offer.economics.hourly_usd*100));
    }
  }

  return {eligible:reasons.length===0,reasons,score,demand,offer};
}

export function rankComputeOffers(demand,offers=[]){
  const evaluated=offers.map((offer)=>evaluateComputeOffer(demand,offer));
  const eligible=evaluated.filter((x)=>x.eligible).sort((a,b)=>
    b.score-a.score ||
    String(a.offer.offer_id).localeCompare(String(b.offer.offer_id))
  );
  return {
    eligible,
    rejected:evaluated.filter((x)=>!x.eligible),
  };
}

function authorityAllows(authority,demand,offer,kind){
  const internalZeroCostLease =
    kind==='lease' &&
    offer?.market==='evercraft-broker' &&
    offer?.economics?.zero_cost===true &&
    offer?.trust?.attested===true &&
    ['authorized_compute','voluntary_compute'].includes(String(offer?.access_class||''));

  if(internalZeroCostLease){
    return {ok:true,reason:'preauthorized_internal_capacity'};
  }

  if(!authority||typeof authority!=='object') return {ok:false,reason:`${kind}_authority_missing`};
  if(authority.schema!=='evercraft.saban.compute-authority.v1'){
    return {ok:false,reason:`${kind}_authority_schema_invalid`};
  }
  if(authority.approved!==true) return {ok:false,reason:`${kind}_authority_not_approved`};
  if(authority.demand_id!==demand.demand_id) return {ok:false,reason:`${kind}_authority_demand_mismatch`};
  const allowed=new Set(uniq(authority.allowed_markets).map((x)=>x.toLowerCase()));
  if(allowed.size&&!allowed.has(offer.market)) return {ok:false,reason:`${kind}_market_not_allowed`};
  if(authority.expires_at&&Date.parse(authority.expires_at)<=Date.now()){
    return {ok:false,reason:`${kind}_authority_expired`};
  }
  if(kind==='lease'){
    const ceiling=authority.max_total_usd==null?null:Math.max(0,n(authority.max_total_usd));
    if(ceiling!=null&&offer.economics.total_usd!=null&&offer.economics.total_usd>ceiling){
      return {ok:false,reason:'lease_authority_budget_exceeded'};
    }
  }
  return {ok:true,reason:'authorized'};
}

export async function negotiateCompute({
  demand:demandInput,
  adapters=[],
  quoteAuthority=null,
  leaseAuthority=null,
}={}){
  const demand=demandInput?.schema==='evercraft.saban.compute-demand.v1'
    ? structuredClone(demandInput)
    : normalizeComputeDemand(demandInput||{});
  const events=[];
  const discovered=[];

  for(const adapter of adapters){
    const market=String(adapter?.market||'unknown').toLowerCase();
    if(!adapter||typeof adapter.discover!=='function'){
      events.push({type:'market.rejected',market,reason:'discover_not_supported'});
      continue;
    }
    try{
      const result=await adapter.discover({demand});
      for(const raw of result?.offers||[]){
        discovered.push(normalizeComputeOffer({...raw,market:raw.market||market}));
      }
      events.push({
        type:'market.discovered',
        market,
        offer_count:Number(result?.offers?.length||0),
        receipt:result?.receipt||null,
      });
    }catch(error){
      events.push({type:'market.discovery_failed',market,reason:String(error?.message||error)});
    }
  }

  let ranking=rankComputeOffers(demand,discovered);
  let selected=ranking.eligible[0]?.offer||null;
  let quote=null;
  let lease=null;

  if(selected&&LEVELS.get(demand.negotiation_level)>=LEVELS.get('quote')&&selected.quote_required){
    const adapter=adapters.find((x)=>String(x?.market||'').toLowerCase()===selected.market);
    if(!adapter||typeof adapter.requestQuotes!=='function'){
      events.push({type:'quote.held',market:selected.market,reason:'quote_adapter_missing'});
    }else{
      const gate=authorityAllows(quoteAuthority,demand,selected,'quote');
      if(!gate.ok){
        events.push({type:'quote.held',market:selected.market,reason:gate.reason});
      }else{
        try{
          quote=await adapter.requestQuotes({demand,offer:selected,authority:quoteAuthority});
          events.push({
            type:'quote.received',
            market:selected.market,
            quote_count:Number(quote?.offers?.length||0),
            receipt:quote?.receipt||null,
          });
          const quoted=(quote?.offers||[]).map((raw)=>normalizeComputeOffer({...raw,market:raw.market||selected.market}));
          ranking=rankComputeOffers(demand,quoted);
          selected=ranking.eligible[0]?.offer||null;
        }catch(error){
          events.push({
            type:'quote.failed',
            market:selected.market,
            reason:String(error?.message||error),
          });
          selected=null;
        }
      }
    }
  }

  let leaseAttempted=false;
  if(
    selected &&
    selected.quote_required!==true &&
    LEVELS.get(demand.negotiation_level)>=LEVELS.get('lease')
  ){
    const adapter=adapters.find((x)=>String(x?.market||'').toLowerCase()===selected.market);
    if(!adapter||typeof adapter.lease!=='function'){
      events.push({type:'lease.held',market:selected.market,reason:'lease_adapter_missing'});
    }else{
      const gate=authorityAllows(leaseAuthority,demand,selected,'lease');
      if(!gate.ok){
        events.push({type:'lease.held',market:selected.market,reason:gate.reason});
      }else{
        leaseAttempted=true;
        try{
          lease=await adapter.lease({demand,offer:selected,authority:leaseAuthority,quote});
          events.push({type:'lease.granted',market:selected.market,receipt:lease?.receipt||null});
        }catch(error){
          events.push({
            type:'lease.failed',
            market:selected.market,
            reason:String(error?.message||error),
            outcome:'reconciliation_required',
          });
        }
      }
    }
  }else if(
    selected?.quote_required===true &&
    LEVELS.get(demand.negotiation_level)>=LEVELS.get('lease')
  ){
    events.push({
      type:'lease.held',
      market:selected.market,
      reason:'quote_required_before_lease',
    });
  }

  if(quote&&!lease&&!leaseAttempted){
    const quotedMarket=String(
      selected?.market ||
      quote?.offers?.[0]?.market ||
      ''
    ).toLowerCase();
    const adapter=adapters.find((x)=>String(x?.market||'').toLowerCase()===quotedMarket);
    if(adapter&&typeof adapter.cancelQuote==='function'){
      try{
        const cleanup=await adapter.cancelQuote({demand,quote});
        events.push({
          type:'quote.cleaned_up',
          market:quotedMarket,
          receipt:cleanup?.receipt_hash||cleanup?.receipt||null,
        });
      }catch(error){
        events.push({
          type:'quote.cleanup_failed',
          market:quotedMarket,
          reason:String(error?.message||error),
        });
      }
    }
  }

  const body={
    schema:'evercraft.saban.compute-negotiation.v1',
    demand,
    discovered_offer_count:discovered.length,
    eligible_offer_count:ranking.eligible.length,
    rejected_offer_count:ranking.rejected.length,
    selected_offer:selected,
    quote:quote?{
      schema:quote.schema||null,
      receipt:quote.receipt||null,
      offer_count:Number(quote.offers?.length||0),
    }:null,
    lease:lease||null,
    manual_reconciliation_required:leaseAttempted&&!lease,
    events,
    completed_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
