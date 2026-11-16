import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbodiedGoalSimulator } from './embodied-goal-simulator.mjs';
import { parsePlannerGoal, submitLocalModelResponse, GOAL_OUTPUT_CONTRACT } from './local-planner-goal-adapter.mjs';
const goal = { schema: GOAL_OUTPUT_CONTRACT.schema, request_id: 'llm-001', kind: 'goto', target_x_m: 0.2, target_y_m: 0, speed_mps: 0.1 };
const observation = { observed_at_s: 0, lease_until_s: 2, estop: false, human_nearby: false, obstacles: [] };
const sim = () => { const s = new EmbodiedGoalSimulator(); s.observe(observation); return s; };
const context = s => ({ authority_state: 'simulation', robot_id: s.robot_id });

test('valid schema output becomes simulator-only goal, not a hardware call', () => {
  const s = sim();
  const r = submitLocalModelResponse(JSON.stringify(goal), s, context(s));
  assert.equal(r.accepted, true);
  assert.equal(r.simulation_only, true);
  assert.equal(s.snapshot().physical_actuation_enabled, false);
});

test('parser rejects prose, fenced markdown, and non-JSON model output', () => {
  for (const raw of ['go forward', '```json\n' + JSON.stringify(goal) + '\n```', 'before ' + JSON.stringify(goal), '{notjson}']) {
    assert.throws(() => parsePlannerGoal(raw), /model_output_/);
  }
});

test('overlong or non-string model output rejected', () => {
  for (const raw of ['x'.repeat(1025), { ...goal }, null, undefined]) {
    assert.throws(() => parsePlannerGoal(raw), /model_output_invalid_size_or_type/);
  }
});

test('wrong schema is rejected', () => {
  assert.throws(() => parsePlannerGoal(JSON.stringify({ ...goal, schema: 'v2' })), /model_output_wrong_schema/);
});

test('JSON command/code injection or extra keys cannot cross simulator gate', () => {
  for (const extra of [{ python: 'print(1)' }, { raw_motor: 'forward' }, { kind: 'exec' },
    { authority_state: 'bounded_physical' }, { target_x_m: 300 }]) {
    const s = sim();
    assert.throws(() => submitLocalModelResponse(JSON.stringify({ ...goal, ...extra }), s, context(s)));
    assert.equal(s.active_goal, null);
  }
});

test('simulation context cannot be injected through the model JSON', () => {
  const s = sim();
  assert.throws(() => submitLocalModelResponse(JSON.stringify(goal), s,
    { authority_state: 'bounded_physical', robot_id: s.robot_id }), /simulation_authority_required/);
});

test('duplicate model goals cannot be replayed', () => {
  const s = sim(); const output = JSON.stringify(goal);
  submitLocalModelResponse(output, s, context(s));
  assert.throws(() => submitLocalModelResponse(output, s, context(s)), /duplicate_request_id/);
});

test('model stop goal cancels pending motion', () => {
  const s = sim();
  submitLocalModelResponse(JSON.stringify(goal), s, context(s));
  const stop = { schema: GOAL_OUTPUT_CONTRACT.schema, request_id: 'stop-999', kind: 'stop' };
  submitLocalModelResponse(JSON.stringify(stop), s, context(s));
  assert.equal(s.active_goal, null);
});

test('controller not duck-typed by arbitrary object', () => {
  assert.throws(() => submitLocalModelResponse(JSON.stringify(goal), { submitGoal: () => ({ accepted: true }) }, {}), /simulator_instance_required/);
});

test('unicode multibyte output obeys byte cap', () => {
  assert.throws(() => parsePlannerGoal('🐙'.repeat(260)), /model_output_invalid_size_or_type/);
});

test('parser rejects array model output', () => {
  assert.throws(() => parsePlannerGoal(JSON.stringify([goal])), /model_output_not_plain_json/);
});

test('missing or stale sensing cannot be made safe by model output', () => {
  const s = new EmbodiedGoalSimulator();
  assert.throws(() => submitLocalModelResponse(JSON.stringify(goal), s, context(s)), /missing_observation/);
});
