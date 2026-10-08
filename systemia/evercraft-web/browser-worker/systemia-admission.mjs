import crypto from 'node:crypto';

// Versioned Systemia admission signature for the durable read-only queue.
// Signing binds method + exact pathname + raw request body with a one-time nonce.
const WINDOW_MS = 5 * 60_000;
const MAX_NONCES = 10000;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const error = (code) => { throw new Error(code); };

export function signDurableJobRequest(secret, { method, path, body = '', timestamp = Date.now(), nonce = crypto.randomUUID() } = {}) {
  if (Buffer.byteLength(String(secret || '')) < 32) error('durable_job_signing_key_invalid');
  const input = [
    String(timestamp), String(nonce), String(method).toUpperCase(),
    String(path), hash(String(body))
  ].join('\n');
  return {
    'x-evercraft-timestamp': String(timestamp),
    'x-evercraft-nonce': String(nonce),
    'x-evercraft-signature': crypto.createHmac('sha256', secret).update(input).digest('hex'),
  };
}

export function verifyDurableJobRequest(secret, { headers, method, path, body = '', now = Date.now(), nonces } = {}) {
  if (Buffer.byteLength(String(secret || '')) < 32 || !(nonces instanceof Map)) {
    error('durable_job_signing_key_unconfigured');
  }
  const timestamp = String(headers?.['x-evercraft-timestamp'] || '');
  const nonce = String(headers?.['x-evercraft-nonce'] || '');
  const signature = String(headers?.['x-evercraft-signature'] || '').toLowerCase();
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Number(timestamp) - now) > WINDOW_MS ||
      !/^[A-Za-z0-9._:-]{8,160}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) {
    error('durable_job_signature_invalid');
  }
  if (nonces.size >= MAX_NONCES) {
    for (const [key, expiry] of nonces) if (expiry <= now) nonces.delete(key);
    if (nonces.size >= MAX_NONCES) error('durable_job_replay_cache_full');
  }
  if (nonces.has(nonce)) error('durable_job_request_replayed');
  const expected = signDurableJobRequest(secret, { method, path, body, timestamp, nonce })['x-evercraft-signature'];
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    error('durable_job_signature_invalid');
  }
  nonces.set(nonce, now + WINDOW_MS);
  return true;
}
