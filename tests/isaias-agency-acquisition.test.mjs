import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireIsaiasReadOnly,parseIsaiasAdvisory8,ISAIAS_NHC_ADVISORY_8} from '../systemia/newsroom/isaias-agency-acquisition.mjs';
const nhcText='BULLETIN\nHurricane Isaias Advisory Number 8\nNWS National Hurricane Center Miami FL AL092026\n1000 AM CDT Thu Oct 08 2026\nSUMMARY OF 1000 AM CDT...1500 UTC...INFORMATION\nLOCATION...23.7N 90.2W\nMAXIMUM SUSTAINED WINDS...85 MPH\nMINIMUM CENTRAL PRESSURE...975 MB';
const fema=JSON.stringify({type:'FeatureCollection',features:[
 {type:'Feature',properties:{shelter_id:123,shelter_name:'Sample shelter',state:'AL',city:'Mobile',shelter_status:'OPEN'},geometry:{type:'Point',coordinates:[-88.04,30.69]}}
]});
const reply=(url,body,status=200)=>({ok:status===200,status,url,headers:{get:()=>String(Buffer.byteLength(body))},text:async()=>body});
const fetcher=async(url)=>String(url).startsWith('https://www.nhc.noaa.gov/')?
  reply(String(url),nhcText):reply(String(url),fema);
test('locked official advisory #8 is parsed without inventing revisions',()=>{
 assert.equal(parseIsaiasAdvisory8(nhcText).max_wind_mph,85);
 assert.throws(()=>parseIsaiasAdvisory8(nhcText.replace('Number 8','Number 9')),/identity/);
 assert.throws(()=>parseIsaiasAdvisory8(nhcText.replace('85 MPH','95 MPH')),/values/);
 assert.match(ISAIAS_NHC_ADVISORY_8,/al092026\.public\.008\.shtml/);
});
test('bounded read-only acquisition preserves provenance and does not claim open shelter',async()=>{
 const result=await acquireIsaiasReadOnly({fetchImpl:fetcher,retrievedAt:'2026-10-08T19:00:00Z'});
 assert.equal(result.status,'acquired_pending_independent_source_and_status_review');
 assert.equal(result.advisory.storm_id,'AL092026');
 assert.equal(result.facilities.features.length,1);
 assert.equal(result.facilities.features[0].properties.status,'open');
 assert.equal(result.public_hazard_intersections,null);
 assert.equal(result.confirmed_impacts,null);
 assert.equal(result.source_receipts.length,2);
 assert.match(result.source_receipts[0].sha256,/^[a-f0-9]{64}$/);
});
test('a redirected, forged, or error-bearing source fails closed',async()=>{
 await assert.rejects(acquireIsaiasReadOnly({fetchImpl:async(url)=>reply('https://example.com/redirect',url.startsWith('https://www.nhc')?nhcText:fema)}),/origin/);
 const held=await acquireIsaiasReadOnly({fetchImpl:async(url)=>reply(String(url),url.startsWith('https://www.nhc')?nhcText:JSON.stringify({error:{code:400,message:'blocked'}}))});
 assert.equal(held.status,'nhc_verified_fema_held');
 assert.equal(held.facilities,null);
 assert.equal(held.source_receipts.length,1);
 assert.equal(held.facility_error,'fema_service_error_400');
});
test('no fake shelter counts or duplicate provider record IDs',async()=>{
 const duplicated=JSON.stringify({type:'FeatureCollection',features:[
  {type:'Feature',properties:{shelter_id:123},geometry:{type:'Point',coordinates:[-88,30]}},
  {type:'Feature',properties:{shelter_id:123},geometry:{type:'Point',coordinates:[-87,31]}}
 ]});
 const held=await acquireIsaiasReadOnly({fetchImpl:async(url)=>reply(String(url),String(url).startsWith('https://www.nhc')?nhcText:duplicated)});
 assert.equal(held.facilities,null);
 assert.equal(held.status,'nhc_verified_fema_held');
 assert.match(held.facility_error,/duplicate/);
});
