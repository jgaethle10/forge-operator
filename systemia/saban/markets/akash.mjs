import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const bytesToMb=(value)=>Number(value||0)/(1024*1024);
const bytesToGb=(value)=>Number(value||0)/(1024*1024*1024);
const cpuMilliToUnits=(value)=>Number(value||0)/1000;

function safeImage(value){
  const image=String(value||'').trim();
  if(!image) throw new Error('akash_container_image_required');
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,255}$/.test(image)){
    throw new Error('akash_container_image_invalid');
  }
  return image;
}

function requestHeaders(apiKey=''){
  return {
    'content-type':'application/json',
    'accept':'application/json',
    ...(apiKey?{'x-api-key':apiKey}:{}),
  };
}

async function requestJson(url,options={},timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      ...options,
      signal:controller.signal,
      headers:{
        ...requestHeaders(),
        ...(options.headers||{}),
      },
    });
    const body=await response.json().catch(()=>null);
    if(!response.ok){
      throw new Error(`akash_http_${response.status}:${body?.message||body?.error||'request_failed'}`);
    }
    return body;
  }finally{
    clearTimeout(timer);
  }
}

function providerArray(payload){
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload?.data)) return payload.data;
  if(Array.isArray(payload?.data?.providers)) return payload.data.providers;
  return [];
}

function bidArray(payload){
  if(Array.isArray(payload?.data)) return payload.data;
  if(Array.isArray(payload?.data?.bids)) return payload.data.bids;
  if(Array.isArray(payload?.bids)) return payload.bids;
  return [];
}

function gpuModels(provider){
  return [
    ...(provider?.gpuModels||[]).map((x)=>x?.model),
    ...(provider?.hardwareGpuModels||[]),
  ].map((x)=>String(x||'').trim().toLowerCase()).filter(Boolean);
}

function offerFromProvider(provider){
  const stats=provider?.stats||{};
  const storage=stats?.storage||{};
  const owner=String(provider?.owner||'').trim();
  if(!owner) return null;
  return {
    offer_id:`akash-provider:${owner}`,
    provider_id:owner,
    market:'akash',
    access_class:'commercial_capacity',
    endpoint:provider?.hostUri||null,
    resources:{
      cpu_units:cpuMilliToUnits(stats?.cpu?.available),
      memory_mb:bytesToMb(stats?.memory?.available),
      storage_gb:bytesToGb(storage?.ephemeral?.available),
      gpu_count:Number(stats?.gpu?.available||0),
      gpu_models:gpuModels(provider),
    },
    placement:{
      region:provider?.ipRegionCode||provider?.ipRegion||null,
      country:provider?.ipCountryCode||provider?.ipCountry||provider?.country||null,
      public_ingress:Boolean(provider?.featEndpointIp||provider?.featEndpointCustomDomain),
      persistent_storage:provider?.featPersistentStorage===true,
    },
    trust:{
      uptime_7d:Number(provider?.uptime7d||0),
      audited:provider?.isAudited===true,
      valid_version:provider?.isValidVersion===true,
      attested:false,
    },
    economics:{
      zero_cost:false,
      quoted:false,
      hourly_usd:null,
      total_usd:null,
      native_price:null,
    },
    quote_required:true,
    metadata:{
      provider_name:provider?.name||null,
      host_uri:provider?.hostUri||null,
      cpu_arch:provider?.hardwareCpuArch||null,
      cpu_model:provider?.hardwareCpu||null,
      network_provider:provider?.networkProvider||null,
      network_speed_down:provider?.networkSpeedDown||null,
      network_speed_up:provider?.networkSpeedUp||null,
      last_check_date:provider?.lastCheckDate||null,
    },
  };
}

function yamlString(value){
  return JSON.stringify(String(value));
}

