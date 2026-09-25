import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, 'durable-restart-worker.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-restart-proof-'));

function runWorker(mode, { waitForEvent = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, mode, root], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const maybeResolveEvent = (chunk) => {
      stdout += chunk.toString();
      if (!waitForEvent || resolved) return;
      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === waitForEvent) {
            resolved = true;
            resolve({ child, stdout, parsed });
            return;
          }
        } catch {}
      }
    };

    child.stdout.on('data', maybeResolveEvent);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (waitForEvent && resolved) return;
      if (code === 0) {
        const lines = stdout.trim().split('\n').filter(Boolean);
        let parsed = null;
        if (lines.length) parsed = JSON.parse(lines[lines.length - 1]);
        resolve({ child, stdout, stderr, parsed, code, signal });
      } else {
        reject(new Error(`worker ${mode} failed code=${code} signal=${signal} stderr=${stderr}`));
      }
    });
  });
}

try {
  const seeded = await runWorker('seed');
  assert.equal(seeded.parsed.event, 'seed-complete');

  const verified = await runWorker('verify');
  assert.equal(verified.parsed.event, 'verify-complete');
  assert.equal(verified.parsed.replay_blocked, true);
  assert.equal(verified.parsed.checkpoint_generation, 1);

  const torn = await runWorker('torn-tail', { waitForEvent: 'partial-tail-written' });
  torn.child.kill('SIGKILL');
  await new Promise((resolve) => torn.child.once('exit', resolve));

  const recovered = await runWorker('verify-tail');
  assert.equal(recovered.parsed.event, 'tail-verify-complete');
  assert.equal(recovered.parsed.executed_count, 2);
  assert.equal(recovered.parsed.tail_recovered, true);

  console.log(JSON.stringify({
    schema: 'evercraft.process-restart-recovery-proof.v1',
    status: 'PASS',
    separate_process_restart: true,
    secure_envelope_replay_blocked_after_restart: true,
    checkpoint_restored_after_restart: true,
    process_sigkill_after_partial_tail: true,
    committed_prefix_recovered_after_sigkill: true,
    field_proof_required: [
      'actual machine reboot',
      'abrupt physical power removal',
      'filesystem/controller cache-loss behavior',
      'restart cycles on deployed Nexus/Hearth hardware'
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
