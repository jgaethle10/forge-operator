import { randomUUID } from 'node:crypto';

export const ALIEV_OFFERS=Object.freeze([
  {key:'site_report_299',name:'RIVET Preliminary Site Opportunity Report',amount_usd:299,billing_mode:'one_time',scope:'one address / preliminary opportunity intelligence'},
  {key:'site_report_750',name:'RIVET Full Site Opportunity Report',amount_usd:750,billing_mode:'one_time',scope:'one address / deeper commercial diligence'},
  {key:'opportunity_pack_250',name:'AliEV Qualified Opportunity Pack · Pilot',amount_usd:250,billing_mode:'one_time',scope:'3–5 opportunity targets in one agreed market'},
  {key:'territory_feed_2500_monthly',name:'AliEV Territory Opportunity Feed',amount_usd:2500,billing_mode:'subscription',scope:'recurring territory opportunity intelligence'}
]);

function clean(value,max=4000){ return String(value??'').replace(/\s+/g,' ').trim().slice(0,max); }
function ownedUrl(origin,path){
  const base=clean(origin,1800).replace(/\/$/,'');
  if(!base) return path;
  return new URL(path,base).toString();
}
function assertOwnedSource(value){
  const raw=clean(value,1800);
  if(!raw) throw new Error('aliev_owned_site_source_not_configured');
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)) throw new Error('aliev_site_source_protocol_invalid');
  if(/(^|\.)base44\.app$/i.test(url.hostname)) throw new Error('aliev_base44_site_source_prohibited');
  return url.toString();
}
function sourceState(raw){
  const status=clean(raw?.charger_source_status,100).toLowerCase();
  if(status==='ok') return {state:'OBSERVED_PUBLIC_INVENTORY',value:Array.isArray(raw?.chargers)?raw.chargers.length:0,confidence_pct:90};
  if(status==='empty') return {state:'OBSERVED_SOURCE_RETURNED_EMPTY',value:0,confidence_pct:90};
  return {state:'UNKNOWN_SOURCE_UNAVAILABLE',value:null,confidence_pct:null};
}
function uniqueSources(chargers){
  const seen=new Set(),out=[];
  for(const row of Array.isArray(chargers)?chargers:[]){
    const url=clean(row?.source_url,1200);
    const name=clean(row?.source||row?.operator||row?.network,240);
    if(!url) continue;
    const key=url+'|'+name;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push({name:name||'Public charging source',url});
    if(out.length>=12) break;
  }
  return out;
}

export function alievCapabilities({origin='',siteSourceConfigured=false}={}){
  return {
    schema_version:'aliev.agent.capabilities.v2',
    product:'AliEV',
    runtime:'yard_evercraft_compute',
    description:'Evidence-disciplined EV infrastructure opportunity intelligence for addresses, sites, markets and commercial deployment workflows.',
    http_endpoint:ownedUrl(origin,'/api/aliev'),
    mcp_endpoint:ownedUrl(origin,'/mcp/aliev'),
    public_review:ownedUrl(origin,'/aliev/review'),
    machine_state:siteSourceConfigured?'owned_public_screen_ready_for_canary':'owned_discovery_ready_site_screen_hold',
    capabilities:[
      {id:'get_aliev_capabilities',status:'owned_ready',access:'free'},
      {id:'get_aliev_offers',status:'owned_ready',access:'free'},
      {id:'prepare_paid_handoff',status:'owned_ready',access:'human_confirmation_required'},
      {id:'analyze_ev_site',status:siteSourceConfigured?'owned_source_configured':'owned_site_engine_required',access:'free_public_screen'},
      {id:'prepare_site_report_checkout',status:'held_until_owned_commerce_execution_verified',access:'explicit_human_payment_confirmation_required'},
      {id:'get_purchase_status',status:'held_until_owned_commerce_execution_verified',access:'purchase_reference'}
    ],
    evidence_rules:[
      'Missing is not zero.',
      'Mapped charger inventory is not utilization.',
      'Modeled values are not observed facts.',
      'Utility capacity and tariff assignment require utility confirmation.',
      'Program presence is not incentive eligibility.',
      'Screening is not engineering, permitting, interconnection, financing, or construction approval.'
    ],
    payment_boundary:'Discovery, offer inspection and review-link preparation are non-transactional. Checkout creation, payment verification and paid entitlement remain separately held until owned commerce execution is verified.',
    base44_runtime_required:false
  };
}

