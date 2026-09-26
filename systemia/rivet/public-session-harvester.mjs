import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_REGISTRY='systemia/rivet/session-source-registry.json';
const DEFAULT_OUT='artifacts/rivet-session-sprawl/harvest-latest.json';
const DEFAULT_MAX_PAGES=500;
const DEFAULT_PAGE_DELAY_MS=125;

const aliases={
  station:['station','station_name','stationname','charge_box_id','chargeboxid','station_id','stationid','evse_id','evseid','charger_id','chargerid','port_name','portname','name'],
  siteLabel:['site','location_name','locationname','site_name','sitename'],
  address:['address','street_address','streetaddress','location','site_address','siteaddress'],
  latitude:['latitude','lat','y'],
  longitude:['longitude','lon','lng','x'],
  date:['date','transaction_date','transactiondate'],
  start:['start_date_time','startdatetime','connected_time','connectedtime','connection_time','connectiontime','start_time','starttime','start_date','startdate','session_start_date','sessionstartdate','connect_start_date','connectstartdate'],
  energy:['energy_kwh','energyprovidedkwh','energy_provided_kwh','energy_consumed_kwh','energyconsumedkwh','energy','kwhdelivered','kwh_delivered','total_kwh','totalkwh'],
  invalidity:['invalidity_reason','invalidityreason'],
  sessionId:['session_id','sessionid','transaction_id','transactionid']
};

function normKey(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function valueFor(row,names){
  if(!row||typeof row!=='object')return null;
  const m=new Map(Object.entries(row).map(([k,v])=>[normKey(k),v]));
  for(const name of names){
    const v=m.get(normKey(name));
    if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;
  }
  return null;
}
function number(v){
  const n=Number.parseFloat(String(v??'').replace(/,/g,''));
  return Number.isFinite(n)?n:null;
}
function isoDay(v){
  if(!v)return null;
  const d=new Date(v);
  return Number.isFinite(d.getTime())?d.toISOString().slice(0,10)+'T00:00:00.000Z':null;
}
function stableSiteKey({source,station,address,siteLabel,latitude,longitude}){
  const identity=[source.source_id,station||'',address||'',siteLabel||'',latitude??'',longitude??''].join('|');
  return source.source_id+':'+crypto.createHash('sha256').update(identity).digest('hex').slice(0,20);
}
function transientSessionKey(row,source){
  const id=valueFor(row,aliases.sessionId);
  if(id)return source.source_id+'|session|'+String(id);
  const parts=[
    valueFor(row,aliases.station),
    valueFor(row,aliases.date),
    valueFor(row,aliases.start),
    valueFor(row,aliases.energy)
  ];
  if(parts.every(v=>v==null))return null;
  return source.source_id+'|fallback|'+crypto.createHash('sha256').update(parts.map(v=>String(v??'')).join('|')).digest('hex');
}

export function aggregateSessionRows(rows,source){
  const groups=new Map();
  const seenSessions=new Set();
  let rejected=0;
  let duplicates=0;

  for(const row of Array.isArray(rows)?rows:[]){
    const invalidity=valueFor(row,aliases.invalidity);
    if(source.reject_if_invalidity_present===true&&invalidity){rejected+=1;continue;}

    const dedupeKey=transientSessionKey(row,source);
    if(dedupeKey&&seenSessions.has(dedupeKey)){duplicates+=1;continue;}
    if(dedupeKey)seenSessions.add(dedupeKey);

    const station=valueFor(row,aliases.station);
    const siteLabel=valueFor(row,aliases.siteLabel);
    const address=valueFor(row,aliases.address);
    const latitude=number(valueFor(row,aliases.latitude));
    const longitude=number(valueFor(row,aliases.longitude));
    const sourceDate=source.period_date_field?valueFor(row,[source.period_date_field]):null;
    const periodStart=isoDay(sourceDate||valueFor(row,aliases.start)||source.default_period_start);

    if(!periodStart||(!station&&!address&&!siteLabel&&(latitude===null||longitude===null))){
      rejected+=1;
      continue;
    }

    const energy=number(valueFor(row,aliases.energy));
    const siteKey=stableSiteKey({source,station,address,siteLabel,latitude,longitude});
    const aggregateKey=siteKey+'|'+periodStart;
    const current=groups.get(aggregateKey)||{
      schema:'evercraft.rivet.ev-observed-usage-aggregate.v1',
      aggregate_key:aggregateKey,
      station_external_id:station?String(station):siteKey,
      site_id:siteKey,
      jurisdiction:source.jurisdiction||null,
      country:source.country||'US',
      address:address?String(address):null,
      site_label:siteLabel?String(siteLabel):null,
      latitude,
      longitude,
      period_start:periodStart,
      period_granularity:'day',
      charging_sessions_count:0,
      energy_kwh:0,
      source_ref:'public:'+source.source_id,
      source_url_or_internal_receipt:source.landing_url||source.endpoint||null,
      data_status:'observed_public_aggregate',
      evidence_class:'public_observed_aggregate',
      provenance_notes:'Aggregated at ingest from public session rows. Direct session/user identifiers are used only transiently for dedupe and are not persisted. Source: '+source.name+'.',
      privacy_transform:'aggregate_at_ingest_drop_session_and_user_identifiers'
    };
    current.charging_sessions_count+=1;
    if(energy!==null)current.energy_kwh+=energy;
    groups.set(aggregateKey,current);
  }

  return {
    aggregates:[...groups.values()].map(r=>({...r,energy_kwh:Number(r.energy_kwh.toFixed(6))})),
    rejected_rows:rejected,
    duplicate_rows_dropped:duplicates
  };
}

async function fetchJson(url,{fetchImpl=globalThis.fetch,timeoutMs=30000}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch unavailable');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetchImpl(url,{
      headers:{'user-agent':'Evercraft-RIVET-Session-Sprawl/1.0 (+public-data; provenance-preserving)'},
      signal:controller.signal
    });
    if(!res.ok)throw new Error('HTTP '+res.status+' for '+url);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}
