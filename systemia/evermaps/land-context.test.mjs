import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {
  LAND_SOURCE_CATALOG,landSourceMetadataUrl,validateLandSourceMetadata,
  createLandCoverageQuery,validateWgsProvenance,readLandCoverageEvidence
} from './land-context.mjs';
const feature={type:'Feature',geometry:{type:'Polygon',coordinates:[[
  [-119.9,46.7],[-119.8,46.7],[-119.8,46.8],[-119.9,46.8],[-119.9,46.7]
]]},properties:{OBJECTID:1,CLASSIFICATION:'Inferred'}};
const source={type:'FeatureCollection',features:[feature]};
const sha=auditGeojsonCollection(source).sha256_source_features;
const receipt={status:'source_geometry_complete_broad_phase_only',county:'Grant',
  layers:{resources:{complete:true,fetched_features:1,geometry_audit:{
    valid_for_mapping:true,sha256_source_features:sha
  }}}};
function mockSource(){
  const calls=[];
  const fetchImpl=async url=>{
    const u=new URL(url); calls.push(u);
    let key=Object.keys(LAND_SOURCE_CATALOG).find(k=>
      u.href.startsWith(LAND_SOURCE_CATALOG[k].url));
    if(!key)throw new Error('Unexpected external host');
    if(u.pathname.endsWith('/query')) {
      if(key==='grantParcelPlanning')throw new Error('Parcel record query forbidden');
      assert.equal(u.searchParams.get('returnCountOnly'),'true');
      return {ok:true,json:async()=>({count:key==='federalClaims'?0:17})};
    }
    const def=LAND_SOURCE_CATALOG[key];
    return {ok:true,json:async()=>({
      geometryType:def.geometryType,
      maxRecordCount:2000,
      fields:def.fields.map(name=>({name}))
    })};
  };
  return {calls,fetchImpl};
}
test('land sources are pinned to real published layers; no owner fields requested',()=>{
  assert.equal(Object.keys(LAND_SOURCE_CATALOG).length,3);
  for(const k of Object.keys(LAND_SOURCE_CATALOG)){
    const u=new URL(landSourceMetadataUrl(k));
    assert.equal(u.searchParams.get('f'),'json');
    const def=LAND_SOURCE_CATALOG[k];
    assert.equal(def.fields.includes('OWNER'),false);
  }
  assert.throws(()=>createLandCoverageQuery('grantParcelPlanning'),/harvesting/);
});
test('regional coverage uses verified WGS footprint and does not make parcel conclusions',async()=>{
  const m=mockSource();
  const r=await readLandCoverageEvidence({source,receipt,fetchImpl:m.fetchImpl,now:()=> 'fixed'});
  assert.equal(r.state,'source_metadata_and_coarse_counts_verified');
  assert.equal(r.results.federalClaims.observed_record_count,0);
  assert.equal(r.results.federalClaims.absence_or_eligibility_conclusion,'not_determined');
  assert.equal(r.results.washingtonSurfacePermits.observed_record_count,17);
  assert.equal(r.results.grantParcelPlanning.scope,'metadata_only_no_owner_records');
  assert.equal(r.land_title_verified,false);
  assert.equal(m.calls.filter(u=>u.pathname.includes('/query')).length,2);
  const spatial=m.calls.find(u=>u.pathname.includes('MiningClaims/MapServer/1/query'));
  const envelope=JSON.parse(spatial.searchParams.get('geometry'));
  assert.equal(envelope.spatialReference.wkid,4326);
  assert.equal(spatial.searchParams.get('geometryType'),'esriGeometryEnvelope');
});
test('tampered WGS data and untrusted county fail before remote reads',()=>{
  const changed={type:'FeatureCollection',features:[{...feature,properties:{...feature.properties,CLASSIFICATION:'Demonstrated'}}]};
  assert.throws(()=>validateWgsProvenance({source:changed,receipt}),/mismatch/);
  assert.throws(()=>validateWgsProvenance({source,receipt,county:'Yakima'}),/required/);
  assert.throws(()=>createLandCoverageQuery('federalClaims',{bbox:[0,0,1,1]}),/bounding box/);
});
test('upstream schema drift and errors remain unverified, never zero',async()=>{
  assert.throws(()=>validateLandSourceMetadata('federalClaims',{fields:[],geometryType:'esriGeometryPolygon'}),/drift/);
  const mock=mockSource();
  const partial=await readLandCoverageEvidence({source,receipt,
    fetchImpl:async url=>url.includes('Active_Surface_Mine_Permit_Sites')?{ok:false,status:503}:mock.fetchImpl(url)});
  assert.equal(partial.state,'source_probe_partial');
  assert.equal(partial.results.washingtonSurfacePermits.state,'source_unverified');
  assert.equal(partial.results.washingtonSurfacePermits.observed_record_count,undefined);
  assert.equal(partial.land_title_verified,false);
});
