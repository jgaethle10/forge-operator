import assert from 'node:assert/strict';
import {
  createMissionState,
  memoryStateIsFresh,
  postflight,
  preflight,
} from './kernel.mjs';

const now = new Date('2026-09-24T16:00:00Z');
const missionKey = 'systemia-one-organism-proof-v1';
let state = createMissionState({
  missionKey,
  objective: 'Operate one coherent mission across many logical agents.',
  successCondition: 'No duplicate execution, stale-memory leakage, or unreceipted completion.',
  now: now.toISOString(),
});

const staleRaven = {
  agent_key: 'raven',
  agent_name: 'Raven',
  must_preflight_memory: true,
  sync_status: 'healthy',
  last_sync_at: '2026-09-22T12:00:00Z',
  stale_after_hours: 24,
};
const freshSystemia = {
  agent_key: 'systemia',
  agent_name: 'Systemia',
  must_preflight_memory: true,
  sync_status: 'healthy',
  last_sync_at: '2026-09-24T15:30:00Z',
  stale_after_hours: 24,
};

assert.equal(memoryStateIsFresh(staleRaven, now.getTime()), false);
assert.equal(memoryStateIsFresh(freshSystemia, now.getTime()), true);

const ordinaryStale = {
  mission_key: missionKey,
  work_key: 'verify-raven',
  dedupe_key: 'verify-raven',
  work_type: 'verify',
  assigned_agents: ['Raven'],
};
const staleHold = preflight({ state, work: ordinaryStale, memoryStates: [staleRaven], now });
assert.equal(staleHold.ok, false);
assert.equal(staleHold.hold, 'assigned_agent_memory_stale');

const memoryRepair = {
  mission_key: missionKey,
  work_key: 'repair-raven-memory',
  dedupe_key: 'repair-raven-memory',
  work_type: 'memory',
  assigned_agents: ['Raven'],
};
const repairAdmission = preflight({ state, work: memoryRepair, memoryStates: [staleRaven], now });
assert.equal(repairAdmission.ok, true);
assert.equal(repairAdmission.role, 'reentry');
state = repairAdmission.state;

const duplicateCandidate = {
  mission_key: missionKey,
  work_key: 'analysis-copy',
  dedupe_key: 'shared-analysis',
  work_type: 'analyze',
  assigned_agents: ['Systemia'],
};
const duplicateHold = preflight({
  state,
  work: duplicateCandidate,
  memoryStates: [freshSystemia],
  workLedger: [{
    mission_key: missionKey,
    work_key: 'analysis-original',
    dedupe_key: 'shared-analysis',
    stage: 'executing',
  }],
  now,
});
assert.equal(duplicateHold.ok, false);
assert.equal(duplicateHold.hold, 'equivalent_work_exists');

const humanGate = preflight({
  state,
  work: {
    mission_key: missionKey,
    work_key: 'payment-obligation',
    dedupe_key: 'payment-obligation',
    work_type: 'commercial',
    founder_attention_required: true,
  },
  now,
});
assert.equal(humanGate.ok, false);
assert.equal(humanGate.hold, 'human_gate_unresolved');

const fingers = Array.from({ length: 100 }, (_, index) => ({
  mission_key: missionKey,
  work_key: `finger-${String(index + 1).padStart(3, '0')}`,
  dedupe_key: `finger-${String(index + 1).padStart(3, '0')}`,
  work_type: index % 10 === 0 ? 'verify' : index % 4 === 0 ? 'analyze' : 'build',
  assigned_agents: [],
  dependency_keys: index === 0 ? [] : [`finger-${String(index).padStart(3, '0')}`],
}));

for (const work of fingers) {
  const admission = preflight({ state, work, now });
  assert.equal(admission.ok, true, `${work.work_key} should be admitted`);
  assert.equal(admission.state.mission_key, missionKey);
  state = admission.state;
}

assert.equal(new Set(state.active_work_keys).size, 101);
assert.ok(state.lead_roles.length > 0);
assert.ok(state.support_roles.length > 0);
assert.ok(state.reset_roles.length > 0);
assert.ok(state.reentry_roles.includes('repair-raven-memory'));

const complete = postflight({
  state,
  work: fingers[0],
  result: 'complete',
  executionReceiptKey: 'exec:finger-001',
  outputRefs: ['artifact:finger-001'],
  cycleKey: 'cycle:organism-proof',
  now: new Date('2026-09-24T16:01:00Z'),
});
assert.equal(complete.ok, true);
assert.equal(complete.state.coherence_status, 'green');
assert.equal(complete.receipt.result, 'pass');
assert.ok(complete.receipt.evidence_refs.includes('exec:finger-001'));
state = complete.state;

const failed = postflight({
  state,
  work: fingers[1],
  result: 'failed',
  blocker: 'synthetic worker failure',
  cycleKey: 'cycle:organism-proof',
  now: new Date('2026-09-24T16:02:00Z'),
});
assert.equal(failed.ok, true);
assert.equal(failed.state.coherence_status, 'amber');
assert.equal(failed.receipt.result, 'blocked');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.organism.proof.v1',
  mission_key: missionKey,
  logical_fingers: fingers.length,
  shared_state_version: failed.state.state_version,
  active_work_keys: failed.state.active_work_keys.length,
  stale_memory_hold: staleHold.hold,
  memory_repair_role: repairAdmission.role,
  duplicate_hold: duplicateHold.hold,
  human_gate_hold: humanGate.hold,
  success_receipt: complete.receipt.receipt_key,
  failure_receipt: failed.receipt.receipt_key,
  final_coherence: failed.state.coherence_status,
}, null, 2));
