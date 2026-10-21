/**
 * Simulation-only embodied goal bridge for EarthWorks Autonomy.
 * LLM outputs are untrusted GOAL PROPOSALS, never motor commands.
 * No ROS, serial, network, device, robot SDK, or physical I/O is present.
 */
import { createHash } from 'node:crypto';
import { createAdapterRegistry, makeSimulatorAdapter } from './equipment-adapter.mjs';

const LIMITS = Object.freeze({
  max_linear_mps: 0.15,
  max_angular_rps: 0.8,
  max_xy_m: 1,
  robot_radius_m: 0.12,
  clearance_m: 0.10,
  sensor_ttl_s: 0.35,
  arrival_tolerance_m: 0.025,
});
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const strictly = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const wrapAngle = a => (a + Math.PI) % (2 * Math.PI) < 0
  ? ((a + Math.PI) % (2 * Math.PI)) + Math.PI
  : ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
const distance = (x, y) => Math.hypot(x, y);

export class EmbodiedGoalSimulator {
  constructor({ robot_id = 'sim.robot.001', starting_pose = { x: 0, y: 0, yaw: 0 } } = {}) {
    if (typeof robot_id !== 'string' || !/^[a-zA-Z0-9._-]{1,64}$/.test(robot_id)) throw new Error('invalid_robot_id');
    if (!strictly(starting_pose, ['x', 'y', 'yaw']) || !Object.values(starting_pose).every(finite)) throw new Error('invalid_starting_pose');
    if (Math.abs(starting_pose.x) > LIMITS.max_xy_m || Math.abs(starting_pose.y) > LIMITS.max_xy_m) throw new Error('starting_pose_out_of_bounds');
    this.robot_id = robot_id;
    this.pose = { ...starting_pose };
    this.time_s = 0;
    this.observation = null;
    this.active_goal = null;
    this.seen = new Set();
    this.events = [];
    this.registry = createAdapterRegistry();
    this.adapter = this.registry.register(makeSimulatorAdapter('mobile_robot'));
  }

  log(event, detail = {}) {
    const record = { seq: this.events.length, time_s: Number(this.time_s.toFixed(5)), event, detail,
      prev_hash: this.events.at(-1)?.hash ?? 'GENESIS' };
    this.events.push({ ...record, hash: fingerprint(record) });
  }

  verifyReceipts() {
    let prev = 'GENESIS';
    return this.events.every((e, index) => {
      const { hash, ...body } = e;
      const valid = e.seq === index && e.prev_hash === prev && hash === fingerprint(body);
      prev = hash;
      return valid;
    });
  }

  /** Synthetic observation. Must be refreshed explicitly, never on control ticks. */
  observe(data) {
    const keys = ['observed_at_s', 'lease_until_s', 'estop', 'human_nearby', 'obstacles'];
    if (!strictly(data, keys) || !finite(data.observed_at_s) || !finite(data.lease_until_s)
      || data.observed_at_s > this.time_s || data.observed_at_s < 0
      || typeof data.estop !== 'boolean' || typeof data.human_nearby !== 'boolean'
      || !Array.isArray(data.obstacles) || data.obstacles.length > 50
      || !data.obstacles.every(o => strictly(o, ['x', 'y', 'radius'])
        && Object.values(o).every(finite) && o.radius >= 0 && o.radius <= 2)) {
      throw new Error('invalid_synthetic_observation');
    }
    // Store by value: later caller mutation cannot alter safety facts silently.
    this.observation = structuredClone(data);
    this.log('observed', { observed_at_s: data.observed_at_s, estop: data.estop,
      human_nearby: data.human_nearby, obstacle_count: data.obstacles.length });
  }

  safetyState() {
    const o = this.observation;
    if (!o) return 'missing_observation';
    if (o.estop) return 'estop';
    if (o.human_nearby) return 'human_nearby';
    if (o.lease_until_s <= this.time_s) return 'lease_expired';
    if (this.time_s - o.observed_at_s > LIMITS.sensor_ttl_s) return 'sensor_stale';
    return null;
  }

