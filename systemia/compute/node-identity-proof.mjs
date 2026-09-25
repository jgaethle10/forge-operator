import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureNodeIdentity } from './node-identity.mjs';
import { encodeCapacityBeacon, parseCapacityBeacon } from './capacity-beacon.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-node-identity-'));
try {
  const first = ensureNodeIdentity({ root, nodeId: 'identity-proof-node' });
  const second = ensureNodeIdentity({ root, nodeId: 'identity-proof-node' });

  assert.equal(first.public_key_fingerprint_sha256, second.public_key_fingerprint_sha256);
  assert.equal(first.public_key_spki_b64, second.public_key_spki_b64);
  assert.equal(fs.statSync(first.private_key_file).mode & 0o777, 0o600);

  const encoded = encodeCapacityBeacon({
    nodeId: 'identity-proof-node',
    endpoint: 'http://127.0.0.1:42420',
    identity: first,
  });
  const parsed = parseCapacityBeacon(encoded);
  assert.equal(parsed.signature_verified, true);
  assert.equal(parsed.public_key_fingerprint_sha256, first.public_key_fingerprint_sha256);
  assert.equal(parsed.authority_state, 'not_granted_by_signature');

  const tampered = JSON.parse(encoded.toString('utf8'));
  tampered.endpoint = 'http://127.0.0.1:49999';
  assert.throws(() => parseCapacityBeacon(Buffer.from(JSON.stringify(tampered))));

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.node.identity-proof.v1',
    algorithm: 'ed25519',
    stable_identity: true,
    local_secret_permissions: '0600',
    signed_beacon_verified: true,
    tampered_beacon_rejected: true,
    signature_grants_authority: false,
    dynamic_authorization_preserved: true
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
