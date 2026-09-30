import { ingestAliEvDomainRecords } from '../domain-store.mjs';
import { refreshWashingtonSiteDomains } from './washington.mjs';

export const AFDC_NEAREST_URL='https://developer.nlr.gov/api/alt-fuel-stations/v1/nearest.json';
export const AFDC_INCENTIVES_URL='https://developer.nlr.gov/api/transportation-incentives-laws/v1.json';

const clean=(v)=>String(v??'').trim();
const num=(v)=>{if(v===null||v===undefined||String(v).trim()==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};

async function fetchJson(url,{fetchImpl=fetch,timeoutMs=10000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{
      headers:{accept:'application/json','user-agent':'Evercraft-AliEV/1.0'},
      signal:controller.signal
    });
    if(!response.ok)throw new Error('http_'+response.status);
    return await response.json();
  }finally{clearTimeout(timer);}
}
function configuredApiKey(explicit=''){
  return clean(explicit||process.env.NLR_API_KEY||process.env.AFDC_API_KEY)||'DEMO_KEY';
}
function maxUnitPower(units){
  let max=null;
  for(const unit of Array.isArray(units)?units:[]){
    for(const connector of Object.values(unit?.connectors||{})){
      const value=num(connector?.power_kw);
      if(value!==null)max=max===null?value:Math.max(max,value);
    }
  }
  return max;
}

export async function collectUsAfdcCharging({
  stateDir,latitude,longitude,state='',apiKey='',fetchImpl=fetch,retrievedAt=new Date().toISOString()
}={}){
  const lat=num(latitude),lon=num(longitude);
  if(lat===null||lon===null)throw new Error('coordinates_required');
  const key=configuredApiKey(apiKey);
  const url=new URL(AFDC_NEAREST_URL);
  const params={
    api_key:key,latitude:String(lat),longitude:String(lon),radius:'25',
    fuel_type:'ELEC',access:'public',status:'E',country:'US',limit:'200'
  };
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const body=await fetchJson(url,{fetchImpl});
  const rows=Array.isArray(body?.fuel_stations)?body.fuel_stations:[];
  const records=rows.map((row)=>{
    const rlat=num(row.latitude),rlon=num(row.longitude);
    if(rlat===null||rlon===null||!row.id)return null;
    const units=Array.isArray(row.ev_charging_units)?row.ev_charging_units:[];
    const nestedPorts=units.reduce((sum,unit)=>sum+(num(unit?.port_count)||0),0);
    const level1=num(row.ev_level1_evse_num),level2=num(row.ev_level2_evse_num),dc=num(row.ev_dc_fast_num),other=num(row.ev_other_evse);
    const published=[level1,level2,dc,other].reduce((sum,x)=>sum+(x||0),0);
    const connectors=Array.isArray(row.ev_connector_types)
      ? row.ev_connector_types
      : typeof row.ev_connector_types==='string'
        ? row.ev_connector_types.split(/\s+/).filter(Boolean)
        : [];
    return {
      record_key:'afdc:'+row.id,
      external_id:'afdc:'+row.id,
      station_name:clean(row.station_name)||clean(row.ev_network)||'Public EV charging station',
      operator_name:clean(row.ev_network)||null,
      network:clean(row.ev_network)||null,
      latitude:rlat,longitude:rlon,
      address:[row.street_address,row.city,row.state,row.zip].map(clean).filter(Boolean).join(', '),
      city:clean(row.city)||null,
      state:clean(row.state).toUpperCase()||clean(state).toUpperCase()||null,
      postal_code:clean(row.zip).slice(0,5)||null,
      ports:nestedPorts||published||null,
      level1_ports:level1,level2_ports:level2,dc_fast_ports:dc,other_evse_ports:other,
      power_kw:maxUnitPower(units),
      connector_types:connectors,
      access_status:clean(row.access_code)||null,
      opening_hours:clean(row.access_days_time)||null,
      retail_price_note:clean(row.ev_pricing)||null,
      commissioned_at:clean(row.open_date)||null,
      source_updated_at:clean(row.updated_at||row.date_last_confirmed)||null,
      funding_sources:Array.isArray(row.funding_sources)?row.funding_sources:[],
      source_name:'DOE / NLR Alternative Fuels Data Center',
      source_url:'https://afdc.energy.gov/stations/#/station/'+row.id,
      source_retrieved_at:retrievedAt,
      evidence_state:'PUBLIC_OFFICIAL_INVENTORY',
      data_status:'verified',
      semantics:'AFDC public active-station inventory. Port and connector power are equipment capability, not utility service capacity, observed utilization, throughput, revenue or margin. Retail price text is driver-facing metadata, not operator utility cost.'
    };
  }).filter(Boolean);
  const receipt=ingestAliEvDomainRecords({
    stateDir,domain:'charging_inventory',records,
    source:{name:'DOE / NLR Alternative Fuels Data Center',url:AFDC_NEAREST_URL,retrieved_at:retrievedAt,evidence_state:'PUBLIC_OFFICIAL_INVENTORY',data_status:'verified'}
  });
  return {
    schema:'evercraft.aliev.collector-receipt.v1',
    collector:'us_afdc_public_charging',
    source_status:records.length?'connected':'empty',
    records:records.length,
    credential_mode:key==='DEMO_KEY'?'demo_key':'configured_key',
    credential_persisted:false,
    ingest:receipt,
    retrieved_at:retrievedAt
  };
}

