import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {LAND_SOURCE_CATALOG} from './land-context.mjs';
import {
  permitGeojsonQuery,fetchGrantPermitPoints,locatePointInPolygon,joinPermitPointsToWgs
} from './permit-point-overlay.mjs';

const rect=(x1,y1,x2,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]];
const poly=(...rings)=>({type:'Polygon',coordinates:rings});
const wgs={type:'FeatureCollection',features:[{type:'Feature',
  properties:{OBJECTID:1,CLASSIFICATION:'Demonstrated'},
  geometry:poly(rect(-119.9,46.2,-119.1,46.9))}]};
const wgsHash=auditGeojsonCollection(wgs).sha256_source_features;
const wgsReceipt={status:'source_geometry_complete_broad_phase_only',county:'Grant',
  layers:{resources:{complete:true,fetched_features:1,
    geometry_audit:{valid_for_mapping:true,sha256_source_features:wgsHash}}}};
const p=(id,coordinates)=>({type:'Feature',properties:{
  OBJECTID:id,MINE_PERMIT_NUMBER:1000+id,COUNTY_NAME:'Grant',COMMODITY_DESC:'Sand and Gravel'
},geometry:{type:'Point',coordinates}});
const permitted=points=>{const c={type:'FeatureCollection',features:points,metadata:{
  complete:true,source:LAND_SOURCE_CATALOG.washingtonSurfacePermits.url,
  source_count_before:points.length,source_count_after:points.length
}};c.metadata.sha256_source_features=auditGeojsonCollection(c).sha256_source_features;return c;};
test('polygon location preserves interiors, exterior holes, boundary uncertainty and multi polygons',()=>{
  const hole=poly(rect(-120,46,-119,47),rect(-119.8,46.2,-119.4,46.6));
  assert.equal(locatePointInPolygon([-119.95,46.9],hole),'interior');
  assert.equal(locatePointInPolygon([-119.6,46.4],hole),'outside');
  assert.equal(locatePointInPolygon([-119.8,46.5],hole),'boundary');
  assert.equal(locatePointInPolygon([-120,46.4],hole),'boundary');
  assert.equal(locatePointInPolygon([-121,46],hole),'outside');
  const multi={type:'MultiPolygon',coordinates:[hole.coordinates,poly(rect(-118.5,46.5,-118,47)).coordinates]};
  assert.equal(locatePointInPolygon([-118.25,46.7],multi),'interior');
});
test('queries select only public non-owner fields and source geometry',()=>{
  const u=new URL(permitGeojsonQuery({pageSize:1,offset:1}));
  assert.equal(u.searchParams.get('outSR'),'4326');
  assert.equal(u.searchParams.get('f'),'geojson');
  assert.equal(u.searchParams.get('outFields'),'OBJECTID,MINE_PERMIT_NUMBER,COUNTY_NAME,COMMODITY_DESC');
  assert.equal(u.searchParams.get('resultOffset'),'1');
  assert.throws(()=>permitGeojsonQuery({county:'Yakima'}),/Grant/);
});
test('read complete WA reclamation permit points with metadata, page and count audit',async()=>{
  const source=LAND_SOURCE_CATALOG.washingtonSurfacePermits;
  const calls=[],points=[p(10,[-119.5,46.5]),p(11,[-118,47])];
  const fetchImpl=async(url)=>{
    const u=new URL(url);calls.push(u);
    if(!u.pathname.endsWith('/query'))return {ok:true,json:async()=>({
      geometryType:source.geometryType,fields:source.fields.map(name=>({name})),maxRecordCount:2000
    })};
    if(u.searchParams.get('returnCountOnly')==='true')return {ok:true,json:async()=>({count:2})};
    const offset=Number(u.searchParams.get('resultOffset'));
    return {ok:true,json:async()=>({type:'FeatureCollection',features:[points[offset]]})};
  };
  const result=await fetchGrantPermitPoints({fetchImpl,pageSize:1,now:()=> 'fixed'});
  assert.equal(result.features.length,2);
  assert.equal(result.metadata.complete,true);
  assert.equal(result.metadata.source_count_after,2);
  assert.match(result.metadata.sha256_source_features,/^[0-9a-f]{64}$/);
  assert.equal(calls.length,5);
});
test('matches permit point to geological interior but never rights or operating status',()=>{
  const points=permitted([p(10,[-119.5,46.5]),p(11,[-119.1,46.6]),p(12,[-118,46.6])]);
  const report=joinPermitPointsToWgs({wgs,receipt:wgsReceipt,permits:points});
  assert.deepEqual(report.point_relation_counts,{interior:1,boundary_uncertain:1,outside:1});
  assert.equal(report.rows[0].matched_resource_interior_object_ids[0],1);
  assert.equal(report.rows[1].state,'point_on_mapped_boundary_uncertain');
  assert.equal(report.point_inside_published_geological_classification_counts.Demonstrated,1);
  assert.equal(report.point_inside_published_geological_classification_counts['Not a Resource'],0);
  assert.equal(report.rows[0].published_classification_context[0].classification,'Demonstrated');
  assert.equal(report.legal_title_verified,false);
  assert.equal(report.operating_mine_status_verified,false);
});
test('source mismatch and tampered permit bytes fail closed',()=>{
  const c=permitted([p(10,[-119.5,46.5])]);
  c.features[0].geometry.coordinates[0]=-119.8;
  assert.throws(()=>joinPermitPointsToWgs({wgs,receipt:wgsReceipt,permits:c}),/source hash/);
  assert.throws(()=>joinPermitPointsToWgs({wgs,receipt:{...wgsReceipt,status:'ingest_failed'},permits:permitted([])}),/Complete county evidence/);
});

test('transient ArcGIS permit errors retry without creating false zero counts',async()=>{
 const def=LAND_SOURCE_CATALOG.washingtonSurfacePermits;
 let countAttempts=0;
 const fetchImpl=async url=>{
  const u=new URL(url);
  if(!u.pathname.endsWith('/query'))return {ok:true,json:async()=>({
   geometryType:def.geometryType,fields:def.fields.map(name=>({name}))
  })};
  if(u.searchParams.has('returnCountOnly')){
   countAttempts++;
   if(countAttempts===1)return {ok:true,json:async()=>({error:{code:503,message:'Temporary source unavailable'}})};
   return {ok:true,json:async()=>({count:1})};
  }
  return {ok:true,json:async()=>({type:'FeatureCollection',features:[p(6,[-119.6,46.5])]})};
 };
 const result=await fetchGrantPermitPoints({fetchImpl});
 assert.equal(result.features.length,1);
 assert.equal(result.metadata.source_count_after,1);
 assert.equal(countAttempts,3);
});
test('persistent upstream ArcGIS errors fail closed and remain explicit',async()=>{
 const def=LAND_SOURCE_CATALOG.washingtonSurfacePermits;
 const fetchImpl=async url=>{
  const u=new URL(url);
  if(!u.pathname.endsWith('/query'))return {ok:true,json:async()=>({
   geometryType:def.geometryType,fields:def.fields.map(name=>({name}))
  })};
  return {ok:true,json:async()=>({error:{code:403,message:'Access denied'}})};
 };
 await assert.rejects(fetchGrantPermitPoints({fetchImpl}),/WA DNR ArcGIS 403: Access denied/);
});
