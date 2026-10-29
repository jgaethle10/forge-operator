import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {SOURCES,layerMetadataUrl,spatialCountUrl,verifyMetadata,probeGrantPlanning} from './planning-context.mjs';
const source={type:'FeatureCollection',features:[{type:'Feature',properties:{OBJECTID:1},
 geometry:{type:'Polygon',coordinates:[[[-119.9,46.2],[-119.3,46.2],[-119.3,46.7],[-119.9,46.7],[-119.9,46.2]]]}}]};
const receipt={status:'source_geometry_complete_broad_phase_only',county:'Grant',layers:{
 resources:{complete:true,fetched_features:1,geometry_audit:{
  valid_for_mapping:true,sha256_source_features:auditGeojsonCollection(source).sha256_source_features}}}};
function fake(bad=null,zero=false){
 const urls=[];const fetchImpl=async(url)=>{
  const u=new URL(url);urls.push(u);
  const key=Object.keys(SOURCES).find(k=>u.href.startsWith(SOURCES[k].url));
  assert.ok(key);
  if(key===bad)return {ok:false,status:503};
  if(u.pathname.endsWith('/query'))return {ok:true,json:async()=>({count:zero?0:12})};
  return {ok:true,json:async()=>({geometryType:'esriGeometryPolygon',
   fields:SOURCES[key].fields.map(name=>({name}))})};
 };return {urls,fetchImpl};
}
test('official pinned sources have no owner or person fields',()=>{
 assert.equal(Object.keys(SOURCES).length,3);
 for(const k of Object.keys(SOURCES)){
  assert.equal(new URL(layerMetadataUrl(k)).searchParams.get('f'),'json');
  assert.ok(!SOURCES[k].fields.some(s=>/owner|name|address/i.test(s)));
  assert.throws(()=>verifyMetadata(k,{geometryType:'esriGeometryPolygon',fields:[]}),/schema mismatch/);
 }
});
test('count query uses verified bounded envelope and no returned features',()=>{
 const url=new URL(spatialCountUrl('zoning',[-119.9,46.2,-119.3,46.7]));
 assert.equal(url.searchParams.get('returnCountOnly'),'true');
 assert.equal(url.searchParams.get('geometryType'),'esriGeometryEnvelope');
 assert.equal(url.searchParams.get('outFields'),null);
 assert.equal(JSON.parse(url.searchParams.get('geometry')).spatialReference.wkid,4326);
 assert.throws(()=>spatialCountUrl('zoning',[-119,46,100,47]),/Invalid/);
});
test('coarse counts never confer title or zoning permission',async()=>{
 const mock=fake();const result=await probeGrantPlanning({source,receipt,fetchImpl:mock.fetchImpl,now:()=> 'fixed'});
 assert.equal(result.state,'coarse_sources_verified');assert.equal(mock.urls.length,6);
 assert.equal(result.results.zoning.envelope_matching_features,12);
 assert.equal(result.legal_mining_eligibility_verified,false);
 assert.equal(result.per_polygon_zoning_verified,false);
 assert.match(result.results.zoning.vintage,/2018/);
});
test('zero count, source errors and source tampering remain non-clearance',async()=>{
 const zero=await probeGrantPlanning({source,receipt,fetchImpl:fake(null,true).fetchImpl});
 assert.equal(zero.results.protected.envelope_matching_features,0);
 assert.equal(zero.environmental_clearance_verified,false);
 const err=await probeGrantPlanning({source,receipt,fetchImpl:fake('protected').fetchImpl});
 assert.equal(err.state,'coarse_sources_partial');
 assert.equal(err.results.protected.envelope_matching_features,null);
 const tampered={type:'FeatureCollection',features:[{...source.features[0],properties:{OBJECTID:2}}]};
 await assert.rejects(()=>probeGrantPlanning({source:tampered,receipt,fetchImpl:fake().fetchImpl}),/mismatch/);
});
