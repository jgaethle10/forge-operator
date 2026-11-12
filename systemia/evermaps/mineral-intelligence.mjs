/** EverMaps Mineral Intelligence: regional evidence screening, NOT mineable reserves. */
export const WGS_RESOURCE_LAYER = 'https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Aggregate_Resources/FeatureServer/11';
export const WGS_DATASET_VERSION = 'Washington Geological Survey Digital Data Series 31 v3.0 (July 2026)';
export const MAP_MIN_DENOMINATOR = 24000;
const ORDER = new Map([['Demonstrated',0], ['Inferred',1], ['Speculative',2]]);
const FIELDS = [
  'OBJECTID','RESOURCE_ID','CLASSIFICATION','COMMODITY','THICKNESS_CLASSIFICATION',
  'RESOURCE_ACREAGE','COUNTY','GENERALIZED_UNIT','PUB_YEAR','COMMENTS'
].join(',');

export function buildAggregateQuery({county='Yakima',offset=0,pageSize=500}={}) {
  if (!/^[A-Za-z][A-Za-z -]{0,39}$/.test(county)) throw new Error('Invalid county label');
  if (!Number.isInteger(offset) || offset<0) throw new Error('Invalid offset');
  if (!Number.isInteger(pageSize) || pageSize<1 || pageSize>2000) throw new Error('Invalid page size');
  const params = new URLSearchParams({
    where: "COUNTY='" + county + "'",
    outFields: FIELDS, returnGeometry:'true', outSR:'4326',
    orderByFields:'OBJECTID ASC', resultOffset:String(offset),
    resultRecordCount:String(pageSize), f:'geojson'
  });
  return WGS_RESOURCE_LAYER + '/query?' + params;
}

export async function fetchAggregateResources({
  county='Yakima',pageSize=500,maxPages=20,fetchImpl=fetch,
  now=()=>new Date().toISOString()
}={}) {
  if (!Number.isInteger(maxPages)||maxPages<1||maxPages>100) throw new Error('Invalid maximum pages');
  const features=[];
  let complete=false, pagesFetched=0;
  for (let page=0;page<maxPages;page++) {
    const url=buildAggregateQuery({county,pageSize,offset:page*pageSize});
    const response=await fetchImpl(url,{headers:{accept:'application/geo+json,application/json'}});
    if (!response?.ok) throw new Error('WGS request failed (HTTP '+(response?.status??'unknown')+')');
    const payload=await response.json();
    if (payload?.error) throw new Error('WGS ArcGIS error: '+(payload.error.message??'unknown error'));
    if (payload?.type!=='FeatureCollection'||!Array.isArray(payload.features)) {
      throw new Error('WGS returned an unexpected response; screening aborted');
    }
    if (payload.features.length>pageSize) throw new Error('WGS response exceeded requested page size');
    features.push(...payload.features);
    pagesFetched++;
    if (payload.features.length<pageSize) {complete=true;break;}
  }
  return {
    type:'FeatureCollection',features,
    metadata:{
      source:WGS_RESOURCE_LAYER,publisher:'Washington Geological Survey',
      version:WGS_DATASET_VERSION,county,retrieved_at:now(),
      source_scale_min_denominator:MAP_MIN_DENOMINATOR,
      complete,pages_fetched:pagesFetched,
      warning:complete?null:'Result may be truncated; do not interpret absent polygons as absent resources.'
    }
  };
}

function normalize(feature) {
  const p=feature?.properties??{};
  const classification=typeof p.CLASSIFICATION==='string'?p.CLASSIFICATION.trim():null;
  const status=ORDER.has(classification)?'mapped_resource_evidence':
    classification==='Not a Resource'?'mapped_not_a_resource':'unknown_or_not_analyzed';
  const geom=feature?.geometry;
  const hasGeometry=['Polygon','MultiPolygon'].includes(geom?.type)&&
    Array.isArray(geom?.coordinates)&&geom.coordinates.length>0;
  const sourceId=p.RESOURCE_ID??p.OBJECTID??feature?.id??null;
  return {
    id:sourceId===null?null:'wgs-aggregate-'+String(sourceId),
    classification:classification||'Unknown',
    commodity:p.COMMODITY??null,county:p.COUNTY??null,
    acreage_reported:typeof p.RESOURCE_ACREAGE==='number'?p.RESOURCE_ACREAGE:null,
    thickness_classification:p.THICKNESS_CLASSIFICATION??null,
    geological_unit:p.GENERALIZED_UNIT??null,
    publication_year:p.PUB_YEAR??null,
    source_comments:p.COMMENTS??null,
    geometry:hasGeometry?geom:null,mapped_status:status,
    evidence:{
      kind:'published_geologic_classification',source:WGS_RESOURCE_LAYER,
      dataset_version:WGS_DATASET_VERSION,authoritative_field:'CLASSIFICATION',
      measured_grade:null,drilled_resource:null
    },
    unresolved:[
      'property ownership and mineral rights','current claim status and spatial accuracy',
      'zoning, protected areas and permitting','surface access and haul routing',
      'material sampling, engineering and economics'
    ]
  };
}

export function screenAggregateResources(collection) {
  if (collection?.type!=='FeatureCollection'||!Array.isArray(collection.features)) {
    throw new Error('A valid GeoJSON FeatureCollection is required');
  }
  const all=collection.features.map(normalize);
  const reviewQueue=all.filter(f=>f.mapped_status==='mapped_resource_evidence'&&f.geometry)
    .sort((a,b)=>ORDER.get(a.classification)-ORDER.get(b.classification)||
      String(a.id).localeCompare(String(b.id)));
  return {
    schema:'evercraft.evermaps.aggregate-screen.v1',
    conclusion:'published_geologic_evidence_only',
    disclaimer:'Not a prospectivity probability, mineable reserve, drilling target, property availability or permit decision.',
    original_resource_classification_is_not_a_mining_permit:true,
    source_metadata:collection.metadata??null,
    counts:{
      mapped_features:all.length,review_queue:reviewQueue.length,
      excluded_not_a_resource:all.filter(f=>f.mapped_status==='mapped_not_a_resource').length,
      unknown_or_not_analyzed:all.filter(f=>f.mapped_status==='unknown_or_not_analyzed').length,
      no_geometry:all.filter(f=>!f.geometry).length
    },
    research_queue:reviewQueue,
    remaining_features:all.filter(f=>f.mapped_status!=='mapped_resource_evidence'||!f.geometry),
    next_gate:'independent rights, zoning, access, permits, field sampling and professional geological review'
  };
}

export function queueToGeoJSON(screen) {
  return {
    type:'FeatureCollection',
    properties:{schema:screen.schema,source:WGS_RESOURCE_LAYER,conclusion:screen.conclusion},
    features:screen.research_queue.map(item=>({
      type:'Feature',id:item.id,geometry:item.geometry,
      properties:{
        resource_id:item.id,classification:item.classification,commodity:item.commodity,
        county:item.county,mapped_status:item.mapped_status,
        acreage_reported:item.acreage_reported,source_url:item.evidence.source,
        caveat:screen.disclaimer
      }
    }))
  };
}
