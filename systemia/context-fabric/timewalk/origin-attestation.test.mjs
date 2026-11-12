import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  ORIGIN_ATTESTATION_SCHEMA,
  originAttestationMessage,
  verifyTimewalkOriginAttestation,
} from './origin-attestation.mjs';

const signedAt = '2026-11-09T12:00:00.000Z';
const verifiedAt = '2026-11-10T12:00:00.000Z';
const expires = '2026-11-12T12:00:00.000Z';
const sha = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');
function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const receiptBody = {
    schema: 'evercraft.execution-gate.lease-event.v1',
    lease_id: 'synthetic-001',
    state: 'completed',
    outcome_evidence_ref: 'synthetic:receipt',
  };
  const receipt = { ...receiptBody, receipt_hash: sha(JSON.stringify(receiptBody)) };
  const body = {
    schema: ORIGIN_ATTESTATION_SCHEMA,
    issuer_id: 'evercraft:execution-gate',
    key_id: 'key:synthetic-001',
    source_receipt_schema: receipt.schema,
    source_receipt_hash: receipt.receipt_hash,
    source_receipt_bytes_sha256: sha(JSON.stringify(receipt)),
    signed_at: signedAt,
    expires_at: expires,
  };
  const attestation = {
    ...body,
    signature_base64: sign(null, Buffer.from(originAttestationMessage(body)),
      privateKey).toString('base64'),
  };
  const trusted_keys = [{
    issuer_id: body.issuer_id, key_id: body.key_id,
    allowed_source_schemas: [receipt.schema],
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
    valid_from: '2026-11-01T00:00:00.000Z',
    valid_to: '2026-12-01T00:00:00.000Z',
    revoked: false,
  }];
  return { receipt, attestation, trusted_keys, privateKey };
}
const check = (overrides = {}) => {
  const f = fixture();
  return verifyTimewalkOriginAttestation({
    ...f, verified_at: verifiedAt, ...overrides,
  });
};

test('real Ed25519 signature verifies only against a pinned allowed producer key', () => {
  const f = fixture();
  assert.equal(verifyTimewalkOriginAttestation({
    receipt: f.receipt, attestation: f.attestation,
    trusted_keys: f.trusted_keys, verified_at: verifiedAt,
  }), 'signature_valid_for_pinned_key');
});
test('attestation does not carry its own public-key authority', () => {
  const f = fixture();
  assert.equal(verifyTimewalkOriginAttestation({
    receipt: f.receipt,
    attestation: { ...f.attestation, public_key_pem: f.trusted_keys[0].public_key_pem },
    trusted_keys: f.trusted_keys, verified_at: verifiedAt,
  }), 'attestation_fields_invalid');
  assert.equal(verifyTimewalkOriginAttestation({
    receipt: f.receipt, attestation: f.attestation,
    trusted_keys: [], verified_at: verifiedAt,
  }), 'trusted_key_unavailable');
});
test('invalid signature, swapped receipt bytes or changed receipt hash all fail', () => {
  const f = fixture();
  const invalidSig = { ...f.attestation, signature_base64: Buffer.alloc(64).toString('base64') };
  assert.equal(verifyTimewalkOriginAttestation({ ...f, attestation: invalidSig,
    verified_at: verifiedAt }), 'attestation_signature_invalid');
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    receipt: { ...f.receipt, lease_id: 'synthetic-tampered' },
    verified_at: verifiedAt }), 'attestation_receipt_binding_mismatch');
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    receipt: { ...f.receipt, receipt_hash: sha('different') },
    verified_at: verifiedAt }), 'attestation_receipt_binding_mismatch');
});
test('producer schema restriction and revoked keys fail closed', () => {
  const f = fixture();
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    trusted_keys: [{ ...f.trusted_keys[0], allowed_source_schemas: [] }],
    verified_at: verifiedAt }), 'trusted_key_not_authorized');
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    trusted_keys: [{ ...f.trusted_keys[0], revoked: true }],
    verified_at: verifiedAt }), 'trusted_key_not_authorized');
});
test('signing windows, expiration and future signatures are enforced', () => {
  const f = fixture();
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    trusted_keys: [{ ...f.trusted_keys[0],
      valid_from: '2026-11-10T00:00:00.000Z' }],
    verified_at: verifiedAt }), 'trusted_key_outside_signing_window');
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    verified_at: '2026-11-15T00:00:00.000Z' }), 'attestation_expired_or_future');
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    verified_at: '2026-11-01T00:00:00.000Z' }), 'attestation_expired_or_future');
});
test('malformed, duplicate key-id and wrong key algorithm cannot pass', () => {
  const f = fixture();
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    attestation: { ...f.attestation, signature_base64: 'not-a-signature' },
    verified_at: verifiedAt }), 'attestation_signature_invalid');
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    trusted_keys: [f.trusted_keys[0], f.trusted_keys[0]],
    verified_at: verifiedAt }), 'trusted_key_unavailable');
  const rsaPublic = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
  assert.equal(verifyTimewalkOriginAttestation({ ...f,
    trusted_keys: [{ ...f.trusted_keys[0],
      public_key_pem: rsaPublic.export({ format: 'pem', type: 'spki' }) }],
    verified_at: verifiedAt }), 'trusted_key_algorithm_invalid');
});
