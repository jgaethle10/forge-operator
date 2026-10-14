import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbodiedGoalSimulator } from './embodied-goal-simulator.mjs';
const context = sim => ({ authority_state: 'simulation', robot_id: sim.robot_id });
const observe = (sim, overrides = {}) => sim.observe({ observed_at_s: sim.time_s,
  lease_until_s: sim.time_s + 2, estop: false, human_nearby: false, obstacles: [], ...overrides });
const move = (request_id = 'goal-001', overrides = {}) => ({ schema: 'evercraft.embodied.goal.v1',
  request_id, kind: 'goto', target_x_m: 0.3, target_y_m: 0, speed_mps: 0.1, ...overrides });
const stop = (request_id = 'stop-001') => ({ schema: 'evercraft.embodied.goal.v1', request_id, kind: 'stop' });

test('simulation moves to goal only after explicit fresh observation', () => {
  const sim = new EmbodiedGoalSimulator();
  observe(sim);
  assert.equal(sim.submitGoal(move(), context(sim)).accepted, true);
  for (let n = 0; n < 90; n++) {
    observe(sim);
    const r = sim.step();
    assert.ok(r.linear_mps <= 0.15);
    if (r.status === 'arrived') break;
  }
  assert.ok(sim.snapshot().pose.x >= 0.27);
  assert.equal(sim.snapshot().receipt_chain_valid, true);
  assert.equal(sim.snapshot().physical_actuation_enabled, false);
});

test('no observation rejects movement', () => {
  const sim = new EmbodiedGoalSimulator();
  assert.throws(() => sim.submitGoal(move(), context(sim)), /missing_observation/);
});

test('simulation-only authority and correct robot identity required', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  for (const auth of [{ authority_state: 'bounded_physical', robot_id: sim.robot_id },
    { authority_state: 'shadow', robot_id: sim.robot_id },
    { authority_state: 'simulation', robot_id: 'wrong.robot' }]) {
    assert.throws(() => sim.submitGoal(move(), auth), /simulation_authority_required/);
  }
});

test('planner cannot send code, SDK commands, or extra fields', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  for (const payload of [move('a', { raw_motor: 'forward' }), move('b', { kind: 'exec' }),
    move('c', { python: '__import__' }), 'run motor', null]) {
    assert.throws(() => sim.submitGoal(payload, context(sim)), /invalid_planner_goal/);
  }
});

test('reject NaN, infinity, oversized coordinates, invalid speed, or coercions', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  for (const overrides of [{ target_x_m: NaN }, { target_y_m: Infinity }, { speed_mps: NaN },
    { speed_mps: '0.1' }, { speed_mps: -1 }, { speed_mps: 1 }, { target_x_m: 3 }]) {
    assert.throws(() => sim.submitGoal(move('a', overrides), context(sim)), /unbounded_planner_goal/);
  }
});

test('replay/duplicate request IDs rejected', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  sim.submitGoal(move(), context(sim));
  assert.throws(() => sim.submitGoal(move(), context(sim)), /duplicate_request_id/);
});

test('emergency stop cancels motion and zeroes velocity', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  sim.submitGoal(move(), context(sim)); observe(sim, { estop: true });
  assert.equal(sim.step().linear_mps, 0);
  assert.equal(sim.snapshot().active_goal, null);
});

test('human proximity cancels movement', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim); sim.submitGoal(move(), context(sim));
  observe(sim, { human_nearby: true });
  assert.equal(sim.step().reason, 'human_nearby');
});

test('lease expires and motion halts without synthetic renewal', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim, { lease_until_s: 0.06 });
  sim.submitGoal(move(), context(sim));
  assert.equal(sim.step(0.1).reason, 'lease_expired');
});

test('stale sensors fail-closed before subsequent motion', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  sim.submitGoal(move(), context(sim));
  for (let i = 0; i < 8; i++) sim.step(0.05);
  assert.equal(sim.snapshot().active_goal, null);
  assert.ok(sim.events.some(e => e.detail.reason === 'sensor_stale'));
});

test('obstacle clearance holds before collision', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim, { obstacles: [{ x: 0.23, y: 0, radius: 0.03 }] });
  sim.submitGoal(move(), context(sim));
  assert.equal(sim.step().reason, 'collision_or_geofence');
  assert.equal(sim.snapshot().pose.x, 0);
});

test('STOP is accepted with stale sensing and no active lease', () => {
  const sim = new EmbodiedGoalSimulator();
  assert.equal(sim.submitGoal(stop(), context(sim)).accepted, true);
  assert.equal(sim.snapshot().active_goal, null);
});

test('rotates before translating', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  sim.submitGoal(move('turn-001', { target_x_m: 0, target_y_m: 0.4 }), context(sim));
  const result = sim.step();
  assert.equal(result.linear_mps, 0);
  assert.ok(result.angular_rps > 0);
});

test('observations copy data to prevent mutation after approval', () => {
  const sim = new EmbodiedGoalSimulator();
  const frame = { observed_at_s: 0, lease_until_s: 2, estop: false, human_nearby: false, obstacles: [] };
  sim.observe(frame); frame.estop = true;
  sim.submitGoal(move(), context(sim));
  assert.notEqual(sim.step().reason, 'estop');
});

test('invalid or future-dated synthetic observations rejected', () => {
  const sim = new EmbodiedGoalSimulator();
  assert.throws(() => observe(sim, { observed_at_s: 999 }), /invalid_synthetic_observation/);
  assert.throws(() => observe(sim, { obstacles: [{ x: 0, y: 0, radius: -1 }] }), /invalid_synthetic_observation/);
});

test('receipt tampering detectable and snapshots are not internal references', () => {
  const sim = new EmbodiedGoalSimulator(); observe(sim);
  const snap = sim.snapshot(); snap.pose.x = 999;
  assert.equal(sim.pose.x, 0);
  assert.equal(sim.verifyReceipts(), true);
  sim.events[0].detail.estop = true;
  assert.equal(sim.verifyReceipts(), false);
});

test('invalid dt cannot bypass time watchdog', () => {
  const sim = new EmbodiedGoalSimulator();
  for (const dt of [0, -1, 1, NaN, '0.05', Infinity]) {
    assert.throws(() => sim.step(dt), /invalid_step/);
  }
});
