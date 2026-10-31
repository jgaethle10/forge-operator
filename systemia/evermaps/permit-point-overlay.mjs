/**
 * Official WA surface-mine reclamation permit POINTS, compared to WGS geology.
 * Approximate locations only; no owner/permittee details, title, or right to mine.
 */
import {LAND_SOURCE_CATALOG,validateLandSourceMetadata,validateWgsProvenance} from './land-context.mjs';
import {bboxForGeometry,auditGeojsonCollection} from './spatial-integrity.mjs';

const DEF=LAND_SOURCE_CATALOG.washingtonSurfacePermits;
const FIELDS=['OBJECTID','MINE_PERMIT_NUMBER','COUNTY_NAME','COMMODITY_DESC'];
const EPS=1e-10;

export function permitGeojsonQuery({county='Grant',offset=0,pageSize=100,countOnly=false}={}){
  if(county!=='Grant')throw new Error('Grant is the only verified pilot');
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>1000||
      !Number.isInteger(offset)||offset<0)throw new Error('Invalid paging');
  const p=new URLSearchParams({f:countOnly?'json':'geojson',where:"COUNTY_NAME='Grant'"});
  if(countOnly)p.set('returnCountOnly','true');
  else {
    p.set('outFields',FIELDS.join(','));p.set('returnGeometry','true');
    p.set('outSR','4326');p.set('orderByFields','OBJECTID ASC');
    p.set('resultOffset',String(offset));p.set('resultRecordCount',String(pageSize));
  }
  return DEF.url+'/query?'+p;
}
async function getJSON(url,fetchImpl,signal){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetchImpl(url,{headers:{accept:'application/json,application/geo+json'},signal});
      if(!response?.ok){
        const status=response?.status??'unknown';
        if([429,500,502,503,504].includes(status)&&attempt<2){
          await new Promise(resolve=>setTimeout(resolve,(attempt+1)*400));
          continue;
        }
        throw new Error('Permit source HTTP '+status);
      }
      const body=await response.json();
      if(body?.error){
        const code=Number(body.error.code);
        const detail=String(body.error.message??'unspecified').slice(0,180);
        if([429,500,502,503,504].includes(code)&&attempt<2){
          await new Promise(resolve=>setTimeout(resolve,(attempt+1)*400));
          continue;
        }
        throw new Error('WA DNR ArcGIS '+(Number.isFinite(code)?code:'error')+': '+detail);
      }
      if(!body||typeof body!=='object'||Array.isArray(body))
        throw new Error('Permit source returned invalid JSON shape');
      return body;
    }catch(error){
      if(signal?.aborted)throw error;
      if(attempt>=2||!/fetch failed|network|connection|timeout/i.test(String(error?.message??'')))throw error;
      await new Promise(resolve=>setTimeout(resolve,(attempt+1)*400));
    }
  }
  throw new Error('Permit source unavailable after bounded read-only retries');
}
export async function fetchGrantPermitPoints({fetchImpl=fetch,pageSize=100,
   now=()=>new Date().toISOString(),signal=AbortSignal.timeout(90000)}={}){
  const info=validateLandSourceMetadata('washingtonSurfacePermits',
     await getJSON(DEF.url+'?f=json',fetchImpl,signal));
  const readCount=async()=>{
    const value=await getJSON(permitGeojsonQuery({countOnly:true}),fetchImpl,signal);
    if(!Number.isSafeInteger(value.count)||value.count<0)throw new Error('Permit source count unavailable');
    return value.count;
  };
  const expected=await readCount();
  const features=[],ids=new Set();
  let pages=0;
  const maxPages=Math.max(1,Math.ceil(expected/pageSize)+1);
  while(features.length<expected&&pages<maxPages){
    const json=await getJSON(permitGeojsonQuery({offset:pages*pageSize,pageSize}),fetchImpl,signal);
    if(json.type!=='FeatureCollection'||!Array.isArray(json.features)||json.features.length===0||
       json.features.length>pageSize)throw new Error('Unexpected permit GeoJSON page');
    for(const f of json.features){
      const p=f?.properties,oid=p?.OBJECTID;
      if(!Number.isSafeInteger(oid)||ids.has(oid))throw new Error('Missing or duplicated permit OBJECTID');
      if(f?.geometry?.type!=='Point'||!Array.isArray(f.geometry.coordinates)||
         !FIELDS.every(k=>Object.hasOwn(p,k)))throw new Error('Invalid permit point or source fields');
      if(p.COUNTY_NAME!=='Grant')throw new Error('Permit point outside requested county field');
      ids.add(oid);features.push(f);
    }
    if(features.length>expected)throw new Error('Permit count exceeded start count');
    pages++;
  }
  const confirmed=await readCount();
  if(confirmed!==expected||features.length!==expected)throw new Error('Permit count drift or truncated source');
  const collection={type:'FeatureCollection',features,metadata:{
    source:DEF.url,publisher:'WA DNR',retrieved_at:now(),source_kind:DEF.kind,
    source_count_before:expected,source_count_after:confirmed,complete:true,
    source_metadata:info,
    fields_requested:FIELDS,
    approximation_note:DEF.limitation
  }};
  const quality=auditGeojsonCollection(collection,{sourceLabel:'WA DNR Grant reclamation permit points'});
  if(!quality.valid_for_mapping)throw new Error('Invalid permit geometry audit');
  collection.metadata.sha256_source_features=quality.sha256_source_features;
  return collection;
}
function onSegment(p,a,b){
  const abx=b[0]-a[0],aby=b[1]-a[1],apx=p[0]-a[0],apy=p[1]-a[1];
  const cross=abx*apy-aby*apx;
  if(Math.abs(cross)>EPS*Math.max(1,Math.hypot(abx,aby)))return false;
  return p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&
    p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
}
function locateRing(pt,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];
    if(onSegment(pt,a,b))return 'boundary';
    if((a[1]>pt[1])!==(b[1]>pt[1]) &&
       pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside?'inside':'outside';
}
export function locatePointInPolygon(point,geometry){
  if(!Array.isArray(point)||point.length<2||!point.slice(0,2).every(Number.isFinite))
    throw new Error('Invalid query point');
  if(!['Polygon','MultiPolygon'].includes(geometry?.type))throw new Error('Expected polygon');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  if(!Array.isArray(polygons))throw new Error('Invalid polygon coordinates');
  let boundary=false;
  for(const rings of polygons){
    const outer=locateRing(point,rings[0]);
    if(outer==='outside')continue;
    if(outer==='boundary'){boundary=true;continue;}
    let hole=false;
    for(const inner of rings.slice(1)){
      const location=locateRing(point,inner);
      if(location==='boundary')boundary=true;
      if(location!=='outside'){hole=true;break;}
    }
    if(!hole)return 'interior';
  }
  return boundary?'boundary':'outside';
}
export function joinPermitPointsToWgs({wgs,receipt,permits,county='Grant'}={}){
  const provenance=validateWgsProvenance({source:wgs,receipt,county});
  if(permits?.type!=='FeatureCollection'||!Array.isArray(permits.features)||
     permits.metadata?.complete!==true||
     permits.metadata?.source!==DEF.url||
     permits.metadata?.source_count_before!==permits.features.length||
     permits.metadata?.source_count_after!==permits.features.length) {
    throw new Error('Require full sourced permit point collection');
  }
  const audit=auditGeojsonCollection(permits,{sourceLabel:'WA DNR reclamation permit points'});
  if(!audit.valid_for_mapping||audit.sha256_source_features!==permits.metadata.sha256_source_features) {
    throw new Error('Permit geometry or source hash failed verification');
  }
  const polygons=wgs.features.map(f=>({id:f.properties.OBJECTID,
    classification:f.properties.CLASSIFICATION??'Unknown',
    geometry:f.geometry,box:bboxForGeometry(f.geometry)}));
  const CLASSES=['Demonstrated','Inferred','Speculative','Not a Resource','Not Analyzed','Unknown'];
  const classCounts=Object.fromEntries(CLASSES.map(key=>[key,0]));
  const rows=[];let within=0,boundary=0,outside=0;
  for(const p of permits.features){
    const point=p.geometry.coordinates;
    const interiorIds=[],boundaryIds=[],classificationMatches=[];
    for(const polygon of polygons){
      const b=polygon.box;
      if(point[0]<b[0]-EPS||point[0]>b[2]+EPS||
         point[1]<b[1]-EPS||point[1]>b[3]+EPS)continue;
      const relation=locatePointInPolygon(point,polygon.geometry);
      if(relation==='interior')interiorIds.push(polygon.id);
      else if(relation==='boundary')boundaryIds.push(polygon.id);
      if(relation==='interior'||relation==='boundary') {
        classificationMatches.push({
          resource_object_id:polygon.id,classification:polygon.classification,
          relation
        });
      }
    }
    for(const classification of new Set(classificationMatches.filter(
      row=>row.relation==='interior').map(row=>row.classification))) {
      classCounts[Object.hasOwn(classCounts,classification)?classification:'Unknown']++;
    }
    if(interiorIds.length)within++;
    else if(boundaryIds.length)boundary++;
    else outside++;
    rows.push({permit_source_object_id:p.properties.OBJECTID,
      matched_resource_interior_object_ids:interiorIds.sort((a,b)=>a-b),
      boundary_uncertainty_resource_object_ids:boundaryIds.sort((a,b)=>a-b),
      published_classification_context:classificationMatches.sort(
        (a,b)=>a.resource_object_id-b.resource_object_id),
      state:interiorIds.length?'approximate_permit_point_inside_geology_polygon':
        boundaryIds.length?'point_on_mapped_boundary_uncertain':'no_polygon_point_match'});
  }
  return {
    schema:'evercraft.evermaps.permit-point-overlay.v1',
    county,source:DEF.url,source_kind:DEF.kind,
    wgs_source_sha256:provenance.source_sha256,
    permit_source_sha256:audit.sha256_source_features,
    imported_resource_polygons:provenance.source_features,
    imported_approximate_permit_points:permits.features.length,
    point_relation_counts:{interior:within,boundary_uncertain:boundary,outside},
    point_inside_published_geological_classification_counts:classCounts,
    classification_counting_note:'Each approximate permit point is counted once per classification it intersects. Counts can overlap. WGS classification is NOT a finding about a permit site.',
    rows,
    legal_title_verified:false,
    operating_mine_status_verified:false,
    extraction_permit_granted_to_user:false,
    caveat:'WGS polygon and approximate WA reclamation-permit point geometries only. A point inside a polygon does NOT verify active mining, ownership, mineral rights, or authorized access.'
  };
}