function withParams(base,params){
  const u=new URL(base);
  for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));
  return u.toString();
}
function delay(ms){return ms>0?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();}

async function harvestSocrata(source,{fetchImpl,maxPages,pageSize=5000}){
  const rows=[];
  for(let page=0;page<maxPages;page+=1){
    const url=withParams(source.endpoint,{'$limit':pageSize,'$offset':page*pageSize});
    const batch=await fetchJson(url,{fetchImpl});
    if(!Array.isArray(batch))throw new Error(source.source_id+': expected Socrata array');
    rows.push(...batch);
    if(batch.length<pageSize)break;
    await delay(source.page_delay_ms??DEFAULT_PAGE_DELAY_MS);
  }
  return rows;
}
async function harvestOpendatasoft(source,{fetchImpl,maxPages,pageSize=100}){
  const rows=[];
  for(let page=0;page<maxPages;page+=1){
    const url=withParams(source.endpoint,{limit:pageSize,offset:page*pageSize});
    const payload=await fetchJson(url,{fetchImpl});
    const batch=Array.isArray(payload?.results)?payload.results:[];
    rows.push(...batch);
    if(batch.length<pageSize||(Number.isFinite(payload?.total_count)&&rows.length>=payload.total_count))break;
    await delay(source.page_delay_ms??DEFAULT_PAGE_DELAY_MS);
  }
  return rows;
}
async function harvestOpendatasoftExport(source,{fetchImpl}){
  const payload=await fetchJson(source.endpoint,{fetchImpl,timeoutMs:120000});
  if(!Array.isArray(payload))throw new Error(source.source_id+': expected Opendatasoft JSON export array');
  return payload;
}
function findArcgisServiceUrl(value){
  if(!value)return null;
  if(typeof value==='string'&&/\/FeatureServer(?:\/\d+)?\/?$/i.test(value))return value;
  if(Array.isArray(value)){
    for(const item of value){const found=findArcgisServiceUrl(item);if(found)return found;}
    return null;
  }
  if(typeof value==='object'){
    if(typeof value.url==='string'&&/\/FeatureServer(?:\/\d+)?\/?$/i.test(value.url))return value.url;
    for(const child of Object.values(value)){const found=findArcgisServiceUrl(child);if(found)return found;}
  }
  return null;
}
async function resolveArcgis(source,{fetchImpl}){
  if(source.endpoint)return source.endpoint;
  const ids=[...(source.arcgis_item_ids||[]),source.arcgis_item_id].filter(Boolean);
  for(const id of [...new Set(ids)]){
    const meta=await fetchJson('https://www.arcgis.com/sharing/rest/content/items/'+encodeURIComponent(id)+'?f=json',{fetchImpl});
    let url=findArcgisServiceUrl(meta);
    if(!url){
      try{
        const data=await fetchJson('https://www.arcgis.com/sharing/rest/content/items/'+encodeURIComponent(id)+'/data?f=json',{fetchImpl});
        url=findArcgisServiceUrl(data);
      }catch{}
    }
    if(url){
      const clean=String(url).replace(/\/$/,'');
      if(/\/FeatureServer\/\d+$/i.test(clean))return clean;
      return clean+(source.arcgis_layer==null?'/0':'/'+source.arcgis_layer);
    }
  }
  throw new Error(source.source_id+': ArcGIS item(s) did not expose a FeatureServer URL');
}
async function harvestArcgis(source,{fetchImpl,maxPages,pageSize=1000}){
  const endpoint=await resolveArcgis(source,{fetchImpl});
  const effectivePageSize=Math.max(1,Math.min(2000,source.arcgis_page_size||pageSize));
  const rows=[];
  for(let page=0;page<maxPages;page+=1){
    const url=withParams(endpoint.replace(/\/$/,'')+'/query',{
      where:'1=1',
      outFields:'*',
      f:'json',
      resultOffset:page*effectivePageSize,
      resultRecordCount:effectivePageSize,
      returnGeometry:'true',
      outSR:'4326'
    });
    const payload=await fetchJson(url,{fetchImpl});
    if(payload?.error)throw new Error(source.source_id+': ArcGIS '+(payload.error.message||'error'));
    const batch=(payload?.features||[]).map(feature=>{
      const row={...(feature.attributes||{})};
      if(feature.geometry?.x!=null&&feature.geometry?.y!=null){
        row.longitude??=feature.geometry.x;
        row.latitude??=feature.geometry.y;
      }
      return row;
    });
    rows.push(...batch);
    if(batch.length===0)break;
    if(batch.length<effectivePageSize&&payload?.exceededTransferLimit!==true)break;
    await delay(source.page_delay_ms??DEFAULT_PAGE_DELAY_MS);
  }
  return rows;
}

