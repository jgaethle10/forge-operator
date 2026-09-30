import { ingestAliEvDomainRecords } from '../domain-store.mjs';

export const WSDOT_TRAFFIC_URL='https://data.wsdot.wa.gov/arcgis/rest/services/Shared/TrafficData/FeatureServer/0/query';
export const WA_UTILITY_AREA_URL='https://gis.ecology.wa.gov/serverext/rest/services/CPR/CPR/FeatureServer/0/query';

const clean=(v)=>String(v??'').trim();
const num=(v)=>{if(v===null||v===undefined||String(v).trim()==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};

async function fetchJson(url,{fetchImpl=fetch,timeoutMs=8000,headers={}}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{
      headers:{accept:'application/json','user-agent':'Evercraft-AliEV/1.0',...headers},
      signal:controller.signal
    });
    if(!response.ok)throw new Error('http_'+response.status);
    return await response.json();
  }finally{
    clearTimeout(timer);
  }
}

export async function collectWashingtonTraffic({
  stateDir,latitude,longitude,fetchImpl=fetch,retrievedAt=new Date().toISOString()
}={}){
  const lat=num(latitude),lon=num(longitude);
  if(lat===null||lon===null)throw new Error('coordinates_required');
  const url=new URL(WSDOT_TRAFFIC_URL);
  const params={
    f:'geojson',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',
    inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:'10',
    units:'esriSRUnit_StatuteMile',
    outFields:'OBJECTID,RouteIdentifier,Location,AADT,ReportingYear',
    returnGeometry:'true',outSR:'4326',resultRecordCount:'100'
  };
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const body=await fetchJson(url,{fetchImpl});
  const records=(body?.features||[]).map((feature)=>{
    const p=feature?.properties||{},coords=feature?.geometry?.coordinates||[];
    const rlat=num(coords[1]),rlon=num(coords[0]),aadt=num(p.AADT);
    if(rlat===null||rlon===null||aadt===null)return null;
    return {
      record_key:'wsdot:'+clean(p.OBJECTID),
      source_id:'wsdot:'+clean(p.OBJECTID),
      route:clean(p.RouteIdentifier)||null,
      location:clean(p.Location)||null,
      aadt,
      reporting_year:num(p.ReportingYear),
      latitude:rlat,longitude:rlon,state:'WA',
      source_name:'Washington State Department of Transportation · Traffic Counts',
      source_url:'https://data.wsdot.wa.gov/arcgis/rest/services/Shared/TrafficData/FeatureServer/0',
      source_retrieved_at:retrievedAt,
      evidence_state:'OBSERVED_VERIFIED',
      data_status:'verified',
      semantics:'WSDOT AADT is annualized traffic volume, not live congestion, footfall, or charging demand.'
    };
  }).filter(Boolean);
  const receipt=ingestAliEvDomainRecords({
    stateDir,domain:'traffic',records,
    source:{name:'Washington State Department of Transportation · Traffic Counts',url:WSDOT_TRAFFIC_URL,retrieved_at:retrievedAt,evidence_state:'OBSERVED_VERIFIED',data_status:'verified'}
  });
  return {
    schema:'evercraft.aliev.collector-receipt.v1',
    collector:'washington_traffic_aadt',
    source_status:records.length?'connected':'empty',
    records:records.length,
    ingest:receipt,
    retrieved_at:retrievedAt
  };
}

export async function collectWashingtonUtilityServiceArea({
  stateDir,latitude,longitude,fetchImpl=fetch,retrievedAt=new Date().toISOString()
}={}){
  const lat=num(latitude),lon=num(longitude);
  if(lat===null||lon===null)throw new Error('coordinates_required');
  const url=new URL(WA_UTILITY_AREA_URL);
  const params={
    f:'json',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',
    inSR:'4326',spatialRel:'esriSpatialRelIntersects',
    outFields:'OBJECTID,Name',returnGeometry:'false',resultRecordCount:'10'
  };
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const body=await fetchJson(url,{fetchImpl});
  const records=(body?.features||[]).map((feature)=>{
    const a=feature?.attributes||{},name=clean(a.Name);
    if(!name)return null;
    return {
      record_key:'wa-ecology-electric-utility:'+clean(a.OBJECTID)+':'+lat.toFixed(5)+':'+lon.toFixed(5),
      source_id:'wa-ecology-electric-utility:'+clean(a.OBJECTID),
      utility_name:name,
      latitude:lat,longitude:lon,state:'WA',
      source_name:'Washington State Department of Ecology · Electric Utility Service Areas',
      source_url:'https://gis.ecology.wa.gov/serverext/rest/services/CPR/CPR/FeatureServer/0',
      source_vintage:'2024-05-31',
      source_retrieved_at:retrievedAt,
      evidence_state:'PUBLIC_SERVICE_AREA_SCREEN',
      data_status:'verified',
      semantics:'Screening boundary compiled from Washington UTC and utility-provided territory data. Washington Ecology states boundaries should not be viewed as official; confirm actual service with the utility.'
    };
  }).filter(Boolean);
  const receipt=ingestAliEvDomainRecords({
    stateDir,domain:'utility_service_area',records,
    source:{name:'Washington State Department of Ecology · Electric Utility Service Areas',url:WA_UTILITY_AREA_URL,retrieved_at:retrievedAt,evidence_state:'PUBLIC_SERVICE_AREA_SCREEN',data_status:'verified'}
  });
  return {
    schema:'evercraft.aliev.collector-receipt.v1',
    collector:'washington_utility_service_area',
    source_status:records.length?'screen_match':'no_polygon_match',
    records:records.length,
    ingest:receipt,
    retrieved_at:retrievedAt
  };
}

export async function refreshWashingtonSiteDomains({
  stateDir,latitude,longitude,fetchImpl=fetch,retrievedAt=new Date().toISOString()
}={}){
  const results={};
  for(const [key,fn] of [
    ['traffic',collectWashingtonTraffic],
    ['utility_service_area',collectWashingtonUtilityServiceArea]
  ]){
    try{
      results[key]=await fn({stateDir,latitude,longitude,fetchImpl,retrievedAt});
    }catch(error){
      results[key]={
        schema:'evercraft.aliev.collector-receipt.v1',
        collector:key==='traffic'?'washington_traffic_aadt':'washington_utility_service_area',
        source_status:'unavailable',
        records:0,
        error:error instanceof Error?error.message:String(error),
        retrieved_at:retrievedAt
      };
    }
  }
  return {
    schema:'evercraft.aliev.site-refresh-receipt.v1',
    state:'WA',
    collectors:results,
    refreshed_at:retrievedAt
  };
}

export async function refreshOwnedAliEvSiteDomains({
  stateDir,state,latitude,longitude,fetchImpl=fetch,retrievedAt=new Date().toISOString()
}={}){
  const region=clean(state).toUpperCase();
  if(region==='WA')return await refreshWashingtonSiteDomains({stateDir,latitude,longitude,fetchImpl,retrievedAt});
  return {
    schema:'evercraft.aliev.site-refresh-receipt.v1',
    state:region,
    collectors:{},
    refreshed_at:retrievedAt,
    semantics:'No owned live collector is connected for this geography yet; stored domain evidence remains available and missing live layers remain explicit.'
  };
}
