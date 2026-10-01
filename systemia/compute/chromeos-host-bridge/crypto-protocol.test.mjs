import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  base64UrlFromBytes,
  bytesFromBase64Url,
  canonicalJson,
  observerSigningPayload,
} from './crypto-protocol.js';

test('canonical JSON is stable across key insertion order', () => {
  const left = {
    z: 1,
    nested: { b: true, a: 'proof' },
    ports: [{ enabled: true, port: 18080 }],
  };
  const right = {
    ports: [{ port: 18080, enabled: true }],
    nested: { a: 'proof', b: true },
    z: 1,
  };
  assert.equal(canonicalJson(left), canonicalJson(right));
});

test('observer signing payload excludes only the signature field', () => {
  const payload = observerSigningPayload({
    observer_install_id: 'cros_proof_identity',
    observer_key_fingerprint: 'sha256:' + 'a'.repeat(64),
    observer_signature: 'should-not-be-signed',
    ports: [8443, 18080],
  });
  assert.equal('observer_signature' in payload, false);
  assert.equal(payload.observer_install_id, 'cros_proof_identity');
  assert.deepEqual(payload.ports, [8443, 18080]);
});

test('browser-compatible ECDSA signature encoding verifies through WebCrypto', async () => {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  const payload = {
    schema: 'evercraft.chromeos-host-boundary-observation.v1',
    observer_install_id: 'cros_crypto_proof',
    ports: [8443, 18080],
  };
  const data = new TextEncoder().encode(canonicalJson(payload));
  const raw = new Uint8Array(await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    data,
  ));
  const encoded = base64UrlFromBytes(raw);
  const decoded = bytesFromBase64Url(encoded);
  assert.deepEqual(decoded, raw);
  const verified = await webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.publicKey,
    decoded,
    data,
  );
  assert.equal(verified, true);
});
