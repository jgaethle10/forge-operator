#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildMultiplicationPlan,
  expandPartitionedWorkItems,
  loadMultiplicationRegistry,
  resolveMultiplicationContract
} from '../saban/multiplier.mjs';
import { recommendFormation } from '../saban/autoscaler.mjs';
import { executeDistributedMultiplicationPlan } from '../saban/distributed-executor.mjs';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { hashFile } from './authorized-source.mjs';

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout).slice(-2000)}`);
  }
  return result;
}

const rootDir = process.cwd();
const sourceDir = path.resolve(rootDir, 'artifacts/forensiscope-intake/proof');
const proofDir = path.resolve(rootDir, 'artifacts/forensiscope-proof');
fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

run('ffmpeg', ['-version']);
run('ffprobe', ['-version']);

const sourcePath = path.join(sourceDir, 'synthetic-repeat.mkv');
run('ffmpeg', [
  '-v', 'error',
  '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=2:d=4',
  '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=2:d=4',
  '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=2:d=4',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=12',
  '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
  '-map', '[v]',
  '-map', '3:a',
  '-c:v', 'ffv1',
  '-c:a', 'pcm_s16le',
  '-y',
  sourcePath
]);

const sourceHash = hashFile(sourcePath);
const registry = loadMultiplicationRegistry();
const registeredContract = resolveMultiplicationContract('forensiscope', registry);
const proofContract = {
  ...registeredContract,
  partitioner: {
    type: 'media_time_windows',
    window_seconds: 4,
    overlap_seconds: 1
  }
};

const workItems = expandPartitionedWorkItems(proofContract, [{
  kind: 'media_job',
  key: 'forensiscope-proof',
  source_file: null,
  raw: {
    schema: 'evercraft.forensiscope.authorized-job.v1',
    duration_seconds: 12,
    source: {
      path: sourcePath,
      sha256: sourceHash
    },
    authorization: {
      confirmed: true,
      scope: 'synthetic-ci-proof',
      authorized_by: 'forensiscope-proof',
      confirmed_at: new Date().toISOString()
    },
    requested_outputs: [
      'media_probe',
      'timeline',
      'duplicate_review',
      'audio_prep',
      'source_integrity'
    ]
  }
}]);

assert.equal(workItems.length, 4);

const formation = recommendFormation({
  contract: proofContract,
  workItemCount: workItems.length
});
assert.equal(formation.strategy, 'work_conserving');
assert.equal(formation.logical_agents, 20);

const plan = buildMultiplicationPlan({
  contract: proofContract,
  logicalAgents: formation.logical_agents,
  physicalWorkers: formation.physical_workers,
  workItems
});
plan.formation_recommendation = formation;

const allocatorToken = 'forensiscope-distributed-proof-token';
const seedA = await startNodeSeed({
  root: path.join(proofDir, 'node-a'),
  nodeId: 'forensiscope-proof-node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});
const seedB = await startNodeSeed({
  root: path.join(proofDir, 'node-b'),
  nodeId: 'forensiscope-proof-node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

const sourceHashBefore = hashFile(sourcePath);
let receipt;
try {
  receipt = await executeDistributedMultiplicationPlan({
    contract: proofContract,
    plan,
    workItems,
    rootDir,
    reconcile: true,
    nodePool: {
      endpoints: [seedA.endpoint, seedB.endpoint],
      allocatorToken,
      maxAttempts: 3,
      maxConcurrencyPerNode: 2,
      assignmentTimeoutMs: 30000
    }
  });
} finally {
  await Promise.allSettled([seedA.close(), seedB.close()]);
}
const sourceHashAfter = hashFile(sourcePath);

assert.equal(sourceHashBefore, sourceHashAfter);
assert.equal(receipt.scheduler_summary.counts.completed, 20);
assert.equal(receipt.pool_summary.nodes.length, 2);
assert.equal(receipt.quality.status, 'pass');
assert.equal(receipt.reconciliation.status, 'reconciled');
assert.equal(receipt.reconciliation.source_integrity_preserved, true);
assert.equal(receipt.reconciliation.worker_statuses.media_probe_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.timeline_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.frame_hash_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.audio_extract_worker, 4);
assert.equal(receipt.reconciliation.worker_statuses.provenance_guard, 4);
assert.ok(receipt.reconciliation.duplicate_review.repeated_content_groups > 0);
assert.ok(
  receipt.reconciliation.audio_assets.some(
    (entry) => entry.state === 'prepared_for_transcription'
  )
);
assert.equal(
  receipt.reconciliation.transcription.state,
  'audio_prepared_engine_not_bound'
);

const proof = {
  schema: 'evercraft.forensiscope.distributed-execution-proof.v1',
  status: 'pass',
  source_sha256: sourceHashAfter,
  source_unchanged: true,
  shards: workItems.length,
  logical_agents: plan.logical_agents,
  physical_workers: plan.physical_workers,
  nodeseed_count: receipt.pool_summary.nodes.length,
  execution_fabric: receipt.execution_fabric,
  completed_assignments: receipt.scheduler_summary.counts.completed,
  repeated_content_groups: receipt.reconciliation.duplicate_review.repeated_content_groups,
  timeline_entries: receipt.reconciliation.timeline.length,
  audio_shards_prepared: receipt.reconciliation.audio_assets.filter(
    (entry) => entry.state === 'prepared_for_transcription'
  ).length,
  transcription_state: receipt.reconciliation.transcription.state,
  public_machine_intake_enabled: false
};

fs.writeFileSync(
  path.join(proofDir, 'latest.json'),
  JSON.stringify(proof, null, 2) + '\n'
);

console.log(JSON.stringify(proof));