export function buildAkashSDL(demand,{
  maximumUactPerBlock=100000,
  serviceName='saban',
}={}){
  const image=safeImage(demand?.container_image);
  const r=demand.resources||{};
  const gpuCount=Math.max(0,Math.floor(Number(r.gpu_count||0)));
  const storage=Math.max(0.005,Number(r.storage_gb||0.5));
  const expose=demand?.placement?.require_public_ingress===true
    ? `    expose:\n      - port: 8080\n        as: 80\n        proto: tcp\n        to:\n          - global: true\n`
    : `    expose:\n      - port: 8080\n        to:\n          - global: true\n`;
  const gpu=gpuCount>0
    ? `        gpu:\n          units: ${gpuCount}\n`
    : '';

  return `version: "2.0"
services:
  ${serviceName}:
    image: ${yamlString(image)}
${expose}
profiles:
  compute:
    ${serviceName}:
      resources:
        cpu:
          units: ${Number(r.cpu_units||1)}
        memory:
          size: ${Math.ceil(Number(r.memory_mb||512))}Mi
        storage:
          - size: ${storage}Gi
${gpu}  placement:
    dcloud:
      pricing:
        ${serviceName}:
          denom: uact
          amount: ${Math.max(1,Math.floor(Number(maximumUactPerBlock||100000)))}
deployment:
  ${serviceName}:
    dcloud:
      profile: ${serviceName}
      count: 1
`;
}

export function uactPerBlockToUsdHour(amount){
  const micro=Number(amount);
  if(!Number.isFinite(micro)||micro<0) return null;
  return Number((((micro/1_000_000)*600)).toFixed(9));
}

function normalizeBid(bid,demand,manifest){
  const id=bid?.bid?.id||bid?.id||{};
  const price=bid?.bid?.price||bid?.price||{};
  const provider=String(id.provider||bid?.provider||'').trim();
  if(!provider) return null;
  const denom=String(price.denom||'').trim().toLowerCase();
  const amount=Number(price.amount);
  const hourly=denom==='uact'?uactPerBlockToUsdHour(amount):null;
  const total=hourly==null?null:hourly*(Number(demand.duration_seconds||3600)/3600);

  return {
    offer_id:`akash-bid:${id.dseq||''}:${id.gseq||''}:${id.oseq||''}:${provider}`,
    provider_id:provider,
    market:'akash',
    access_class:'commercial_capacity',
    endpoint:null,
    resources:structuredClone(demand.resources),
    placement:{
      region:null,
      country:null,
      public_ingress:demand.placement.require_public_ingress===true,
      persistent_storage:demand.placement.require_persistent_storage===true,
    },
    trust:{
      uptime_7d:0,
      audited:false,
      valid_version:true,
      attested:false,
    },
    economics:{
      zero_cost:false,
      quoted:true,
      hourly_usd:hourly,
      total_usd:total,
      native_price:{
        denom,
        amount:String(price.amount??''),
        unit:'per_block',
      },
    },
    quote_required:false,
    metadata:{
      market_bid:{
        dseq:String(id.dseq||''),
        gseq:Number(id.gseq||0),
        oseq:Number(id.oseq||0),
        provider,
        bseq:id.bseq==null?null:Number(id.bseq),
      },
      manifest,
      bid_state:bid?.bid?.state||bid?.state||null,
      resources_offer:bid?.bid?.resources_offer||bid?.resources_offer||null,
    },
  };
}