export async function collectUsAfdcIncentives({
  stateDir,state,apiKey='',fetchImpl=fetch,retrievedAt=new Date().toISOString()
}={}){
  const region=clean(state).toUpperCase();
  if(!/^[A-Z]{2}$/.test(region))throw new Error('us_state_code_required');
  const key=configuredApiKey(apiKey);
  const url=new URL(AFDC_INCENTIVES_URL);
  url.searchParams.set('api_key',key);
  url.searchParams.set('jurisdiction','US-'+region);
  url.searchParams.set('technology','ELEC');
  const body=await fetchJson(url,{fetchImpl,timeoutMs:9000});
  const rows=Array.isArray(body?.result)?body.result:Array.isArray(body?.laws)?body.laws:Array.isArray(body)?body:[];
  const records=rows.slice(0,200).map((row,i)=>({
    record_key:'afdc-incentive:'+clean(row.id||region+'-'+i),
    id:row.id??null,
    title:clean(row.title||row.name)||'EV law or incentive',
    type:clean(row.type||row.incentive_type||row.regulation_type)||null,
    state:region,
    jurisdiction:clean(row.jurisdiction)||'US-'+region,
    enacted_date:clean(row.enacted_date)||null,
    amended_date:clean(row.amended_date)||null,
    expired_date:clean(row.expired_date)||null,
    text:clean(row.text||row.description)||null,
    source_name:'DOE / NLR Alternative Fuels Data Center · Laws & Incentives',
    source_url:clean(row.url||row.source_url)||'https://afdc.energy.gov/laws',
    source_retrieved_at:retrievedAt,
    evidence_state:'PUBLIC_PROGRAM_RECORD',
    data_status:'verified',
    eligibility_guardrail:'Published law/program context is not site eligibility, reservation, award, reimbursement, installation or operation.'
  }));
  const receipt=ingestAliEvDomainRecords({
    stateDir,domain:'incentives',records,
    source:{name:'DOE / NLR Alternative Fuels Data Center · Laws & Incentives',url:AFDC_INCENTIVES_URL,retrieved_at:retrievedAt,evidence_state:'PUBLIC_PROGRAM_RECORD',data_status:'verified'}
  });
  return {
    schema:'evercraft.aliev.collector-receipt.v1',
    collector:'us_afdc_incentives',
    source_status:records.length?'connected':'empty',
    records:records.length,
    credential_mode:key==='DEMO_KEY'?'demo_key':'configured_key',
    credential_persisted:false,
    ingest:receipt,
    retrieved_at:retrievedAt
  };
}

export async function refreshOwnedAliEvSiteDomains({
  stateDir,state,latitude,longitude,fetchImpl=fetch,retrievedAt=new Date().toISOString(),afdcApiKey=''
}={}){
  const region=clean(state).toUpperCase();
  const collectors={};
  if(/^[A-Z]{2}$/.test(region)){
    for(const [key,fn,args] of [
      ['charging_inventory',collectUsAfdcCharging,{latitude,longitude,state:region,apiKey:afdcApiKey}],
      ['incentives',collectUsAfdcIncentives,{state:region,apiKey:afdcApiKey}]
    ]){
      try{collectors[key]=await fn({stateDir,fetchImpl,retrievedAt,...args});}
      catch(error){collectors[key]={schema:'evercraft.aliev.collector-receipt.v1',collector:key,source_status:'unavailable',records:0,error:error instanceof Error?error.message:String(error),retrieved_at:retrievedAt};}
    }
  }
  if(region==='WA'){
    const washington=await refreshWashingtonSiteDomains({stateDir,latitude,longitude,fetchImpl,retrievedAt});
    Object.assign(collectors,washington.collectors);
  }
  return {
    schema:'evercraft.aliev.site-refresh-receipt.v1',
    state:region,
    collectors,
    refreshed_at:retrievedAt,
    base44_runtime_required:false
  };
}
