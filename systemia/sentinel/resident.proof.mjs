import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  emptyResidentState,
  runSentinelResidentCycle
} from './resident-cycle.mjs';

const source = {
  source_id: 'proof-source',
  poll_interval_seconds: 60,
  contract: {
    source_id: 'proof-source',
    domain: 'environmental',
    independence_group: 'proof-provider',
    expected_max_age_seconds: 120,
    required: true,
    description: 'proof'
  },
  poll: async ({ checkedAt }) => ({
    contract: null,
    receipt: {
      source_id: 'proof-source',
      status: 'ok',
      checked_at: checkedAt,
      item_count: 0
    },
    observations: [],
    error: null
  })
};

const first = await runSentinelResidentCycle({
  inputState: emptyResidentState(),
  now: '2026-09-29T13:00:00Z',
  sources: [source]
});

const second = await runSentinelResidentCycle({
  inputState: first.state,
  now: '2026-09-29T13:00:20Z',
  sources: [source]
});

assert.equal(first.snapshot.summary.sources_polled, 1);
assert.equal(first.snapshot.summary.coverage_healthy, true);
assert.equal(second.snapshot.summary.sources_polled, 0);
assert.equal(second.snapshot.summary.sources_deferred, 1);
assert.equal(second.snapshot.summary.urgent_incidents, 0);

const manifest = JSON.parse(fs.readFileSync(
  new URL('./resident.workflow.json', import.meta.url),
  'utf8'
));
assert.equal(manifest.runtime, 'systemia-core-resident');
assert.equal(manifest.safety.autonomous_intervention, false);
assert.equal(manifest.safety.targeting, false);

console.log(JSON.stringify({
  schema: 'systemia.sentinel.resident-proof.v1',
  pass: true,
  claim: 'Sentinel resident orchestration polls due sources, defers early re-polls, preserves quiet healthy coverage, and remains bounded to evidence and operator warning.',
  first_cycle: first.snapshot.summary,
  second_cycle: second.snapshot.summary,
  safety: manifest.safety
}, null, 2));
