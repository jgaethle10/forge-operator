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

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function costOf(workload) {
  return {
    cpu: Math.max(0, finiteNumber(workload.cpu_units)),
    memory: Math.max(0, finiteNumber(workload.memory_mb)),
    power: Math.max(0, finiteNumber(workload.power_units))
  };
}

function fits(remaining, cost) {
  return (
    remaining.cpu >= cost.cpu &&
    remaining.memory >= cost.memory &&
    remaining.power >= cost.power
  );
}

function subtract(remaining, cost) {
  remaining.cpu -= cost.cpu;
  remaining.memory -= cost.memory;
  remaining.power -= cost.power;
}

function normalizedPriority(value) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return PRIORITY.ORDINARY;
  return Math.max(PRIORITY.LIFE_SAFETY, Math.min(PRIORITY.BULK, n));
}

export { PRIORITY, PRIORITY_NAME };

export function planContinuity({ capacity, workloads }) {
  const initial = {
    cpu: Math.max(0, finiteNumber(capacity?.cpu_units)),
    memory: Math.max(0, finiteNumber(capacity?.memory_mb)),
    power: Math.max(0, finiteNumber(capacity?.power_units))
  };
  const remaining = { ...initial };

  const normalized = (workloads || []).map((workload, index) => ({
    ...workload,
    priority: normalizedPriority(workload.priority),
    _index: index,
    _cost: costOf(workload)
  }));

  const ordered = normalized.sort((a, b) =>
    a.priority - b.priority ||
    Number(Boolean(b.required)) - Number(Boolean(a.required)) ||
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
      required: Boolean(workload.required),
      cost: workload._cost
    };

    if (fits(remaining, workload._cost)) {
      subtract(remaining, workload._cost);
      admitted.push({
        ...base,
        mode: 'full'
      });
      continue;
    }

    const fallback = workload.fallback;
    if (fallback) {
      const fallbackCost = costOf(fallback);
      if (fits(remaining, fallbackCost)) {
        subtract(remaining, fallbackCost);
        degraded.push({
          ...base,
          mode: fallback.mode || 'degraded',
          cost: fallbackCost,
          original_cost: workload._cost
        });
        continue;
      }
    }

    shed.push({
      ...base,
      mode: 'shed',
      reason: 'insufficient_capacity'
    });
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
      required_workloads_preserved: requiredLost.length === 0,
      life_safety_shed: shed.some((row) => row.priority === PRIORITY.LIFE_SAFETY),
      control_plane_shed: shed.some((row) => row.priority === PRIORITY.CONTROL_PLANE),
      mission_critical_shed: shed.some((row) => row.priority === PRIORITY.MISSION_CRITICAL)
    }
  };
}
