/** Server-side spatial relationship from publisher geometry. Read-only and research-only. */
import {WGS_EVIDENCE_LAYERS,wgsEvidenceQuery} from './aggregate-evidence.mjs';

const BASE=wgsEvidenceQuery({kind:'resources',county:'Grant',countOnly:true}).split('/11/query?')[0];
const STUDY=BASE+'/'+WGS_EVIDENCE_LAYERS.studies.id;
const RESOURCE=BASE+'/'+WGS_EVIDENCE_LAYERS.resources.id;

function safeCounty(county) {
  if(typeof county!=='string'||!/^[A-Za-z][A-Za-z -]{0,39}$/.test(county)) throw new Error('Invalid county name');
  return "COUNTY='"+county+"'";
}
async function getJson(url,{fetchImpl,init}={}) {
  const response=await fetchImpl(url,init);
  if(!response?.ok) throw new Error('WGS spatial query HTTP '+(response?.status??'unknown'));
  const result=await response.json();
  if(!result||typeof result!=='object'||result.error) {
    throw new Error('WGS spatial query error: '+String(result?.error?.message??'bad JSON'));
  }
  return result;
}
export function studyQueryUrl(county='Grant') {
  const params=new URLSearchParams({
    where:safeCounty(county),returnGeometry:'true',outFields:'OBJECTID',
    outSR:'4326',f:'json',orderByFields:'OBJECTID ASC'
  });
  return STUDY+'/query?'+params.toString();
}
export function spatialRelationPost({county='Grant',geometry,relation}) {
  if(!['esriSpatialRelIntersects','esriSpatialRelWithin'].includes(relation)) throw new Error('Unsafe spatial relation');
  if (!geometry||!Array.isArray(geometry.rings)||geometry.rings.length<1) throw new Error('Invalid publisher study polygon');
  const params=new URLSearchParams({
    f:'json',where:safeCounty(county),
    geometryType:'esriGeometryPolygon',geometry:JSON.stringify({
      rings:geometry.rings,spatialReference:{wkid:4326}
    }),
    inSR:'4326',spatialRel:relation,returnIdsOnly:'true'
  });
  return {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params.toString()};
}
function readIds(json) {
  if(!Array.isArray(json?.objectIds)) throw new Error('WGS did not return ArcGIS objectIds');
  const ids=json.objectIds;
  if(!ids.every(Number.isSafeInteger)||new Set(ids).size!==ids.length) throw new Error('Bad or repeated WGS objectIds');
  return ids;
}
export async function verifyPublisherStudyJoins({county='Grant',sourceIds,fetchImpl=fetch,
  signal=AbortSignal.timeout(180000)}={}) {
  if(!Array.isArray(sourceIds)||sourceIds.length===0||new Set(sourceIds).size!==sourceIds.length||
     !sourceIds.every(Number.isSafeInteger)) throw new Error('Require full unique imported resource ids');
  const study=await getJson(studyQueryUrl(county),{fetchImpl,init:{signal}});
  if(!Array.isArray(study.features)||study.features.length<1) throw new Error('No publisher study geometry');
  const universe=new Set(sourceIds);
  const intersection=new Set(),within=new Set(),studyIds=[];
  for(const row of study.features) {
    const studyId=row?.attributes?.OBJECTID;
    if(!Number.isSafeInteger(studyId)) throw new Error('Study feature ID missing');
    studyIds.push(studyId);
    for (const [relation,dest] of [
      ['esriSpatialRelIntersects',intersection],
      ['esriSpatialRelWithin',within]
    ]) {
      const init=spatialRelationPost({county,geometry:row.geometry,relation});
      const raw=await getJson(RESOURCE+'/query',{fetchImpl,init:{...init,signal}});
      for(const id of readIds(raw)) {
        if(!universe.has(id)) throw new Error('Publisher spatial results contain non-imported IDs');
        dest.add(id);
      }
    }
  }
  if([...within].some(id=>!intersection.has(id))) throw new Error('Within set is not a subset of intersects');
  return {
    schema:'evercraft.evermaps.wgs-publisher-study-join.v1',
    county,checked_at:new Date().toISOString(),
    status:'publisher_spatial_relations_verified',
    method:'WGS ArcGIS server esriSpatialRelIntersects and esriSpatialRelWithin against published study polygon',
    source_layer:RESOURCE,study_layer:STUDY,study_ids:studyIds,
    source_imported_resource_count:sourceIds.length,
    polygon_intersects_study_count:intersection.size,
    polygon_within_study_count:within.size,
    polygon_does_not_intersect_study_count:sourceIds.length-intersection.size,
    intersects_resource_ids:[...intersection].sort((a,b)=>a-b),
    within_resource_ids:[...within].sort((a,b)=>a-b),
    disclaimer:'Geologic study membership only; no mineral rights, economic viability, environmental approval, or site selection.'
  };
}
