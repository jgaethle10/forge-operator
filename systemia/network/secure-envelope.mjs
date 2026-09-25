import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';

function keyBytes(key) {
  if (Buffer.isBuffer(key)) {
    if (key.length === 32) return key;
    return createHash('sha256').update(key).digest();
  }
  return createHash('sha256').update(String(key || '')).digest();
}

function aadBytes(header) {
  return Buffer.from(JSON.stringify({
    schema: header.schema,
    message_id: header.message_id,
    key_id: header.key_id,
    source: header.source,
    destination: header.destination,
    kind: header.kind,
    created_at: header.created_at,
    expires_at: header.expires_at,
    irreversible: header.irreversible
  }));
}

export class ReplayGuard {
  constructor(initialIds = []) {
    this.seen = new Set(initialIds);
  }

  has(messageId) {
    return this.seen.has(messageId);
  }

  mark(messageId) {
    if (this.seen.has(messageId)) {
      const error = new Error('replay_detected');
      error.code = 'replay_detected';
      throw error;
    }
    this.seen.add(messageId);
  }
}

export function sealEnvelope({
  key,
  key_id = 'local-continuity',
  source,
  destination,
  kind = 'continuity.message',
  payload,
  message_id = `msg_${randomBytes(12).toString('hex')}`,
  created_at = new Date().toISOString(),
  expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  irreversible = false
}) {
  if (!source || !destination) throw new Error('source_and_destination_required');

  const header = {
    schema: 'evercraft.secure-envelope.v1',
    message_id,
    key_id,
    source,
    destination,
    kind,
    created_at,
    expires_at,
    irreversible: Boolean(irreversible)
  };

  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), nonce);
  cipher.setAAD(aadBytes(header));

  const plaintext = Buffer.from(JSON.stringify(payload ?? null));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ...header,
    algorithm: 'aes-256-gcm',
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  };
}

export function openEnvelope({
  envelope,
  key,
  expected_destination = null,
  now = Date.now(),
  replay_guard = null
}) {
  if (!envelope || envelope.schema !== 'evercraft.secure-envelope.v1') {
    throw new Error('invalid_envelope_schema');
  }
  if (envelope.algorithm !== 'aes-256-gcm') {
    throw new Error('unsupported_envelope_algorithm');
  }
  if (expected_destination && envelope.destination !== expected_destination) {
    throw new Error('wrong_destination');
  }

  const expires = Date.parse(envelope.expires_at);
  if (!Number.isFinite(expires) || expires <= now) {
    const error = new Error('envelope_expired');
    error.code = 'envelope_expired';
    throw error;
  }

  const header = {
    schema: envelope.schema,
    message_id: envelope.message_id,
    key_id: envelope.key_id,
    source: envelope.source,
    destination: envelope.destination,
    kind: envelope.kind,
    created_at: envelope.created_at,
    expires_at: envelope.expires_at,
    irreversible: Boolean(envelope.irreversible)
  };

  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBytes(key),
    Buffer.from(envelope.nonce, 'base64')
  );
  decipher.setAAD(aadBytes(header));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

  let plaintext;
  try {
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]);
  } catch {
    const error = new Error('envelope_authentication_failed');
    error.code = 'envelope_authentication_failed';
    throw error;
  }

  if (replay_guard) replay_guard.mark(envelope.message_id);

  return {
    header,
    payload: JSON.parse(plaintext.toString('utf8'))
  };
}
