/**
 * EverMaps phase 2: public land-record source discovery and coarse coverage,
 * never title verification, entitlement or commercial claimant harvesting.
 */
import {auditGeojsonCollection} from './spatial-integrity.mjs';

export const LAND_SOURCE_CATALOG = Object.freeze({
  federalClaims:{
    url:'https://nlsdbpubgis.blm.gov/arcgis/rest/services/Mining_Claims/MiningClaims/MapServer/1',
    geometryType:'esriGeometryPolygon',
    fields:['OBJECTID','CSE_NR','CSE_DISP','QLTY','GEO_STATE'],
    kind:'mapped_federal_mining_claim_cases',
    limitation:'BLM MLRS geocoding may be inaccurate or entirely absent. A mapped claim never verifies title or surface access.'
  },
  washingtonSurfacePermits:{
    url:'https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Active_Surface_Mine_Permit_Sites/MapServer/0',
    geometryType:'esriGeometryPoint',
    fields:['OBJECTID','MINE_PERMIT_NUMBER','COUNTY_NAME','COMMODITY_DESC'],
    kind:'approximate_reclamation_permit_point',
    limitation:'An active reclamation permit point does not establish operating status, extraction permission or proximity to any selected polygon.'
  },
  grantParcelPlanning:{
    url:'https://services.arcgis.com/33TOOklri9xpic7U/ArcGIS/rest/services/Grant_County_Interactive_Parcel_Map/FeatureServer/0',
    geometryType:'esriGeometryPolygon',
    fields:['FID','Name'],
    kind:'public_parcel_planning_geometry',
    limitation:'Assessment and planning only. Not a boundary survey, title, access right or authorization to use an owner list for commerce.'
  }
});
const KEYS=Object.keys(LAND_SOURCE_CATALOG);
export function validateWgsProvenance({source,receipt,county='Grant'}){
  if(source?.type!=='FeatureCollection'||!Array.isArray(source.features)||
    receipt?.status!=='source_geometry_complete_broad_phase_only'||
    receipt?.county!==county||receipt?.layers?.resources?.complete!==true||
    receipt?.layers?.resources?.geometry_audit?.valid_for_mapping!==true||
    receipt?.layers?.resources?.fetched_features!==source.features.length) {
    throw new Error('Complete county evidence and audit receipt required');
  }
  const a=auditGeojsonCollection(source,{sourceLabel:'WGS full Grant resources'});
  if(!a.valid_for_mapping||a.sha256_source_features!==receipt.layers.resources.geometry_audit.sha256_source_features) {
    throw new Error('WGS source geometry/digest mismatch');
  }
  if(a.bbox_entries.length<1)throw new Error('Cannot derive source footprint from empty data');
  const bbox=[Infinity,Infinity,-Infinity,-Infinity];
  for(const row of a.bbox_entries){
    bbox[0]=Math.min(bbox[0],row.box[0]);bbox[1]=Math.min(bbox[1],row.box[1]);
    bbox[2]=Math.max(bbox[2],row.box[2]);bbox[3]=Math.max(bbox[3],row.box[3]);
  }
  if(bbox[0]<-125||bbox[2]>-115||bbox[1]<44||bbox[3]>50) {
    throw new Error('Unexpected WGS regional coordinates; refuse unrestricted query');
  }
  return {bbox,source_sha256:a.sha256_source_features,source_features:a.record_count};
}
export function landSourceMetadataUrl(key){
  if(!LAND_SOURCE_CATALOG[key])throw new Error('Unknown land source');
  return LAND_SOURCE_CATALOG[key].url+'?f=json';
}
export function validateLandSourceMetadata(key,metadata){
  const def=LAND_SOURCE_CATALOG[key];
  if(!def)throw new Error('Unknown land source');
  if(metadata?.error||metadata?.geometryType!==def.geometryType||
     !Array.isArray(metadata?.fields)||!def.fields.every(field=>
       metadata.fields.some(f=>f.name===field))) throw new Error('Official GIS layer metadata drift: '+key);
  return {
    state:'source_metadata_verified',kind:def.kind,source:def.url,
    observed_geometry_type:metadata.geometryType,
    source_required_fields_present:true,
    max_record_count:metadata.maxRecordCount??null,
    last_edit_ms:metadata.editingInfo?.lastEditDate??null,
    important_limitation:def.limitation
  };
}
export function createLandCoverageQuery(key,{county='Grant',bbox}={}){
  if(!['federalClaims','washingtonSurfacePermits'].includes(key)) {
    throw new Error('No parcel-owner or parcel-record harvesting through land context');
  }
  if(county!=='Grant')throw new Error('Pilot currently requires verified Grant data');
  const p=new URLSearchParams({f:'json',returnCountOnly:'true'});
  if(key==='federalClaims'){
    if(!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||
       bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||
       bbox[0]<-125||bbox[2]>-115||bbox[1]<44||bbox[3]>50) {
      throw new Error('Invalid verified bounding box');
    }
    p.set('where','1=1');
    p.set('geometry',JSON.stringify({xmin:bbox[0],ymin:bbox[1],xmax:bbox[2],ymax:bbox[3],spatialReference:{wkid:4326}}));
    p.set('geometryType','esriGeometryEnvelope');
    p.set('inSR','4326');
    p.set('spatialRel','esriSpatialRelIntersects');
  }else {
    p.set('where',"COUNTY_NAME='Grant'");
  }
  return LAND_SOURCE_CATALOG[key].url+'/query?'+p;
}
async function request(url,fetchImpl,signal){
  const response=await fetchImpl(url,{signal,headers:{accept:'application/json'}});
  if(!response?.ok)throw new Error('Public source HTTP '+(response?.status??'unknown'));
  const json=await response.json();
  if(!json||typeof json!=='object'||Array.isArray(json)||json.error) {
    throw new Error('Public source returned malformed ArcGIS JSON');
  }
  return json;
}
export async function readLandCoverageEvidence({
  source,receipt,county='Grant',fetchImpl=fetch,signal=AbortSignal.timeout(90000),
  now=()=>new Date().toISOString()
}={}){
  const provenance=validateWgsProvenance({source,receipt,county});
  const result={
    schema:'evercraft.evermaps.land-source-coverage.v1',
    county,observed_at:now(),state:'source_probe_partial',
    source_wgs:provenance,results:{},
    land_title_verified:false,parcel_boundary_verified:false,
    active_extraction_authorized:false,commercial_outreach_list_created:false,
    disclosure:'Coverage counts are NOT parcel-level intersections, land rights, operation, clearance or absence of claims. No owner-list access or site-ranking conclusion.'
  };
  for(const key of KEYS){
    const def=LAND_SOURCE_CATALOG[key];
    try {
      const meta=await request(landSourceMetadataUrl(key),fetchImpl,signal);
      const info=validateLandSourceMetadata(key,meta);
      if(key==='grantParcelPlanning'){
        result.results[key]={...info,scope:'metadata_only_no_owner_records',record_count:null};
      }else {
        const q=createLandCoverageQuery(key,{county,bbox:provenance.bbox});
        const counts=await request(q,fetchImpl,signal);
        if(!Number.isSafeInteger(counts.count)||counts.count<0)throw new Error('Unverified coverage count');
        result.results[key]={
          ...info,scope:key==='federalClaims'?
            'published_mapped_claims_intersecting_WGS_county_source_ENVELOPE_only':
            'state_reclamation_permit_points_with_county_field_Grant',
          observed_record_count:counts.count,
          absence_or_eligibility_conclusion:'not_determined'
        };
      }
    }catch(error){
      result.results[key]={state:'source_unverified',kind:def.kind,source:def.url,
        reason:String(error?.message??error),limitation:def.limitation};
    }
  }
  result.state=KEYS.every(key=>result.results[key].state==='source_metadata_verified')?
    'source_metadata_and_coarse_counts_verified':'source_probe_partial';
  return result;
}
