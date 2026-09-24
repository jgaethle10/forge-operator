import assert from 'node:assert/strict';
import {
  admitGoalPlan,
  authorizeGoalWork,
  createGoalState,
} from './goal-runtime.mjs';
import {
  createCapabilityRegistry,
  executeGoalWorkWithAdapter,
  selectCapabilityAdapter,
} from './capability-runtime.mjs';

const registry = createCapabilityRegistry([
  {
    capability_key: 'research.readonly.v1',
    work_types: ['research'],
    authority: 'read-only',
    async execute({ work }) {
      return {
        result: 'complete',
        receipt_ref: `exec:${work.work_key}`,
        evidence_refs: [`evidence:${work.work_key}`],
      };
    },
  },
  {
    capability_key: 'commercial.confirmed.v1',
    work_types: ['commercial'],
    authority: 'human-confirmed',
    human_gate_required: true,
    async execute({ work }) {
      return {
        result: 'complete',
        receipt_ref: `exec:${work.work_key}`,
      };
    },
  },
]);

let state = createGoalState({
  goalKey: 'capability-runtime-proof',
  objective: 'Route bounded goal work only to declared capability adapters.',
  now: new Date('2026-09-24T19:40:00Z'),
});

state = admitGoalPlan({
  state,
  plan: [
    { work_key: 'research', work_type: 'research' },
    {
      work_key: 'commercial',
      work_type: 'commercial',
      dependency_keys: ['research'],
      human_gate_required: true,
    },
  ],
  now: new Date('2026-09-24T19:40:01Z'),
});

assert.equal(selectCapabilityAdapter(registry, state.tasks[0]).capability_key, 'research.readonly.v1');

const research = await executeGoalWorkWithAdapter({
  state,
  workKey: 'research',
  registry,
  now: new Date('2026-09-24T19:41:00Z'),
});
assert.equal(research.ok, true);
assert.equal(research.state.tasks[0].status, 'complete');
state = research.state;

const held = await executeGoalWorkWithAdapter({
  state,
  workKey: 'commercial',
  registry,
  now: new Date('2026-09-24T19:42:00Z'),
}).catch((error) => ({ error }));

assert.ok(held.error);
assert.match(held.error.message, /not ready/);

state = authorizeGoalWork({
  state,
  workKey: 'commercial',
  authorizationRef: 'human:approval:capability-proof',
  now: new Date('2026-09-24T19:43:00Z'),
});

const commercial = await executeGoalWorkWithAdapter({
  state,
  workKey: 'commercial',
  registry,
  now: new Date('2026-09-24T19:44:00Z'),
});
assert.equal(commercial.ok, true);
assert.equal(commercial.state.status, 'complete');
assert.equal(commercial.receipt.authority, 'human-confirmed');

const noAdapterRegistry = createCapabilityRegistry([]);
const unavailable = await executeGoalWorkWithAdapter({
  state: admitGoalPlan({
    state: createGoalState({
      goalKey: 'no-adapter',
      objective: 'Fail closed when no capability adapter exists.',
      now: new Date('2026-09-24T19:45:00Z'),
    }),
    plan: [{ work_key: 'unknown', work_type: 'teleport' }],
    now: new Date('2026-09-24T19:45:01Z'),
  }),
  workKey: 'unknown',
  registry: noAdapterRegistry,
  now: new Date('2026-09-24T19:45:02Z'),
});
assert.equal(unavailable.executed, false);
assert.equal(unavailable.reason, 'no_adapter');
assert.equal(unavailable.receipt.result, 'unavailable');

const wronglyUngated = createGoalState({
  goalKey: 'wrongly-ungated',
  objective: 'Reject a human-gated adapter when the work plan omitted the gate.',
  now: new Date('2026-09-24T19:46:00Z'),
});
const wronglyUngatedPlan = admitGoalPlan({
  state: wronglyUngated,
  plan: [{ work_key: 'commercial', work_type: 'commercial' }],
  now: new Date('2026-09-24T19:46:01Z'),
});
const adapterHold = await executeGoalWorkWithAdapter({
  state: wronglyUngatedPlan,
  workKey: 'commercial',
  registry,
  now: new Date('2026-09-24T19:46:02Z'),
});
assert.equal(adapterHold.executed, false);
assert.equal(adapterHold.reason, 'adapter_requires_human_gate');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.capability-runtime.proof.v1',
  routed_readonly_work: true,
  preserved_human_gate: true,
  no_adapter_fails_closed: true,
  adapter_gate_cannot_be_weakened_by_plan: true,
}, null, 2));
