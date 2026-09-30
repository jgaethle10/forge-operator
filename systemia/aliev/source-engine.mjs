import { queryAliEvDomain } from './domain-store.mjs';

const REQUIRED_DOMAINS=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];
const clean=(v)=>String(v??'').trim();
const arr=(v)=>Array.isArray(v)?v:[];
const n=(v)=>{const x=Number(v);return Number.isFinite(x)?x:null;};

function publicRecord(row){
  const { _meta, _distance_miles, ...record }=row||{};
  const distance=n(_distance_miles);
  if(distance!==null && record.distance_miles===undefined) record.distance_miles=Math.round(distance*100)/100;
  if(_meta?.source){
    if(!record.source_name&&_meta.source.name) record.source_name=_meta.source.name;
    if(!record.source_url&&_meta.source.url) record.source_url=_meta.source.url;
    if(!record.source_vintage&&_meta.source.vintage) record.source_vintage=_meta.source.vintage;
    if(!record.evidence_state&&_meta.source.evidence_state) record.evidence_state=_meta.source.evidence_state;
    if(!record.data_status&&_meta.source.data_status) record.data_status=_meta.source.data_status;
  }
  return record;
}
function coverage(state,count,sourceStatus){
  return {state,record_count:count,source_status:sourceStatus||null};
}
function refs(rows){
  const out=new Set();
  for(const row of rows){
    const url=clean(row?.source_url||row?._meta?.source?.url);
    if(/^https?:\/\//i.test(url)) out.add(url);
  }
  return [...out];
}
function records(stateDir,domain,query){
  return queryAliEvDomain({stateDir,domain,...query}).map(publicRecord);
}

export async function censusOnelineGeocode(address,{fetchImpl=fetch,endpoint='https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'}={}){
  const url=new URL(endpoint);
  url.searchParams.set('address',clean(address));
  url.searchParams.set('benchmark','Public_AR_Current');
  url.searchParams.set('vintage','Current_Current');
  url.searchParams.set('format','json');
  const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'Evercraft-AliEV/1.0'}});
  if(!response.ok) throw new Error('geocoder_http_'+response.status);
  const body=await response.json();
  const match=body?.result?.addressMatches?.[0];
  if(!match) throw new Error('geocoder_no_match');
  const components=match.addressComponents||{};
  const lat=n(match.coordinates?.y),lon=n(match.coordinates?.x);
  if(lat===null||lon===null) throw new Error('geocoder_coordinates_missing');
  return {
    matched_address:clean(match.matchedAddress||address),
    latitude:lat,
    longitude:lon,
    state:clean(components.state),
    postal_code:clean(components.zip),
    city:clean(components.city),
    source_name:'US Census Geocoder',
    source_url:url.origin+url.pathname,
    evidence_state:'OFFICIAL_GEOCODE',
  };
}

