import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runFridayEngineeringLog } from '../systemia/organism/kaidance-friday-engineering-log.mjs';

test('Friday in Pacific time emits one private registry log and preserves evidence levels', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kaidance-friday-'));
  let reads = 0;
  const options = {
    outDir,
    readRecord: async endpoint => {
      reads++;
      const number = Number(endpoint.split('/')[1]);
      if (number === 907) throw Error('source blocked');
      return { number, state: 'open', updated_at: '2026-11-27T15:00:00Z', draft: true };
    },
    runSimulation: async () => ({ status: 'demonstrated_simulation' })
  };
  try {
    const pulse = iso => runFridayEngineeringLog({ ...options, now: new Date(iso) });
    assert.equal((await pulse('2026-11-27T16:59:00Z')).status, 'not_due');
    assert.equal((await pulse('2026-11-28T08:00:00Z')).status, 'not_due');
    assert.equal(reads, 0);
    assert.equal((await pulse('2026-11-27T17:00:00Z')).status, 'compiled');
    assert.equal((await pulse('2026-11-27T17:05:00Z')).status, 'already_compiled');
    assert.equal(reads, 8);
    const file = path.join(outDir, '2026-11-27.json');
    const log = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.equal(log.review_status, 'registry_review_pending');
    assert.equal(log.coverage, 'partial');
    assert.equal(log.entries.find(row => row.program === 'toy-yard-002').evidence_level, 'source_unavailable');
    assert.equal(log.entries.find(row => row.program === 'anniston-aaar').evidence_level, 'proposed_source');
    assert.equal(log.simulation_results[0].status, 'demonstrated_simulation');
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
