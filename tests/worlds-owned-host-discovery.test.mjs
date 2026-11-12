import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverWorldsOwnedHost,DISCOVERY_SCHEMA} from '../scripts/discover-worlds-owned-host.mjs';
const origin='https://worlds.example.org';
const after=()=>Date.parse('2026-11-11T12:00:00Z');
const future='2030-01-01T00:00:00.000Z';
function fixture(options={}){
 const edge={ok:true,service:'evercraft-public-edge',
  instance_id:'public_edge_'+'a'.repeat(24),mode:'wildcard_https',
  base_domain:'example.org',public_https:true,deployment_receipt_bound:true,
  tls_admission:{schema:'evercraft.public-edge.tls-admission.v1',ready:true,
    base_domain:'example.org',hostname_match:'route-probe.example.org',certificate_valid_to:future},
  ...options.edge};
 const caps={protocol:'evercraft.public-route.v1',proof_only:false,https_required:true,
  hostname_mode:'wildcard_subdomain',base_domain:'example.org',lease_supported:true,
  lease_renewal_supported:true,release_supported:true,...options.caps};
 const vault={schema:'evercraft.worlds.vault.v1',ok:true,mode:'owned-durable-vault',
  public_origin:origin,...options.vault};
 const called=[];
 const fetchFn=async(url,init)=>{
  called.push({url,init});
  assert.equal(init.method,'GET');
  assert.equal(init.redirect,'error');
  assert.equal(init.cache,'no-store');
  const body=url.endsWith('/v1/public-route/capabilities')?caps:
   url.endsWith('/worlds/api/health')?vault:edge;
  return new Response(JSON.stringify(body),{status:options.httpStatus||200,
   headers:{'content-type':'application/json'}});
 };
 return {fetchFn,called};
}
test('discovers only from TLS-admitted owned edge and never claims public launch',async()=>{
 const f=fixture();const r=await discoverWorldsOwnedHost({fetchFn:f.fetchFn,now:after});
 assert.equal(r.schema,DISCOVERY_SCHEMA);
 assert.equal(r.status,'candidate_for_external_probe');
 assert.equal(r.candidate_origin,origin);
 assert.equal(r.candidate_source,'owned_edge_tls_admission');
 assert.equal(r.candidate_verified_publicly,false);
 assert.equal(r.public_https_verified,false);
 assert.equal(r.customer_write_verified,false);
 assert.equal(r.lease_modified,false);
 assert.equal(r.settings_modified,false);
 assert.deepEqual(f.called.map(x=>new URL(x.url).pathname),[
  '/health','/v1/public-route/capabilities','/worlds/api/health']);
 assert.ok(f.called.every(x=>x.url.startsWith('http://127.0.0.1:')));
});
test('local proof-only edge is not mistaken for customer HTTPS',async()=>{
 const f=fixture({edge:{mode:'proof_loopback',public_https:false},caps:{proof_only:true}});
 const r=await discoverWorldsOwnedHost({fetchFn:f.fetchFn,now:after});
 assert.equal(r.status,'blocked_edge_admission');
 assert.equal(r.candidate_origin,undefined);
 assert.equal(f.called.length,2);
});
test('cert expiry and domain discrepancies stop discovery before vault requests',async()=>{
 for(const patch of [
  {edge:{tls_admission:{ready:true,base_domain:'another.org',hostname_match:'x',certificate_valid_to:future}}},
  {caps:{base_domain:'another.org'}},
  {edge:{tls_admission:{ready:true,base_domain:'example.org',hostname_match:'x',certificate_valid_to:'2026-11-12T00:00:00Z'}}}
 ]){
  const f=fixture(patch);const r=await discoverWorldsOwnedHost({fetchFn:f.fetchFn,now:after});
  assert.equal(r.status,'blocked_edge_admission');
  assert.equal(f.called.length,2);
 }
});
test('vault missing exact origin stops external checks even with TLS edge present',async()=>{
 for(const pinned of [null,'https://wrong.example.org']){
  const f=fixture({vault:{public_origin:pinned}});let calls=0;
  const r=await discoverWorldsOwnedHost({fetchFn:f.fetchFn,now:after,
   external:true,externalAuditor:async()=>{calls++;return {verified:true,origin};}});
  assert.equal(r.status,'blocked_vault_origin');assert.equal(r.public_https_verified,false);
  assert.equal(calls,0);
 }
});
test('external read-only proof is explicit, requires matching origin, and never approves writes',async()=>{
 const f=fixture();let calls=0;
 const verified=await discoverWorldsOwnedHost({fetchFn:f.fetchFn,now:after,
  external:true,externalAuditor:async value=>{calls++;assert.equal(value,origin);
   return {verified:true,origin:value,checks:{worlds:{verified:true},heritage:{verified:true},hidden_world:{verified:true}}};
  }});
 assert.equal(calls,1);
 assert.equal(verified.status,'verified_readonly');
 assert.equal(verified.public_https_verified,true);
 assert.equal(verified.deployment_approved,false);
 assert.equal(verified.physical_iphone_verified,false);
 assert.equal(verified.customer_write_verified,false);
 const bad=await discoverWorldsOwnedHost({fetchFn:f.fetchFn,now:after,
  external:true,externalAuditor:async()=>({verified:true,origin:'https://wrong.example.org'})});
 assert.equal(bad.status,'external_probe_failed');
 assert.equal(bad.public_https_verified,false);
});
test('invalid control URLs do not contact any listener',async()=>{
 const f=fixture();
 for(const control of ['http://localhost:18081','http://127.0.0.1:18081/path','https://127.0.0.1:18081']){
  const r=await discoverWorldsOwnedHost({edgeControlUrl:control,fetchFn:f.fetchFn,now:after});
  assert.equal(r.status,'blocked_invalid_loopback');
 }
 assert.equal(f.called.length,0);
});
test('private control token may be passed but never appears in release receipt',async()=>{
 const f=fixture();const token='NEVER_PRINT_THIS_TEST_TOKEN';
 const r=await discoverWorldsOwnedHost({fetchFn:f.fetchFn,controlToken:token,now:after});
 assert.equal(r.status,'candidate_for_external_probe');
 assert.ok(f.called.slice(0,2).every(x=>x.init.headers.authorization==='Bearer '+token));
 assert.ok(!JSON.stringify(r).includes(token));
});
