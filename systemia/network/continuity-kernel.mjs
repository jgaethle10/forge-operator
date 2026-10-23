const PRIORITY = Object.freeze({
  LIFE_SAFETY: 0,
  CONTROL_PLANE: 1,
  MISSION_CRITICAL: 2,
  DURABILITY: 3,
  COMMUNICATIONS: 4,
  ORDINARY: 5,
  BULK: 6
});

const PRIORITY_NAME = Object.freeze({
  0: 'life_safety',
  1: 'control_plane',
  2: 'mission_critical',
  3: 'durability',
  4: 'communications',
  5: 'ordinary',
  6: 'bulk'
});
const RESOURCES = Object.freeze([
  ['cpu_units', 'cpu'],
  ['memory_mb', 'memory'],
  ['power_units', 'power']
]);
const MAX_WORKLOADS = 10000;

function validResource(value) {
  // Number() coercion would silently turn null, false and '' into free capacity.
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function readResources(input, label, errors) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push(label + '_must_be_object');
    return null;
  }
  const result = {};
  for (const [name, key] of RESOURCES) {
    if (!validResource(input[name])) {
      errors.push(label + '_' + name + '_invalid');
    } else {
      result[key] = input[name];
    }
  }
  return result;
}

function invalidPlan(errors) {
  return {
    schema: 'evercraft.continuity-plan.v1',
    mode: 'HOLD_INVALID_RESOURCE_EVIDENCE',
    errors: errors.slice(0, 30),
    capacity: null,
    remaining: null,
    admitted: [],
    degraded: [],
    shed: [],
    invariants: {
      resource_evidence_valid: false,
      required_workloads_preserved: false,
      life_safety_shed: null,
      control_plane_shed: null,
      mission_critical_shed: null
    }
  };
}

function validateInput(capacity, workloads) {
  const errors = [];
  const initial = readResources(capacity, 'capacity', errors);
  if (!Array.isArray(workloads)) {
    errors.push('workloads_must_be_array');
    return { errors, initial, normalized: [] };
  }
  if (workloads.length > MAX_WORKLOADS) {
    errors.push('workload_count_exceeds_bound');
    return { errors, initial, normalized: [] };
  }

  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < workloads.length; index++) {
    const workload = workloads[index];
    const label = 'workload_' + index;
    if (!workload || typeof workload !== 'object' || Array.isArray(workload)) {
      errors.push(label + '_must_be_object');
      continue;
    }
    const id = workload.id;
    if (typeof id !== 'string' || !id.trim() || id.length > 160) {
      errors.push(label + '_id_invalid');
    } else if (seen.has(id)) {
      errors.push(label + '_duplicate_id');
    } else {
      seen.add(id);
    }

    const priority = workload.priority === undefined
      ? PRIORITY.ORDINARY : workload.priority;
    if (!Number.isInteger(priority) ||
        priority < PRIORITY.LIFE_SAFETY || priority > PRIORITY.BULK) {
      errors.push(label + '_priority_invalid');
    }

    const cost = readResources(workload, label, errors);
    let fallbackCost = null;
    if (workload.fallback !== undefined && workload.fallback !== null) {
      fallbackCost = readResources(workload.fallback, label + '_fallback', errors);
      if (typeof workload.fallback?.mode !== 'string' ||
          !workload.fallback.mode.trim()) {
        errors.push(label + '_fallback_mode_invalid');
      }
    }

    normalized.push({
      id,
      priority,
      required: workload.required === true,
      _index: index,
      _cost: cost,
      _fallbackCost: fallbackCost,
      _fallbackMode: workload.fallback?.mode || null
    });
  }
  return { errors, initial, normalized };
}

function fits(remaining, cost) {
  return remaining.cpu >= cost.cpu &&
    remaining.memory >= cost.memory &&
    remaining.power >= cost.power;
}

function subtract(remaining, cost) {
  remaining.cpu -= cost.cpu;
  remaining.memory -= cost.memory;
  remaining.power -= cost.power;
}

export { PRIORITY, PRIORITY_NAME };

export function planContinuity({ capacity, workloads } = {}) {
  const { errors, initial, normalized } = validateInput(capacity, workloads);
  if (errors.length) return invalidPlan(errors);
  const remaining = { ...initial };
  const ordered = normalized.sort((a, b) =>
    a.priority - b.priority ||
    Number(b.required) - Number(a.required) ||
    a._index - b._index
  );

  const admitted = [];
  const degraded = [];
  const shed = [];

  for (const workload of ordered) {
    const base = {
      id: workload.id,
      priority: workload.priority,
      priority_name: PRIORITY_NAME[workload.priority],
      required: workload.required,
      cost: workload._cost
    };

    if (fits(remaining, workload._cost)) {
      subtract(remaining, workload._cost);
      admitted.push({ ...base, mode: 'full' });
      continue;
    }

    if (workload._fallbackCost && fits(remaining, workload._fallbackCost)) {
      subtract(remaining, workload._fallbackCost);
      degraded.push({
        ...base,
        mode: workload._fallbackMode,
        cost: workload._fallbackCost,
        original_cost: workload._cost
      });
      continue;
    }

    shed.push({ ...base, mode: 'shed', reason: 'insufficient_capacity' });
  }

  const requiredLost = shed.filter((row) => row.required);
  const highestLostPriority = shed.length
    ? Math.min(...shed.map((row) => row.priority))
    : null;

  const mode =
    requiredLost.length > 0 ? 'CRITICAL_RESOURCE_DEFICIT' :
    shed.length === 0 ? 'FULL' :
    highestLostPriority >= PRIORITY.ORDINARY ? 'BROWNOUT_LIGHT' :
    highestLostPriority >= PRIORITY.COMMUNICATIONS ? 'BROWNOUT_MODERATE' :
    highestLostPriority >= PRIORITY.DURABILITY ? 'BROWNOUT_SEVERE' :
    'SURVIVAL';

  return {
    schema: 'evercraft.continuity-plan.v1',
    mode,
    capacity: initial,
    remaining,
    admitted,
    degraded,
    shed,
    invariants: {
      resource_evidence_valid: true,
      required_workloads_preserved: requiredLost.length === 0,
      life_safety_shed: shed.some((row) => row.priority === PRIORITY.LIFE_SAFETY),
      control_plane_shed: shed.some((row) => row.priority === PRIORITY.CONTROL_PLANE),
      mission_critical_shed: shed.some((row) => row.priority === PRIORITY.MISSION_CRITICAL)
    }
  };
}
