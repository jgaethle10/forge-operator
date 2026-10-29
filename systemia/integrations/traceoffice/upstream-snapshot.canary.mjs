#!/usr/bin/env node
// Zero-secret contract canary. Never reads session files or sends network requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [snapshotPath, parserPath] = process.argv.slice(2);
if (!snapshotPath || !parserPath) {
  console.error('Usage: node --experimental-strip-types upstream-snapshot.canary.mjs <synthetic.json> <pinned-upstream/src/snapshot.ts>');
  process.exitCode = 2;
} else {
  const { parseOfficeSnapshot } = await import(pathToFileURL(path.resolve(parserPath)).href);
  assert.equal(typeof parseOfficeSnapshot, 'function', 'upstream parser export missing');
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  assert.ok(Buffer.byteLength(raw, 'utf8') < 2_000_000, 'snapshot too large');
  const accepted = parseOfficeSnapshot(raw);
  assert.equal(accepted.version, 1);
  assert.equal(accepted.agents.length, 3);
  assert.equal(accepted.interactions.length, 2);
  assert.ok(accepted.agents.every(a => a.name.includes('SYNTHETIC')));
  assert.ok(accepted.agents.every(a => a.activityLabel?.startsWith('SYNTHETIC')));
  assert.deepEqual(accepted.agents.map(a => a.status), ['working', 'blocked', 'idle']);
  const ids = new Set(accepted.agents.map(a => a.id));
  assert.ok(accepted.interactions.every(link => ids.has(link.fromId) && ids.has(link.toId)));

  const reject = (change, label) => {
    const altered = structuredClone(accepted);
    change(altered);
    assert.throws(() => parseOfficeSnapshot(JSON.stringify(altered)), Error, label);
  };
  reject(s => { s.agents[0].status = 'unverified-fantasy'; }, 'reject invented status');
  reject(s => { s.agents[0].activityLabel = 'x'.repeat(161); }, 'reject oversized label');
  reject(s => { s.agents[0].updatedAt = 'yesterday'; }, 'reject invalid timestamp');
  reject(s => { s.interactions[0].toId = 'missing'; }, 'reject forged edge');
  reject(s => { s.agents = Array.from({ length: 51 }, (_, i) => ({ ...s.agents[0], id: `faux-${i}` })); }, 'enforce upstream limit');

  console.log('UPSTREAM SNAPSHOT PARSER: PASS (synthetic import + five rejection controls)');
  console.log('Parser acceptance is NOT a running 3D UI import.');
}
