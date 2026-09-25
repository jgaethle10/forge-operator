import assert from 'node:assert/strict';
import { runRivetPublicSnapshot } from './yard-public-snapshot.mjs';

const original=globalThis.fetch;
globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes('geocoding.geo.census.gov'))return Response.json({result:{addressMatches:[{matchedAddress:'6405 W CHESTNUT AVE, YAKIMA, WA, 98908',coordinates:{x:-120.59,y:46.59},addressComponents:{state:'WA',zip:'98908'},geographies:{Counties:[{NAME:'Yakima County',GEOID:'53077'}]}}]}});
  if(u.includes('data.wsdot.wa.gov'))return Response.json({features:[{properties:{OBJECTID:7,RouteIdentifier:'US 12',Location:'proof',AADT:42000,ReportingYear:2025},geometry:{coordinates:[-120.57,46.58]}}]});
  if(u.includes('gis.ecology.wa.gov'))return Response.json({features:[{attributes:{OBJECTID:9,Name:'Pacific Power'}}]});
  throw new Error('unexpected_source');
};
try{
  const x=await runRivetPublicSnapshot({address:'6405 W Chestnut Ave, Yakima, WA 98908'});
  assert.equal(x.schema,'evercraft.aliev.rivet-public-snapshot.v1');
  assert.equal(x.evidence_state,'PARTIAL_SOURCE_BACKED');
  assert.equal(x.traffic.length,1);
  assert.equal(x.washington_utility_service_area_candidates.length,1);
  assert.equal(x.coverage_contract.provenance_rule,'Missing observed data is never converted to zero.');
  console.log(JSON.stringify({ok:true,address:x.matched_address,traffic_rows:x.traffic.length,utility_rows:x.washington_utility_service_area_candidates.length,fabricated_zero:false},null,2));
}finally{globalThis.fetch=original;}
