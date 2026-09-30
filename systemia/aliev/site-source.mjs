const CENSUS='https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const NOMINATIM='https://nominatim.openstreetmap.org/search';
const AFDC='https://developer.nlr.gov/api/alt-fuel-stations/v1/nearest.json';
const WSDOT='https://data.wsdot.wa.gov/arcgis/rest/services/Shared/TrafficData/FeatureServer/0/query';
const WA_UTILITIES='https://gis.ecology.wa.gov/serverext/rest/services/CPR/CPR/FeatureServer/0/query';

const COVERAGE_DOMAINS=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];

function clean(value,max=4000){ return String(value??'').replace(/\s+/g,' ').trim().slice(0,max); }
function n(value){ const x=Number(value); return Number.isFinite(x)?x:null; }
function stateRow(state,recordCount=0,sourceStatus='unknown'){ return {state,record_count:recordCount,source_status:sourceStatus}; }
function manifest(domains,now){
  return {
    schema:'evercraft.rivet.source-coverage.v1',
    generated_at:now,
    domains:Object.fromEntries(COVERAGE_DOMAINS.map((key)=>[key,domains[key]||stateRow('NOT_OBSERVABLE',0,'not_connected')])),
    semantics:'Every report-relevant source domain is explicit. Missing is never zero.'
  };
}
async function getJson(fetchImpl,url,init={},timeoutMs=12000){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{...init,signal:init.signal||ctl.signal});
    if(!response.ok) throw new Error('http_'+response.status);
    return await response.json();
  }finally{ clearTimeout(timer); }
}
function findNumber(attrs,tests){
  for(const [key,value] of Object.entries(attrs||{})){
    const lower=key.toLowerCase();
    if(tests.every((test)=>test(lower))){
      const num=n(value);
      if(num!==null) return {key,value:num};
    }
  }
  return null;
}
function firstText(attrs,keys){
  for(const key of keys){
    const found=Object.entries(attrs||{}).find(([k,v])=>k.toLowerCase()===key.toLowerCase()&&clean(v));
    if(found) return clean(found[1],500);
  }
  return '';
}
function haversine(lat1,lon1,lat2,lon2){
  const r=3958.7613,toRad=(d)=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*r*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export async function geocodeAliEVAddress(address,{fetchImpl=fetch}={}){
  const q=clean(address,500);
  if(q.length<5) throw new Error('address_required');
  try{
    const url=new URL(CENSUS);
    url.searchParams.set('address',q);
    url.searchParams.set('benchmark','Public_AR_Current');
    url.searchParams.set('vintage','Current_Current');
    url.searchParams.set('format','json');
    const data=await getJson(fetchImpl,url.toString(),{headers:{'user-agent':'Evercraft-AliEV/2.0'}});
    const row=data?.result?.addressMatches?.[0];
    const lat=n(row?.coordinates?.y),lon=n(row?.coordinates?.x);
    if(lat!==null&&lon!==null){
      const c=row?.addressComponents||{};
      return {
        matched_address:clean(row?.matchedAddress||q,500),
        latitude:lat,longitude:lon,
        country_code:'US',
        state:clean(c.state,80),
        region:clean(c.state,80),
        county:clean(c.county,160),
        postal_code:clean(c.zip,20),
        city:clean(c.city,160),
        geocoder_source:'US Census Geocoder',
        source_url:CENSUS,
        confidence_pct:96
      };
    }
  }catch{}
  const url=new URL(NOMINATIM);
  url.searchParams.set('q',q);
  url.searchParams.set('format','jsonv2');
  url.searchParams.set('addressdetails','1');
  url.searchParams.set('limit','1');
  const rows=await getJson(fetchImpl,url.toString(),{headers:{'user-agent':'Evercraft-AliEV/2.0 (public site intelligence)'}});
  const row=Array.isArray(rows)?rows[0]:null;
  const lat=n(row?.lat),lon=n(row?.lon);
  if(lat===null||lon===null) throw new Error('address_not_resolved');
  const a=row?.address||{};
  return {
    matched_address:clean(row?.display_name||q,500),
    latitude:lat,longitude:lon,
    country_code:clean(a.country_code,10).toUpperCase(),
    state:clean(a.state_code||a['ISO3166-2-lvl4']||a.state,80).replace(/^US-/,''),
    region:clean(a.state,120),
    county:clean(a.county,160),
    postal_code:clean(a.postcode,30),
    city:clean(a.city||a.town||a.village,160),
    geocoder_source:'OpenStreetMap Nominatim',
    source_url:NOMINATIM,
    confidence_pct:78
  };
}

export async function fetchNearbyChargers(location,{fetchImpl=fetch,apiKey=process.env.NLR_API_KEY||process.env.AFDC_API_KEY||'DEMO_KEY'}={}){
  if(location.country_code!=='US') return {rows:[],status:'not_connected_for_country',source:'none'};
  const url=new URL(AFDC);
  url.searchParams.set('api_key',clean(apiKey,500)||'DEMO_KEY');
  url.searchParams.set('fuel_type','ELEC');
  url.searchParams.set('latitude',String(location.latitude));
  url.searchParams.set('longitude',String(location.longitude));
  url.searchParams.set('radius','10');
  url.searchParams.set('limit','80');
  url.searchParams.set('access','public');
  try{
    const data=await getJson(fetchImpl,url.toString(),{headers:{'user-agent':'Evercraft-AliEV/2.0'}});
    const rows=(Array.isArray(data?.fuel_stations)?data.fuel_stations:[]).map((r)=>{
      const lat=n(r.latitude),lon=n(r.longitude);
      const connectors=Array.isArray(r.ev_connector_types)?r.ev_connector_types:
        clean(r.ev_connector_types).split(/\s+/).filter(Boolean);
      return {
        source_id:r.id?('afdc:'+r.id):null,
        name:r.station_name||r.ev_network||'Public EV charging station',
        operator:r.ev_network||null,
        network:r.ev_network||null,
        latitude:lat,longitude:lon,
        distance_miles:n(r.distance)??(lat!==null&&lon!==null?Number(haversine(location.latitude,location.longitude,lat,lon).toFixed(2)):null),
        ports:[r.ev_level1_evse_num,r.ev_level2_evse_num,r.ev_dc_fast_num,r.ev_other_evse].map((x)=>n(x)||0).reduce((a,b)=>a+b,0)||null,
        level1_ports:n(r.ev_level1_evse_num),level2_ports:n(r.ev_level2_evse_num),dc_fast_ports:n(r.ev_dc_fast_num),
        connectors,
        address:[r.street_address,r.city,r.state,r.zip].filter(Boolean).join(', ')||null,
        access:r.access_code||null,
        opening_hours:r.access_days_time||null,
        source_updated:r.updated_at||r.date_last_confirmed||null,
        source:'DOE / NLR Alternative Fuels Data Center',
        source_url:r.id?'https://afdc.energy.gov/stations/#/station/'+r.id:'https://afdc.energy.gov/'
      };
    }).sort((a,b)=>(a.distance_miles??999)-(b.distance_miles??999));
    return {rows,status:rows.length?'ok':'empty',source:'DOE / NLR Alternative Fuels Data Center',source_url:AFDC};
  }catch(error){
    return {rows:[],status:'unavailable',source:'DOE / NLR Alternative Fuels Data Center',source_url:AFDC,error:error instanceof Error?error.message:String(error)};
  }
}

export async function fetchWashingtonTraffic(location,{fetchImpl=fetch}={}){
  if(location.country_code!=='US'||location.state!=='WA') return {rows:[],status:'not_applicable'};
  const url=new URL(WSDOT);
  Object.entries({
    f:'json',where:'1=1',geometry:location.longitude+','+location.latitude,
    geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',
    distance:'8',units:'esriSRUnit_StatuteMile',outFields:'*',returnGeometry:'true',outSR:'4326'
  }).forEach(([k,v])=>url.searchParams.set(k,v));
  try{
    const data=await getJson(fetchImpl,url.toString());
    const rows=(Array.isArray(data?.features)?data.features:[]).map((feature)=>{
      const a=feature?.attributes||{},g=feature?.geometry||{};
      const aadt=findNumber(a,[(k)=>k.includes('aadt'),(k)=>!k.includes('truck')]);
      const lat=n(g.y),lon=n(g.x);
      return {
        source_station_id:clean(a.StationID||a.StationId||a.LocationID||a.ObjectID,120)||null,
        route:firstText(a,['RouteID','Route','StateRoute','SR']),
        location:firstText(a,['Location','Description','RoadName']),
        latitude:lat,longitude:lon,
        distance_miles:lat!==null&&lon!==null?Number(haversine(location.latitude,location.longitude,lat,lon).toFixed(2)):null,
        aadt:aadt?.value??null,
        aadt_field:aadt?.key??null,
        reporting_year:firstText(a,['Year','ReportingYear','AADTYear'])||null,
        source_name:'WSDOT Traffic Counts',
        source_url:WSDOT,
        evidence_state:'OBSERVED_VERIFIED'
      };
    }).filter((row)=>row.aadt!==null||row.latitude!==null);
    return {rows,status:rows.length?'ok':'empty',source_url:WSDOT};
  }catch(error){
    return {rows:[],status:'unavailable',source_url:WSDOT,error:error instanceof Error?error.message:String(error)};
  }
}

export async function fetchWashingtonUtility(location,{fetchImpl=fetch}={}){
  if(location.country_code!=='US'||location.state!=='WA') return {rows:[],status:'not_applicable'};
  const url=new URL(WA_UTILITIES);
  Object.entries({
    f:'json',where:'1=1',geometry:location.longitude+','+location.latitude,
    geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',
    outFields:'*',returnGeometry:'false'
  }).forEach(([k,v])=>url.searchParams.set(k,v));
  try{
    const data=await getJson(fetchImpl,url.toString());
    const rows=(Array.isArray(data?.features)?data.features:[]).map((feature)=>{
      const a=feature?.attributes||{};
      return {
        utility_name:firstText(a,['UTILITY','Utility','NAME','Name','Company','SERVPROV'])||'Utility service-area candidate',
        source_url:WA_UTILITIES,
        evidence_state:'OBSERVED_VERIFIED_SERVICE_AREA',
        raw_ref:Object.entries(a).slice(0,12).map(([key,value])=>({key,value:clean(value,240)}))
      };
    });
    return {rows,status:rows.length?'ok':'empty',source_url:WA_UTILITIES};
  }catch(error){
    return {rows:[],status:'unavailable',source_url:WA_UTILITIES,error:error instanceof Error?error.message:String(error)};
  }
}

export async function lookupAliEVSite(address,{
  mode='public_screen',
  fetchImpl=fetch,
  now=()=>new Date().toISOString(),
  nlrApiKey=process.env.NLR_API_KEY||process.env.AFDC_API_KEY||'DEMO_KEY'
}={}){
  const retrievedAt=now();
  const location=await geocodeAliEVAddress(address,{fetchImpl});
  const [charging,traffic,utility]=await Promise.all([
    fetchNearbyChargers(location,{fetchImpl,apiKey:nlrApiKey}),
    fetchWashingtonTraffic(location,{fetchImpl}),
    fetchWashingtonUtility(location,{fetchImpl})
  ]);
  const domains={
    geocoding:stateRow('OBSERVED_VERIFIED',1,'ok'),
    charging_inventory:stateRow(charging.status==='ok'||charging.status==='empty'?'OBSERVED_VERIFIED':'NOT_OBSERVABLE',charging.rows.length,charging.status),
    traffic:stateRow(traffic.status==='ok'||traffic.status==='empty'?'OBSERVED_VERIFIED':'NOT_OBSERVABLE',traffic.rows.length,traffic.status),
    utility_service_area:stateRow(utility.status==='ok'||utility.status==='empty'?'OBSERVED_VERIFIED':'NOT_OBSERVABLE',utility.rows.length,utility.status),
    provenance:stateRow('OBSERVED_VERIFIED',1+charging.rows.length+traffic.rows.length+utility.rows.length,'assembled')
  };
  for(const key of COVERAGE_DOMAINS) if(!domains[key]) domains[key]=stateRow('NOT_OBSERVABLE',0,'not_connected');

  const response={
    matched_address:location.matched_address,
    latitude:location.latitude,longitude:location.longitude,
    state:location.state,postal_code:location.postal_code,
    country_code:location.country_code,region:location.region,county:location.county,
    geocoder_source:location.geocoder_source,
    evidence_state:'VERIFIED/PUBLIC-SOURCE + EXPLICIT UNKNOWN',
    response_profile:mode==='rivet_report_snapshot'?'rivet_report_snapshot_v1':'public_screen_v2',
    access_policy:{public_access:mode!=='rivet_report_snapshot',commercial_access:mode==='rivet_report_snapshot'},
    chargers:charging.rows,
    charger_source_status:charging.status,
    charger_source_error:charging.error||null,
    charger_source_name:charging.source,
    charger_source_url:charging.source_url||null,
    traffic:traffic.rows,
    traffic_source_status:traffic.status,
    traffic_source_name:'WSDOT Traffic Counts',
    traffic_source_url:traffic.source_url||null,
    traffic_semantics:'WSDOT AADT is annual average daily traffic, not live congestion, footfall or charging sessions.',
    washington_utility_service_area_candidates:utility.rows,
    washington_utility_service_area_status:utility.status,
    utility_rate_candidates:[],
    incentives:[],
    nearby_observed_usage:[],
    dwell_anchors:[],
    freight_context:null,
    local_ev_stock:null,
    source_record_ids:[],
    public_signal_summary:{
      traffic_evidence:traffic.rows.length>0,
      utility_evidence:utility.rows.length>0,
      program_evidence:false,
      observed_usage_evidence:false
    },
    coverage_contract:{
      geocoding:{state:'OBSERVED_VERIFIED',value:location,confidence_pct:location.confidence_pct},
      charging_inventory:charging.status==='unavailable'
        ? {state:'NOT_OBSERVABLE',value:null,semantics:'Configured public charging source was unavailable. Missing is not zero.'}
        : {state:'OBSERVED_VERIFIED',value:charging.rows,semantics:'Mapped public charging inventory, not utilization.'},
      traffic:traffic.status==='unavailable'||traffic.status==='not_applicable'
        ? {state:'NOT_OBSERVABLE',value:null,semantics:'Traffic remains unobserved for this screening run.'}
        : {state:'OBSERVED_VERIFIED',value:traffic.rows,semantics:'Annual average daily traffic, not live congestion.'},
      utility_service_area:utility.status==='unavailable'||utility.status==='not_applicable'
        ? {state:'NOT_OBSERVABLE',value:null,semantics:'Utility service area remains unresolved.'}
        : {state:'OBSERVED_VERIFIED',value:utility.rows,semantics:'Service-area candidate evidence; tariff and capacity require confirmation.'},
      utility_tariff:{state:'NOT_OBSERVABLE',value:null,semantics:'Tariff assignment and site capacity require verified utility-specific diligence.'},
      incentives:{state:'NOT_OBSERVABLE',value:null,semantics:'Program eligibility is not inferred from geography alone.'},
      sessions_utilization:{state:'NOT_OBSERVABLE',value:null,semantics:'Candidate-site utilization is not observed before deployment.'},
      local_ev_stock:{state:'NOT_OBSERVABLE',value:null,semantics:'No owned active-stock adapter is connected in this source version.'},
      provenance_rule:'Missing observed data is never converted to zero. Observed, public, inferred and modeled states remain distinct.'
    },
    source_coverage_manifest:manifest(domains,retrievedAt),
    source_provenance:[
      {source_name:location.geocoder_source,source_url:location.source_url,state:'OBSERVED_VERIFIED'},
      {source_name:charging.source,source_url:charging.source_url||AFDC,state:charging.status==='unavailable'?'NOT_OBSERVABLE':'OBSERVED_VERIFIED'},
      {source_name:'WSDOT Traffic Counts',source_url:WSDOT,state:traffic.status==='unavailable'||traffic.status==='not_applicable'?'NOT_OBSERVABLE':'OBSERVED_VERIFIED'},
      {source_name:'Washington electric utility service areas',source_url:WA_UTILITIES,state:utility.status==='unavailable'||utility.status==='not_applicable'?'NOT_OBSERVABLE':'OBSERVED_VERIFIED'}
    ],
    retrieved_at:retrievedAt,
    source_runtime:'yard_evercraft_compute',
    base44_runtime_used:false
  };
  return response;
}
