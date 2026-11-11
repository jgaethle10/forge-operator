import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditWorldsReadiness,READINESS_SCHEMA} from '../scripts/audit-worlds-owned-readiness.mjs';

const origin='https://worlds.evercraft-example.org';
const observedAt=()=> '2026-11-09T12:00:00.000Z';
function mocks(change={}){
 const names=['worlds','heritage','hidden_world'],calls=[];
 const probes=Object.fromEntries(names.map(name=>[name,async submitted=>{
   calls.push([name,submitted]);
   return {verified:true,origin:submitted,...change[name]};
 }]));
 return {probes,calls};
}
test('missing origin holds launch with no external call',async()=>{
 const {probes,calls}=mocks();
 const v=await auditWorldsReadiness('',{probes,observedAt});
 assert.equal(v.schema,READINESS_SCHEMA);
 assert.equal(v.status,'blocked_no_origin');
 assert.equal(v.verified,false);
 assert.equal(v.public_https_verified,false);
 assert.equal(v.origin,null);
 assert.equal(v.read_only,true);
 assert.equal(v.customer_write_verified,false);
 assert.equal(v.physical_device_verified,false);
 assert.deepEqual(calls,[]);
 assert.deepEqual(Object.keys(v.checks),['worlds','heritage','hidden_world']);
 assert.ok(Object.values(v.checks).every(x=>!x.verified&&x.reason==='not_checked'));
});
test('only all three independent external proofs can produce read-only verification',async()=>{
 const {probes,calls}=mocks();
 const v=await auditWorldsReadiness(origin,{probes,observedAt});
 assert.equal(v.status,'verified_readonly');
 assert.equal(v.verified,true);
 assert.equal(v.public_https_verified,true);
 assert.equal(v.customer_write_verified,false);
 assert.equal(v.physical_device_verified,false);
 assert.equal(v.systemia_mission_executed,false);
 assert.equal(v.observed_at_utc,observedAt());
 assert.deepEqual(calls.map(([n])=>n),['worlds','heritage','hidden_world']);
 assert.ok(calls.every(([,o])=>o===origin));
});
test('one unverified heritage path holds aggregate release without inventing passing evidence',async()=>{
 const {probes}=mocks({heritage:{verified:false,reason:'http_not_200',path:'/worlds/heritage/tour.mjs'}});
 const v=await auditWorldsReadiness(origin,{probes,observedAt});
 assert.equal(v.status,'failed_external_check');
 assert.deepEqual(v.checks.heritage,{verified:false,reason:'http_not_200'});
 assert.deepEqual(v.checks.worlds,{verified:true});
 assert.deepEqual(v.checks.hidden_world,{verified:true});
 assert.equal(v.public_https_verified,false);
});
test('rejects bad origin before any network or read-only probe is contacted',async()=>{
 const {probes,calls}=mocks();
 for(const bad of ['http://worlds.evercraft-example.org','https://user:pass@worlds.evercraft-example.org','https://worlds.evercraft-example.org/path','https://evil.base44.app']){
   const r=await auditWorldsReadiness(bad,{probes,observedAt});
   assert.equal(r.status,'blocked_invalid_origin');
   assert.equal(r.verified,false);
   assert.equal(r.origin,null);
 }
 assert.deepEqual(calls,[]);
});
test('network exceptions, origin mismatch and missing result are failed, never promoted',async()=>{
 const {probes}=mocks();
 probes.heritage=async()=>{throw Error('no network')};
 probes.hidden_world=async()=>({verified:true,origin:'https://other.invalid'});
 const v=await auditWorldsReadiness(origin,{probes,observedAt});
 assert.equal(v.verified,false);
 assert.equal(v.checks.heritage.reason,'probe_exception');
 assert.equal(v.checks.hidden_world.reason,'origin_mismatch');
});
test('source workflow is non-mutating and saves a named evidence artifact',()=>{
 const wf=readFileSync(new URL('../.github/workflows/evercraft-worlds-readiness-watch.yml',import.meta.url),'utf8');
 assert.match(wf,/schedule:/);
 assert.match(wf,/branches: \[main\]/);
 assert.match(wf,/WORLDS_ORIGIN: \$\{\{ vars\.EVERCRAFT_WORLDS_PUBLIC_ORIGIN \}\}/);
 assert.match(wf,/node scripts\/audit-worlds-owned-readiness\.mjs/);
 assert.match(wf,/actions\/upload-artifact@v4/);
 assert.match(wf,/::warning title=Evercraft Worlds public release BLOCKED::/);
 assert.match(wf,/issues\/1994/);
 assert.match(wf,/if \(!r\.verified\)/);
 assert.doesNotMatch(wf,/--execute|allow_disposable_write|POST |PUT |DELETE /);
});
