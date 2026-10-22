// EverMaps source adapter owned in Forge. No Base44 SDK, keys, accounts or wallet.
// WFIGS current incident records describe reported incidents, NOT live flames.
export const WFIGS = Object.freeze({
 endpoint:'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query',
 sourcePage:'https://www.nifc.gov/fire-information/maps',
 region:'Pacific Northwest, WA/OR/ID (bounding envelope)',
 bounds:[-125,42,-116,50],
 cacheMs:15*60*1000,
 maxRecordAgeMs:14*24*60*60*1000,
 maxResults:600
});

export function wfigsUrl(){
 const params=new URLSearchParams({
  where:"IncidentTypeCategory='WF'",
  geometry:WFIGS.bounds.join(','),
  geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',
  spatialRel:'esriSpatialRelIntersects',
  outFields:'OBJECTID,IncidentName,IncidentTypeCategory,FireOutDateTime,ModifiedOnDateTime_dt,FireDiscoveryDateTime,IncidentSize,PercentContained,UniqueFireIdentifier,IrwinID,POOState',
  returnGeometry:'true',resultRecordCount:String(WFIGS.maxResults),f:'json'
 });
 return WFIGS.endpoint+'?'+params;
}
const numeric=(value)=>value==null||value===''?null:Number(value);
const finiteRange=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
function normalizeTime(value){
 const n=numeric(value);
 return n!==null&&finiteRange(n,1,9e15)?n:null;
}
export function normalizeWfigs(payload, now=Date.now()){
 if(!payload||!Array.isArray(payload.features)||payload.error)throw new Error('WFIGS_INVALID_RESPONSE');
 if(payload.exceededTransferLimit||payload.features.length>=WFIGS.maxResults)throw new Error('WFIGS_TRUNCATED_RESPONSE');
 const records=new Map();
 const coverage={received:payload.features.length,excluded_out:0,excluded_stale:0,excluded_invalid:0};
 for(const feature of payload.features){
  const p=feature?.attributes??{},g=feature?.geometry??{};
  if(p.IncidentTypeCategory!=='WF'){coverage.excluded_invalid++;continue;}
  if(normalizeTime(p.FireOutDateTime)!==null){coverage.excluded_out++;continue;}
  const observedAt=normalizeTime(p.ModifiedOnDateTime_dt);
  if(observedAt===null||observedAt>now+15*60*1000||now-observedAt>WFIGS.maxRecordAgeMs){
   coverage.excluded_stale++;continue;
  }
  const lat=numeric(g.y),lng=numeric(g.x);
  if(!finiteRange(lat,WFIGS.bounds[1],WFIGS.bounds[3])
    ||!finiteRange(lng,WFIGS.bounds[0],WFIGS.bounds[2])){
   coverage.excluded_invalid++;continue;
  }
  const id=String(p.IrwinID||p.UniqueFireIdentifier||'').trim();
  if(!id||id.length>160){coverage.excluded_invalid++;continue;}
  const containment=numeric(p.PercentContained),size=numeric(p.IncidentSize);
  const current={
   id:'nifc-'+id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,160),
   incident_id:id,
   name:String(p.IncidentName||'Unnamed incident').replace(/[<>]/g,'').slice(0,120),
   latitude:lat,longitude:lng,
   modified_at_utc:new Date(observedAt).toISOString(),
   discovery_at_utc:normalizeTime(p.FireDiscoveryDateTime)!==null?new Date(Number(p.FireDiscoveryDateTime)).toISOString():null,
   reported_acres:finiteRange(size,0,1e9)?size:null,
   reported_containment_percent:finiteRange(containment,0,100)?containment:null,
   state:String(p.POOState||'').slice(0,20),
   evidence_state:'SOURCE_REPORTED_INCIDENT_NOT_BURNING_CONFIRMATION'
  };
  const existing=records.get(id);
  if(!existing||existing.modified_at_utc<current.modified_at_utc)records.set(id,current);
 }
 return {records:[...records.values()].sort((a,b)=>b.modified_at_utc.localeCompare(a.modified_at_utc)),coverage};
}
export async function fetchWfigs({fetchImpl=fetch,now=Date.now(),timeoutMs=12000}={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(wfigsUrl(),{signal:controller.signal,headers:{Accept:'application/json'},redirect:'error'});
  if(!response.ok)throw new Error('WFIGS_HTTP_'+response.status);
  const len=Number(response.headers?.get('content-length')||0);
  if(len>4e6)throw new Error('WFIGS_RESPONSE_TOO_LARGE');
  const body=await response.text();
  if(body.length>4e6)throw new Error('WFIGS_RESPONSE_TOO_LARGE');
  let raw;try{raw=JSON.parse(body);}catch{throw new Error('WFIGS_NOT_JSON');}
  return normalizeWfigs(raw,now);
 }finally{clearTimeout(timeout);}
}
export function createOwnedWfigsService({
 fetchImpl=fetch,clock=Date.now,cacheMs=WFIGS.cacheMs
}={}){
 let cache=null,pending=null,lastFailure=null,lastAttemptAt=null;
 async function read(){
  const now=clock();
  if(cache&&now-cache.fetched_at_ms<cacheMs)return cache.payload;
  if(pending)return pending;
  lastAttemptAt=now;
  pending=(async()=>{
   try{
    const data=await fetchWfigs({fetchImpl,now});
    const payload={
     schema:'evercraft.evermaps.incident-observations.v1',
     source:'NIFC WFIGS current incident locations',
     source_url:WFIGS.sourcePage,
     region:WFIGS.region,
     fetched_at_utc:new Date(now).toISOString(),
     source_coverage:data.coverage,
     count:data.records.length,
     records:data.records,
     guarantees:{
      current_feed_is_burning_confirmation:false,
      location_is_fire_perimeter:false,
      evacuation_guidance:false,
      zero_records_proves_zero_fires:false
     }
    };
    cache={fetched_at_ms:now,payload};
    lastFailure=null;
    return payload;
   }catch(error){
    // Do not serve expired cache as if fresh. Clear stale data and surface unavailability.
    cache=null;
    lastFailure={at_utc:new Date(clock()).toISOString(),error:String(error?.message||error).slice(0,140)};
    throw error;
   }finally{pending=null;}
  })();
  return pending;
 }
 return {
  read,
  health:()=>({
   schema:'evercraft.evermaps.incident-source-health.v1',
   state:cache&&clock()-cache.fetched_at_ms<cacheMs?'fresh':lastFailure?'unavailable':'not_loaded',
   source:'NIFC WFIGS',legacy_base44_dependency:false,
   last_attempt_at_utc:lastAttemptAt===null?null:new Date(lastAttemptAt).toISOString(),
   cached_at_utc:cache?new Date(cache.fetched_at_ms).toISOString():null,
   last_failure:lastFailure,
   shipping_state:'NOT_AUTHORIZED_BY_SOURCE_ADAPTER'
  })
 };
}