export async function buildOwnedAliEvSiteSnapshot({
  address,
  domainStateDir,
  geocode=censusOnelineGeocode,
  now=()=>new Date().toISOString(),
}={}){
  if(!clean(address)) throw new Error('address_required');
  if(!domainStateDir) throw new Error('domainStateDir is required');
  const geo=await geocode(address);
  const latitude=n(geo?.latitude),longitude=n(geo?.longitude);
  if(latitude===null||longitude===null) throw new Error('geocoding_coordinates_required');
  const state=clean(geo?.state);
  const postal=clean(geo?.postal_code);
  const near=(domain,radiusMiles,limit=50)=>records(domainStateDir,domain,{latitude,longitude,radiusMiles,limit});
  const regional=(domain,limit=50)=>records(domainStateDir,domain,{state,limit});
  const postalRows=(domain,limit=50)=>{
    const exact=postal?records(domainStateDir,domain,{postalCode:postal,limit}):[];
    return exact.length?exact:regional(domain,limit);
  };

  const chargers=near('charging_inventory',15,80);
  const traffic=near('traffic',15,40);
  const trafficProfiles=near('traffic_temporal',20,40);
  const observedUsage=near('observed_sessions',20,60);
  const utilityAreas=postalRows('utility_service_area',30);
  const tariffs=postalRows('utility_tariff',40);
  const incentives=regional('incentives',60);
  const parcel=near('parcel_planning',1.5,20);
  const stock=regional('local_ev_stock',20);
  const freight=near('freight',30,50);
  const dwell=near('dwell_context',15,50);
  const market=regional('deep_market_evidence',50);

  const allRows=[...chargers,...traffic,...trafficProfiles,...observedUsage,...utilityAreas,...tariffs,...incentives,...parcel,...stock,...freight,...dwell,...market];
  const sourceRefs=[clean(geo?.source_url),...refs(allRows)].filter(Boolean);
  const sourceRecordIds=allRows.map((row,i)=>clean(
    row.record_key||row.external_id||row.aggregate_key||row.profile_key||row.snapshot_key||row.evidence_key||row.id||('owned-domain-'+i)
  )).filter(Boolean);

  const domains={
    geocoding:coverage('CONNECTED',1,clean(geo?.source_name)||'owned_geocoder'),
    charging_inventory:coverage(chargers.length?'CONNECTED':'NOT_OBSERVABLE',chargers.length,chargers.length?'owned_domain_store':'no_records_in_radius'),
    traffic:coverage(traffic.length?'CONNECTED':'NOT_OBSERVABLE',traffic.length,traffic.length?'owned_domain_store':'no_records_in_radius'),
    traffic_temporal:coverage(trafficProfiles.length?'CONNECTED':'NOT_OBSERVABLE',trafficProfiles.length,trafficProfiles.length?'owned_domain_store':'no_records_in_radius'),
    utility_service_area:coverage(utilityAreas.length?'CANDIDATE_PRESENT_NOT_SERVICE_POINT_VERIFIED':'NOT_OBSERVABLE',utilityAreas.length,utilityAreas.length?'owned_domain_store':'no_matching_records'),
    utility_tariff:coverage(tariffs.length?'CONNECTED_CANDIDATE_NOT_SERVICE_POINT_VERIFIED':'NOT_OBSERVABLE',tariffs.length,tariffs.length?'owned_domain_store':'no_matching_records'),
    incentives:coverage(incentives.length?'CONNECTED_ELIGIBILITY_UNVERIFIED':'NOT_OBSERVABLE',incentives.length,incentives.length?'owned_domain_store':'no_matching_records'),
    parcel_planning:coverage(parcel.length?'CONNECTED':'NOT_OBSERVABLE',parcel.length,parcel.length?'owned_domain_store':'no_records_in_radius'),
    local_ev_stock:coverage(stock.length?'STATE_LEVEL_PROXY_ONLY':'NOT_OBSERVABLE',stock.length,stock.length?'owned_domain_store':'no_matching_records'),
    observed_sessions:coverage(observedUsage.length?'OBSERVED_VERIFIED':'NOT_OBSERVABLE',observedUsage.length,observedUsage.length?'owned_domain_store':'no_permissioned_records_in_radius'),
    freight:coverage(freight.length?'REGIONAL_EVIDENCE_PRESENT_ADDRESS_BINDING_UNVERIFIED':'NOT_OBSERVABLE',freight.length,freight.length?'owned_domain_store':'no_records_in_radius'),
    dwell_context:coverage(dwell.length?'CONTEXT_PRESENT':'NOT_OBSERVABLE',dwell.length,dwell.length?'owned_domain_store':'no_records_in_radius'),
    deep_market_evidence:coverage(market.length?'CONNECTED':'NOT_OBSERVABLE',market.length,market.length?'owned_domain_store':'no_matching_records'),
    provenance:coverage(sourceRefs.length?'CONNECTED':'PARTIAL',sourceRefs.length,sourceRefs.length?'owned_domain_provenance':'geocoder_only')
  };

  return {
    response_profile:'rivet_report_snapshot_v1',
    evidence_state:'SOURCE_BACKED_OWNED_DOMAIN_ENGINE',
    access_policy:{tier:'team',commercial_access:true,authority:'systemia_machine'},
    matched_address:clean(geo?.matched_address||address),
    requested_address:clean(address),
    latitude,longitude,state,postal_code:postal,city:clean(geo?.city),
    retrieved_at:now(),
    source_coverage_manifest:{
      schema:'evercraft.rivet.source-coverage.v1',
      generated_at:now(),
      domains,
      semantics:'Every report-relevant source domain is explicit. Missing is never zero; candidate utility, tariff and incentive records remain unverified until site-specific eligibility is confirmed.'
    },
    coverage_contract:{
      utility_service_area:{state:domains.utility_service_area.state},
      utility_tariff:{state:domains.utility_tariff.state},
      sessions_utilization:{state:domains.observed_sessions.state},
    },
    traffic,
    traffic_profiles:trafficProfiles,
    traffic_source_status:domains.traffic.state,
    traffic_source_name:clean(traffic[0]?.source_name)||null,
    traffic_source_url:clean(traffic[0]?.source_url)||null,
    chargers,
    charger_source_status:domains.charging_inventory.state,
    charger_source_name:clean(chargers[0]?.source_name)||null,
    nearby_observed_usage:observedUsage,
    utility_service_area_candidates:utilityAreas,
    utility_rate_candidates:tariffs,
    utility_rate_candidate_utilities:[...new Set(tariffs.map(x=>clean(x.utility_name)).filter(Boolean))],
    utility_rate_source_status:domains.utility_tariff.state,
    incentives,
    incentive_source_status:domains.incentives.state,
    parcel_planning:parcel,
    site_diligence:parcel.length?{records:parcel,evidence_state:'SOURCE_BACKED'}:null,
    local_ev_stock:stock[0]||null,
    local_ev_stock_status:domains.local_ev_stock.state,
    freight_context:freight,
    dwell_anchors:dwell,
    dwell_source_status:domains.dwell_context.state,
    deep_market_evidence:market,
    deep_evidence_semantics:'Owned domain records retain their source and evidence-state metadata; absence is not evidence of zero.',
    source_record_ids:sourceRecordIds,
    source_refs:[...new Set(sourceRefs)],
    owned_domain_engine:{
      schema:'evercraft.aliev.owned-domain-engine.v1',
      required_domains:REQUIRED_DOMAINS.length,
      queried_at:now(),
      precomputed_snapshot_required:false,
    }
  };
}
