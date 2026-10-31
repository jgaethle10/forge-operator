import test from 'node:test';
import assert from 'node:assert/strict';
import {pqRuntime,generatePqRecipient,encryptPqEnvelope,decryptPqEnvelope} from '../systemia/crypto/pq-envelope.mjs';

test('capability report is explicit and fail-closed on unsupported runtimes', () => {
  const state = pqRuntime();
  assert.equal(state.algorithm,'ML-KEM-768+HKDF-SHA256+AES-256-GCM');
  if (!state.available) assert.throws(()=>generatePqRecipient(),/refusing downgrade/);
});

test('ML-KEM roundtrip, route binding and tamper rejection', {skip:!pqRuntime().available}, () => {
  const keys = generatePqRecipient();
  const message = Buffer.from('Evercraft test payload, not a live secret');
  const envelope = encryptPqEnvelope({recipientPublicKey:keys.publicKey,plaintext:message,context:'systemia.relay.lab'});
  assert.equal(envelope.header.recipient_key_id,keys.recipientKeyId);
  assert.deepEqual(decryptPqEnvelope({recipientPrivateKey:keys.privateKey,envelope,expectedContext:'systemia.relay.lab'}),message);
  assert.throws(()=>decryptPqEnvelope({recipientPrivateKey:keys.privateKey,envelope,expectedContext:'systemia.relay.live'}),/rejected/);
  for (const property of ['ciphertext','tag']) {
    const tampered=structuredClone(envelope);
    tampered[property] = Buffer.from(`tamper ${property}`).toString('base64url');
    assert.throws(()=>decryptPqEnvelope({recipientPrivateKey:keys.privateKey,envelope:tampered,expectedContext:'systemia.relay.lab'}),/rejected/);
  }
  const altered=structuredClone(envelope);
  altered.header.context='systemia.relay.other';
  assert.throws(()=>decryptPqEnvelope({recipientPrivateKey:keys.privateKey,envelope:altered,expectedContext:'systemia.relay.other'}),/rejected/);
  const wrong = generatePqRecipient();
  assert.throws(()=>decryptPqEnvelope({recipientPrivateKey:wrong.privateKey,envelope,expectedContext:'systemia.relay.lab'}),/rejected/);
  assert.throws(()=>encryptPqEnvelope({recipientPublicKey:keys.publicKey,plaintext:'x',context:''}),/context/);
});
