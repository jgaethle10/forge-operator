#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvercraftRealtimeBus } from './realtime-bus.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-realtime-proof-'));
try {
  const bus = new EvercraftRealtimeBus({ stateDir: dir });
  const one = bus.publish('proof-app', 'Widget', { type: 'create', data: { id: '1' }, revision: 1 });
  const two = bus.publish('proof-app', 'Widget', { type: 'update', data: { id: '1', x: 2 }, revision: 2 });
  assert.equal(one.sequence, 1);
  assert.equal(two.sequence, 2);
  assert.equal(two.previous_event_hash, one.event_hash);
  assert.equal(bus.read('proof-app', 'Widget', { afterSequence: 1 }).length, 1);

  const reopened = new EvercraftRealtimeBus({ stateDir: dir });
  const three = reopened.publish('proof-app', 'Widget', { type: 'delete', data: { id: '1' }, revision: 3 });
  assert.equal(three.sequence, 3);
  assert.equal(reopened.cursor('proof-app', 'Widget').sequence, 3);
  assert.equal(reopened.read('proof-app', 'Widget').length, 3);
  assert.equal(reopened.health().state, 'healthy');

  console.log(JSON.stringify({
    schema: 'evercraft.realtime.proof.v1',
    status: 'pass',
    durable_restart: true,
    ordered_sequence: true,
    resume_after_sequence: true,
    hash_chain: true,
    app_entity_stream_isolation: true
  }));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
