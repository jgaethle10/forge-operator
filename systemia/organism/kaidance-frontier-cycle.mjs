#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { writeFrontierArtifacts } from './frontier-watch.mjs';
import { runScienceHazardWatch } from './science-hazard-watch.mjs';
import { KaidanceRuntime } from '../collider/runtime.mjs';

const rootDir = process.cwd();
const now = new Date();
const artifactRoot = path.join(rootDir, 'artifacts');
const frontier = writeFrontierArtifacts({
  rootDir,
  outDir: path.join(artifactRoot, 'portfolio-frontier'),
  now
});
const science = await runScienceHazardWatch({
  outDir: path.join(artifactRoot, 'science-hazard-watch'),
  now
});

const cycleRoot = path.join(artifactRoot, 'kaidance-frontier');
fs.mkdirSync(cycleRoot, { recursive: true });
const configPath = path.join(cycleRoot, 'mission-sources.json');
fs.writeFileSync(configPath, JSON.stringify({
  schema: 'evercraft.kaidance.mission-fabric-config.v1',
  sources: [
    {
      source_key: 'portfolio-frontier',
      path: '../portfolio-frontier/mission-snapshot.json',
      required: true,
      stale_after_seconds: 900
    },
    {
      source_key: 'science-hazard-watch',
      path: '../science-hazard-watch/mission-snapshot.json',
      required: true,
      stale_after_seconds: 900
    }
  ]
}, null, 2) + '\n');

const runtime = new KaidanceRuntime({
  root: path.join(cycleRoot, 'runtime'),
  colliderKey: 'kaidance-frontier-field',
  heartbeatTargetSeconds: 300,
  graceSeconds: 120,
  deploymentReceipt: process.env.GITHUB_RUN_ID ? `github-actions:${process.env.GITHUB_RUN_ID}` : 'local-field-cycle',
  missionFabricConfigPath: configPath,
  missionFabricAllowedRoot: artifactRoot,
  clock: () => now
});

const result = await runtime.runOnce(now);
const body = {
  schema: 'evercraft.kaidance.frontier-field-cycle.v1',
  observed_at: now.toISOString(),
  ok: Boolean(result.ok),
  hold: result.hold || null,
  frontier: {
    asset_count: frontier.report.asset_count,
    obligation_count: frontier.report.obligation_count,
    silent_drop_count: frontier.report.silent_drop_count,
    receipt_hash: frontier.report.receipt_hash
  },
  science_hazard: {
    earthquake_count: science.report.lanes.earthquakes.count ?? null,
    elevated_volcano_count: science.report.lanes.volcanoes.elevated_count ?? null,
    recent_medical_matches: science.report.lanes.medical_research.total_recent_matches ?? null,
    held_sources: science.snapshot.counts.held,
    receipt_hash: science.report.receipt_hash
  },
  kaidance: result.ok ? {
    cycle_key: result.cycle?.cycle_key || null,
    coverage_receipt: result.coverageReceipt?.receipt_hash || result.coverageReceipt?.receipt_key || null,
    health: result.health
  } : {
    health: result.health || runtime.health(now)
  }
};
fs.writeFileSync(path.join(cycleRoot, 'latest.json'), JSON.stringify(body, null, 2) + '\n');
console.log(JSON.stringify(body));
