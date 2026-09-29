import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  emptyResidentState,
  runSentinelResidentCycle,
  computeNextPollAt,
  buildSentinelMissionSnapshot
} from './resident-cycle.mjs';

function source({
  sourceId,
  domain,
  group,
  pollInterval = 60,
  observation = null,
  fail = false
}) {
  return {
    source_id: sourceId,
    poll_interval_seconds: pollInterval,
    contract: {
      source_id: sourceId,
      domain,
      independence_group: group,
      expected_max_age_seconds: 120,
      required: true,
      description: sourceId
    },
    poll: async ({ checkedAt }) => {
      if (fail) {
        return {
          contract: null,
          receipt: {
            source_id: sourceId,
            status: 'error',
            checked_at: checkedAt,
            item_count: 0,
            error_code: 'fixture_failure'
          },
          observations: [],
          error: 'fixture_failure'
        };
      }
      return {
        contract: null,
        receipt: {
          source_id: sourceId,
          status: 'ok',
          checked_at: checkedAt,
          item_count: observation ? 1 : 0
        },
        observations: observation ? [{ ...observation, observation_id: sourceId + ':' + observation.observation_id }] : [],
        error: null
      };
    }
  };
}

const now = '2026-09-29T12:00:00Z';
const sources = [
  source({
    sourceId: 'weather-a',
    domain: 'weather',
    group: 'provider-a',
    observation: {
      observation_id: '1',
      created_at: now,
      region_key: 'Region A',
      region_group: 'coarse-grid:1deg:136:59',
      source_family: 'weather-a',
      independence_group: 'provider-a',
      domain: 'weather',
      kind: 'deviation',
      anomaly_score: 0.9,
      reliability: 0.9,
      evidence_state: 'verified'
    }
  }),
  source({
    sourceId: 'environment-b',
    domain: 'environmental',
    group: 'provider-b',
    observation: {
      observation_id: '1',
      created_at: '2026-09-29T12:00:10Z',
      region_key: 'Region B',
      region_group: 'coarse-grid:1deg:136:59',
      source_family: 'environment-b',
      independence_group: 'provider-b',
      domain: 'environmental',
      kind: 'deviation',
      anomaly_score: 0.88,
      reliability: 0.9,
      evidence_state: 'verified'
    }
  })
];

let result = await runSentinelResidentCycle({
  inputState: emptyResidentState(),
  now,
  sources,
  eventGraphWindowSeconds: 900
});

assert.equal(result.snapshot.summary.sources_polled, 2);
assert.equal(result.snapshot.summary.coverage_healthy, true);
assert.equal(result.snapshot.event_graph.cluster_count, 1);
assert.equal(result.snapshot.event_graph.clusters[0].independent_source_groups.length, 2);
assert.equal(result.snapshot.doctrine.autonomous_intervention, false);
assert.equal(result.snapshot.event_graph.clusters[0].attribution, 'unresolved');

const nextAt = result.state.source_schedule['weather-a'].next_poll_at;
assert.ok(new Date(nextAt).getTime() >= new Date(now).getTime() + 60000);

const second = await runSentinelResidentCycle({
  inputState: result.state,
  now: '2026-09-29T12:00:20Z',
  sources
});
assert.equal(second.snapshot.summary.sources_polled, 0);
assert.equal(second.snapshot.summary.sources_deferred, 2);

const failing = [
  source({
    sourceId: 'weather-a',
    domain: 'weather',
    group: 'provider-a',
    fail: true
  }),
  sources[1]
];

result = await runSentinelResidentCycle({
  inputState: second.state,
  now: '2026-09-29T12:02:30Z',
  sources: failing
});

assert.equal(result.snapshot.coverage.healthy, false);
assert.ok(result.snapshot.coverage.blind_spots.some((row) => row.source_id === 'weather-a'));
assert.equal(
  result.snapshot.signals.find((signal) => signal.kind === 'sensor_coverage').severity_hint,
  'warning'
);
assert.equal(result.snapshot.summary.urgent_incidents, 0);
assert.equal(result.snapshot.doctrine.sensor_failure_is_not_threat_evidence, true);

const missionSnapshot = buildSentinelMissionSnapshot(result.snapshot);
assert.equal(missionSnapshot.schema, 'evercraft.kaidance.mission-snapshot.v1');
assert.equal(missionSnapshot.mission_key, 'evercraft-life-safety-sentinel');
assert.equal(missionSnapshot.workflow_key, 'sentinel-life-safety-resident');
assert.equal(missionSnapshot.counts.held, 1);
assert.ok(missionSnapshot.evidence_refs.includes('source-health:weather-a'));

const thirdFailureAt = computeNextPollAt({
  source: sources[0],
  receipt: { status: 'error' },
  sourceHealthState: {
    sources: {
      'weather-a': { consecutive_failures: 3 }
    }
  },
  checkedAt: '2026-09-29T12:10:00Z',
  maxJitterSeconds: 0
});
assert.equal(
  new Date(thirdFailureAt).getTime() - new Date('2026-09-29T12:10:00Z').getTime(),
  240000
);

const supervisorConfig = JSON.parse(fs.readFileSync(
  new URL('../core/resident-services.json', import.meta.url),
  'utf8'
));
const registered = supervisorConfig.services.find(
  (row) => row.service_key === 'sentinel-life-safety-watch'
);
assert.ok(registered);
assert.equal(registered.mode, 'resident');
assert.equal(registered.executable, 'systemia/sentinel/resident-runner.mjs');
assert.equal(registered.manifest, 'systemia/sentinel/resident.workflow.json');
assert.equal(registered.max_restarts_per_hour, 12);

const missionSources = JSON.parse(fs.readFileSync(
  new URL('../collider/mission-sources.json', import.meta.url),
  'utf8'
));
const sentinelMissionSource = missionSources.sources.find(
  (row) => row.source_key === 'sentinel-life-safety'
);
assert.ok(sentinelMissionSource);
assert.equal(sentinelMissionSource.required, false);
assert.equal(sentinelMissionSource.stale_after_seconds, 180);

console.log('SYSTEMIA SENTINEL RESIDENT CYCLE PASS');
