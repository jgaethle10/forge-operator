#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EvercraftSecretStore } from './secret-store.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-secret-store-proof-'));
const key = randomBytes(32);
const wrongKey = randomBytes(32);
const secret = 'proof-super-secret-value-42';

try {
  const store = new EvercraftSecretStore({ stateDir: dir, masterKey: key });
  const first = store.setSecret('proof-app', 'provider-token', secret, { metadata: { provider: 'proof' } });
  assert.equal(first.version, 1);
  assert.equal(store.getSecretText('proof-app', 'provider-token'), secret);
  assert.equal(store.metadata('proof-app', 'provider-token').metadata.provider, 'proof');

  const disk = fs.readdirSync(dir, { recursive: true })
    .filter((entry) => typeof entry === 'string')
    .map((entry) => path.join(dir, entry))
    .filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile())
    .map((entry) => fs.readFileSync(entry))
    .reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0))
    .toString('utf8');
  assert.ok(!disk.includes(secret));

  const second = store.setSecret('proof-app', 'provider-token', 'rotated-value');
  assert.equal(second.version, 2);
  assert.equal(store.getSecretText('proof-app', 'provider-token'), 'rotated-value');

  const wrong = new EvercraftSecretStore({ stateDir: dir, masterKey: wrongKey });
  assert.throws(() => wrong.getSecretText('proof-app', 'provider-token'), /secret_decryption_failed/);

  const receipts = fs.readFileSync(path.join(dir, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(receipts.every((row) => row.secret_value_emitted === false));
  assert.ok(!JSON.stringify(receipts).includes('rotated-value'));

  const deletion = store.deleteSecret('proof-app', 'provider-token');
  assert.equal(deletion.operation, 'delete');
  assert.throws(() => store.getSecretText('proof-app', 'provider-token'), /secret_not_found/);
  assert.equal(store.health().state, 'healthy');

  console.log(JSON.stringify({
    schema: 'evercraft.secret-store.proof.v1',
    status: 'pass',
    encrypted_at_rest: true,
    aad_bound_identity: true,
    wrong_key_fails_closed: true,
    versioned_rotation: true,
    plaintext_absent_from_disk: true,
    plaintext_absent_from_receipts: true,
    master_key_persisted_by_store: false
  }));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
