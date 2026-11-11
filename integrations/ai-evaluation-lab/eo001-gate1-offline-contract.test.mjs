import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  BASELINE,canonicalJson,fingerprintSyntheticContext,
  reviewManifest,measureSyntheticDecision,staticOfflineReport,sourceFingerprints
} from './eo001-gate1-offline-contract.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const fixture={request:{operation_id:'synthetic-gate1-fixture'},
  observations:[{method:'lookup',transport:'unavailable'}],steps_remaining:2};
const proposed=JSON.parse(readFileSync(path.join(here,
  'eo001-run-plan.evercraft-proposed.json'),'utf8'));

test('current proposal cannot authorize a model run and exposes actual blockers',()=>{
  const result=reviewManifest(proposed);
  assert.equal(result.state,'NEEDS_REVIEW');
  assert.equal(result.execution_authorized,false);
  for(const missing of ['prompt_sha256','context_serialization_sha256',
    'warmup_prompt_sha256','warmup_timeout_seconds','host_configuration',
    'output_naming','cleanup_checks','review_references.lab_and_evercraft']){
    assert.ok(result.unresolved_or_invalid_fields.includes(missing),missing);
  }
});
test('even a fully populated proposed manifest cannot grant an execution permission',()=>{
  const plan={...proposed,
    lab_adapter_commit:'a'.repeat(40),forge_adapter_commit:'b'.repeat(40),
    prompt_sha256:'c'.repeat(64),
    context_serialization_sha256:'d'.repeat(64),
    warmup_prompt_sha256:'e'.repeat(64),
    context_serialization:'explicit strict UTF-8 proposed v1',
    host_configuration:'isolated loopback-only synthetic host',
    output_naming:'one private immutable report per case',
    cleanup_checks:'verify child exit and delete only ephemeral token',
    generation_parameters:{model:'synthetic fixture',temperature:0,max_tokens:128},
    review_references:{lab:'Lab #35',evercraft:'Forge #1705'},
    max_output_tokens:128,warmup_timeout_seconds:30
  };
  const result=reviewManifest(plan);
  assert.equal(result.state,'FIELDS_COMPLETE_REVIEW_REQUIRED');
  assert.equal(result.execution_authorized,false);
  assert.equal(result.source_pins_verified,false);
  assert.equal(result.reviewed_by_lab_and_forge,false);
});
test('changed decision limit / scenario order / retry rules fail the manifest review',()=>{
  for(const change of [
    {decision_timeout_seconds:16},{max_decisions_per_case:7},
    {warmup_requests:2},{scenario_order:['tamper','none','ack_loss','lookup_outage']},
    {stop_on_timeout:false},{replace_failed_attempts:true}
  ]){
    const r=reviewManifest({...proposed,...change});
    assert.equal(r.state,'NEEDS_REVIEW');
    assert.equal(r.execution_authorized,false);
  }
});
test('canonical JSON stable across dictionary key insertion order',()=>{
  const a={z:3,a:{y:2,x:1}},b={a:{x:1,y:2},z:3};
  assert.equal(canonicalJson(a),canonicalJson(b));
});
test('nonJSON, nonfinite, accessor and cyclic context values block',()=>{
  for(const value of [undefined,NaN,Infinity,2n,new Date(),()=>3]){
    assert.throws(()=>canonicalJson({input:value}));
  }
  const access={};Object.defineProperty(access,'private',{enumerable:true,get(){return 'secret';}});
  assert.throws(()=>canonicalJson(access),/accessor_not_allowed/);
  const loop={};loop.loop=loop;
  assert.throws(()=>canonicalJson(loop),/cyclic_json/);
});
test('fixture prompt digest is not misrepresented as a global template digest',()=>{
  const result=fingerprintSyntheticContext(fixture);
  assert.match(result.actual_fixture_prompt_sha256,/^[a-f0-9]{64}$/);
  assert.equal(result.prompt_is_specific_to_fixture,true);
  assert.equal(result.claimed_global_prompt_template_sha256,false);
  assert.equal(result.execution_authorized,false);
});
test('legacy runtime serialization and proposed canonical serialization remain distinct',()=>{
  const a={request:{operation_id:'x'},steps_remaining:2,observations:[]};
  const b={steps_remaining:2,observations:[],request:{operation_id:'x'}};
  const x=fingerprintSyntheticContext(a);
  const y=fingerprintSyntheticContext(b);
  assert.notEqual(x.existing_recorder_context_sha256,y.existing_recorder_context_sha256);
  assert.equal(x.candidate_canonical_context_sha256,y.candidate_canonical_context_sha256);
});
test('per-decision runtime prompt hash changes when synthetic context changes',()=>{
  const x=fingerprintSyntheticContext(fixture);
  const y=fingerprintSyntheticContext({...fixture,steps_remaining:3});
  assert.notEqual(x.actual_fixture_prompt_sha256,y.actual_fixture_prompt_sha256);
});
test('synthetic whole-decision duration includes all callback work and never delivers action',async()=>{
  const times=[1000,1090];
  let called=0;
  const r=await measureSyntheticDecision({context:fixture,execute:async({fingerprint})=>{
    assert.equal(fingerprint.prompt_is_specific_to_fixture,true);
    called++;
  },clock:()=>times.shift()});
  assert.equal(called,1);
  assert.equal(r.outcome,'COMPLETE_SYNTHETIC');
  assert.equal(r.elapsed_wall_ms,90);
  assert.equal(r.execution_authorized,false);
  assert.equal(r.raw_model_action_delivered,false);
});
test('deliberately over-budget completed synthetic callback remains a timeout',async()=>{
  const times=[0,15001];
  const r=await measureSyntheticDecision({context:fixture,execute:async()=>{},
    clock:()=>times.shift()});
  assert.equal(r.outcome,'TIMEOUT_RETAINED');
  assert.equal(r.replace_failed_attempts,false);
});
test('synthetic failure is preserved as failure evidence, never pass',async()=>{
  const times=[0,40];
  const r=await measureSyntheticDecision({context:fixture,execute:async()=>{
    throw TypeError('synthetic negative fixture');
  },clock:()=>times.shift()});
  assert.equal(r.outcome,'FAILURE_RETAINED');
  assert.equal(r.error_kind,'TypeError');
});
test('async synthetic stall produces abort and timeout classification',async()=>{
  let abortSeen=false;
  const clockValues=[0,15000];
  const r=await measureSyntheticDecision({
    context:fixture,execute:async({signal})=>new Promise(resolve=>{
      signal.addEventListener('abort',()=>{abortSeen=true;resolve();},{once:true});
    }),
    clock:()=>clockValues.shift(),
    setTimer:fn=>{queueMicrotask(fn);return 4;},clearTimer:()=>{}
  });
  assert.equal(abortSeen,true);
  assert.equal(r.outcome,'TIMEOUT_RETAINED');
});
test('different timeout budget cannot quietly alter baseline',async()=>{
  await assert.rejects(measureSyntheticDecision({context:fixture,execute:async()=>{},
    timeoutMs:16000}),/protocol_budget_drift/);
});
test('offline report reads tracked source only and never enables execution',()=>{
  const result=staticOfflineReport(root,proposed);
  assert.equal(result.live_model_requests,0);
  assert.equal(result.external_messages_sent,0);
  assert.equal(result.physical_run_authorized,false);
  assert.equal(result.run_plan_review.state,'NEEDS_REVIEW');
  assert.equal(Object.keys(result.source_fingerprints.files).length,4);
  for(const x of Object.values(sourceFingerprints(root).files))
    assert.match(x.sha256,/^[a-f0-9]{64}$/);
});
