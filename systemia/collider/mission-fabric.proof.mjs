import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggregateMissionSnapshotsFromConfig } from './mission-fabric.mjs';
import { KaidanceRuntime } from './runtime.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-mission-fabric-'));
const sources = path.join(root, 'sources');
const configPath = path.join(root, 'mission-sources.json');
const stateRoot = path.join(root, 'kaidance');
fs.mkdirSync(sources, { recursive: true });

const now = new Date('2026-09-25T06:30:00Z');

fs.writeFileSync(path.join(sources, 'legacy.json'), JSON.stringify({
  schema: 'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref: 'legacy-proof',
  observed_at: '2026-09-25T06:29:00Z',
  counts: { scanned: 10, changed: 2, admitted: 1, held: 1 },
  evidence_refs: ['legacy:evidence'],
}, null, 2));

fs.writeFileSync(configPath, JSON.stringify({
  schema: 'evercraft.kaidance.mission-fabric-config.v1',
  sources: [
    {
      source_key: 'legacy-rescue',
      path: 'sources/legacy.json',
      required: false,
      stale_after_seconds: 900,
    },
    {
      source_key: 'node001-field',
      path: 'sources/node001.json',
      required: true,
      stale_after_seconds: 900,
    },
  ],
}, null, 2));

const degraded = aggregateMissionSnapshotsFromConfig({
  configPath,
  allowedRoot: root,
  now,
});
assert.equal(degraded.snapshot.counts.scanned, 11);
assert.equal(degraded.snapshot.counts.changed, 3);
assert.equal(degraded.snapshot.counts.admitted, 1);
assert.equal(degraded.snapshot.counts.held, 2);
assert.equal(degraded.report.degraded_required_sources.length, 1);
assert.equal(degraded.report.degraded_required_sources[0].source_key, 'node001-field');

fs.writeFileSync(path.join(sources, 'node001.json'), JSON.stringify({
  schema: 'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref: 'node001-proof',
  observed_at: '2026-09-25T06:29:30Z',
  counts: { scanned: 1, changed: 1, admitted: 0, held: 1 },
  evidence_refs: ['node001:issue:175'],
}, null, 2));

const healthy = aggregateMissionSnapshotsFromConfig({
  configPath,
  allowedRoot: root,
  now,
});
assert.equal(healthy.snapshot.counts.scanned, 11);
assert.equal(healthy.snapshot.counts.changed, 3);
assert.equal(healthy.snapshot.counts.admitted, 1);
assert.equal(healthy.snapshot.counts.held, 2);
assert.equal(healthy.report.degraded_required_sources.length, 0);
assert.equal(healthy.report.accepted_count, 2);

let clock = now;
const runtime = new KaidanceRuntime({
  root: stateRoot,
  missionFabricConfigPath: configPath,
  missionFabricAllowedRoot: root,
  heartbeatTargetSeconds: 300,
  graceSeconds: 90,
  clock: () => new Date(clock),
});
const cycle = await runtime.runOnce(clock);
assert.equal(cycle.ok, true);
assert.equal(cycle.cycle.counts.scanned, 11);
assert.equal(cycle.cycle.counts.changed, 3);
assert.equal(cycle.cycle.counts.admitted, 1);
assert.equal(cycle.cycle.counts.held, 2);
assert.equal(cycle.health.mission_fabric_enabled, true);
assert.equal(cycle.health.mission_fabric_degraded_required_sources, 0);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.kaidance.mission-fabric-proof.v1',
  required_missing_becomes_hold: true,
  multiple_missions_aggregated: true,
  kaidance_consumed_fabric_directly: true,
  aggregate_counts: cycle.cycle.counts,
  degraded_required_sources_after_fix: cycle.health.mission_fabric_degraded_required_sources,
}, null, 2));

fs.rmSync(root, { recursive: true, force: true });