export async function harvestSource(source,{fetchImpl=globalThis.fetch,maxPages=DEFAULT_MAX_PAGES}={}){
  if(source.authority!=='public'||source.auto_harvest!==true){
    return {source_id:source.source_id,status:'SKIPPED_AUTHORITY_OR_MANUAL',rows:[],reason:source.status||source.authority};
  }

  let rows=[];
  if(source.transport==='socrata')rows=await harvestSocrata(source,{fetchImpl,maxPages});
  else if(source.transport==='opendatasoft')rows=await harvestOpendatasoft(source,{fetchImpl,maxPages});
  else if(source.transport==='opendatasoft_export_json')rows=await harvestOpendatasoftExport(source,{fetchImpl});
  else if(source.transport==='arcgis')rows=await harvestArcgis(source,{fetchImpl,maxPages});
  else return {source_id:source.source_id,status:'SKIPPED_UNSUPPORTED_TRANSPORT',rows:[],reason:source.transport||'none'};

  const normalized=aggregateSessionRows(rows,source);
  return {
    source_id:source.source_id,
    status:'HARVESTED',
    raw_session_rows_seen:rows.length,
    accepted_aggregate_rows:normalized.aggregates.length,
    rejected_rows:normalized.rejected_rows,
    duplicate_rows_dropped:normalized.duplicate_rows_dropped,
    rows:normalized.aggregates
  };
}

export async function harvestRegistry(registry,{fetchImpl=globalThis.fetch,maxPages=DEFAULT_MAX_PAGES,only=null}={}){
  const wanted=only?new Set(only):null;
  const sources=(registry.sources||[]).filter(source=>!wanted||wanted.has(source.source_id));
  const sourceResults=[];
  const aggregates=[];

  for(const source of sources){
    try{
      const result=await harvestSource(source,{fetchImpl,maxPages});
      aggregates.push(...(result.rows||[]));
      sourceResults.push({...result,rows:undefined});
    }catch(error){
      sourceResults.push({source_id:source.source_id,status:'ERROR',error:error instanceof Error?error.message:String(error)});
    }
  }

  return {
    schema:'evercraft.rivet.session-harvest.v1',
    generated_at:new Date().toISOString(),
    mission_id:registry.mission_id||'rivet-us-session-sprawl-001',
    source_results:sourceResults,
    totals:{
      sources_attempted:sources.length,
      sources_harvested:sourceResults.filter(r=>r.status==='HARVESTED').length,
      raw_session_rows_seen:sourceResults.reduce((sum,r)=>sum+(r.raw_session_rows_seen||0),0),
      duplicate_rows_dropped:sourceResults.reduce((sum,r)=>sum+(r.duplicate_rows_dropped||0),0),
      accepted_aggregate_rows:aggregates.length
    },
    privacy:'Direct session/user identifiers are never persisted; they may be used transiently only for duplicate suppression.',
    aggregates
  };
}

function argValue(argv,flag,fallback=null){
  const index=argv.indexOf(flag);
  return index>=0&&argv[index+1]?argv[index+1]:fallback;
}
async function main(){
  const argv=process.argv.slice(2);
  const registryPath=argValue(argv,'--registry',DEFAULT_REGISTRY);
  const out=argValue(argv,'--out',DEFAULT_OUT);
  const maxPages=Math.max(1,Math.min(5000,Number.parseInt(argValue(argv,'--max-pages',String(DEFAULT_MAX_PAGES)),10)||DEFAULT_MAX_PAGES));
  const onlyRaw=argValue(argv,'--sources',null);
  const only=onlyRaw?onlyRaw.split(',').map(s=>s.trim()).filter(Boolean):null;
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const receipt=await harvestRegistry(registry,{maxPages,only});
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({...receipt,aggregates:undefined}));
  if(receipt.source_results.some(r=>r.status==='ERROR'))process.exitCode=2;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
