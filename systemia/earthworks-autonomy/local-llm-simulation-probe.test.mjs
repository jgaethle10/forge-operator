import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbodiedGoalSimulator } from './embodied-goal-simulator.mjs';
import {
  validateLoopbackEndpoint,
  queryLocalModel,
  runLocalModelSimulation,
} from './local-llm-simulation-probe.mjs';

const endpoint = 'http://127.0.0.1:8080/v1/chat/completions';
const goal = (request_id = 'case-001', fields = {}) => ({
  schema: 'evercraft.embodied.goal.v1', request_id, kind: 'goto',
  target_x_m: 0.25, target_y_m: 0, speed_mps: 0.1, ...fields,
});
const validBody = (text = JSON.stringify(goal())) => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }],
  usage: { prompt_tokens: 12, completion_tokens: 23 },
});
const respond = (payload = validBody(), status = 200) => new Response(
  typeof payload === 'string' ? payload : JSON.stringify(payload),
  { status, headers: { 'content-type': 'application/json' } },
);
const opts = (fetch_impl, overrides = {}) => ({
  endpoint, model: 'local-test-model', intent: 'Move to the marker', request_id: 'case-001',
  fetch_impl, now_ms: () => 12.34, ...overrides,
});
const simulator = () => {
  const sim = new EmbodiedGoalSimulator();
  sim.observe({ observed_at_s: 0, lease_until_s: 2, estop: false, human_nearby: false, obstacles: [] });
  return sim;
};
const context = sim => ({ authority_state: 'simulation', robot_id: sim.robot_id });

test('only exact numeric loopback endpoints accepted', () => {
  assert.equal(validateLoopbackEndpoint(endpoint), endpoint);
  assert.equal(validateLoopbackEndpoint('http://[::1]:8080/v1/chat/completions'),
    'http://[::1]:8080/v1/chat/completions');
  for (const bad of [
    'http://localhost:8080/v1/chat/completions',
    'http://127.0.0.2:8080/v1/chat/completions',
    'http://10.0.0.1:8080/v1/chat/completions',
    'https://127.0.0.1:8080/v1/chat/completions',
    'http://127.0.0.1:8080/other',
    'http://127.0.0.1:8080/v1/chat/completions?api_key=abc',
    'http://127.0.0.1:8080@evil.com/v1/chat/completions',
    'http://127.0.0.1:0/v1/chat/completions',
    'http://127.0.0.1:65536/v1/chat/completions',
    'http://2130706433:8080/v1/chat/completions',
  ]) assert.throws(() => validateLoopbackEndpoint(bad));
});

test('passes fixed non-streaming JSON prompt to loopback without credentials or redirects', async () => {
  let calls = 0;
  const fetch_impl = async (url, init) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal);
    const body = JSON.parse(init.body);
    assert.equal(body.stream, false);
    assert.equal(body.temperature, 0);
    assert.equal(body.model, 'local-test-model');
    assert.equal(body.messages.length, 2);
    assert.equal(JSON.parse(body.messages[1].content).request_id, 'case-001');
    return respond();
  };
  const result = await queryLocalModel(opts(fetch_impl));
  assert.equal(calls, 1);
  assert.equal(result.proposed_goal.kind, 'goto');
  assert.equal(result.model_reported_usage.completion_tokens, 23);
  assert.equal(result.physical_actuation_enabled, false);
});

test('invalid endpoint or oversized intent rejects before any fetch', async () => {
  let called = false;
  const fetch_impl = () => { called = true; throw Error('should not fetch'); };
  await assert.rejects(queryLocalModel(opts(fetch_impl, { endpoint: 'http://example.com:8080/v1/chat/completions' })),
    /loopback_endpoint_required/);
  await assert.rejects(queryLocalModel(opts(fetch_impl, { intent: 'a'.repeat(513) })), /intent_invalid/);
  assert.equal(called, false);
});

test('invalid timeout rejects before fetch', async () => {
  await assert.rejects(queryLocalModel(opts(() => {}, { timeout_ms: -1 })), /timeout_invalid/);
});

test('bad HTTP status rejected', async () => {
  await assert.rejects(queryLocalModel(opts(async () => respond('error', 500))), /model_http_status_500/);
});

test('streamed oversized model response rejected', async () => {
  await assert.rejects(queryLocalModel(opts(async () => respond('X'.repeat(17000)))), /model_response_oversized/);
});

test('non-JSON response rejected', async () => {
  await assert.rejects(queryLocalModel(opts(async () => respond('not json'))), /model_response_invalid_json/);
});

test('multiple choices, tool calls or truncated generations rejected', async () => {
  const bads = [
    { choices: [] },
    { choices: [validBody().choices[0], validBody().choices[0]] },
    { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: JSON.stringify(goal()) } }] },
    { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: JSON.stringify(goal()), tool_calls: [] } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'user', content: JSON.stringify(goal()) } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: null } }] },
  ];
  for (const payload of bads) {
    await assert.rejects(queryLocalModel(opts(async () => respond(payload))), /model_response_/);
  }
});

test('model cannot choose its own request ID', async () => {
  await assert.rejects(
    queryLocalModel(opts(async () => respond(validBody(JSON.stringify(goal('not-case-001')))))),
    /model_response_request_id_mismatch/,
  );
});

test('model markdown/prose and injected commands are rejected', async () => {
  for (const text of [
    '```json\n' + JSON.stringify(goal()) + '\n```',
    JSON.stringify(goal('case-001', { raw_motor: 'forward' })),
    JSON.stringify(goal('case-001', { authority_state: 'bounded_physical' })),
  ]) {
    await assert.rejects(queryLocalModel(opts(async () => respond(validBody(text)))));
  }
});

test('valid local model output only results in simulation state', async () => {
  const sim = simulator();
  const result = await runLocalModelSimulation({
    ...opts(async () => respond()), simulator: sim, authority_context: context(sim),
  });
  assert.equal(result.accepted_in_simulation, true);
  assert.equal(result.simulator_state.physical_actuation_enabled, false);
  assert.equal(sim.active_goal?.request_id, 'case-001');
});

test('no simulation lease or incorrect context blocks model even when output valid', async () => {
  const s = new EmbodiedGoalSimulator();
  await assert.rejects(runLocalModelSimulation({
    ...opts(async () => respond()), simulator: s, authority_context: context(s),
  }), /missing_observation/);
  const good = simulator();
  await assert.rejects(runLocalModelSimulation({
    ...opts(async () => respond()), simulator: good,
    authority_context: { authority_state: 'bounded_physical', robot_id: good.robot_id },
  }), /simulation_authority_required/);
});

test('model response is not allowed to override active emergency stop', async () => {
  const sim = new EmbodiedGoalSimulator();
  sim.observe({ observed_at_s: 0, lease_until_s: 2, estop: true, human_nearby: false, obstacles: [] });
  await assert.rejects(runLocalModelSimulation({
    ...opts(async () => respond()), simulator: sim, authority_context: context(sim),
  }), /movement_held:estop/);
  assert.equal(sim.snapshot().active_goal, null);
});

test('malformed response shape rejected', async () => {
  await assert.rejects(queryLocalModel(opts(async () => respond({ choices: null }))), /model_response_unexpected_choices/);
});

test('stale model output cannot replay accepted goal', async () => {
  const sim = simulator();
  const call = () => runLocalModelSimulation({
    ...opts(async () => respond()), simulator: sim, authority_context: context(sim),
  });
  await call();
  await assert.rejects(call(), /duplicate_request_id/);
});
