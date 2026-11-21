import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvermapsOwnedOrigin,verifyEvermapsOwnedHttps} from './public-https-canary.mjs';
const good='https://fabric.systemiacommandcenters.com';
const sha='a'.repeat(64);
test('HTTPS origin must be explicit and must not be localhost, credentials or a guessed path',()=>{
 assert.equal(normalizeEvermapsOwnedOrigin(good+'/'),good);
 for(const v of ['http://example.com/','https://localhost/','https://example.com/other',
 'https://admin:token@example.com/','https://example.com:8443/'])assert.throws(
  ()=>normalizeEvermapsOwnedOrigin(v));
});
function fake({correct=true,missing=false}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,method:options.method});
  if(missing&&url.endsWith('/evermaps/'))return {ok:false,status:404};
  if(url.endsWith('/api/health'))return {ok:true,json:async()=>({
   ok:true,service:'evermaps-research',wgs_source_sha256:correct?sha:'b'.repeat(64),
   research_record_count:700,source_dependencies_verified:true,
   mining_site_recommendations_authorized:false,public_https_route_verified:false
  }),headers:new Headers({'content-type':'application/json'})};
  if(url.endsWith('/evermaps/'))return {ok:true,text:async()=>(
   '<div id="mobile-static-preview"><svg></svg></div><script>Object.assign(data,{});preview.hidden=true</script>'
  ),headers:new Headers({'content-type':'text/html','content-security-policy':"connect-src 'none'"})};
  return {ok:true,headers:new Headers({'content-type':url.endsWith('.csv')?'text/csv':'text/html'})};
 };return {calls,fetchImpl};
}
test('canary verifies actual HTTPS pages, fingerprints, CSS fallback, no mining claims',async()=>{
 const f=fake();
 const result=await verifyEvermapsOwnedHttps({origin:good,expectedWgsSha256:sha,
  fetchImpl:f.fetchImpl,now:()=> 'fixed'});
 assert.equal(result.result,'public_https_verified');
 assert.equal(result.geology_research_records,700);
 assert.equal(result.payment_or_external_action_taken,false);
 assert.deepEqual(f.calls.map(x=>new URL(x.url).pathname),[
 '/evermaps/api/health','/evermaps/','/evermaps/research/','/evermaps/research.csv'
 ]);
});
test('missing page or wrong WGS hash must hold publication receipt',async()=>{
 await assert.rejects(()=>verifyEvermapsOwnedHttps({origin:good,expectedWgsSha256:sha,
  fetchImpl:fake({correct:false}).fetchImpl}),/health_contract/);
 await assert.rejects(()=>verifyEvermapsOwnedHttps({origin:good,expectedWgsSha256:sha,
  fetchImpl:fake({missing:true}).fetchImpl}),/route_failed/);
});
