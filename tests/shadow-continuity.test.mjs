import test from 'node:test';
import assert from 'node:assert/strict';
import {assessShadowContinuity} from '../systemia/compute/shadow-continuity.mjs';
const now=Date.parse('2026-10-14T12:00:00Z');
const nodeKey='synthetic:node:example',sourceAdapter='synthetic-signed-shadow';
const samplePrefix='SAMPLE-',noncePrefix='NONCE-',digest='a'.repeat(64),statement='b'.repeat(64);
const key=i=>i.toString(16).padStart(32,'0');
const sample=(i,ago,uptime)=>({node_key:nodeKey,source_adapter:sourceAdapter,
 collection_state:'observed',sample_key:samplePrefix+key(i),
 observed_at:new Date(now-ago*1000).toISOString(),memory_pct:7.3,uptime_seconds:uptime,
 evidence_refs:['signed-statement-sha256:'+statement,'signed-envelope-sha256:'+digest]});
const nonce=i=>({node_key:nodeKey,nonce_key:noncePrefix+key(i),request_fingerprint:'sha256:'+digest});
function fixture(){
 const samples=[sample(1,40000,140000),sample(2,6500,4),sample(3,300,6200),sample(4,0,6500)];
 return {nodeKey,sourceAdapter,samplePrefix,noncePrefix,samples,nonces:[1,2,3,4].map(nonce),now,
 registry:{node_key:nodeKey,last_sample_key:samples.at(-1).sample_key,last_seen_at:samples.at(-1).observed_at,status:'shadow',execution_allowed:false},
 authority:{mode:'quarantined',allowed_execution:false},leaseCount:0};
}
test('gap timestamps and counter reversal are preserved without claiming restart cause',()=>{
 const a=fixture(),r=assessShadowContinuity(a),w=r.windows.find(x=>x.hours===24);
 assert.equal(w.sample_count,4);assert.equal(w.longest_interval_seconds,33500);
 assert.equal(w.reported_uptime_reversals,1);
 assert.deepEqual(w.largest_incidents[0],{before_at:a.samples[0].observed_at,after_at:a.samples[1].observed_at,
 interval_seconds:33500,reported_uptime_reversed:true,cause:'unverified'});
 assert.equal(r.authority_state,'shadow_quarantined');assert.equal(r.fresh_observation,true);
 assert.equal(r.work_execution_authorized,false);assert.equal(r.host_restart_cause_verified,false);
});
test('matched stored hash never implies independent signature verification',()=>{
 const r=assessShadowContinuity(fixture());
 assert.equal(r.windows[2].linked_stored_hash_count,4);
 assert.equal(r.independent_signature_verification,false);
 assert.equal(r.work_execution_authorized,false);
});
test('duplicate sample identifiers are excluded as ambiguous',()=>{
 const a=fixture();a.samples.push({...a.samples[1]});
 const r=assessShadowContinuity(a);
 assert.equal(r.duplicate_sample_keys,1);assert.equal(r.accepted_unique_sample_count,3);
 assert.equal(r.windows[2].linked_stored_hash_count,3);
});
test('duplicate nonce and tampered hash fail stored-evidence linkage',()=>{
 const a=fixture();a.nonces.push({...a.nonces[0]});a.nonces[1].request_fingerprint='sha256:'+'c'.repeat(64);
 const r=assessShadowContinuity(a);
 assert.equal(r.duplicate_nonce_keys,1);assert.equal(r.windows[2].linked_stored_hash_count,2);
});
test('old record with absent evidence is never retroactively verified',()=>{
 const a=fixture();a.samples[0].evidence_refs=[];
 const r=assessShadowContinuity(a);
 assert.equal(r.accepted_unique_sample_count,4);assert.equal(r.windows[2].linked_stored_hash_count,3);
});
test('wrong source, future data and bad metrics are excluded',()=>{
 const a=fixture();a.samples[0].source_adapter='fake';a.samples[1].observed_at=new Date(now+60000).toISOString();a.samples[2].memory_pct=101;
 assert.equal(assessShadowContinuity(a).accepted_unique_sample_count,1);
});
test('authority changes never yield a work permit',()=>{
 for(const changes of [{authority:{mode:'ready',allowed_execution:true}},{leaseCount:1},{registry:null},{authority:null}]){
  const r=assessShadowContinuity({...fixture(),...changes});
  assert.equal(r.work_execution_authorized,false);assert.equal(r.authority_state,'unknown_or_changed');
 }
});
test('empty observations cannot manufacture uptime or work',()=>{
 const r=assessShadowContinuity({...fixture(),samples:[],nonces:[]});
 assert.equal(r.latest_sample_at,null);assert.equal(r.fresh_observation,false);
 assert.equal(r.windows[2].sample_count,0);assert.equal(r.windows[2].median_interval_seconds,null);
 assert.equal(r.work_execution_authorized,false);
});
test('input bounds and clock are strict',()=>{
 assert.throws(()=>assessShadowContinuity({...fixture(),samples:Array(2001).fill({})}),/unbounded/);
 assert.throws(()=>assessShadowContinuity({...fixture(),now:NaN}),/unbounded/);
 assert.throws(()=>assessShadowContinuity({...fixture(),nodeKey:''}),/unbounded/);
});

test('registry timestamp alone never proves same sample identity',()=>{
 const a=fixture();a.registry.last_sample_key='SAMPLE-'+('f'.repeat(32));
 const r=assessShadowContinuity(a);
 assert.equal(r.last_sample_registry_linked,false);
 assert.equal(r.fresh_observation,false);
 assert.equal(r.work_execution_authorized,false);
});
