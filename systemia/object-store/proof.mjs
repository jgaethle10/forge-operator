#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvercraftObjectStore } from './object-store.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-object-store-proof-'));
try {
  const store = new EvercraftObjectStore({ stateDir: dir, maxObjectBytes: 1024 * 1024 });
  const body = Buffer.from('evercraft-object-proof');
  const first = store.put('proof-app', body, { name: 'proof.txt', contentType: 'text/plain' });
  const second = store.put('proof-app', body, { name: 'proof-copy.txt', contentType: 'text/plain' });
  assert.notEqual(first.reference.object_ref, second.reference.object_ref);
  assert.equal(first.reference.blob_sha256, second.reference.blob_sha256);
  assert.equal(second.receipt.blob_created, false);

  const fetched = store.get('proof-app', first.reference.object_ref);
  assert.equal(fetched.data.toString('utf8'), body.toString('utf8'));
  assert.equal(fetched.reference.content_type, 'text/plain');
  assert.equal(store.list('proof-app').length, 2);
  assert.throws(() => store.get('other-app', first.reference.object_ref), /object_reference_not_found/);

  store.deleteReference('proof-app', first.reference.object_ref);
  assert.equal(store.list('proof-app').length, 1);
  const before = store.garbageCollect({ dryRun: true });
  assert.equal(before.orphaned_blob_count, 0);
  store.deleteReference('proof-app', second.reference.object_ref);
  const orphan = store.garbageCollect({ dryRun: true });
  assert.equal(orphan.orphaned_blob_count, 1);
  const gc = store.garbageCollect({ dryRun: false });
  assert.equal(gc.deleted_blob_count, 1);
  assert.equal(store.health().state, 'healthy');

  console.log(JSON.stringify({
    schema: 'evercraft.object-store.proof.v1',
    status: 'pass',
    content_addressed: true,
    deduplicated_blobs: true,
    app_scoped_references: true,
    read_integrity_verified: true,
    reference_delete_is_not_blob_delete: true,
    explicit_gc: true
  }));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
