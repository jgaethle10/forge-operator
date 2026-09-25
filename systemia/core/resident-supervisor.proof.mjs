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
await new Promise((resolve) => {
  const close = () => resolve();
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
});
`;

fs.writeFileSync(path.join(fixtureDir, 'cycle.mjs'), cycleScript);
fs.writeFileSync(path.join(fixtureDir, 'resident.mjs'), residentScript);

for (const [name, mode] of [['cycle', 'cycle'], ['resident', 'resident']]) {
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
  },
});

try {
  const started = supervisor.start({ immediateCycles: true });
  assert.equal(started.running, true);
  assert.equal(started.service_count, 2);

  await sleep(2800);

  const cycleRuns = Number(fs.readFileSync(cycleCount, 'utf8'));
  const residentStarts = Number(fs.readFileSync(residentCount, 'utf8'));
  assert.ok(cycleRuns >= 3, `expected >=3 cycle runs, got ${cycleRuns}`);
  assert.ok(residentStarts >= 2, `expected resident restart, got ${residentStarts}`);

  const health = supervisor.health();
  const cycle = health.services.find((x) => x.service_key === 'proof-cycle');
  const resident = health.services.find((x) => x.service_key === 'proof-resident');
  assert.ok(['idle', 'running'].includes(cycle.status));
  assert.equal(resident.status, 'running');
  assert.ok(resident.restart_count >= 1);

  const receipts = fs.readFileSync(path.join(stateDir, 'receipts.jsonl'), 'utf8')
    .trim().split('\n').map(JSON.parse);
  assert.ok(receipts.some((x) => x.type === 'cycle.completed'));
  assert.ok(receipts.some((x) => x.type === 'resident.exited'));
  assert.ok(receipts.filter((x) => x.type === 'resident.started').length >= 2);
  assert.ok(receipts.every((x) => x.receipt_hash?.startsWith('sha256:')));

  const stopped = await supervisor.stop();
  assert.equal(stopped.running, false);
  assert.equal(stopped.services.every((x) => x.status === 'stopped'), true);

  const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'health.json'), 'utf8'));
  assert.equal(persisted.running, false);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.systemia.resident-supervisor-proof.v1',
    cycle_runs: cycleRuns,
    resident_starts: residentStarts,
    resident_restart_verified: true,
    cycle_cadence_verified: true,
    receipt_chain_present: true,
    graceful_stop_verified: true,
  }, null, 2));
} finally {
  try { await supervisor.stop(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
