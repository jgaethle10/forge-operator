/**
 * Read-only RFC 7946 public point bridge for Evercraft World Engine.
 * Produces a deterministic reference overlay, NOT a navigable or physical world.
 * No imagery, customer data, engineering permits, resource reserves, or simulation authority.
 */
export const REFERENCE_OVERLAY_SCHEMA='evercraft.world-engine.public-reference-overlay.v1';
const MAX_FEATURES=256;
const MAX_OFFSET_METERS=50_000;
const LON_SCALE=111_320;
const LAT_SCALE=111_320;
const REF_STATES=new Set(['sourced_point_only']);
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(code){throw new Error('public_reference_bridge:'+code);}
function numericCoordinate(value,axis){
  if(typeof value!=='number'||!Number.isFinite(value))fail('invalid_'+axis);
  if(axis==='latitude'&&Math.abs(value)>=85)fail('unsupported_latitude');
  if(axis==='longitude'&&Math.abs(value)>180)fail('invalid_longitude');
  return value;
}
function validateOrigin(origin){
  if(!isObj(origin))fail('origin_required');
  return {
    lat:numericCoordinate(origin.lat,'latitude'),
    lon:numericCoordinate(origin.lon,'longitude'),
  };
}
function safeId(x){
  if(typeof x!=='string'||! /^[a-zA-Z0-9_.:-]{1,96}$/.test(x))fail('invalid_id');
  return x;
}
function safeText(x,field){
  if(typeof x!=='string'||!x.trim()||x.length>500)fail('invalid_'+field);
  return x.trim();
}
function sourceUrl(x){
  const t=safeText(x,'source_url');
  if(!/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/|\?|#|$)/.test(t))fail('source_url_must_be_https');
  return t;
}
function validateFixture(collection){
  if(!isObj(collection)||collection.type!=='FeatureCollection'||!Array.isArray(collection.features))fail('invalid_feature_collection');
  if(!collection.features.length||collection.features.length>MAX_FEATURES)fail('invalid_feature_count');
  const m=collection.metadata;
  if(!isObj(m)||m.coord_units!=='WGS84 decimal degrees; lon,lat'||m.modeled_visuals_excluded!==true)fail('missing_truth_boundary');
  if(!Array.isArray(m.not_for)||!m.not_for.includes('civil engineering')||!m.not_for.includes('navigation'))fail('insufficient_authority_restrictions');
  return collection.features;
}
/**
 * @param {object} collection Point-only FeatureCollection with explicit source and authority metadata
 * @param {{lat:number,lon:number}} origin Fixed WGS84 origin; local tangent-plane approximation only
 * @returns {object} Read-only, non-physical overlay DTO
 */
export function compilePublicReferencePoints(collection,origin){
  const center=validateOrigin(origin);
  const input=validateFixture(collection);
  const seen=new Set();
  const points=input.map(feature=>{
    if(!isObj(feature)||feature.type!=='Feature'||!isObj(feature.geometry)||feature.geometry.type!=='Point')fail('point_geometry_only');
    const coords=feature.geometry.coordinates;
    if(!Array.isArray(coords)||coords.length!==2)fail('exact_lonlat_required');
    const lon=numericCoordinate(coords[0],'longitude');
    const lat=numericCoordinate(coords[1],'latitude');
    const id=safeId(feature.id);
    if(seen.has(id))fail('duplicate_id');seen.add(id);
    const p=feature.properties;
    if(!isObj(p)||!REF_STATES.has(p.geometry_state))fail('unsupported_geometry_authority');
    if(p.building_or_pad_footprint_state!=='not_provided'||p.engineering_approval!=='none')fail('physical_geometry_claim_forbidden');
    const title=safeText(p.name,'name');
    const reference=sourceUrl(p.source_url);
    const coordinateSource=safeText(p.coordinate_source,'coordinate_source');
    const x=(lon-center.lon)*LON_SCALE*Math.cos(center.lat*Math.PI/180);
    const z=-(lat-center.lat)*LAT_SCALE;
    if(Math.hypot(x,z)>MAX_OFFSET_METERS)fail('beyond_local_projection_bounds');
    return {
      id:'reference:'+id,
      name:title,
      wgs84:{lon,lat},
      localMetersApprox:{x,y:0,z},
      evidence:{sourceUrl:reference,coordinateSource,sourceState:'cited_unverified_reference_point'},
      authority:{coordinate:'public_reference_only',physicalExtent:false,engineering:false,navigation:false,launchOperations:false,collision:false,geology:false},
    };
  }).sort((a,b)=>a.id.localeCompare(b.id));
  return {
    schema:REFERENCE_OVERLAY_SCHEMA,
    origin:center,
    projection:'local_equirectangular_approximation_meters',
    coordinateOrder:'lon_lat',
    scaleFactor:1,
    evidenceState:'public_references_not_independently_survey_verified',
    decisionAuthority:false,
    isNavigable:false,
    isSimulation:false,
    isSurvey:false,
    sourceFeatureCount:input.length,
    points,
    blockers:['browser_visual_qa','survey_verification','engineering_authorization','release_gate'],
  };
}
