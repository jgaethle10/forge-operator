import { createHash, createPublicKey, verify } from 'node:crypto';

/**
 * Offline verification of a producer's Ed25519 attestation binding its key
 * to a receipt object's exact JSON.stringify() serialization. An internal operator must pin the trust registry.
 * A valid signature proves key possession and digest binding, NOT receipt
 * truth, historical completeness, or authorization to execute.
 *
 * This contract is NEW. Existing unsigned receipts remain unverified.
 */
export const ORIGIN_ATTESTATION_SCHEMA = 'evercraft.timewalk.source-origin-attestation.v1';

const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,127}$/;

function sha256(text) {
  return 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');
}

function exactIso(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))) return null;
  const normalized = new Date(value).toISOString();
  return normalized;
}

function stringField(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

// Positional domain-separated payload avoids JSON property-order ambiguity.
// Source producers must sign this exact UTF-8 array representation.
export function originAttestationMessage(body) {
  return JSON.stringify([
    ORIGIN_ATTESTATION_SCHEMA,
    body.issuer_id,
    body.key_id,
    body.source_receipt_schema,
    body.source_receipt_hash,
    body.source_receipt_bytes_sha256,
    body.signed_at,
    body.expires_at,
  ]);
}

/**
 * Keys are passed ONLY from internal owner-pinned configuration, never from
 * the receipt or attestation. key entry:
 * {issuer_id,key_id,public_key_pem,allowed_source_schemas,valid_from,valid_to,revoked}
 *
 * This verifier makes no network request and never accepts a public key
 * supplied by the attestation itself.
 */
export function verifyTimewalkOriginAttestation({
  receipt, attestation, trusted_keys, verified_at = new Date().toISOString(),
} = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return 'source_receipt_invalid';
  }
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    return 'attestation_unavailable';
  }
  if (attestation.schema !== ORIGIN_ATTESTATION_SCHEMA) return 'attestation_schema_invalid';
  const expectedFields = [
    'schema', 'issuer_id', 'key_id', 'source_receipt_schema',
    'source_receipt_hash', 'source_receipt_bytes_sha256',
    'signed_at', 'expires_at', 'signature_base64',
  ];
  const actualKeys = Object.keys(attestation).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedFields].sort())) {
    return 'attestation_fields_invalid';
  }
  if (!stringField(attestation.issuer_id, ID) || !stringField(attestation.key_id, ID) ||
      !stringField(attestation.source_receipt_schema, ID) ||
      typeof attestation.source_receipt_hash !== 'string' ||
      !stringField(attestation.source_receipt_bytes_sha256, HASH) ||
      !exactIso(attestation.signed_at) || !exactIso(attestation.expires_at) ||
      !exactIso(verified_at)) return 'attestation_fields_invalid';
  if (Date.parse(attestation.signed_at) > Date.parse(verified_at) ||
      Date.parse(attestation.expires_at) <= Date.parse(verified_at) ||
      Date.parse(attestation.expires_at) <= Date.parse(attestation.signed_at)) {
    return 'attestation_expired_or_future';
  }
  if (attestation.source_receipt_schema !== receipt.schema ||
      attestation.source_receipt_hash !== receipt.receipt_hash ||
      attestation.source_receipt_bytes_sha256 !== sha256(JSON.stringify(receipt))) {
    return 'attestation_receipt_binding_mismatch';
  }
  // The registry is supplied by a trusted internal deployment, never merged
  // with fields from any fetched source or its claimed signer.
  if (!Array.isArray(trusted_keys) || trusted_keys.length === 0) {
    return 'trusted_key_unavailable';
  }
  const keys = trusted_keys.filter((key) =>
    key?.issuer_id === attestation.issuer_id &&
    key?.key_id === attestation.key_id);
  if (keys.length !== 1) return 'trusted_key_unavailable';
  const key = keys[0];
  if (key.revoked === true ||
      !Array.isArray(key.allowed_source_schemas) ||
      !key.allowed_source_schemas.includes(receipt.schema)) {
    return 'trusted_key_not_authorized';
  }
  const from = exactIso(key.valid_from);
  const to = exactIso(key.valid_to);
  if (!from || !to ||
      Date.parse(attestation.signed_at) < Date.parse(from) ||
      Date.parse(attestation.signed_at) >= Date.parse(to)) {
    return 'trusted_key_outside_signing_window';
  }
  const encoded = attestation.signature_base64;
  if (typeof encoded !== 'string' || encoded.length > 128 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return 'attestation_signature_invalid';
  const signature = Buffer.from(encoded, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== encoded) {
    return 'attestation_signature_invalid';
  }
  try {
    const publicKey = createPublicKey(key.public_key_pem);
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      return 'trusted_key_algorithm_invalid';
    }
    return verify(null,
      Buffer.from(originAttestationMessage(attestation), 'utf8'),
      publicKey,
      signature) ? 'signature_valid_for_pinned_key' : 'attestation_signature_invalid';
  } catch {
    return 'trusted_key_or_signature_invalid';
  }
}
