import crypto from 'node:crypto';

const b64 = (value) => Buffer.from(value).toString('base64url');
const unb64 = (value) => Buffer.from(String(value || ''), 'base64url');

function signature(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest();
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).map((v) => v.trim()).filter(Boolean))];
}

export function issueRelaySession(claims, secret, options = {}) {
  const key = String(secret || '');
  if (Buffer.byteLength(key) < 32) throw new Error('Relay session secret must be at least 32 bytes.');
  const principal = String(claims?.principal_id || claims?.sub || '').trim();
  if (!principal) throw new Error('principal_id is required.');
  const now = Math.floor(Number(options.now ?? Date.now()) / 1000);
  const ttl = Math.max(60, Math.min(Number(claims?.ttl_seconds ?? options.ttlSeconds ?? 600), 3600));
  const header = { alg: 'HS256', typ: 'EVR', v: 1 };
  const payload = {
    iss: 'systemia-notification-fabric',
    sub: principal,
    aud: 'evercraft-relay',
    iat: now,
    exp: now + ttl,
    jti: crypto.randomUUID(),
    permissions: normalizeList(claims?.permissions || ['subscribe', 'stream', 'inbox', 'ack']),
    audiences: normalizeList(claims?.audiences),
    products: normalizeList(claims?.products),
  };
  const unsigned = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  return { token: `${unsigned}.${b64(signature(unsigned, key))}`, expires_at: new Date(payload.exp * 1000).toISOString(), claims: payload };
}

export function verifyRelaySession(token, secret, options = {}) {
  const key = String(secret || '');
  if (Buffer.byteLength(key) < 32) throw new Error('Relay session secret is not configured.');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid Relay session token.');
  const unsigned = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(unb64(parts[2]), signature(unsigned, key))) throw new Error('Invalid Relay session signature.');
  let header;
  let payload;
  try {
    header = JSON.parse(unb64(parts[0]).toString('utf8'));
    payload = JSON.parse(unb64(parts[1]).toString('utf8'));
  } catch {
    throw new Error('Invalid Relay session encoding.');
  }
  if (header?.alg !== 'HS256' || header?.typ !== 'EVR' || payload?.iss !== 'systemia-notification-fabric' || payload?.aud !== 'evercraft-relay') {
    throw new Error('Invalid Relay session claims.');
  }
  const now = Math.floor(Number(options.now ?? Date.now()) / 1000);
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.exp <= now || payload.iat > now + 60) {
    throw new Error('Relay session expired or not yet valid.');
  }
  if (payload.exp - payload.iat > 3600) throw new Error('Relay session exceeds maximum lifetime.');
  const required = String(options.permission || '').trim();
  if (required && !Array.isArray(payload.permissions)) throw new Error('Relay session permission denied.');
  if (required && !payload.permissions.includes(required)) throw new Error('Relay session permission denied.');
  if (!String(payload.sub || '').trim()) throw new Error('Relay session principal missing.');
  return payload;
}
