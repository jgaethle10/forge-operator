/**
 * Bounded publisher-side WGS polygon intersection evidence, not land-use eligibility.
 * No owner or sensitive species records are read: metadata + returnCountOnly.
 */
import {validateWgsProvenance} from './land-context.mjs';
import {SOURCES,layerMetadataUrl,verifyMetadata} from './planning-context.mjs';
import {bboxForGeometry} from './spatial-integrity.mjs';

const CLASSES=['Demonstrated','Inferred','Speculative','Not a Resource'];
export const SAMPLE_PER_CLASS=2;
export const MAX_QUERY_BODY_BYTES=180000;

function signedArea(ring){
 let n=0;
 for(let i=0;i<ring.length-1;i++)n+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
 return n;
}
export function publisherPolygonGeometry(geojson){
 bboxForGeometry(geojson);
 if(!['Polygon','MultiPolygon'].includes(geojson.type))throw Error('WGS polygon required');
 const polys=geojson.type==='Polygon'?[geojson.coordinates]:geojson.coordinates;
 const rings=[];
 for(const polygon of polys){
  for(let i=0;i<polygon.length;i++){
   const ring=polygon[i].map(pt=>pt.slice(0,2));
   const clockwise=signedArea(ring)<0;
   // ArcGIS outer rings clockwise, holes counterclockwise.
   const wantClockwise=i===0;
   rings.push(clockwise===wantClockwise?ring:ring.slice().reverse());
  }
 }
 if(rings.length===0)throw Error('Missing validated polygon rings');
 return {rings,spatialReference:{wkid:4326}};
}
export function chooseVerifiedWgsSample({source,receipt}){
 const provenance=validateWgsProvenance({source,receipt,county:'Grant'});
 const groups=Object.fromEntries(CLASSES.map(x=>[x,[]]));
 for(const f of source.features){
  const c=f?.properties?.CLASSIFICATION;
  if(Object.hasOwn(groups,c))groups[c].push(f);
 }
 const chosen=[];
 for(const c of CLASSES){
  groups[c].sort((a,b)=>a.properties.OBJECTID-b.properties.OBJECTID);
  for(const f of groups[c].slice(0,SAMPLE_PER_CLASS)){
   chosen.push({source_object_id:f.properties.OBJECTID,classification:c,geometry:f.geometry});
  }
 }
 if(chosen.length<1)throw Error('No WGS evidence classifications available for sample');
 return {provenance,chosen,selection:'first two OBJECTID values in each published class; not statistically representative'};
}
export function polygonCountRequest(kind,geometry){
 if(!SOURCES[kind])throw Error('Unknown planning source');
 const payload=publisherPolygonGeometry(geometry);
 const p=new URLSearchParams({
  f:'json',where:'1=1',returnCountOnly:'true',
  geometryType:'esriGeometryPolygon',geometry:JSON.stringify(payload),
  inSR:'4326',spatialRel:'esriSpatialRelIntersects'
 });
 const body=p.toString();
 if(new TextEncoder().encode(body).length>MAX_QUERY_BODY_BYTES)throw Error('Geometry exceeds bounded source query size');
 return {url:SOURCES[kind].url+'/query',
  init:{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body}};
}
async function request(url,init,fetchImpl,signal){
 const r=await fetchImpl(url,{...init,signal});
 if(!r?.ok)throw Error('Source HTTP '+(r?.status??'unknown'));
 const json=await r.json();
 if(!json||typeof json!=='object'||Array.isArray(json))throw Error('Invalid ArcGIS JSON');
 if(json.error)throw Error('ArcGIS '+(json.error.code??'error')+': '+String(json.error.message??'unknown').slice(0,100));
 return json;
}
export async function testGrantPolygonPlanningSample({source,receipt,fetchImpl=fetch,
 signal=AbortSignal.timeout(180000),now=()=>new Date().toISOString()}={}){
 const {provenance,chosen,selection}=chooseVerifiedWgsSample({source,receipt});
 const metadata={};
 for(const kind of Object.keys(SOURCES)){
  try{
   metadata[kind]={state:'verified',...verifyMetadata(kind,await request(layerMetadataUrl(kind),{},fetchImpl,signal))};
  }catch(error){
   metadata[kind]={state:'source_unverified',source:SOURCES[kind].url,
    reason:String(error?.message??error)};
  }
 }
 const rows=[];
 for(const f of chosen){
  const entry={wgs_resource_object_id:f.source_object_id,wgs_published_classification:f.classification,
   results:{},mining_eligibility:'not_determined'};
  for(const kind of Object.keys(SOURCES)){
   if(metadata[kind].state!=='verified'){
    entry.results[kind]={state:'source_unverified',count:null};
    continue;
   }
   try{
    const q=polygonCountRequest(kind,f.geometry);
    const json=await request(q.url,q.init,fetchImpl,signal);
    if(!Number.isSafeInteger(json?.count)||json.count<0)throw Error('Missing source count');
    entry.results[kind]={
     state:'publisher_polygon_intersection_count',
     matching_source_features:json.count,
     scope:'ArcGIS esriSpatialRelIntersects to original WGS polygon; not coverage fraction or legal validity'
    };
   }catch(error){
    entry.results[kind]={state:'intersection_unverified',matching_source_features:null,
     reason:String(error?.message??error)};
   }
  }
  rows.push(entry);
 }
 const all=rows.every(row=>Object.values(row.results).every(v=>
  v.state==='publisher_polygon_intersection_count'));
 return {
  schema:'evercraft.evermaps.planning-polygon-sample.v1',
  status:all?'sample_polygon_intersections_verified':'sample_incomplete_or_source_unavailable',
  observed_at:now(),county:'Grant',source_wgs_sha256:provenance.source_sha256,
  source_wgs_polygons:provenance.source_features,
  sample_feature_count:rows.length,selection_rule:selection,
  source_metadata:metadata,rows,
  all_wgs_polygons_checked:false,
  zoning_currentness_verified:false,
  environmental_clearance_verified:false,
  no_habitat_present_verified:false,
  land_rights_verified:false,
  commercial_recommendation_allowed:false,
  important_warning:'Sample is not representative. Zoning published 2018; DNR mixed land interests; WDFW PHS generalized and incomplete. Matching features do not indicate project eligibility; zero does not mean clear.'
 };
}
