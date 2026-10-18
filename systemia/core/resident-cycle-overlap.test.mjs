import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SystemiaCoreResidentSupervisor } from './resident-supervisor.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('busy cycle skips ticks without changing running state or spawning overlap', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'systemia-cycle-overlap-'));
  const stateDir = path.join(root, 'state');
  const manifest = 'cycle.workflow.json';
  const executable = 'cycle.mjs';
  fs.writeFileSync(path.join(root, executable), '// Only checked for existence. Stubbed child never executes.\n');
  fs.writeFileSync(path.join(root, manifest), JSON.stringify({
    schema: 'evercraft.systemia.workflow-manifest.v1',
    workflow_key: 'cycle-overlap-proof',
    cadence_seconds: 1,
  }));
  const configPath = path.join(root, 'resident-services.json');
  fs.writeFileSync(configPath, JSON.stringify({
    schema: 'evercraft.systemia.resident-supervisor-config.v1',
    services: [{
      service_key: 'slow-scheduled-task',
      mode: 'cycle',
      manifest,
      executable,
      cadence_seconds: 1,
    }],
  }));

  let spawned = 0;
  let active = 0;
  let maxActive = 0;
  const spawnImpl = () => {
    spawned += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      active -= 1;
      child.emit('close', code);
    };
    const timer = setTimeout(() => finish(0), 2650);
    child.kill = () => {
      clearTimeout(timer);
      queueMicrotask(() => finish(0));
      return true;
    };
    return child;
  };
  const supervisor = new SystemiaCoreResidentSupervisor({
    repoRoot: root,
    configPath,
    stateDir,
    spawnImpl,
  });

  try {
    supervisor.start({ immediateCycles: true });
    await sleep(2250); // Two interval ticks have fired while child #1 is alive.
    assert.equal(spawned, 1, 'second/third tick must not start another child');
    assert.equal(maxActive, 1);
    const running = supervisor.health().services[0];
    assert.equal(running.status, 'running', 'overlap skip cannot pretend the running task is held');
    assert.equal(running.run_count, 1);
    const receipts = fs.readFileSync(path.join(stateDir, 'receipts.jsonl'), 'utf8')
      .trim().split('\n').map(JSON.parse);
    assert.ok(receipts.filter((x) => x.type === 'cycle.skipped').length >= 2);
    assert.ok(receipts.some((x) => x.type === 'cycle.skipped' &&
      x.reason === 'previous_cycle_still_running'));

    await sleep(1120); // First child ends at ~2.65 seconds, next tick at ~3 seconds.
    assert.equal(spawned, 2, 'next cycle may start after previous child exits');
    assert.equal(maxActive, 1, 'no overlap across the skipped and resumed ticks');
    const stopped = await supervisor.stop();
    assert.equal(stopped.running, false);
    assert.equal(stopped.services[0].status, 'stopped');
    const countAtStop = spawned;
    await sleep(1150);
    assert.equal(spawned, countAtStop, 'no cycle can start after stop');
  } finally {
    await supervisor.stop().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
});
