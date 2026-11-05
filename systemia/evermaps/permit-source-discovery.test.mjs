import test from 'node:test';
import assert from 'node:assert/strict';
import {probeWaPermitSourceCandidates,permitReadOnlyQuery,WA_PERMIT_SOURCE_CANDIDATES} from './permit-source-discovery.mjs';
const FIELDS=['OBJECTID','MINE_PERMIT_NUMBER','COUNTY_NAME','COMMODITY_DESC'];
test('candidate source endpoints remain official DNR only and data queries avoid owner fields',()=>{
 assert.equal(WA_PERMIT_SOURCE_CANDIDATES.length,2);
 for(const c of WA_PERMIT_SOURCE_CANDIDATES){
  const p=new URL(permitReadOnlyQuery(c.url,{type:'sample'})).searchParams;
  assert.equal(p.get('outFields'),FIELDS.join(','));
  assert.equal(p.get('resultRecordCount'),'1');
  assert.equal(p.get('returnGeometry'),'true');
  assert.equal(p.get('outSR'),'4326');
 }
});
test('live-compatible source can be distinguished from stale 404 endpoint',async()=>{
 const fetchImpl=async url=>{
  const src=WA_PERMIT_SOURCE_CANDIDATES[0].url;
  if(!url.startsWith(src))return {ok:true,json:async()=>({error:{code:404,message:'Service not found'}})};
  if(!url.includes('/query?'))return {ok:true,json:async()=>({
   geometryType:'esriGeometryPoint',fields:FIELDS.map(name=>({name}))
  })};
  if(url.includes('returnCountOnly'))return {ok:true,json:async()=>({count:42})};
  return {ok:true,json:async()=>({type:'FeatureCollection',features:[{
   type:'Feature',properties:{OBJECTID:1,MINE_PERMIT_NUMBER:22,COUNTY_NAME:'Grant',COMMODITY_DESC:'Stone'},
   geometry:{type:'Point',coordinates:[-119.1,47.1]}
  }]})};
 };
 const r=await probeWaPermitSourceCandidates({fetchImpl});
 assert.equal(r.preferred_source_key,'site3_current');
 assert.equal(r.results[0].county_count,42);
 assert.equal(r.results[1].state,'source_unverified');
 assert.equal(r.full_county_import_verified,false);
 assert.equal(r.permittee_records_exported,false);
});
test('metadata drift and malicious non-official hosts fail safely',async()=>{
 const r=await probeWaPermitSourceCandidates({
  candidates:[{key:'bad',url:'https://malicious.example/arcgis/MapServer/0'}],
  fetchImpl:()=>{throw Error('Should not fetch unapproved host')}
 });
 assert.equal(r.state,'no_live_permit_source_verified');
 assert.equal(r.results[0].county_count,null);
});
