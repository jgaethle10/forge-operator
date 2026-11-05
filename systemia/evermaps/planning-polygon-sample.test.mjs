import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {SOURCES} from './planning-context.mjs';
import {publisherPolygonGeometry,polygonCountRequest,chooseVerifiedWgsSample,
 testGrantPolygonPlanningSample,MAX_QUERY_BODY_BYTES} from './planning-polygon-sample.mjs';
const ring=(xmin,ymin,xmax,ymax)=>[[xmin,ymin],[xmax,ymin],[xmax,ymax],[xmin,ymax],[xmin,ymin]];
const poly=(rings)=>({type:'Polygon',coordinates:rings});
const samples=[
 ['Demonstrated',1],['Demonstrated',2],['Inferred',3],['Inferred',4],
 ['Speculative',5],['Speculative',6],['Not a Resource',7],['Not a Resource',8],
 ['Not Analyzed',9]
].map(([c,id])=>({type:'Feature',properties:{OBJECTID:id,CLASSIFICATION:c},
 geometry:poly([ring(-119.95+id*.01,46.3,-119.945+id*.01,46.31)])}));
const source={type:'FeatureCollection',features:samples};
const receipt={status:'source_geometry_complete_broad_phase_only',county:'Grant',layers:{
 resources:{complete:true,fetched_features:samples.length,geometry_audit:{
 valid_for_mapping:true,sha256_source_features:auditGeojsonCollection(source).sha256_source_features}}
}};
test('ArcGIS polygon conversion preserves holes and reorients outer CW and holes CCW',()=>{
 const g=publisherPolygonGeometry(poly([
  ring(-120,46,-119,47),ring(-119.8,46.2,-119.6,46.4)
 ]));
 assert.equal(g.rings.length,2);
 assert.deepEqual(g.spatialReference,{wkid:4326});
 const a=r=>r.slice(0,-1).reduce((s,p,i)=>s+p[0]*r[i+1][1]-r[i+1][0]*p[1],0);
 assert.ok(a(g.rings[0])<0);
 assert.ok(a(g.rings[1])>0);
 const mp={type:'MultiPolygon',coordinates:[poly([ring(-120,46,-119,47)]).coordinates,
 poly([ring(-118,46,-117,47)]).coordinates]};
 assert.equal(publisherPolygonGeometry(mp).rings.length,2);
});
test('deterministic WGS group sample includes nonresource as control and no false statistical claim',()=>{
 const picked=chooseVerifiedWgsSample({source,receipt});
 assert.deepEqual(picked.chosen.map(x=>x.source_object_id),[1,2,3,4,5,6,7,8]);
 assert.match(picked.selection,/not statistically representative/i);
 assert.throws(()=>chooseVerifiedWgsSample({source,receipt:{...receipt,county:'Yakima'}}),/required/);
});
test('POST spatial queries only return counts, never owner, owner names or species records',()=>{
 for(const kind of Object.keys(SOURCES)){
  const q=polygonCountRequest(kind,samples[0].geometry);
  assert.equal(q.init.method,'POST');
  const p=new URLSearchParams(q.init.body);
  assert.equal(p.get('returnCountOnly'),'true');
  assert.equal(p.get('geometryType'),'esriGeometryPolygon');
  assert.equal(p.get('spatialRel'),'esriSpatialRelIntersects');
  assert.equal(p.get('outFields'),null);
  assert.equal(JSON.parse(p.get('geometry')).spatialReference.wkid,4326);
  assert.ok(q.init.body.length<MAX_QUERY_BODY_BYTES);
 }
});
function fake({bad=null,zero=false}={}){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  const kind=Object.keys(SOURCES).find(k=>url.startsWith(SOURCES[k].url));
  assert.ok(kind);
  calls.push({kind,url,init});
  if(kind===bad)return {ok:false,status:503};
  if(url.endsWith('/query')){
   assert.equal(init.method,'POST');
   return {ok:true,json:async()=>({count:zero?0:kind==='habitat'?1:2})};
  }
  return {ok:true,json:async()=>({geometryType:'esriGeometryPolygon',
   fields:SOURCES[kind].fields.map(name=>({name}))})};
 };return {calls,fetchImpl};
}
test('8 sample polygons x 3 sources report source intersection observations, never mineability',async()=>{
 const f=fake();
 const r=await testGrantPolygonPlanningSample({source,receipt,fetchImpl:f.fetchImpl,now:()=> 'fixed'});
 assert.equal(r.status,'sample_polygon_intersections_verified');
 assert.equal(r.sample_feature_count,8);
 assert.equal(f.calls.filter(x=>x.init?.method==='POST').length,24);
 assert.equal(r.rows[0].results.habitat.matching_source_features,1);
 assert.equal(r.rows[0].mining_eligibility,'not_determined');
 assert.equal(r.all_wgs_polygons_checked,false);
 assert.equal(r.commercial_recommendation_allowed,false);
});
test('zero hits, unavailable source and tampered WGS never imply legal clearance',async()=>{
 const r=await testGrantPolygonPlanningSample({source,receipt,fetchImpl:fake({zero:true}).fetchImpl});
 assert.equal(r.rows[0].results.habitat.matching_source_features,0);
 assert.equal(r.environmental_clearance_verified,false);
 const fail=await testGrantPolygonPlanningSample({source,receipt,fetchImpl:fake({bad:'habitat'}).fetchImpl});
 assert.equal(fail.status,'sample_incomplete_or_source_unavailable');
 assert.equal(fail.rows[0].results.habitat.state,'source_unverified');
 const tampered={...source,features:source.features.map(f=>({...f,properties:{...f.properties,OBJECTID:f.properties.OBJECTID+100}}))};
 await assert.rejects(()=>testGrantPolygonPlanningSample({source:tampered,receipt,fetchImpl:fake().fetchImpl}),/mismatch/);
});
