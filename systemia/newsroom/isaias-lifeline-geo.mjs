import crypto from 'node:crypto';

const SCHEMA='evercraft.isaias-geo-exposure.v1';
const stamp=(obj)=>crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
const validLonLat=(pair)=>Array.isArray(pair)&&pair.length>=2&&finite(pair[0])&&finite(pair[1])&&pair[0]>=-180&&pair[0]<=180&&pair[1]>=-90&&pair[1]<=90;

function ringHasPoint(point,ring){
  if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!validLonLat(p))) throw new Error('invalid_geojson_polygon_ring');
  const [x,y]=point;
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    const crossing=(yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi)/(yj-yi))+xi;
    if(crossing)inside=!inside;
  }
  return inside;
}
function polygonHasPoint(point,rings){
  if(!Array.isArray(rings)||!rings.length||!ringHasPoint(point,rings[0]))return false;
  for(let i=1;i<rings.length;i++)if(ringHasPoint(point,rings[i]))return false;
  return true;
}
export function geometryContainsPoint(geometry,point){
  if(!validLonLat(point))throw new Error('invalid_geojson_point');
  if(!geometry||typeof geometry!=='object')throw new Error('invalid_forecast_geometry');
  if(geometry.type==='Polygon')return polygonHasPoint(point,geometry.coordinates);
  if(geometry.type==='MultiPolygon')return geometry.coordinates.some(p=>polygonHasPoint(point,p));
  throw new Error('forecast_geometry_must_be_polygon');
}
function requireCollection(collection,geometryType){
  if(collection?.type!=='FeatureCollection'||!Array.isArray(collection.features))throw new Error('geojson_feature_collection_required');
  if(collection.crs&&String(collection.crs.properties?.name||'')!=='EPSG:4326')throw new Error('geospatial_crs_not_wgs84');
  for(const feature of collection.features){
    if(feature?.type!=='Feature'||!feature.geometry||!(geometryType==='polygon'
      ? ['Polygon','MultiPolygon'].includes(feature.geometry.type)
      : feature.geometry.type==='Point'))throw new Error('geojson_geometry_class_mismatch');
    if(geometryType==='point'&&!validLonLat(feature.geometry.coordinates))throw new Error('invalid_geojson_point');
  }
}
const held=(reason)=>({
  schema:SCHEMA,
  cyclone_id:'AL092026',
  state:'held',
  reason,
  forecast_exposure_candidates_count:null,
  confirmed_disruptions_count:null,
  candidate_facilities:null,
  source_validation:'not_established'
});
const officialForecast=(url)=>{try{
  const u=new URL(url);
  return u.protocol==='https:'&&['nhc.noaa.gov','www.nhc.noaa.gov'].includes(u.hostname);
}catch{return false;}};
export function joinIsaiasForecastAndLifelines({forecast,facilities,forecastEvidence,facilityEvidence}={}){
  if(!forecast||!facilities||!forecastEvidence||!facilityEvidence)return held('authoritative_input_missing');
  if(!officialForecast(forecastEvidence.source_url)||forecastEvidence.cyclone_id!=='AL092026')return held('nhc_source_identity_unverified');
  // A track cone is a forecast uncertainty envelope, not a storm surge, wind, or damage hazard.
  const semantics=String(forecastEvidence.layer_semantics||'');
  if(!['official_storm_surge_inundation','official_wind_probability_threshold'].includes(semantics))
    return held('forecast_layer_not_a_verified_hazard');
  if(semantics==='official_wind_probability_threshold'&&!Number.isFinite(forecastEvidence.threshold_percent))
    return held('wind_probability_threshold_missing');
  if(semantics==='official_storm_surge_inundation'&&!forecastEvidence.vertical_datum)
    return held('storm_surge_vertical_datum_missing');
  if(!/^https:\/\//.test(String(facilityEvidence.source_url||'')))return held('facility_source_unverified');
  if(!forecastEvidence.issued_at||!facilityEvidence.retrieved_at||!forecastEvidence.record_id||!facilityEvidence.record_id)
    return held('source_lineage_incomplete');
  requireCollection(forecast,'polygon');
  requireCollection(facilities,'point');
  const seen=new Set(),candidates=[];
  for(const facility of facilities.features){
    const id=String(facility.properties?.record_id||'').trim();
    if(!id||seen.has(id))throw new Error('facility_record_identity_missing_or_duplicated');
    seen.add(id);
    const point=facility.geometry.coordinates;
    const hits=forecast.features.filter(shape=>geometryContainsPoint(shape.geometry,point)).map(shape=>{
      const hazardId=String(shape.properties?.record_id||'').trim();
      if(!hazardId)throw new Error('forecast_hazard_record_id_missing');
      return hazardId;
    });
    if(!hits.length)continue;
    candidates.push({
      facility_record_id:id,
      source_status:facility.properties?.status??null,
      hazard_record_ids:hits,
      classification:'forecast_polygon_intersection_only',
      observed_disruption:null,
      source_feature_checksum:stamp(facility)
    });
  }
  return {
    schema:SCHEMA,
    cyclone_id:'AL092026',
    state:'candidate_intersections_only',
    source_validation:'caller_supplied_not_independently_authenticated',
    risk_geometry:'official_source_claim_to_be_verified_before_publication',
    forecast_exposure_candidates_count:candidates.length,
    confirmed_disruptions_count:null,
    candidate_facilities:candidates,
    forecast_evidence:{
      ...forecastEvidence,
      sha256:stamp(forecast)
    },
    facility_evidence:{
      ...facilityEvidence,
      sha256:stamp(facilities)
    },
    limitations:[
      'Point-in-polygon is not a risk model, forecast probability, or confirmed impact.',
      'Caller-supplied source metadata must be corroborated against original agency records before publication.',
      'Facility status is source-reported and may be stale.',
      'Longitude-latitude GeoJSON WGS84 only; no reprojecting or antimeridian handling.',
      'Missing disruptions remain null, not zero.'
    ]
  };
}
