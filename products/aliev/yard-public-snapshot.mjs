const CENSUS='https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const WSDOT='https://data.wsdot.wa.gov/arcgis/rest/services/Shared/TrafficData/FeatureServer/0/query';
const WA_UTILITY='https://gis.ecology.wa.gov/serverext/rest/services/CPR/CPR/FeatureServer/0/query';

const num=v=>Number.isFinite(Number(v))?Number(v):null;
async function getJson(url,timeout=8000){
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeout);
  try{const r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':'Evercraft-AliEV/1.0','Accept':'application/json'}});if(!r.ok)throw new Error('source_http_'+r.status);return await r.json();}
  finally{clearTimeout(timer)}
}
const err=e=>String(e?.name==='AbortError'?'timeout':e?.message||e||'unknown').slice(0,200);

async function geocode(address){
  const url=CENSUS+'?address='+encodeURIComponent(address)+'&benchmark=Public_AR_Current&vintage=Current_Current&format=json';
  const d=await getJson(url); const m=d?.result?.addressMatches?.[0]; if(!m)throw new Error('address_not_found');
  const c=m.addressComponents||{}, county=m?.geographies?.Counties?.[0]||null, lat=num(m.coordinates?.y), lon=num(m.coordinates?.x);
  if(lat===null||lon===null)throw new Error('coordinates_missing');
  return {matched_address:m.matchedAddress||address,latitude:lat,longitude:lon,state:String(c.state||'').toUpperCase(),postal_code:String(c.zip||''),county:String(county?.NAME||''),county_geoid:String(county?.GEOID||''),geocoder_source:'U.S. Census Geocoder',geocoder_source_url:url};
}
async function waTraffic(lat,lon){
  const p=new URLSearchParams({f:'geojson',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:'10',units:'esriSRUnit_StatuteMile',outFields:'OBJECTID,RouteIdentifier,Location,AADT,ReportingYear',returnGeometry:'true',outSR:'4326',resultRecordCount:'100'});
  try{const d=await getJson(WSDOT+'?'+p);const rows=(d?.features||[]).map(f=>({source_id:'wsdot:'+f.properties?.OBJECTID,route:f.properties?.RouteIdentifier||null,location:f.properties?.Location||null,aadt:num(f.properties?.AADT),reporting_year:f.properties?.ReportingYear||null,latitude:num(f.geometry?.coordinates?.[1]),longitude:num(f.geometry?.coordinates?.[0]),source:'Washington State Department of Transportation',source_url:WSDOT})).filter(x=>x.aadt!==null).sort((a,b)=>b.aadt-a.aadt);return {state:rows.length?'OBSERVED_VERIFIED':'OBSERVED_EMPTY',rows};}
  catch(e){return {state:'NOT_OBSERVABLE',rows:[],error:err(e)}}
}
async function waUtility(lat,lon){
  const p=new URLSearchParams({f:'json',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'OBJECTID,Name',returnGeometry:'false',resultRecordCount:'10'});
  try{const d=await getJson(WA_UTILITY+'?'+p);const rows=(d?.features||[]).map(f=>({source_id:'wa-utility:'+f.attributes?.OBJECTID,utility_name:f.attributes?.Name||null,source:'Washington State Department of Ecology',source_url:WA_UTILITY,evidence_state:'PUBLIC_SERVICE_AREA_SCREEN'})).filter(x=>x.utility_name);return {state:rows.length?'PUBLIC_SERVICE_AREA_SCREEN':'OBSERVED_EMPTY',rows};}
  catch(e){return {state:'NOT_OBSERVABLE',rows:[],error:err(e)}}
}
export async function runRivetPublicSnapshot({address}={}){
  const geo=await geocode(String(address||'').trim());
  const [traffic,utility]=await Promise.all([geo.state==='WA'?waTraffic(geo.latitude,geo.longitude):{state:'NOT_APPLICABLE',rows:[]},geo.state==='WA'?waUtility(geo.latitude,geo.longitude):{state:'NOT_APPLICABLE',rows:[]}]);
  return {schema:'evercraft.aliev.rivet-public-snapshot.v1',response_profile:'rivet_report_snapshot_v1',...geo,evidence_state:'PARTIAL_SOURCE_BACKED',traffic:traffic.rows,traffic_source_status:traffic.state,traffic_source_error:traffic.error||null,washington_utility_service_area_candidates:utility.rows,washington_utility_service_area_status:utility.state,washington_utility_service_area_error:utility.error||null,coverage_contract:{state:'PARTIAL_YARD_EXTRACTION',provenance_rule:'Missing observed data is never converted to zero.'},retrieved_at:new Date().toISOString()};
}
