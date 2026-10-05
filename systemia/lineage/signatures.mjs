import { createHash, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { lineage } from './core.mjs';

const SCHEMA = 'evercraft.lineage.attestation.v1';

function canonical(value) {
  return lineage.stable(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function createAttestationPayload({
  subjectType,
  subjectId,
  actor,
  keyId,
  claims = {},
  issuedAt = new Date().toISOString()
}) {
  if (!subjectType) throw new Error('subjectType is required');
  if (!subjectId) throw new Error('subjectId is required');
  if (!actor?.id || !actor?.type) throw new Error('actor type and id are required');
  if (!keyId) throw new Error('keyId is required');

  return {
    schema: SCHEMA,
    subject: {
      type: String(subjectType),
      id: String(subjectId)
    },
    actor: {
      type: String(actor.type),
      id: String(actor.id)
    },
    key_id: String(keyId),
    issued_at: String(issuedAt),
    claims
  };
}

export function signAttestation(payload, privateKey) {
  if (payload?.schema !== SCHEMA) throw new Error('Unsupported attestation schema');
  const canonicalPayload = canonical(payload);
  const signature = cryptoSign(null, Buffer.from(canonicalPayload), privateKey);
  return {
    payload,
    payload_sha256: createHash('sha256').update(canonicalPayload).digest('hex'),
    algorithm: 'Ed25519',
    signature: signature.toString('base64')
  };
}

export function verifyAttestation(envelope, {
  publicKey,
  revokedKeyIds = new Set(),
  expectedSubject = null
} = {}) {
  if (!envelope?.payload || envelope.payload.schema !== SCHEMA) {
    return { ok: false, reason: 'unsupported_schema' };
  }
  if (!publicKey) return { ok: false, reason: 'missing_public_key' };
  if (revokedKeyIds.has(envelope.payload.key_id)) {
    return { ok: false, reason: 'key_revoked', key_id: envelope.payload.key_id };
  }

  const canonicalPayload = canonical(envelope.payload);
  const actualDigest = createHash('sha256').update(canonicalPayload).digest('hex');
  if (actualDigest !== envelope.payload_sha256) {
    return { ok: false, reason: 'payload_digest_mismatch', expected: envelope.payload_sha256, actual: actualDigest };
  }

  if (expectedSubject) {
    if (
      envelope.payload.subject?.type !== expectedSubject.type ||
      envelope.payload.subject?.id !== expectedSubject.id
    ) {
      return { ok: false, reason: 'subject_mismatch' };
    }
  }

  let signature;
  try {
    signature = Buffer.from(envelope.signature || '', 'base64');
  } catch {
    return { ok: false, reason: 'invalid_signature_encoding' };
  }

  const valid = cryptoVerify(null, Buffer.from(canonicalPayload), publicKey, signature);
  if (!valid) return { ok: false, reason: 'signature_invalid' };

  return {
    ok: true,
    key_id: envelope.payload.key_id,
    actor: envelope.payload.actor,
    subject: envelope.payload.subject,
    payload_sha256: actualDigest,
    attestation_id: digest(envelope)
  };
}

export class AttestationKeyRegistry {
  constructor(entries = []) {
    this.keys = new Map();
    for (const entry of entries) this.register(entry);
  }

  register({ keyId, publicKey, actor = null, status = 'active' }) {
    if (!keyId || !publicKey) throw new Error('keyId and publicKey are required');
    if (!['active', 'revoked'].includes(status)) throw new Error(`Unsupported key status: ${status}`);
    this.keys.set(String(keyId), { publicKey, actor, status });
    return this;
  }

  revoke(keyId) {
    const current = this.keys.get(String(keyId));
    if (!current) throw new Error(`Unknown key: ${keyId}`);
    this.keys.set(String(keyId), { ...current, status: 'revoked' });
  }

  verify(envelope, options = {}) {
    const keyId = envelope?.payload?.key_id;
    const key = this.keys.get(String(keyId));
    if (!key) return { ok: false, reason: 'unknown_key', key_id: keyId || null };
    if (key.status === 'revoked') return { ok: false, reason: 'key_revoked', key_id: keyId };
    const result = verifyAttestation(envelope, { ...options, publicKey: key.publicKey });
    if (!result.ok) return result;
    if (
      key.actor &&
      (key.actor.type !== result.actor.type || key.actor.id !== result.actor.id)
    ) {
      return { ok: false, reason: 'actor_key_mismatch', key_id: keyId };
    }
    return result;
  }
}

export const attestations = { schema: SCHEMA, canonical, digest };