export function createAkashMarketAdapter({
  apiKey=process.env.AKASH_API_KEY||'',
  baseUrl='https://console-api.akash.network',
  pollIntervalMs=3000,
  quoteTimeoutMs=45000,
}={}){
  const base=String(baseUrl).replace(/\/$/,'');
  return {
    market:'akash',

    async discover(){
      const payload=await requestJson(`${base}/v1/providers`,{},15000);
      const providers=providerArray(payload);
      const offers=providers
        .filter((p)=>p?.isOnline===true)
        .map(offerFromProvider)
        .filter(Boolean);
      const body={
        schema:'evercraft.saban.market-discovery.v1',
        market:'akash',
        provider_count:providers.length,
        online_offer_count:offers.length,
        source:`${base}/v1/providers`,
        authentication_required:false,
        observed_at:new Date().toISOString(),
      };
      return {offers,receipt:{...body,receipt_hash:sha(body)}};
    },

    async requestQuotes({demand,authority}={}){
      if(!apiKey) throw new Error('akash_api_key_required_for_market_order');
      if(authority?.allow_market_orders!==true){
        throw new Error('akash_market_order_authority_required');
      }
      const ceiling=Number(
        demand?.economics?.market_price_ceiling?.akash_uact_per_block||
        authority?.akash_uact_per_block_ceiling||
        0
      );
      if(!Number.isFinite(ceiling)||ceiling<=0){
        throw new Error('akash_uact_per_block_ceiling_required');
      }

      const sdl=buildAkashSDL(demand,{maximumUactPerBlock:ceiling});
      const created=await requestJson(`${base}/v1/deployments`,{
        method:'POST',
        headers:requestHeaders(apiKey),
        body:JSON.stringify({
          data:{
            sdl,
            runtimeLimitHours:Math.max(1,Math.ceil(Number(demand.duration_seconds||3600)/3600)),
          },
        }),
      },20000);
      const createdData=created?.data||created;
      const dseq=String(createdData?.dseq||createdData?.deployment?.id?.dseq||'');
      const manifest=String(createdData?.manifest||'');
      if(!dseq||!manifest) throw new Error('akash_deployment_order_response_invalid');

      const deadline=Date.now()+Math.max(5000,quoteTimeoutMs);
      let bids=[];
      while(Date.now()<deadline){
        const payload=await requestJson(
          `${base}/v1/bids?dseq=${encodeURIComponent(dseq)}`,
          {headers:requestHeaders(apiKey)},
          15000
        );
        bids=bidArray(payload);
        if(bids.length) break;
        await new Promise((resolve)=>setTimeout(resolve,Math.max(1000,pollIntervalMs)));
      }

      const offers=bids.map((bid)=>normalizeBid(bid,demand,manifest)).filter(Boolean);
      const body={
        schema:'evercraft.saban.akash-quote-round.v1',
        demand_id:demand.demand_id,
        dseq,
        bid_count:offers.length,
        market_order_created:true,
        lease_created:false,
        observed_at:new Date().toISOString(),
      };
      return {
        schema:body.schema,
        order_id:dseq,
        manifest,
        offers,
        receipt:{...body,receipt_hash:sha(body)},
      };
    },

    async lease({demand,offer,authority,quote}={}){
      if(!apiKey) throw new Error('akash_api_key_required_for_lease');
      if(authority?.allow_spend!==true) throw new Error('akash_spend_authority_required');
      const bid=offer?.metadata?.market_bid;
      const manifest=offer?.metadata?.manifest||quote?.manifest;
      if(!bid?.dseq||!bid?.provider||!manifest) throw new Error('akash_bid_context_missing');
      if(offer?.economics?.total_usd==null){
        throw new Error('akash_bid_usd_cost_unresolved');
      }
      const ceiling=authority.max_total_usd==null?null:Number(authority.max_total_usd);
      if(ceiling==null||!Number.isFinite(ceiling)){
        throw new Error('akash_spend_ceiling_required');
      }
      if(Number(offer.economics.total_usd)>ceiling){
        throw new Error('akash_spend_ceiling_exceeded');
      }

      const payload=await requestJson(`${base}/v1/leases`,{
        method:'POST',
        headers:requestHeaders(apiKey),
        body:JSON.stringify({
          manifest,
          leases:[{
            dseq:String(bid.dseq),
            gseq:Number(bid.gseq),
            oseq:Number(bid.oseq),
            provider:String(bid.provider),
          }],
        }),
      },30000);
      const body={
        schema:'evercraft.saban.akash-lease-receipt.v1',
        demand_id:demand.demand_id,
        dseq:String(bid.dseq),
        provider:String(bid.provider),
        estimated_total_usd:Number(offer.economics.total_usd),
        approved_ceiling_usd:ceiling,
        lease_created:true,
        created_at:new Date().toISOString(),
      };
      return {
        ...body,
        provider_response:payload?.data||payload,
        receipt:sha(body),
      };
    },

    async cancelQuote({quote}={}){
      if(!apiKey||!quote?.order_id) return null;
      const payload=await requestJson(
        `${base}/v1/deployments/${encodeURIComponent(String(quote.order_id))}`,
        {
          method:'DELETE',
          headers:requestHeaders(apiKey),
        },
        15000
      );
      const body={
        schema:'evercraft.saban.akash-order-close.v1',
        dseq:String(quote.order_id),
        closed_at:new Date().toISOString(),
      };
      return {...body,provider_response:payload?.data||payload,receipt_hash:sha(body)};
    },
  };
}
