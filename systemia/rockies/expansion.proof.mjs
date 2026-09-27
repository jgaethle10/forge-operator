import assert from 'node:assert/strict';
import { getTopology, summarizeTopology, planRockyAllocation } from './expansion.mjs';

const topology = getTopology();
const summary = summarizeTopology(topology);

assert.ok(summary.baseline_agents > 65, 'expanded baseline must exceed the prior 65-Rocky reference');
assert.ok(summary.range_count > 14, 'expanded range count must exceed the prior 14-range reference');
assert.ok(summary.distinct_source_families >= 60, 'source-family diversity should materially expand');
assert.ok(summary.domains.includes('water'));
assert.ok(summary.domains.includes('cyber'));
assert.ok(summary.domains.includes('public_health'));
assert.ok(summary.domains.includes('agriculture'));
assert.ok(summary.domains.includes('housing'));

const routine = planRockyAllocation({
  range:'water',
  anomaly_score:0.15,
  independent_source_families:2
});
assert.equal(routine.mode, 'baseline');

const surge = planRockyAllocation({
  range:'water',
  anomaly_score:0.86,
  independent_source_families:1,
  stale_source_families:1,
  corroboration_requested:true
});
assert.equal(surge.mode, 'surge');
assert.ok(surge.allocated_agents > surge.baseline_agents);
assert.ok(surge.reasons.includes('high_anomaly'));
assert.ok(surge.reasons.includes('needs_independent_corroboration'));
assert.ok(surge.reasons.includes('source_family_stale'));

const cyber = planRockyAllocation({
  range:'cyber',
  anomaly_score:0.7,
  independent_source_families:3
});
assert.equal(cyber.mode, 'surge');

console.log(JSON.stringify({
  ok:true,
  ...summary,
  routine_water_agents:routine.allocated_agents,
  surge_water_agents:surge.allocated_agents,
  surge_cyber_agents:cyber.allocated_agents
}, null, 2));