export function alievOffers(){
  return {
    ok:true,
    schema_version:'aliev.agent.offers.v2',
    currency:'USD',
    offers:ALIEV_OFFERS,
    payment_authority:'No offer is paid or activated by this response. Checkout, payment verification, entitlement and fulfillment are separate human-authorized states.',
    base44_runtime_required:false
  };
}

export function prepareAliEVHandoff({offerKey,address='',origin='',requestId=randomUUID()}={}){
  const key=clean(offerKey,120);
  const site=clean(address,500);
  const offer=ALIEV_OFFERS.find((row)=>row.key===key);
  if(!offer) throw new Error('unknown_offer_key');
  if(['site_report_299','site_report_750'].includes(key)&&site.length<5) throw new Error('address_required_for_site_offer');
  const params=new URLSearchParams({offer:key,rid:clean(requestId,120)});
  if(site) params.set('address',site);
  return {
    ok:true,
    schema_version:'aliev.agent.handoff.v2',
    offer,
    handoff_url:ownedUrl(origin,'/aliev/review?'+params.toString()),
    request_id:clean(requestId,120),
    payment_authority:false,
    checkout_created:false,
    payment_created:false,
    instruction:'Present this review link to the human buyer. Do not describe the offer as purchased until authoritative payment verification exists.'
  };
}

export function compactAliEVPublicScreen(raw,address){
  const chargers=Array.isArray(raw?.chargers)?raw.chargers:[];
  const charging=sourceState(raw);
  const signals=raw?.public_signal_summary||{};
  return {
    schema_version:'aliev.agent.site_screen.v2',
    product:'AliEV',
    runtime:'yard_evercraft_compute',
    capability:'address_to_ev_opportunity_intelligence',
    access_level:'public_free_screen',
    query:{address:clean(address,500)},
    resolved_location:{
      matched_address:raw?.matched_address||address,
      latitude:raw?.latitude??null,
      longitude:raw?.longitude??null,
      country_code:raw?.country_code||null,
      region:raw?.region||null,
      state:raw?.state||null,
      county:raw?.county||null,
      postal_code:raw?.postal_code||null,
      geocoder_source:raw?.geocoder_source||null
    },
    evidence:{
      charging_inventory:{
        ...charging,
        semantics:'Count reflects charging stations returned by the connected public inventory source within the AliEV screening radius. It is not live availability or utilization.'
      },
      traffic_detail:{
        state:signals?.traffic_evidence?'AVAILABLE_IN_PAID_DILIGENCE':'UNKNOWN',
        value:null,
        semantics:'Public free screen reports source-backed traffic availability, not traffic values.'
      },
      utility_or_tariff_detail:{
        state:signals?.utility_evidence?'AVAILABLE_IN_PAID_DILIGENCE':'UNKNOWN',
        value:null,
        semantics:'Utility territory, tariff assignment, capacity and economics require deeper diligence and utility confirmation.'
      },
      incentive_or_program_detail:{
        state:signals?.program_evidence?'AVAILABLE_IN_PAID_DILIGENCE':'UNKNOWN',
        value:null,
        semantics:'Program evidence can be surfaced in deeper diligence; eligibility is never inferred from geography alone.'
      },
      observed_usage_detail:{
        state:signals?.observed_usage_evidence?'AVAILABLE_IN_PAID_DILIGENCE':'UNKNOWN',
        value:null,
        semantics:'Observed charging usage stays separate from mapped inventory and modeled demand.'
      }
    },
    nearby_chargers:chargers.slice(0,10).map((row)=>({
      name:row?.name||'Public EV charging station',
      operator:row?.operator||row?.network||null,
      distance_miles:row?.distance_miles??null,
      address:row?.address||null,
      connectors:Array.isArray(row?.connectors)?row.connectors:[],
      availability_state:row?.availability_state||null,
      source_updated:row?.source_updated||null,
      source_url:row?.source_url||null
    })),
    sources:uniqueSources(chargers),
    evidence_rules:alievCapabilities().evidence_rules,
    retrieved_at:raw?.retrieved_at||new Date().toISOString(),
    base44_runtime_used:false
  };
}

