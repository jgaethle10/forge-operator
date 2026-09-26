import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SystemiaCoreResidentSupervisor } from './resident-supervisor.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'systemia-core-supervisor-'));
const fixtureDir = path.join(root, 'fixtures');
const stateDir = path.join(root, 'state');
const cycleCount = path.join(root, 'cycle-count.txt');
const residentCount = path.join(root, 'resident-count.txt');
const residentMarker = path.join(root, 'resident-marker');
const flapperCount = path.join(root, 'flapper-count.txt');
fs.mkdirSync(fixtureDir, { recursive: true });

const cycleScript = `
import fs from 'node:fs';
const file = process.env.PROOF_CYCLE_FILE;
const current = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
fs.writeFileSync(file, String(current + 1));
await new Promise((resolve) => setTimeout(resolve, 150));
`;

const residentScript = `
import fs from 'node:fs';
const countFile = process.env.PROOF_RESIDENT_COUNT;
const marker = process.env.PROOF_RESIDENT_MARKER;
const current = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0;
fs.writeFileSync(countFile, String(current + 1));
if (!fs.existsSync(marker)) {
  fs.writeFileSync(marker, 'crashed-once');
  process.exit(7);
}
const keepAlive = setInterval(() => {}, 1000);
await new Promise((resolve) => {
  const close = () => {
    clearInterval(keepAlive);
    resolve();
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
});
`;

const flapperScript = `
import fs from 'node:fs';
const file = process.env.PROOF_FLAPPER_COUNT;
const current = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
fs.writeFileSync(file, String(current + 1));
process.exit(9);
`;

fs.writeFileSync(path.join(fixtureDir, 'cycle.mjs'), cycleScript);
fs.writeFileSync(path.join(fixtureDir, 'resident.mjs'), residentScript);
fs.writeFileSync(path.join(fixtureDir, 'flapper.mjs'), flapperScript);

for (const [name, mode] of [
  ['cycle', 'cycle'],
  ['resident', 'resident'],
  ['flapper', 'resident'],
  ['optional', 'resident'],
]) {
  fs.writeFileSync(path.join(fixtureDir, `${name}.workflow.json`), JSON.stringify({
    schema: 'evercraft.systemia.workflow-manifest.v1',
    workflow_key: `proof-${name}`,
    runtime: mode === 'cycle' ? 'systemia-organism+collider' : 'systemia-core-resident',
    cadence_seconds: 1,
    entrypoint: `fixtures/${name}.mjs`,
  }, null, 2));
}

const configPath = path.join(root, 'resident-services.json');
fs.writeFileSync(configPath, JSON.stringify({
  schema: 'evercraft.systemia.resident-supervisor-config.v1',
  services: [
    {
      service_key: 'proof-cycle',
      mode: 'cycle',
      manifest: 'fixtures/cycle.workflow.json',
      executable: 'fixtures/cycle.mjs',
      cadence_seconds: 1,
    },
    {
      service_key: 'proof-resident',
      mode: 'resident',
      manifest: 'fixtures/resident.workflow.json',
      executable: 'fixtures/resident.mjs',
      restart_backoff_ms: 1000,
      max_restarts_per_hour: 4,
    },
    {
      service_key: 'proof-flapper',
      mode: 'resident',
      manifest: 'fixtures/flapper.workflow.json',
      executable: 'fixtures/flapper.mjs',
      restart_backoff_ms: 1000,
      max_restarts_per_hour: 2,
    },
    {
      service_key: 'proof-optional',
      mode: 'resident',
      manifest: 'fixtures/optional.workflow.json',
      executable: 'fixtures/resident.mjs',
      optional_when_unconfigured: true,
      env_args: {
        '--unused': 'PROOF_OPTIONAL_REQUIRED',
      },
    },
  ],
}, null, 2));

const supervisor = new SystemiaCoreResidentSupervisor({
  repoRoot: root,
  configPath,
  stateDir,
  env: {
    ...process.env,
    PROOF_CYCLE_FILE: cycleCount,
    PROOF_RESIDENT_COUNT: residentCount,
    PROOF_RESIDENT_MARKER: residentMarker,
    PROOF_FLAPPER_COUNT: flapperCount,
  },
});

try {
  const started = supervisor.start({ immediateCycles: true });
  assert.equal(started.running, true);
  assert.equal(started.service_count, 4);

  await sleep(4500);

  const cycleRuns = Number(fs.readFileSync(cycleCount, 'utf8'));
  const residentStarts = Number(fs.readFileSync(residentCount, 'utf8'));
  const flapperStarts = Number(fs.readFileSync(flapperCount, 'utf8'));

  assert.ok(cycleRuns >= 4, `expected >=4 cycle runs, got ${cycleRuns}`);
  assert.ok(residentStarts >= 2, `expected resident restart, got ${residentStarts}`);
  assert.equal(flapperStarts, 2);

  const health = supervisor.health();
  const cycle = health.services.find((x) => x.service_key === 'proof-cycle');
  const resident = health.services.find((x) => x.service_key === 'proof-resident');
  const flapper = health.services.find((x) => x.service_key === 'proof-flapper');
  const optional = health.services.find((x) => x.service_key === 'proof-optional');

  assert.ok(['idle', 'running'].includes(cycle.status));
  assert.equal(resident.status, 'running');
  assert.ok(resident.restart_count >= 1);
  assert.equal(flapper.status, 'held');
  assert.equal(flapper.hold_reason, 'restart_budget_exhausted');
  assert.equal(optional.status, 'disabled');
  assert.equal(optional.hold_reason, 'optional_environment_not_configured');
  assert.equal(health.disabled_count, 1);
  assert.equal(health.held_count, 1);

  const receipts = fs.readFileSync(path.join(stateDir, 'receipts.jsonl'), 'utf8')
    .trim().split('\n').map(JSON.parse);
  assert.ok(receipts.some((x) => x.type === 'cycle.completed'));
  assert.ok(receipts.some((x) => x.type === 'resident.exited'));
  assert.ok(receipts.filter((x) => x.type === 'resident.started').length >= 4);
  assert.ok(receipts.some(
    (x) => x.type === 'resident.disabled' &&
      x.service_key === 'proof-optional' &&
      x.reason === 'optional_environment_not_configured'
  ));
  assert.ok(receipts.some(
    (x) => x.type === 'resident.held' &&
      x.service_key === 'proof-flapper' &&
      x.reason === 'restart_budget_exhausted'
  ));
  assert.ok(receipts.every((x) => x.receipt_hash?.startsWith('sha256:')));

  const stopped = await supervisor.stop();
  assert.equal(stopped.running, false);
  assert.equal(
    stopped.services
      .filter((x) => x.service_key !== 'proof-flapper')
      .every((x) => x.status === 'stopped'),
    true
  );
  assert.equal(
    stopped.services.find((x) => x.service_key === 'proof-flapper').status,
    'held'
  );

  const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'health.json'), 'utf8'));
  assert.equal(persisted.running, false);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.systemia.resident-supervisor-proof.v1',
    cycle_runs: cycleRuns,
    resident_starts: residentStarts,
    flapper_starts: flapperStarts,
    resident_restart_verified: true,
    restart_budget_exhaustion_verified: true,
    cycle_cadence_verified: true,
    cycle_children_tracked_for_shutdown: true,
    receipt_chain_present: true,
    optional_unconfigured_service_disabled_not_held: true,
    graceful_stop_verified: true,
  }, null, 2));
} finally {
  try { await supervisor.stop(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
