import assert from 'node:assert/strict';
import {
  LEGACY_RESCUE_WATCH,
  buildLegacyRescueMissionSnapshot,
  buildLegacyRescueWatchPlan,
  classifyLegacyRescueSignal,
  createLegacyRescueWatchGoal,
  dedupeLegacyRescueSignals,
  shouldSurfaceLegacyRescueChange,
} from './legacy-rescue-watch.mjs';

assert.equal(LEGACY_RESCUE_WATCH.schema, 'evercraft.systemia.workflow.v1');
assert.equal(LEGACY_RESCUE_WATCH.cadence_seconds, 300);
assert.equal(LEGACY_RESCUE_WATCH.authority.named_outreach, 'human_gate');
assert.equal(LEGACY_RESCUE_WATCH.authority.payment_request, 'human_gate');

const plan = buildLegacyRescueWatchPlan({ cycleKey: '2026-09-24T21:40Z' });
assert.equal(plan.length, 7);
assert.equal(plan.find((row) => row.work_key === 'named-outreach')?.human_gate_required, true);
assert.equal(plan.find((row) => row.work_key === 'build-no-touch-proof')?.human_gate_required, undefined);

const goal = createLegacyRescueWatchGoal({
  cycleKey: '2026-09-24T21:40Z',
  now: new Date('2026-09-24T21:40:00Z'),
});
assert.equal(goal.mission_key, 'legacy-software-modernization-radar-2026-09-13');
assert(goal.next_work_keys.includes('scan-signals'));

const deduped = dedupeLegacyRescueSignals([
  { source: 'IBM', title: 'IBM i 7.4 lifecycle', change_type: 'deadline_change', url: 'https://example.test/ibmi' },
  { source: 'IBM', title: 'IBM i 7.4 lifecycle', change_type: 'deadline_change', url: 'https://example.test/ibmi' },
  { source: 'State', title: 'Legacy RFP', change_type: 'new_signal', url: 'https://example.test/rfp' },
]);
assert.equal(deduped.length, 2);

const high = classifyLegacyRescueSignal({
  urgency: 100,
  buyer_access: 90,
  proofability: 100,
  evidence_quality: 100,
  days_to_cash: 90,
});
assert.equal(high.disposition, 'strike_candidate');

const low = classifyLegacyRescueSignal({
  urgency: 20,
  buyer_access: 10,
  proofability: 30,
  evidence_quality: 30,
  days_to_cash: 10,
});
assert.equal(low.disposition, 'hold_noise');

assert.equal(shouldSurfaceLegacyRescueChange({ change_type: 'deadline_change' }), true);
assert.equal(shouldSurfaceLegacyRescueChange({ change_type: 'unchanged_poll' }), false);

const snapshot = buildLegacyRescueMissionSnapshot({
  cycleKey: '2026-09-24T21:40Z',
  scanned: 25,
  changed: 4,
  admitted: 2,
  held: 2,
  evidenceRefs: ['web:ibmi', 'web:rfp'],
  observedAt: new Date('2026-09-24T21:40:00Z'),
});
assert.equal(snapshot.schema, 'evercraft.kaidance.mission-snapshot.v1');
assert.equal(snapshot.cadence_seconds, 300);
assert.deepEqual(snapshot.counts, { scanned: 25, changed: 4, admitted: 2, held: 2 });

console.log(JSON.stringify({
  ok: true,
  workflow_key: LEGACY_RESCUE_WATCH.workflow_key,
  cadence_seconds: LEGACY_RESCUE_WATCH.cadence_seconds,
  first_work: goal.next_work_keys,
  named_outreach_gate: true,
  high_signal: high,
  deduped_signals: deduped.length,
}, null, 2));