export async function analyzeAliEVSite({
  address,
  sourceUrl=process.env.ALIEV_PUBLIC_SCREEN_SOURCE_URL||process.env.ALIEV_YARD_SOURCE_URL||'',
  systemiaMachineKey=process.env.SYSTEMIA_MACHINE_KEY||'',
  fetchImpl=fetch
}={}){
  const site=clean(address,500);
  if(site.length<5) throw new Error('address_required');
  const url=assertOwnedSource(sourceUrl);
  const headers={'content-type':'application/json','accept':'application/json','user-agent':'AliEV-Yard-Public-Gateway/2.0'};
  if(clean(systemiaMachineKey,12000)) headers['x-systemia-machine-key']=clean(systemiaMachineKey,12000);
  const response=await fetchImpl(url,{
    method:'POST',
    headers,
    body:JSON.stringify({address:site,mode:'public_screen'})
  });
  const raw=await response.json().catch(()=>null);
  if(!response.ok||!raw) throw new Error('aliev_owned_site_source_http_'+response.status);
  if(raw?.access_policy?.public_access===false) throw new Error('aliev_owned_site_source_public_access_denied');
  return compactAliEVPublicScreen(raw,site);
}

function rpcResult(id,result){ return {jsonrpc:'2.0',id:id??null,result}; }
function rpcError(id,code,message){ return {jsonrpc:'2.0',id:id??null,error:{code,message}}; }
function toolResult(payload,isError=false){
  return {content:[{type:'text',text:JSON.stringify(payload,null,2)}],structuredContent:payload,isError};
}

export async function executeAliEVMcp(rpc,{origin='',sourceUrl='',systemiaMachineKey='',fetchImpl=fetch}={}){
  const method=clean(rpc?.method,120),id=rpc?.id??null;
  const siteConfigured=Boolean(clean(sourceUrl,1800));
  if(method==='initialize') return rpcResult(id,{
    protocolVersion:'2025-03-26',
    capabilities:{tools:{}},
    serverInfo:{name:'aliev',version:'2.0.0-yard'},
    instructions:'Owned AliEV discovery, offer handoff, and source-gated public EV site screening. Checkout/payment tools remain held.'
  });
  if(method==='tools/list'){
    const safe={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
    return rpcResult(id,{tools:[
      {name:'get_aliev_capabilities',title:'Get AliEV capabilities',description:'Read current owned AliEV capability states and evidence boundaries.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:safe},
      {name:'get_aliev_offers',title:'Get AliEV offers',description:'Read published AliEV paid-depth options. Creates no checkout or obligation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:safe},
      {name:'prepare_paid_handoff',title:'Prepare AliEV paid-depth review',description:'Create an owned human-review URL for a selected offer. No checkout, payment, entitlement or outreach.',inputSchema:{type:'object',properties:{offer_key:{type:'string'},address:{type:'string',maxLength:500}},required:['offer_key'],additionalProperties:false},annotations:safe},
      {name:'analyze_ev_site',title:'Screen an address for EV opportunity',description:'Run a free public screen only when the owned AliEV site evidence source is configured. Never falls back to Base44.',inputSchema:{type:'object',properties:{address:{type:'string',minLength:5,maxLength:500}},required:['address'],additionalProperties:false},annotations:safe}
    ]});
  }
  if(method==='tools/call'){
    const name=clean(rpc?.params?.name,120),args=rpc?.params?.arguments||{};
    try{
      if(name==='get_aliev_capabilities') return rpcResult(id,toolResult(alievCapabilities({origin,siteSourceConfigured:siteConfigured})));
      if(name==='get_aliev_offers') return rpcResult(id,toolResult(alievOffers()));
      if(name==='prepare_paid_handoff') return rpcResult(id,toolResult(prepareAliEVHandoff({offerKey:args.offer_key,address:args.address,origin})));
      if(name==='analyze_ev_site'){
        if(!siteConfigured) return rpcResult(id,toolResult({ok:false,error:'aliev_owned_site_source_not_configured',state:'migration_hold',base44_fallback:false},true));
        const result=await analyzeAliEVSite({address:args.address,sourceUrl,systemiaMachineKey,fetchImpl});
        return rpcResult(id,toolResult({ok:true,result}));
      }
      return rpcError(id,-32602,'Unknown or unsupported AliEV tool.');
    }catch(error){
      return rpcResult(id,toolResult({ok:false,error:error instanceof Error?error.message:String(error)},true));
    }
  }
  if(method==='notifications/initialized') return null;
  return rpcError(id,-32601,'Method not found.');
}
