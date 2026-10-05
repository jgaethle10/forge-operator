import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  AttestationKeyRegistry,
  createAttestationPayload,
  signAttestation,
  verifyAttestation
} from './signatures.mjs';

function pair() {
  return generateKeyPairSync('ed25519');
}

test('signed actor attestation independently verifies against exact subject', () => {
  const { publicKey, privateKey } = pair();
  const payload = createAttestationPayload({
    subjectType: 'commit',
    subjectId: 'a'.repeat(64),
    actor: { type: 'agent', id: 'fallen-director' },
    keyId: 'yard:agent:fallen-director:v1',
    claims: { authority: 'bounded_scene_edit', publication_authority: false },
    issuedAt: '2026-10-02T06:00:00.000Z'
  });
  const envelope = signAttestation(payload, privateKey);
  const verified = verifyAttestation(envelope, {
    publicKey,
    expectedSubject: { type: 'commit', id: 'a'.repeat(64) }
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.actor.id, 'fallen-director');
  assert.match(verified.attestation_id, /^[a-f0-9]{64}$/);
});

test('tampering after signature fails verification', () => {
  const { publicKey, privateKey } = pair();
  const payload = createAttestationPayload({
    subjectType: 'transaction',
    subjectId: 'b'.repeat(64),
    actor: { type: 'agent', id: 'rivet-worker' },
    keyId: 'yard:agent:rivet-worker:v1',
    claims: { evidence_state: 'observed' }
  });
  const envelope = signAttestation(payload, privateKey);
  envelope.payload.claims.evidence_state = 'modeled';
  const verified = verifyAttestation(envelope, { publicKey });
  assert.equal(verified.ok, false);
  assert.equal(verified.reason, 'payload_digest_mismatch');
});

test('registry rejects revoked keys', () => {
  const { publicKey, privateKey } = pair();
  const registry = new AttestationKeyRegistry([{
    keyId: 'yard:agent:saban-worker-12:v1',
    publicKey,
    actor: { type: 'agent', id: 'saban-worker-12' }
  }]);
  const envelope = signAttestation(createAttestationPayload({
    subjectType: 'commit',
    subjectId: 'c'.repeat(64),
    actor: { type: 'agent', id: 'saban-worker-12' },
    keyId: 'yard:agent:saban-worker-12:v1'
  }), privateKey);
  assert.equal(registry.verify(envelope).ok, true);
  registry.revoke('yard:agent:saban-worker-12:v1');
  const revoked = registry.verify(envelope);
  assert.equal(revoked.ok, false);
  assert.equal(revoked.reason, 'key_revoked');
});

test('registry binds a key to the declared actor identity', () => {
  const { publicKey, privateKey } = pair();
  const registry = new AttestationKeyRegistry([{
    keyId: 'yard:human:alice:v1',
    publicKey,
    actor: { type: 'human', id: 'alice' }
  }]);
  const envelope = signAttestation(createAttestationPayload({
    subjectType: 'commit',
    subjectId: 'd'.repeat(64),
    actor: { type: 'human', id: 'mallory' },
    keyId: 'yard:human:alice:v1'
  }), privateKey);
  const result = registry.verify(envelope);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'actor_key_mismatch');
});
