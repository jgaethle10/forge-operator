import assert from 'node:assert/strict';
import { PRIORITY, planContinuity } from './continuity-kernel.mjs';

const workloads = [
  {
    id: 'guardian-continuity',
    priority: PRIORITY.LIFE_SAFETY,
    required: true,
    cpu_units: 1,
    memory_mb: 96,
    power_units: 2,
    fallback: { mode: 'guardian_cache_only', cpu_units: 0.5, memory_mb: 48, power_units: 1 }
  },
  {
    id: 'identity-trust-routing',
    priority: PRIORITY.CONTROL_PLANE,
    required: true,
    cpu_units: 1,
    memory_mb: 96,
    power_units: 2
  },
  {
    id: 'receipt-ledger',
    priority: PRIORITY.CONTROL_PLANE,
    required: true,
    cpu_units: 0.5,
    memory_mb: 64,
    power_units: 1
  },
  {
    id: 'saban-mission-runtime',
    priority: PRIORITY.MISSION_CRITICAL,
    required: true,
    cpu_units: 3,
    memory_mb: 768,
    power_units: 8,
    fallback: { mode: 'deterministic_tools_and_queue', cpu_units: 1, memory_mb: 192, power_units: 2 }
  },
  {
    id: 'hearth-checkpoint',
    priority: PRIORITY.DURABILITY,
    required: true,
    cpu_units: 0.5,
    memory_mb: 64,
    power_units: 1
  },
  {
    id: 'store-forward',
    priority: PRIORITY.DURABILITY,
    required: false,
    cpu_units: 0.5,
    memory_mb: 96,
    power_units: 1
  },
  {
    id: 'local-inference-large',
    priority: PRIORITY.MISSION_CRITICAL,
    required: false,
    cpu_units: 5,
    memory_mb: 4096,
    power_units: 20,
    fallback: { mode: 'small_model_or_deterministic', cpu_units: 2, memory_mb: 768, power_units: 5 }
  },
  {
    id: 'operator-comms',
    priority: PRIORITY.COMMUNICATIONS,
    required: false,
    cpu_units: 1,
    memory_mb: 192,
    power_units: 3
  },
  {
    id: 'ordinary-automation',
    priority: PRIORITY.ORDINARY,
    required: false,
    cpu_units: 2,
    memory_mb: 512,
    power_units: 8
  },
  {
    id: 'analytics-batch',
    priority: PRIORITY.BULK,
    required: false,
    cpu_units: 4,
    memory_mb: 2048,
    power_units: 20
  },
  {
    id: 'publishing-batch',
    priority: PRIORITY.BULK,
    required: false,
    cpu_units: 2,
    memory_mb: 512,
    power_units: 8
  }
];

const scenarios = [
  {
    name: 'full',
    capacity: { cpu_units: 24, memory_mb: 16384, power_units: 100 }
  },
  {
    name: 'brownout',
    capacity: { cpu_units: 12, memory_mb: 6144, power_units: 35 }
  },
  {
    name: 'severe',
    capacity: { cpu_units: 7, memory_mb: 2048, power_units: 17 }
  },
  {
    name: 'survival',
    capacity: { cpu_units: 4, memory_mb: 768, power_units: 8 }
  }
];

const receipts = [];

for (const scenario of scenarios) {
  const plan = planContinuity({
    capacity: scenario.capacity,
    workloads
  });

  assert.equal(plan.invariants.required_workloads_preserved, true, scenario.name);
  assert.equal(plan.invariants.life_safety_shed, false, scenario.name);
  assert.equal(plan.invariants.control_plane_shed, false, scenario.name);

  const admittedIds = new Set([
    ...plan.admitted.map((row) => row.id),
    ...plan.degraded.map((row) => row.id)
  ]);

  assert.ok(admittedIds.has('guardian-continuity'), scenario.name);
  assert.ok(admittedIds.has('identity-trust-routing'), scenario.name);
  assert.ok(admittedIds.has('receipt-ledger'), scenario.name);
  assert.ok(admittedIds.has('saban-mission-runtime'), scenario.name);
  assert.ok(admittedIds.has('hearth-checkpoint'), scenario.name);

  if (scenario.name === 'survival') {
    assert.ok(plan.shed.some((row) => row.id === 'analytics-batch'));
    assert.ok(plan.shed.some((row) => row.id === 'publishing-batch'));
    assert.ok(plan.shed.some((row) => row.id === 'ordinary-automation'));
    assert.ok(plan.degraded.some((row) =>
      row.id === 'saban-mission-runtime' &&
      row.mode === 'deterministic_tools_and_queue'
    ));
  }

  receipts.push({
    scenario: scenario.name,
    mode: plan.mode,
    admitted: plan.admitted.map((row) => row.id),
    degraded: plan.degraded.map((row) => ({ id: row.id, mode: row.mode })),
    shed: plan.shed.map((row) => row.id),
    remaining: plan.remaining
  });
}

const impossible = planContinuity({
  capacity: { cpu_units: 0.25, memory_mb: 32, power_units: 0.5 },
  workloads
});
assert.equal(impossible.mode, 'CRITICAL_RESOURCE_DEFICIT');
assert.equal(impossible.invariants.required_workloads_preserved, false);

console.log(JSON.stringify({
  schema: 'evercraft.continuity-kernel-proof.v1',
  status: 'PASS',
  scenarios: receipts,
  impossible_capacity_is_reported_honestly: true
}, null, 2));
