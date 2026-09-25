import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { SystemiaMissionPublisher } from './mission-publisher.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function snapshot(ref, counts) {
  return {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: ref,
    observed_at: new Date().toISOString(),
    counts,
    evidence_refs: [`proof:${ref}`],
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'systemia-mission-publisher-'));
const computeRoot = path.join(root, 'compute');
const stateRoot = path.join(computeRoot, 'services', 'kaidance');
const yardRoot = path.join(root, 'yard');
const controlRoot = path.join(root, 'control');
const configPath = path.join(controlRoot, 'mission-sources.json');
const ledgerPath = path.join(controlRoot, 'publisher-ledger.json');
const node001Path = path.join(controlRoot, 'node001.json');
const legacyPath = path.join(controlRoot, 'legacy.json');
const allocatorToken = 'mission-publisher-proof-token';

writeJson(configPath, {
  schema: 'evercraft.kaidance.mission-fabric-config.v1',
  sources: [
    {
      source_key: 'node001-field',
      path: 'node001.json',
      required: true,
      stale_after_seconds: 900,
    },
    {
      source_key: 'legacy-rescue',
      path: 'legacy.json',
      required: false,
      stale_after_seconds: 900,
    },
  ],
});

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'mission-publisher-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false,
});
const yard = new YardOperator({ stateDir: yardRoot });

try {
  const deployment = await yard.deployRelease({
    deploymentId: 'kaidance-publisher-proof',
    releaseRef: '3512ab9dbabff132fd15708fdb4875cb3c2e2495',
    workloadClass: 'systemia.kaidance-collider.v1',
    capacityEndpoint: seed.endpoint,
    allocatorToken,
    input: {
      state_root: stateRoot,
      mission_source_policies: [
        {
          source_key: 'node001-field',
          required: true,
          stale_after_seconds: 900,
        },
        {
          source_key: 'legacy-rescue',
          required: false,
          stale_after_seconds: 900,
        },
      ],
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:legacy-checkpoint',
    leaseTtlMs: 120_000,
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.result.mission_ingress_supported, true);

  let now = new Date('2026-09-25T07:00:00Z');
  const publisher = new SystemiaMissionPublisher({
    yard,
    deploymentId: 'kaidance-publisher-proof',
    configPath,
    allowedRoot: controlRoot,
    ledgerPath,
    clock: () => new Date(now),
  });

  const missing = await publisher.syncOnce(now);
  assert.equal(missing.status, 'degraded');
  assert.equal(missing.pushed, 1);
  assert.deepEqual(missing.required_missing, ['node001-field']);
  assert.equal(
    missing.sources.find((x) => x.source_key === 'node001-field').status,
    'hold_pushed'
  );
  assert.equal(
    missing.sources.find((x) => x.source_key === 'legacy-rescue').status,
    'missing'
  );

  const remoteNode001 = path.join(
    stateRoot,
    'mission-fabric',
    'providers',
    'node001-field.json'
  );
  const remoteLegacy = path.join(
    stateRoot,
    'mission-fabric',
    'providers',
    'legacy-rescue.json'
  );
  assert.equal(fs.existsSync(remoteNode001), true);
  assert.equal(fs.existsSync(remoteLegacy), false);
  assert.match(
    JSON.parse(fs.readFileSync(remoteNode001, 'utf8')).snapshot_ref,
    /^publisher-hold:node001-field:source_missing$/
  );

  writeJson(node001Path, snapshot(
    'node001-real-001',
    { scanned: 1, changed: 1, admitted: 0, held: 1 }
  ));

  now = new Date('2026-09-25T07:05:00Z');
  const recovered = await publisher.syncOnce(now);
  assert.equal(recovered.status, 'ok');
  assert.equal(recovered.pushed, 1);
  assert.equal(recovered.required_missing.length, 0);
  assert.equal(
    JSON.parse(fs.readFileSync(remoteNode001, 'utf8')).snapshot_ref,
    'node001-real-001'
  );

  const unchanged = await publisher.syncOnce(now);
  assert.equal(unchanged.pushed, 0);
  assert.equal(
    unchanged.sources.find((x) => x.source_key === 'node001-field').status,
    'unchanged'
  );

  writeJson(node001Path, snapshot(
    'node001-real-002',
    { scanned: 1, changed: 1, admitted: 1, held: 0 }
  ));
  writeJson(legacyPath, snapshot(
    'legacy-real-001',
    { scanned: 8, changed: 2, admitted: 1, held: 1 }
  ));

  now = new Date('2026-09-25T07:10:00Z');
  const changed = await publisher.syncOnce(now);
  assert.equal(changed.status, 'ok');
  assert.equal(changed.pushed, 2);
  assert.equal(fs.existsSync(remoteLegacy), true);
  assert.equal(
    JSON.parse(fs.readFileSync(remoteNode001, 'utf8')).snapshot_ref,
    'node001-real-002'
  );
  assert.equal(
    JSON.parse(fs.readFileSync(remoteLegacy, 'utf8')).snapshot_ref,
    'legacy-real-001'
  );

  fs.rmSync(node001Path);
  now = new Date('2026-09-25T07:15:00Z');
  const lostAgain = await publisher.syncOnce(now);
  assert.equal(lostAgain.status, 'degraded');
  assert.deepEqual(lostAgain.required_missing, ['node001-field']);
  assert.equal(lostAgain.pushed, 1);
  assert.match(
    JSON.parse(fs.readFileSync(remoteNode001, 'utf8')).snapshot_ref,
    /^publisher-hold:node001-field:source_missing$/
  );

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  assert.equal(ledger.schema, 'evercraft.systemia.mission-publisher-ledger.v1');
  assert.ok(ledger.published['node001-field'].ingress_receipt_hash);
  assert.ok(ledger.published['legacy-rescue'].ingress_receipt_hash);

  await yard.stopDeployment('kaidance-publisher-proof', {
    reason: 'proof_complete',
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.systemia.mission-publisher-proof.v1',
    required_missing_becomes_remote_hold: true,
    optional_missing_does_not_fake_state: true,
    recovered_source_replaces_hold: true,
    unchanged_snapshot_deduped: true,
    changed_snapshots_published: 2,
    later_required_failure_replaces_old_data_with_hold: true,
    ingress_receipts_persisted: true,
    cadence_seconds: 300,
  }, null, 2));
} finally {
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
