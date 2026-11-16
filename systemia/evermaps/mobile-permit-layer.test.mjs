import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {LAND_SOURCE_CATALOG} from './land-context.mjs';
import {verifiedMapPermitLayer} from './mobile-permit-layer.mjs';
const source=LAND_SOURCE_CATALOG.washingtonSurfacePermits.url;
const wgsSourceSha256='a'.repeat(64);
const permits={type:'FeatureCollection',features:[{type:'Feature',
 properties:{OBJECTID:9,PERMIT_NO:'123',COUNTY:'Grant',COMMODITY:'Stone',
 APPLICANT:'Unrequested Name',OWNER_ADDRESS:'Unrequested address'},
 geometry:{type:'Point',coordinates:[-119.2,47.3]}}],metadata:{
 complete:true,source,source_count_before:1,source_count_after:1
}};
permits.metadata.sha256_source_features=auditGeojsonCollection(permits).sha256_source_features;
const receipt={schema:'evercraft.evermaps.permit-point-overlay-receipt.v1',
 state:'point_geometry_overlay_verified',county:'Grant',geologic_source_sha256:wgsSourceSha256,
 source,permit_count:1,permit_source_sha256:permits.metadata.sha256_source_features,
 site_recommendation_allowed:false,land_title_verified:false};
test('only four approved fields appear in map even if GIS returned owner data',()=>{
 const layer=verifiedMapPermitLayer({wgsSourceSha256,permits,receipt});
 assert.equal(layer.features.length,1);
 assert.deepEqual(Object.keys(layer.features[0].properties).sort(),
  ['OBJECTID','PERMIT_NO','COUNTY','COMMODITY'].sort());
 assert.equal(JSON.stringify(layer).includes('Unrequested'),false);
});
test('stale geology fingerprint and source drift hold all permit markers',()=>{
 assert.throws(()=>verifiedMapPermitLayer({wgsSourceSha256:'b'.repeat(64),permits,receipt}),/same-run/);
 assert.throws(()=>verifiedMapPermitLayer({wgsSourceSha256,permits,receipt:{...receipt,state:'overlay_unverified'}}),/same-run/);
 assert.throws(()=>verifiedMapPermitLayer({wgsSourceSha256,permits,receipt:{...receipt,source:'https://example.org'}}),/same-run/);
});
test('altered permit coordinates and extra permit rows cannot be quietly published',()=>{
 const tampered={...permits,features:permits.features.map(f=>({...f,geometry:{type:'Point',coordinates:[0,0]}}))};
 assert.throws(()=>verifiedMapPermitLayer({wgsSourceSha256,permits:tampered,receipt}),/SHA-256 mismatch/);
 const extra={...permits,features:[...permits.features,...permits.features]};
 assert.throws(()=>verifiedMapPermitLayer({wgsSourceSha256,permits:extra,receipt}),/mismatched/);
});
