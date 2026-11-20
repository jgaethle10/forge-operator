// FEMA-owned National Flood Hazard Layer point-query adapter.
// Maps are regulatory hazard classifications, NOT proof that a location is safe,
// insurable, uninsurable, above a flood elevation, or eligible for a specific rate.
const ORIGIN='https://hazards.fema.gov';
const BASE=ORIGIN+'/arcgis/rest/services/public/NFHL/MapServer';
const LAYERS=Object.freeze({zone:28,panel:3});
const ALLOWED_FIELDS=Object.freeze({
  zone:['FLD_ZONE','ZONE_SUBTY','SFHA_TF','FLD_AR_ID','SOURCE_CIT','STATIC_BFE','DEPTH','VELOCITY','AR_REVERT'],
  panel:['FIRM_PAN','EFF_DATE','PANEL_TYP','SOURCE_CIT','DFIRM_ID']
});
export const OFFICIAL_FEMA_FLOOD_SOURCE=Object.freeze({
  service:BASE,
  zone_layer:BASE+'/28',
  panel_layer:BASE+'/3',
  map_center:'https://msc.fema.gov/portal/home',
  owner:'Federal Emergency Management Agency',
  evidence_scope:'effective National Flood Hazard Layer polygon intersecting exact input point'
});
const fail=(message)=>{throw new Error(message)};
function text(value,max=180){
  if(value===undefined||value===null)return null;
  const cleaned=String(value).replace(/[\u0000-\u001f]/g,' ').trim();
  return cleaned ? cleaned.slice(0,max) : null;
}
function numeric(value,min,max){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
function date(value){
  if(value===null||value===undefined||value==='')return null;
  const time=typeof value==='number'?value:Date.parse(value);
  if(!Number.isFinite(time))return null;
  const parsed=new Date(time);
  return parsed.getUTCFullYear()>=1950&&parsed.getUTCFullYear()<=2100?parsed.toISOString().slice(0,10):null;
}
export function validateFemaPoint(latitude,longitude){
  // Pilot matches site-scan continental US; no geocoding or coordinates inferred.
  const lat=Number(latitude),lon=Number(longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>50||lon< -125||lon> -66){
    throw new TypeError('fema_explicit_contiguous_us_point_required');
  }
  return {latitude:lat,longitude:lon};
}
export function femaPointLayerUrl(layer,{latitude,longitude}){
  if(![LAYERS.zone,LAYERS.panel].includes(layer))throw new Error('fema_layer_not_allowlisted');
  const point=validateFemaPoint(latitude,longitude);
  const params=new URLSearchParams({
    f:'json',
    where:'1=1',
    geometry:point.longitude.toFixed(6)+','+point.latitude.toFixed(6),
    geometryType:'esriGeometryPoint',
    inSR:'4326',
    spatialRel:'esriSpatialRelIntersects',
    outFields:'*',
    returnGeometry:'false',
    resultRecordCount:'6'
  });
  return BASE+'/'+layer+'/query?'+params.toString();
}
function allowlistedAttributes(value,kind){
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const out={};
  for(const key of ALLOWED_FIELDS[kind]){
    const field=input[key]??input[key.toLowerCase()];
    out[key]=key==='STATIC_BFE'||key==='DEPTH'||key==='VELOCITY'
      ? numeric(field,-10000,10000):key==='EFF_DATE'
      ? date(field):text(field,150);
  }
  return out;
}
export function parseFemaPointFeatures(payload,kind){
  if(!['zone','panel'].includes(kind))throw new Error('fema_invalid_kind');
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.error){
    throw new Error('fema_source_invalid_response');
  }
  if(!Array.isArray(payload.features)||payload.features.length>6||payload.exceededTransferLimit===true){
    throw new Error('fema_source_incomplete_or_unbounded');
  }
  if(payload.features.some(f=>!f||typeof f!=='object'||!f.attributes||typeof f.attributes!=='object')){
    throw new Error('fema_source_feature_malformed');
  }
  return payload.features.map(f=>allowlistedAttributes(f.attributes,kind));
}
async function queryFemaLayer(layer,kind,point,fetchImpl){
  const url=femaPointLayerUrl(layer,point);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetchImpl(url,{
      method:'GET',redirect:'error',signal:controller.signal,
      headers:{accept:'application/json','user-agent':'Evercraft-FAIE/1.0 (https://fabric.systemiacommandcenters.com/faie/)'}
    });
    if(!response?.ok)throw new Error('fema_official_http_'+String(response?.status??'unavailable'));
    const raw=await response.text();
    if(raw.length>300000)throw new Error('fema_source_response_too_large');
    let payload;
    try{payload=JSON.parse(raw);}catch{throw new Error('fema_invalid_json')}
    return {url,features:parseFemaPointFeatures(payload,kind)};
  }finally{clearTimeout(timeout)}
}
function zoneSummary(features){
  return features.map(f=>{
    const zone=f.FLD_ZONE,subtype=f.ZONE_SUBTY,sfha=f.SFHA_TF;
    // The T/F field is the only sanctioned binary classification. Null
    // remains "unknown", even for a zone label that sounds low risk.
    const specialFloodHazardArea=sfha==='T'?true:sfha==='F'?false:null;
    return {
      flood_zone:zone,
      zone_subtype:subtype,
      special_flood_hazard_area:specialFloodHazardArea,
      hazard_area_record_id:f.FLD_AR_ID,
      source_citation:f.SOURCE_CIT,
      mapped_base_flood_elevation:f.STATIC_BFE,
      mapped_elevation_unit:'feet (check FEMA vertical datum before use)',
      mapped_depth:f.DEPTH,
      mapped_velocity:f.VELOCITY
    };
  });
}
export async function collectFemaFloodAtPoint({
  latitude,longitude,fetchImpl=globalThis.fetch,
  retrievedAt=new Date().toISOString()
}={}){
  const point=validateFemaPoint(latitude,longitude);
  if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl_required');
  if(!Number.isFinite(Date.parse(retrievedAt)))throw new TypeError('retrievedAt_invalid');
  // Query exact point at WGS84 coordinates, never an inferred parcel polygon.
  const [zones,panel]=await Promise.allSettled([
    queryFemaLayer(LAYERS.zone,'zone',point,fetchImpl),
    queryFemaLayer(LAYERS.panel,'panel',point,fetchImpl)
  ]);
  // A successful zone query is required. No source, no claim about flood zone.
  if(zones.status!=='fulfilled')throw new Error('fema_hazard_zone_unverified');
  const matches=zoneSummary(zones.value.features);
  const panelRecords=panel.status==='fulfilled'?panel.value.features.map(f=>({
    firm_panel:f.FIRM_PAN,
    effective_date:f.EFF_DATE,
    panel_type:f.PANEL_TYP,
    source_citation:f.SOURCE_CIT
  })):[];
  const state=matches.length ? 'mapped_hazard_polygon_at_point'
    : panelRecords.length ? 'no_hazard_polygon_returned_with_panel_context'
    : 'zone_not_returned_coverage_unverified';
  return {
    schema:'evercraft.faie.fema-flood-point.v1',
    source:'FEMA National Flood Hazard Layer',
    source_family:'fema-effective-nfhl',
    evidence_state:'REPORTED',
    status:state,
    coordinates:point,
    retrieved_at:new Date(retrievedAt).toISOString(),
    study_scope:'Point intersection with effective FEMA NFHL; NOT a parcel-boundary or flood-depth study',
    hazard_polygons:matches,
    firm_panels:panelRecords,
    panel_lookup_status:panel.status==='fulfilled'?'returned':'unavailable',
    source_urls:[
      OFFICIAL_FEMA_FLOOD_SOURCE.zone_layer,
      OFFICIAL_FEMA_FLOOD_SOURCE.panel_layer,
      OFFICIAL_FEMA_FLOOD_SOURCE.map_center
    ],
    next_checks:[
      'Confirm the effective FIRM panel and any LOMR/LOMA affecting the property with FEMA and the local floodplain administrator.',
      'Review local drainage, flash flood, surface water, infrastructure and historical events; a missing mapped polygon does not establish safety.',
      'Request an insurer-specific quote; FEMA hazard classifications do not determine premium, coverage or insurability.',
      'For buildings, verify the actual parcel geometry, ground elevation, vertical datum and applicable local regulations.'
    ],
    limitations:[
      'FEMA flood mapping does not capture every possible flood, drainage or future climate scenario.',
      'NFHL point intersection is not a parcel map, flood insurance quote or flood-depth prediction.',
      'No returned polygon is NOT evidence that the location has no flood risk.',
      'FIRM panel absence and provider errors are data coverage gaps, not a safe-site verdict.'
    ],
    request_persisted:false,
    field_verification_required:true,
    insurance_premium_estimate:null,
    insurance_eligibility_decision:null,
    site_suitability_verdict:null,
    decision_authority:false,
    publication_authority:false
  };
}
