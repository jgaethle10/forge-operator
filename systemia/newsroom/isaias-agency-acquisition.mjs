import crypto from 'node:crypto';

export const ISAIAS_NHC_ADVISORY_8='https://www.nhc.noaa.gov/archive/2026/al09/al092026.public.008.shtml';
export const FEMA_SHELTERS_LAYER='https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/FeatureServer/0/query';

const sha256=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const isFiniteCoord=(a)=>Array.isArray(a)&&a.length>=2&&Number.isFinite(a[0])&&Number.isFinite(a[1])&&a[0]>=-180&&a[0]<=180&&a[1]>=-90&&a[1]<=90;
function assertOfficial(response,allowedHostname){
  const url=new URL(response?.url||'https://invalid.invalid/');
  if(url.protocol!=='https:'||url.hostname!==allowedHostname)throw new Error('official_response_origin_mismatch');
  if(!response?.ok)throw new Error('official_response_not_successful');
}
async function boundedText(response,maxBytes){
  const size=Number(response.headers?.get?.('content-length')||0);
  if(size>maxBytes)throw new Error('official_response_oversize');
  const raw=await response.text();
  if(Buffer.byteLength(raw,'utf8')>maxBytes)throw new Error('official_response_oversize');
  return raw;
}
function plainText(markup){
  return String(markup).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
    .replace(/[ \t]+/g,' ').replace(/\r/g,'');
}
export function parseIsaiasAdvisory8(raw){
  const text=plainText(raw);
  if(!/Hurricane\s+Isaias\b/i.test(text)||!/(?:Advisory\s+Number\s*:?[\s]*8\b|Advisory\s*#\s*8\b)/i.test(text)||!/\bAL092026\b/.test(text))
    throw new Error('nhc_advisory_identity_mismatch');
  if(!/1000\s+AM\s+CDT\s+Thu\s+Oct\s+08\s+2026/i.test(text)||!/\b1500\s+UTC\b/.test(text))
    throw new Error('nhc_advisory_issuance_mismatch');
  const pos=text.match(/LOCATION\.{2,}\s*(\d{1,2}\.\d)N\s+(\d{1,3}\.\d)W/i);
  const wind=text.match(/MAXIMUM\s+SUSTAINED\s+WINDS\.{2,}\s*(\d+)\s+MPH/i);
  const pressure=text.match(/MINIMUM\s+CENTRAL\s+PRESSURE\.{2,}\s*(\d+)\s+MB/i);
  if(!pos||!wind||!pressure)throw new Error('nhc_advisory_fields_not_verified');
  if(Number(pos[1])!==23.7||Number(pos[2])!==90.2||Number(wind[1])!==85||Number(pressure[1])!==975)
    throw new Error('nhc_advisory_values_do_not_match_locked_baseline');
  return {storm_id:'AL092026',advisory_number:8,issued_at:'2026-10-08T15:00:00Z',
    position:{latitude:23.7,longitude:-90.2},max_wind_mph:85,minimum_pressure_mb:975};
}
function normalizeFema(raw){
  let json;try{json=JSON.parse(raw);}catch{throw new Error('fema_invalid_json');}
  if(json?.error)throw new Error('fema_service_error_'+String(Number(json.error.code)||0));
  if(json?.type!=='FeatureCollection'||!Array.isArray(json.features))throw new Error('fema_geojson_required');
  if(json.features.length>4000)throw new Error('fema_page_limit_exceeded');
  if(json.features.some(f=>f.type!=='Feature'||f.geometry?.type!=='Point'||!isFiniteCoord(f.geometry.coordinates)))throw new Error('fema_geometry_invalid');
  const seen=new Set(),features=[];
  for(const feature of json.features){
    const p=feature.properties||{};
    const id=String(p.shelter_id??p.SHELTER_ID??'').trim();
    if(!id||id==='0'||seen.has(id))throw new Error('fema_shelter_id_missing_or_duplicate');
    seen.add(id);
    const status=String(p.shelter_status??p.SHELTER_STATUS??'').trim().toLowerCase()||null;
    // This is the agency's reported status at retrieval time, NOT a validated opening claim.
    features.push({type:'Feature',properties:{
      record_id:'FEMA-SHELTER-'+id,
      name:p.shelter_name??p.SHELTER_NAME??null,
      state:p.state??p.STATE??null,
      city:p.city??p.CITY??null,
      status
    },geometry:feature.geometry});
  }
  return {type:'FeatureCollection',features};
}
export async function acquireIsaiasReadOnly({fetchImpl=fetch,retrievedAt=new Date().toISOString()}={}){
  const options={method:'GET',redirect:'manual',headers:{accept:'text/html,application/geo+json,application/json'}};
  // Preserve a verified NHC receipt even if the unrelated FEMA endpoint is unavailable.
  const nhcResponse=await fetchImpl(ISAIAS_NHC_ADVISORY_8,options);
  assertOfficial(nhcResponse,'www.nhc.noaa.gov');
  const nhcRaw=await boundedText(nhcResponse,500000);
  const advisory=parseIsaiasAdvisory8(nhcRaw);
  const sourceReceipts=[{id:'NHC-AL092026-008',url:ISAIAS_NHC_ADVISORY_8,sha256:sha256(nhcRaw),
    retrieved_at:retrievedAt,advisory_issued_at:advisory.issued_at,semantic_role:'historical_advisory_not_latest'}];
  const femaUrl=new URL(FEMA_SHELTERS_LAYER);
  femaUrl.searchParams.set('where',"state IN ('AL','FL','MS','LA')");
  femaUrl.searchParams.set('outFields','shelter_id,shelter_name,state,city,shelter_status');
  femaUrl.searchParams.set('outSR','4326');
  femaUrl.searchParams.set('returnGeometry','true');
  femaUrl.searchParams.set('f','geojson');

  let facilities=null,facilityState='held',facilityError=null;
  try{
    const femaResponse=await fetchImpl(femaUrl.href,options);
    assertOfficial(femaResponse,'gis.fema.gov');
    const raw=await boundedText(femaResponse,6000000);
    facilities=normalizeFema(raw);
    facilityState='acquired_pending_status_review';
    sourceReceipts.push({id:'FEMA-OPEN-SHELTERS',url:femaUrl.href,sha256:sha256(raw),
      retrieved_at:retrievedAt,semantic_role:'agency_reported_shelter_rows_not_independently_open_verified'});
  }catch(e){
    facilityError=String(e instanceof Error?e.message:e).slice(0,100);
  }
  return {
    schema:'evercraft.isaias-agency-readonly-acquisition.v1',
    collected_at:retrievedAt,
    authority:'NHC + FEMA',
    status:facilities?'acquired_pending_independent_source_and_status_review':'nhc_verified_fema_held',
    advisory,facilities,facility_state:facilityState,facility_error:facilityError,
    source_receipts:sourceReceipts,
    forecast_polygon:null,
    public_hazard_intersections:null,
    confirmed_impacts:null,
    warning:'Historical NOAA advisory is verified independently of FEMA availability. No facility is endorsed as open and no polygon intersections or actual impacts are asserted.'
  };
}
