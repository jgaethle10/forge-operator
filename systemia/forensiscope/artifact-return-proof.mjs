#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { runNodeSeedAssignmentPool } from '../saban/nodeseed-pool.mjs';
import { prepareRemoteAssignment } from './nodeseed-transport.mjs';
import { hashFile } from './authorized-source.mjs';

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${String(result.stderr || result.stdout || '').slice(-2000)}`
    );
  }
}

const rootDir = process.cwd();
const proofDir = path.resolve(rootDir, 'artifacts/forensiscope-artifact-return-proof');
const sourceDir = path.join(proofDir, 'source');
const nodeRoot = path.join(proofDir, 'node');
const returnRoot = path.join(proofDir, 'returned');
fs.rmSync(proofDir, { recursive: true, force: true });
fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(returnRoot, { recursive: true });

run('ffmpeg', ['-version']);
run('ffprobe', ['-version']);

const sourcePath = path.join(sourceDir, 'source.mkv');
run('ffmpeg', [
  '-v', 'error',
  '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=2:duration=2',
  '-f', 'lavfi', '-i', 'sine=frequency=523:sample_rate=16000:duration=2',
  '-map', '0:v',
  '-map', '1:a',
  '-c:v', 'ffv1',
  '-c:a', 'pcm_s16le',
  '-y',
  sourcePath
]);

const sourceSha256 = hashFile(sourcePath);
const assignment = {
  agent_id: 'forensiscope-artifact-return-proof',
  idempotency_key: 'sha256:' + createHash('sha256')
    .update('forensiscope-artifact-return-proof-v1')
    .digest('hex'),
  role: 'audio_extract_worker',
  work: {
    kind: 'media_job',
    key: 'artifact-return-proof'
  },
  item: {
    kind: 'media_job',
    key: 'artifact-return-proof:0',
    raw: {
      schema: 'evercraft.forensiscope.authorized-job.v1',
      parent_key: 'artifact-return-proof',
      shard_index: 0,
      start_seconds: 0,
      end_seconds: 2,
      duration_seconds: 2,
      source: {
        path: sourcePath,
        sha256: sourceSha256
      },
      authorization: {
        confirmed: true,
        scope: 'synthetic-artifact-return-proof',
        authorized_by: 'forensiscope-artifact-return-proof',
        confirmed_at: new Date().toISOString()
      }
    }
  }
};

const allocatorToken = 'forensiscope-artifact-return-proof-token';

async function execute(seed) {
  return runNodeSeedAssignmentPool({
    software: 'forensiscope',
    assignments: [assignment],
    endpoints: [seed.endpoint],
    allocatorToken,
    maxAttempts: 1,
    maxConcurrencyPerNode: 1,
    assignmentTimeoutMs: 30000,
    artifactReturnRoot: returnRoot,
    prepareAssignment: (context) =>
      prepareRemoteAssignment({
        ...context,
        rootDir
      })
  });
}

let seed = await startNodeSeed({
  root: nodeRoot,
  nodeId: 'forensiscope-artifact-return-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

let first;
try {
  first = await execute(seed);
} finally {
  await seed.close();
}

assert.equal(first.completed_assignments, 1);
assert.equal(first.failed_assignments, 0);
assert.equal(first.portable_artifacts, 1);
assert.equal(first.results[0].deduplicated, false);
assert.equal(first.results[0].artifacts.length, 1);

const firstArtifact = first.results[0].artifacts[0];
assert.equal(firstArtifact.portable, true);
assert.equal(firstArtifact.returned_from_nodeseed, true);
assert.ok(firstArtifact.path);
assert.equal(fs.existsSync(firstArtifact.path), true);
assert.equal(hashFile(firstArtifact.path), firstArtifact.sha256);
assert.equal(
  first.results[0].result.result.data.audio.path,
  firstArtifact.path
);
assert.equal(
  first.results[0].result.result.data.audio.artifact_sha256,
  firstArtifact.sha256
);

const durableNodeArtifactDir = path.join(
  nodeRoot,
  '.evercraft',
  'saban-artifacts'
);
assert.equal(fs.existsSync(durableNodeArtifactDir), true);
assert.ok(fs.readdirSync(durableNodeArtifactDir).length >= 1);

fs.rmSync(firstArtifact.path, { force: true });
assert.equal(fs.existsSync(firstArtifact.path), false);

seed = await startNodeSeed({
  root: nodeRoot,
  nodeId: 'forensiscope-artifact-return-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});

let replay;
try {
  replay = await execute(seed);
} finally {
  await seed.close();
}

assert.equal(replay.completed_assignments, 1);
assert.equal(replay.failed_assignments, 0);
assert.equal(replay.portable_artifacts, 1);
assert.equal(replay.results[0].deduplicated, true);
assert.equal(replay.results[0].artifacts.length, 1);

const replayArtifact = replay.results[0].artifacts[0];
assert.equal(fs.existsSync(replayArtifact.path), true);
assert.equal(replayArtifact.sha256, firstArtifact.sha256);
assert.equal(hashFile(replayArtifact.path), firstArtifact.sha256);
assert.equal(
  replay.results[0].result.result.data.audio.path,
  replayArtifact.path
);
assert.equal(
  replay.results[0].result.result.data.audio.artifact_sha256,
  replayArtifact.sha256
);

const proof = {
  schema: 'evercraft.forensiscope.artifact-return-proof.v1',
  status: 'pass',
  source_sha256: sourceSha256,
  first_execution_deduplicated: first.results[0].deduplicated,
  restart_replay_deduplicated: replay.results[0].deduplicated,
  portable_artifact_sha256: replayArtifact.sha256,
  coordinator_path_rehydrated: true,
  coordinator_copy_deleted_before_replay: true,
  durable_nodeseed_store_survived_restart: true,
  artifact_download_reverified_sha256: true,
  adapter_reexecution_required_on_replay: false
};

fs.writeFileSync(
  path.join(proofDir, 'latest.json'),
  JSON.stringify(proof, null, 2) + '\n'
);

console.log(JSON.stringify(proof));