  /** Accepts only a constrained JSON object from an untrusted planner. */
  submitGoal(plan, { authority_state = 'none', robot_id = '' } = {}) {
    if (authority_state !== 'simulation' || robot_id !== this.robot_id) throw new Error('simulation_authority_required');
    const base = ['schema', 'request_id', 'kind'];
    const valid = strictly(plan, base) || strictly(plan, [...base, 'target_x_m', 'target_y_m', 'speed_mps']);
    if (!valid || plan.schema !== 'evercraft.embodied.goal.v1' || typeof plan.request_id !== 'string'
      || !/^[a-zA-Z0-9._-]{1,100}$/.test(plan.request_id) || !['goto', 'stop'].includes(plan.kind)) {
      throw new Error('invalid_planner_goal');
    }
    if (this.seen.has(plan.request_id)) throw new Error('duplicate_request_id');
    if (plan.kind === 'stop') {
      if (!strictly(plan, base)) throw new Error('invalid_stop_goal');
      this.active_goal = null;
      this.seen.add(plan.request_id);
      this.log('stop', { request_id: plan.request_id });
      return { accepted: true, simulation_only: true };
    }
    if (!strictly(plan, [...base, 'target_x_m', 'target_y_m', 'speed_mps'])
      || ![plan.target_x_m, plan.target_y_m, plan.speed_mps].every(finite)
      || Math.abs(plan.target_x_m) > LIMITS.max_xy_m || Math.abs(plan.target_y_m) > LIMITS.max_xy_m
      || !(plan.speed_mps > 0 && plan.speed_mps <= LIMITS.max_linear_mps)) {
      throw new Error('unbounded_planner_goal');
    }
    if (this.safetyState()) throw new Error('movement_held:' + this.safetyState());
    const adapterResult = this.registry.authorize({
      adapterId: this.adapter.id, authorityState: 'simulation', command: 'navigate_to_zone',
    });
    if (!adapterResult.ok) throw new Error('adapter_rejected:' + adapterResult.reason);
    this.active_goal = { ...plan };
    this.seen.add(plan.request_id);
    this.log('goal_accepted', { ...plan, authority_state: 'simulation' });
    return { accepted: true, simulation_only: true, adapter_id: this.adapter.id };
  }

  step(dt_s = 0.05) {
    if (!finite(dt_s) || dt_s <= 0 || dt_s > 0.1) throw new Error('invalid_step');
    this.time_s = Number((this.time_s + dt_s).toFixed(5));
    const hold = this.safetyState();
    if (hold) {
      this.active_goal = null;
      this.log('hold', { reason: hold });
      return { linear_mps: 0, angular_rps: 0, status: 'hold', reason: hold };
    }
    if (!this.active_goal) return { linear_mps: 0, angular_rps: 0, status: 'idle' };
    const g = this.active_goal;
    const dx = g.target_x_m - this.pose.x;
    const dy = g.target_y_m - this.pose.y;
    const remaining = distance(dx, dy);
    if (remaining <= LIMITS.arrival_tolerance_m) {
      this.active_goal = null;
      this.log('arrived', { request_id: g.request_id });
      return { linear_mps: 0, angular_rps: 0, status: 'arrived' };
    }
    const heading_error = wrapAngle(Math.atan2(dy, dx) - this.pose.yaw);
    const angular = Math.max(-LIMITS.max_angular_rps, Math.min(LIMITS.max_angular_rps, heading_error / dt_s));
    const linear = Math.abs(heading_error) > 0.15 ? 0 : Math.min(g.speed_mps, remaining / dt_s);
    const future = { x: this.pose.x + Math.cos(this.pose.yaw) * linear * dt_s,
      y: this.pose.y + Math.sin(this.pose.yaw) * linear * dt_s };
    if (Math.abs(future.x) > LIMITS.max_xy_m || Math.abs(future.y) > LIMITS.max_xy_m
      || this.observation.obstacles.some(o => distance(future.x - o.x, future.y - o.y)
        < LIMITS.robot_radius_m + LIMITS.clearance_m + o.radius)) {
      this.active_goal = null;
      this.log('hold', { reason: 'collision_or_geofence' });
      return { linear_mps: 0, angular_rps: 0, status: 'hold', reason: 'collision_or_geofence' };
    }
    this.pose = { ...future, yaw: wrapAngle(this.pose.yaw + angular * dt_s) };
    this.log('simulated_step', { x: this.pose.x, y: this.pose.y, linear_mps: linear, angular_rps: angular });
    return { linear_mps: linear, angular_rps: angular, status: 'simulated' };
  }

  snapshot() {
    return structuredClone({ schema: 'evercraft.embodied.simulation-state.v1', robot_id: this.robot_id,
      simulated_time_s: this.time_s, pose: this.pose, active_goal: this.active_goal,
      receipt_count: this.events.length, last_receipt_hash: this.events.at(-1)?.hash ?? null,
      receipt_chain_valid: this.verifyReceipts(), physical_actuation_enabled: false });
  }
}
