import { createHash } from 'node:crypto';

const STATS_URL='https://api2.stats.golem.network/v2/network/online';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function property(provider,key){
  return provider?.runtimes?.vm?.properties?.[key];
}

function statsOffer(provider){
  const nodeId=String(provider?.node_id||'').trim();
  if(!nodeId||provider?.online!==true||!provider?.runtimes?.vm) return null;
  const cpu=Number(property(provider,'golem.inf.cpu.threads')||0);
  const memoryGib=Number(property(provider,'golem.inf.mem.gib')||0);
  const storageGib=Number(property(provider,'golem.inf.storage.gib')||0);
  const hourly=provider.runtimes.vm.hourly_price_glm;
  const polygon=property(
    provider,
    'golem.com.payment.platform.erc20-polygon-glm.address'
  );
  return {
    offer_id:'golem-stats:'+nodeId,
    provider_id:nodeId,
    market:'golem',
    access_class:'commercial_capacity',
    endpoint:null,
    resources:{
      cpu_units:cpu,
      memory_mb:memoryGib*1024,
      storage_gb:storageGib,
      gpu_count:0,
      gpu_models:[],
    },
    placement:{
      region:null,
      country:null,
      public_ingress:false,
      persistent_storage:false,
    },
    trust:{
      uptime_7d:Math.max(0,Math.min(1,Number(provider?.uptime||0)/100)),
      audited:false,
      valid_version:true,
      attested:false,
    },
    economics:{
      zero_cost:false,
      quoted:false,
      hourly_usd:null,
      total_usd:null,
      native_price:hourly==null?null:{
        denom:'GLM',
        amount:Number(hourly),
        unit:'hour',
      },
    },
    quote_required:false,
    metadata:{
      provider_name:String(property(provider,'golem.node.id.name')||''),
      yagna_version:String(provider?.version||''),
      network:String(provider?.network||''),
      computing_now:provider?.computing_now===true,
      reputation_blacklisted:provider?.reputation?.blacklisted===true,
      polygon_payment_ready:Boolean(polygon),
      cpu_brand:String(property(provider,'golem.inf.cpu.brand')||''),
      live_stats_source:STATS_URL,
    },
  };
}

function pricingFromDemand(demand,authority){
  const ceilings=demand?.economics?.market_price_ceiling||{};
  const start=Number(
    ceilings.golem_start_glm ??
    authority?.golem_max_start_price_glm ??
    0
  );
  const cpu=Number(
    ceilings.golem_cpu_hour_glm ??
    authority?.golem_max_cpu_hour_glm ??
    0
  );
  const env=Number(
    ceilings.golem_env_hour_glm ??
    authority?.golem_max_env_hour_glm ??
    0
  );
  if(!(start>0)||!(cpu>0)||!(env>0)){
    throw new Error('golem_native_price_ceilings_required');
  }
  return {
    model:'linear',
    maxStartPrice:start,
    maxCpuPerHourPrice:cpu,
    maxEnvPerHourPrice:env,
  };
}

function imageSpec(demand){
  const image=String(demand?.container_image||'').trim();
  if(!image) throw new Error('golem_container_image_required');
  if(image.startsWith('http://')||image.startsWith('https://')||image.startsWith('file://')){
    return {imageUrl:image};
  }
  return {imageTag:image};
}

function marketOrder(demand,offer,authority){
  const network=String(authority?.golem_network||'hoodi').toLowerCase();
  if(network==='polygon'&&authority?.allow_mainnet!==true){
    throw new Error('golem_mainnet_authority_required');
  }
  const providerNetwork=String(offer?.metadata?.network||'').toLowerCase();
  if(network==='polygon'){
    if(providerNetwork&&providerNetwork!=='mainnet'){
      throw new Error('golem_provider_network_mismatch');
    }
    if(offer?.metadata?.polygon_payment_ready!==true){
      throw new Error('golem_provider_polygon_payment_unavailable');
    }
  }else if(providerNetwork==='mainnet'){
    throw new Error('golem_provider_network_mismatch');
  }
  const providerId=String(offer?.provider_id||'');
  return {
    demand:{
      workload:imageSpec(demand),
    },
    market:{
      rentHours:Math.max(1/60,Number(demand.duration_seconds||3600)/3600),
      pricing:pricingFromDemand(demand,authority),
      offerProposalFilter:(proposal)=>{
        const id=String(
          proposal?.provider?.id||
          proposal?.provider?.walletAddress||
          proposal?.provider?.wallet_address||
          ''
        );
        return !providerId||id===providerId;
      },
    },
    payment:{
      network,
    },
  };
}

