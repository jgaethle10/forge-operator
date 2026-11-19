import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGemsKssSpatialContract} from './kss-spatial-contract.mjs';
const sample=()=>({schema:'evercraft.kss.gems-spatial-metadata.v1',
 width:3292,height:3730,crs:'EPSG:32611',
 affine:[100,0,243350,0,-100,4508550],pixel_size_m:[100,100],
 band_count:1,data_type:'float32',nodata_representation:'NaN'});
test('KSS-compatible grid contract verifies known GEMS-001 source geometry without worker claims',()=>{
 const value=verifyGemsKssSpatialContract(sample());
 assert.equal(value.state,'geometry_contract_verified');
 assert.equal(value.checks.length,5);
 assert.equal(value.coordinate_roundtrip_passed,true);
 assert.equal(value.kss_worker_invoked,false);
 assert.equal(value.real_gems_raster_opened,false);
 assert.equal(value.reference_mask_verified,false);
});
test('wrong CRS, negative dimensions, affine drift or forged payload fails closed',()=>{
 const changes=[{crs:'EPSG:4326'},{width:3291},{height:3700},{band_count:3},
  {data_type:'float64'},{nodata_representation:'0'},
  {affine:[100,1,243350,0,-100,4508550]},
  {pixel_size_m:[99,100]},{runner_command:'execute KSS'},
  {affine:[100,0,'untrusted',0,-100,4508550]}];
 for(const change of changes){
  const result=verifyGemsKssSpatialContract({...sample(),...change});
  assert.equal(result.state,'held',JSON.stringify(change));
  assert.equal(result.kss_worker_invoked,false);
 }
});
