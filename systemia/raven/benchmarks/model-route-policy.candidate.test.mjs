import test from 'node:test';
import assert from 'node:assert/strict';
import { decideModelRoute, POLICY_SCHEMA } from './model-route-policy.candidate.mjs';

const request = overrides => ({
  task_id: 'SYNTHETIC-001',
  capabilities: ['text'],
  data_classification: 'public',
  local_only: false,
  cloud_consent: false,
  cost_ceiling_usd: 0.25,
  ...overrides
});

const localModel = overrides => ({
  provider_id: 'owned-local',
  model_id: 'test-small',
  runtime: 'local',
  configured: true,
  healthy: true,
  capabilities: ['text'],
  estimated_cost_usd: 0,
  latency_ms: 100,
  ...overrides
});

const cloudModel = overrides => ({
  provider_id: 'authorized-cloud',
  model_id: 'test-cloud',
  runtime: 'cloud',
  configured: true,
  healthy: true,
  credential_ready: true,
  capabilities: ['text'],
  estimated_cost_usd: 0.12,
  latency_ms: 50,
  retention_policy_verified: true,
  ...overrides
});

test('returns held for malformed or unclassified requests', () => {
  assert.equal(decideModelRoute({}).status, 'held');
  assert.deepEqual(decideModelRoute({request:request({data_classification:'unknown'}),inventory:[localModel()]}).reason_codes, ['UNCLASSIFIED_DATA']);
  assert.deepEqual(decideModelRoute({request:request({cost_ceiling_usd:undefined}),inventory:[localModel()]}).reason_codes, ['COST_CEILING_REQUIRED']);
});

test('confidential local-only work cannot escape to cloud', () => {
  const result = decideModelRoute({request:request({local_only:true,data_classification:'confidential',cloud_consent:true,confidential_cloud_approved:true}),inventory:[cloudModel()]});
  assert.equal(result.status, 'held');
  assert.equal(result.primary, null);
  assert.equal(result.inference_performed, false);
});

test('local installed model is preferred even when cloud is faster', () => {
  const result = decideModelRoute({request:request({cloud_consent:true}),inventory:[cloudModel(),localModel()]});
  assert.equal(result.status, 'eligible');
  assert.equal(result.primary.provider_id, 'owned-local');
  assert.equal(result.schema, POLICY_SCHEMA);
  assert.equal(result.external_effect_authorized, false);
});

test('cloud requires explicit consent and ready credentials', () => {
  assert.equal(decideModelRoute({request:request(),inventory:[cloudModel()]}).status, 'held');
  assert.equal(decideModelRoute({request:request({cloud_consent:true}),inventory:[cloudModel({credential_ready:false})]}).status, 'held');
  assert.equal(decideModelRoute({request:request({cloud_consent:true}),inventory:[cloudModel()]}).status, 'eligible');
});

test('confidential cloud requires separate approval and verified retention', () => {
  const task=request({data_classification:'confidential',cloud_consent:true});
  assert.equal(decideModelRoute({request:task,inventory:[cloudModel()]}).status,'held');
  assert.equal(decideModelRoute({request:{...task,confidential_cloud_approved:true},inventory:[cloudModel({retention_policy_verified:false})]}).status,'held');
  assert.equal(decideModelRoute({request:{...task,confidential_cloud_approved:true},inventory:[cloudModel()]}).status,'eligible');
});

test('missing costs, unsupported capabilities, unhealthy models fail closed', () => {
  assert.equal(decideModelRoute({request:request(),inventory:[localModel({estimated_cost_usd:null})]}).status,'held');
  assert.equal(decideModelRoute({request:request({capabilities:['vision']}),inventory:[localModel()]}).status,'held');
  assert.equal(decideModelRoute({request:request(),inventory:[localModel({healthy:false})]}).status,'held');
});

test('known over-budget route is rejected rather than inferred free', () => {
  const result=decideModelRoute({request:request({cost_ceiling_usd:0.01,cloud_consent:true}),inventory:[cloudModel()]});
  assert.deepEqual(result.reason_codes,['OVER_BUDGET']);
});

test('second opinion proposes distinct provider route within shared budget', () => {
  const result=decideModelRoute({request:request({second_opinion_requested:true,cloud_consent:true}),inventory:[localModel(),cloudModel()]});
  assert.equal(result.status,'eligible');
  assert.notEqual(result.primary.provider_id,result.secondary.provider_id);
  assert.equal(result.estimated_cost_usd,0.12);
  assert.equal(result.secondary.route_status,'proposed_only');
  assert.equal(result.inference_performed,false);
});

test('second opinion cannot invent a second eligible model', () => {
  const result=decideModelRoute({request:request({second_opinion_requested:true}),inventory:[localModel()]});
  assert.deepEqual(result.reason_codes,['SECOND_OPINION_ROUTE_UNAVAILABLE']);
  assert.equal(result.secondary,null);
});

test('total second-opinion budget is enforced', () => {
  const result=decideModelRoute({request:request({second_opinion_requested:true,cloud_consent:true,cost_ceiling_usd:0.1}),inventory:[localModel(),cloudModel()]});
  assert.equal(result.status,'held');
});

test('stable lexical tie breaks and provider secrets never appear in receipt', () => {
  const inventory=[localModel({model_id:'zeta',secret:'TOP_SECRET'}),localModel({model_id:'alpha',secret:'DIFFERENT_SECRET'})];
  const result=decideModelRoute({request:request(),inventory});
  assert.equal(result.primary.model_id,'alpha');
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
});

test('max latency policy rejects stale performance candidate', () => {
  const result=decideModelRoute({request:request({max_latency_ms:90}),inventory:[localModel({latency_ms:100})]});
  assert.equal(result.status,'held');
});