export function createGolemMarketAdapter({
  statsUrl=STATS_URL,
  appKey=process.env.YAGNA_APPKEY||'',
  sdkLoader=()=>import('@golem-sdk/golem-js'),
  networkFactory=null,
  fetchImpl=fetch,
  statsNetworks=['mainnet'],
  timeoutMs=20_000,
}={}){
  return {
    market:'golem',

    async discover({demand}={}){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      let response;
      try{
        response=await fetchImpl(statsUrl,{
          signal:controller.signal,
          headers:{
            accept:'application/json',
            'user-agent':'Evercraft-Saban-Compute-Exchange/1.0',
          },
        });
      }finally{
        clearTimeout(timer);
      }
      if(!response.ok) throw new Error('golem_stats_http_'+response.status);
      const providers=await response.json();
      if(!Array.isArray(providers)) throw new Error('golem_stats_shape_invalid');

      const allowedNetworks=new Set(
        (statsNetworks||[]).map((value)=>String(value).trim().toLowerCase()).filter(Boolean)
      );
      const offers=providers
        .filter((p)=>
          !allowedNetworks.size ||
          allowedNetworks.has(String(p?.network||'').toLowerCase())
        )
        .filter((p)=>p?.reputation?.blacklisted!==true)
        .map(statsOffer)
        .filter(Boolean);

      const body={
        schema:'evercraft.saban.market-discovery.v1',
        market:'golem',
        source:statsUrl,
        provider_records_seen:providers.length,
        normalized_offer_count:offers.length,
        public_discovery:true,
        yagna_required_for_lease:true,
        observed_at:new Date().toISOString(),
      };
      return {offers,receipt:{...body,receipt_hash:sha(body)}};
    },

    async lease({demand,offer,authority}={}){
      if(authority?.allow_spend!==true){
        throw new Error('golem_spend_authority_required');
      }
      if(!appKey) throw new Error('golem_yagna_app_key_required');
      const order=marketOrder(demand,offer,authority);
      const sdk=networkFactory?null:await sdkLoader();
      const GolemNetwork=sdk?.GolemNetwork;
      const glm=networkFactory
        ? await networkFactory({appKey,authority})
        : new GolemNetwork({
            api:{key:appKey},
          });

      await glm.connect();
      let rental=null;
      try{
        rental=await glm.oneOf({order});
      }catch(error){
        try{ await glm.disconnect(); }catch{}
        throw error;
      }

      const providerId=String(
        rental?.agreement?.provider?.id||
        rental?.provider?.id||
        offer?.provider_id||
        ''
      );
      const body={
        schema:'evercraft.saban.golem-lease.v1',
        demand_id:demand.demand_id,
        market:'golem',
        provider_id:providerId,
        network:String(authority?.golem_network||'hoodi').toLowerCase(),
        selected_from_live_stats_provider:String(offer?.provider_id||''),
        native_price_ceilings:pricingFromDemand(demand,authority),
        execution_ready:true,
        created_at:new Date().toISOString(),
      };
      const result={
        ...body,
        receipt:sha(body),
      };
      Object.defineProperty(result,'runtime_authority',{
        value:Object.freeze({
          glm,
          rental,
        }),
        enumerable:false,
        writable:false,
      });
      return result;
    },

    async release({lease}={}){
      const runtime=lease?.runtime_authority;
      if(!runtime?.rental||!runtime?.glm) return null;
      try{
        await runtime.rental.stopAndFinalize();
      }finally{
        await runtime.glm.disconnect();
      }
      const body={
        schema:'evercraft.saban.golem-release.v1',
        provider_id:lease.provider_id,
        demand_id:lease.demand_id,
        released_at:new Date().toISOString(),
      };
      return {...body,receipt_hash:sha(body)};
    },
  };
}

export { statsOffer as normalizeGolemStatsProvider, marketOrder as buildGolemMarketOrder };
