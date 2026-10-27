/** Independent WGS evidence layers. No point-to-polygon inference or mineral reserve claims. */
import {WGS_RESOURCE_LAYER, WGS_DATASET_VERSION, screenAggregateResources, queueToGeoJSON} from './mineral-intelligence.mjs';

const BASE=WGS_RESOURCE_LAYER.replace(/\/11$/,'');
export const WGS_EVIDENCE_LAYERS=Object.freeze({
  resources:{id:11,fields:['OBJECTID','RESOURCE_ID','CLASSIFICATION','COMMODITY','THICKNESS_CLASSIFICATION','RESOURCE_ACREAGE','COUNTY','GENERALIZED_UNIT','PUB_YEAR','COMMENTS'],geometry:['Polygon','MultiPolygon']},
  tests:{id:1,fields:['OBJECTID','SITE_ID','TEST_NAME','COMMODITY','TEST_DATE','TEST_EXPIRATION','LA_ABRASION','DEGRADATION','RESULT','COUNTY','COMMENTS'],geometry:['Point']},
  mineHistory:{id:0,fields:['OBJECTID','SITE_ID','MINE_DESCRIPTION','COMMODITY','DATA_SOURCE','YEAR','COUNTY','COMMENTS'],geometry:['Point']},
  studies:{id:12,fields:['OBJECTID','STUDY_ID','CITATION','HYPERLINK','COUNTY'],geometry:['Polygon','MultiPolygon']}
});
const ALL_KEYS=Object.keys(WGS_EVIDENCE_LAYERS);
function checkCounty(county) {
  if (typeof county!=='string'|| !/^[A-Za-z][A-Za-z -]{0,39}$/.test(county)) throw new Error('Invalid county name');
}
function checkPageSize(pageSize) {
  if (!Number.isInteger(pageSize)||pageSize<1||pageSize>2000) throw new Error('Invalid page size');
}
export function wgsEvidenceQuery({kind,county='Grant',offset=0,pageSize=500,countOnly=false}={}) {
  checkCounty(county);checkPageSize(pageSize);
  if (!Number.isInteger(offset)||offset<0) throw new Error('Invalid offset');
  const layer=WGS_EVIDENCE_LAYERS[kind];
  if (!layer) throw new Error('Unknown WGS evidence layer');
  const params=new URLSearchParams({where:"COUNTY='"+county+"'",f:countOnly?'json':'geojson'});
  if (countOnly) params.set('returnCountOnly','true');
  else {
    params.set('outFields',layer.fields.join(','));
    params.set('returnGeometry','true');
    params.set('outSR','4326');
    params.set('orderByFields','OBJECTID ASC');
    params.set('resultOffset',String(offset));
    params.set('resultRecordCount',String(pageSize));
  }
  return BASE+'/'+layer.id+'/query?'+params;
}
async function requestJson(url,fetchImpl,signal) {
  const response=await fetchImpl(url,{headers:{accept:'application/json,application/geo+json'},signal});
  if (!response?.ok) throw new Error('WGS unavailable: HTTP '+(response?.status??'unknown'));
  const json=await response.json();
  if (!json||typeof json!=='object'||Array.isArray(json)) throw new Error('Invalid WGS JSON response');
  if (json.error) throw new Error('WGS ArcGIS error: '+String(json.error.message??'unknown'));
  return json;
}
async function countRecords(kind,county,fetchImpl,signal) {
  const json=await requestJson(wgsEvidenceQuery({kind,county,countOnly:true}),fetchImpl,signal);
  if (!Number.isSafeInteger(json.count)||json.count<0) throw new Error('WGS count unavailable for '+kind);
  return json.count;
}
export async function ingestWgsEvidenceLayer({
  kind,county='Grant',pageSize=500,maxPages=40,fetchImpl=fetch,
  now=()=>new Date().toISOString(),signal
}={}) {
  if (!WGS_EVIDENCE_LAYERS[kind]) throw new Error('Unknown WGS evidence layer');
  checkCounty(county);checkPageSize(pageSize);
  if (!Number.isInteger(maxPages)||maxPages<1||maxPages>100) throw new Error('Invalid maxPages');
  const source=BASE+'/'+WGS_EVIDENCE_LAYERS[kind].id;
  const expected=await countRecords(kind,county,fetchImpl,signal);
  const features=[],ids=new Set();
  let pages=0;
  while (features.length<expected && pages<maxPages) {
    const json=await requestJson(wgsEvidenceQuery({kind,county,offset:pages*pageSize,pageSize}),fetchImpl,signal);
    if (json.type!=='FeatureCollection'||!Array.isArray(json.features)) {
      throw new Error('Unexpected WGS GeoJSON for '+kind);
    }
    if (json.features.length===0||json.features.length>pageSize) {
      throw new Error('WGS page-size mismatch; aborted to avoid false completeness');
    }
    for (const feature of json.features) {
      const id=feature?.properties?.OBJECTID;
      if (!Number.isSafeInteger(id)) throw new Error('Missing OBJECTID in '+kind);
      if (ids.has(id)) throw new Error('Repeated OBJECTID across pages in '+kind);
      if (!WGS_EVIDENCE_LAYERS[kind].geometry.includes(feature?.geometry?.type)) {
        throw new Error('Unexpected geometry in '+kind);
      }
      ids.add(id);features.push(feature);
    }
    pages++;
    if (features.length>expected) throw new Error('More WGS features than counted in '+kind);
  }
  const confirmed=await countRecords(kind,county,fetchImpl,signal);
  if (confirmed!==expected) throw new Error('WGS count changed during scan: '+kind);
  const complete=features.length===expected;
  const metadata={
    source,source_title:kind,dataset:WGS_DATASET_VERSION,
    county,retrieved_at:now(),count_before:expected,count_after:confirmed,
    fetched_features:features.length,pages_fetched:pages,complete,
    spatial_reference:'EPSG:4326 (requested)',minimum_interpretation_scale:'1:24000',
    warning:complete?null:'INCOMPLETE SOURCE COVERAGE. Missing records are NOT missing resources.'
  };
  return {type:'FeatureCollection',features,metadata};
}
export async function createWgsEvidencePacket({county='Grant',pageSize=500,maxPages=40,fetchImpl=fetch,now,signal}={}) {
  const layers={};
  for (const kind of ALL_KEYS) {
    layers[kind]=await ingestWgsEvidenceLayer({kind,county,pageSize,maxPages,fetchImpl,now,signal});
  }
  const screening=screenAggregateResources(layers.resources);
  const complete=ALL_KEYS.every(k=>layers[k].metadata.complete);
  const canRelease=complete && layers.studies.features.length>0;
  return {
    schema:'evercraft.evermaps.aggregate-evidence-packet.v1',county,
    status:canRelease?'evidence_for_human_review':'coverage_review_required',
    summary:{
      source_layer_counts:Object.fromEntries(ALL_KEYS.map(k=>[k,layers[k].metadata])),
      study_coverage_verified:false,
      warning:'Study-area geometry requires spatial intersection review; county membership does not prove full mapped coverage.'
    },
    mapped_research_queue:queueToGeoJSON(screening),
    reference_layers:{
      materialTests:layers.tests,
      historicalMineSites:layers.mineHistory,
      studyAreas:layers.studies
    },
    caveats:[
      'WGS historical active-mine labels refer to identification-era observations, not current operation.',
      'Nearby test sites are NOT proof of a given resource polygon\'s composition or strength.',
      'County-level grouping does NOT prove a resource polygon falls within the study area.',
      'BLM mining claims and legal access require independent title and permitting checks.',
      'Source classifications are not reserves, valuations, profitability, or mining recommendations.'
    ]
  };
}
