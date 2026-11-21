/** Read-only coarse GIS planning context, NEVER legal permission. */
import {validateWgsProvenance} from './land-context.mjs';
export const SOURCES=Object.freeze({
 zoning:{url:'https://services2.arcgis.com/hQZvdtFxRzJpMtdS/ArcGIS/rest/services/Zoning/FeatureServer/0',
  fields:['OBJECTID','ZoneDesig','ZONECODE'],vintage:'Published 2018 zoning GIS, not verified current zoning',
  authority:'Grant County Planning',note:'Verify adopted county zoning ordinances and municipal jurisdiction before any use.'},
 dnr:{url:'https://gis.dnr.wa.gov/site3/rest/services/Public_Boundaries/WADNR_PUBLIC_Cadastre_OpenData/FeatureServer/6',
  fields:['OBJECTID','PARCEL_TYPE_CD','PARCEL_SYST_ID'],vintage:'WA DNR live metadata; subsets incomplete',
  authority:'Washington DNR',note:'Mapped DNR interests include ownership, easements, leases and other categories. No permission or title proof.'},
 habitat:{url:'https://geodataservices.wdfw.wa.gov/arcgis/rest/services/PHSOnTheWeb/PHSOnTheWebPublic/MapServer/3',
  fields:['OBJECTID','Display_Resolution_Desc'],vintage:'WDFW statewide public Priority Habitats and Species public polygons',
  authority:'Washington Department of Fish and Wildlife',
  note:'Public PHS habitat observation polygons with variable location generalization and incomplete survey coverage. Not a protected-land boundary, project approval, clearance or absence-of-species result. Do not disclose or collect species-level details.'}
});
export function layerMetadataUrl(kind){
 if(!SOURCES[kind])throw Error('Unknown planning layer');
 return SOURCES[kind].url+'?f=json';
}
export function spatialCountUrl(kind,bbox){
 if(!SOURCES[kind])throw Error('Unknown planning layer');
 if(!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||
 bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||
 bbox[0]<-125||bbox[2]>-115||bbox[1]<44||bbox[3]>50)throw Error('Invalid verified WGS envelope');
 const geometry={xmin:bbox[0],ymin:bbox[1],xmax:bbox[2],ymax:bbox[3],spatialReference:{wkid:4326}};
 const p=new URLSearchParams({f:'json',where:'1=1',returnCountOnly:'true',
  geometry:JSON.stringify(geometry),geometryType:'esriGeometryEnvelope',
  inSR:'4326',spatialRel:'esriSpatialRelIntersects'});
 return SOURCES[kind].url+'/query?'+p;
}
export function verifyMetadata(kind,metadata){
 const src=SOURCES[kind];
 if(!src)throw Error('Unknown planning layer');
 if(metadata?.error||metadata?.geometryType!=='esriGeometryPolygon'||
  !Array.isArray(metadata?.fields)||!src.fields.every(field=>metadata.fields.some(f=>f.name===field)))
   throw Error('Planning source schema mismatch: '+kind);
 return {source:src.url,publisher:src.authority,vintage:src.vintage,limitation:src.note,
  last_edit_ms:metadata.editingInfo?.lastEditDate??null};
}
async function read(url,fetchImpl,signal){
 const r=await fetchImpl(url,{signal,headers:{accept:'application/json'}});
 if(!r?.ok)throw Error('Public source HTTP '+(r?.status??'unknown'));
 const j=await r.json();
 if(!j||typeof j!=='object'||Array.isArray(j)||j.error)throw Error('Source JSON unavailable');
 return j;
}
export async function probeGrantPlanning({source,receipt,fetchImpl=fetch,
 signal=AbortSignal.timeout(90000),now=()=>new Date().toISOString()}={}){
 const wgs=validateWgsProvenance({source,receipt,county:'Grant'});
 const results={};
 for(const [kind,src] of Object.entries(SOURCES)){
  try{
   const meta=verifyMetadata(kind,await read(layerMetadataUrl(kind),fetchImpl,signal));
   const count=await read(spatialCountUrl(kind,wgs.bbox),fetchImpl,signal);
   if(!Number.isSafeInteger(count?.count)||count.count<0)throw Error('Invalid spatial count');
   results[kind]={status:'source_metadata_and_count_verified',...meta,
    envelope_matching_features:count.count,
    note:'Bounding envelope count only, not Grant-only, not resource-polygon overlap or land-use clearance.'};
  }catch(error){results[kind]={status:'unverified',source:src.url,
    envelope_matching_features:null,reason:String(error.message),vintage:src.vintage};}
 }
 return {schema:'evercraft.evermaps.grant-planning-probe.v1',county:'Grant',checked_at:now(),
  state:Object.values(results).every(r=>r.status==='source_metadata_and_count_verified')?
    'coarse_sources_verified':'coarse_sources_partial',
  wgs_source_sha256:wgs.source_sha256,wgs_count:wgs.source_features,bbox:wgs.bbox,
  results,per_polygon_zoning_verified:false,legal_mining_eligibility_verified:false,
  land_title_verified:false,environmental_clearance_verified:false,
  commercial_site_recommendation_allowed:false,
  caveat:'Only source availability and rough envelope overlap. No owner records, zoning approvals, protected land clearance, mineral rights or extraction permission.'};
}
