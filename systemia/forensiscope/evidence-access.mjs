import crypto from 'node:crypto';

const TOKEN_PREFIX = 'forensiscope-access-v1';
const AUDIENCE = 'forensiscope-evidence';
const MAX_TTL_SECONDS = 24 * 60 * 60;
const ALLOWED_SCOPES = new Set([
  'query',
  'timeline',
  'duplicates',
  'context',
  'compare',
  'verify'
]);

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function signingKey(explicitKey = null) {
  const key = String(explicitKey || process.env.FORENSISCOPE_EVIDENCE_ACCESS_KEY || '');
  if (Buffer.byteLength(key, 'utf8') < 32) {
    throw new Error('ForensiScope evidence access requires a signing key of at least 32 bytes.');
  }
  return key;
}

function signature(payloadPart, key) {
  return crypto
    .createHmac('sha256', key)
    .update(TOKEN_PREFIX + '.' + payloadPart)
    .digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeScopes(scopes) {
  const values = [...new Set(
    (Array.isArray(scopes) ? scopes : [])
      .map((scope) => String(scope || '').trim())
      .filter(Boolean)
  )];
  if (!values.length) throw new Error('ForensiScope evidence access requires at least one scope.');
  for (const scope of values) {
    if (!ALLOWED_SCOPES.has(scope)) {
      throw new Error(`Unsupported ForensiScope evidence access scope: ${scope}`);
    }
  }
  return values.sort();
}

function assertEvidenceRef(evidenceRef) {
  const ref = String(evidenceRef || '');
  if (!/^forensiscope-evidence:sha256:[a-f0-9]{64}$/.test(ref)) {
    throw new Error('ForensiScope evidence access requires a valid immutable evidence_ref.');
  }
  return ref;
}

export function issueEvidenceAccessToken({
  evidenceRef,
  scopes,
  ttlSeconds = 3600,
  subject = null,
  nowSeconds = Math.floor(Date.now() / 1000),
  key = null
} = {}) {
  const ref = assertEvidenceRef(evidenceRef);
  const normalizedScopes = normalizeScopes(scopes);
  const ttl = Math.max(60, Math.min(MAX_TTL_SECONDS, Number(ttlSeconds) || 3600));
  const secret = signingKey(key);

  const payload = {
    v: 1,
    aud: AUDIENCE,
    evidence_ref: ref,
    scopes: normalizedScopes,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
    nonce: crypto.randomBytes(16).toString('hex'),
    ...(subject ? { sub: String(subject) } : {})
  };
  const payloadPart = base64url(JSON.stringify(payload));
  const sig = signature(payloadPart, secret);

  return {
    schema: 'evercraft.forensiscope.evidence-access-grant.v1',
    access_token: `${TOKEN_PREFIX}.${payloadPart}.${sig}`,
    evidence_ref: ref,
    scopes: normalizedScopes,
    issued_at_unix: payload.iat,
    expires_at_unix: payload.exp
  };
}

export function verifyEvidenceAccessToken(accessToken, {
  evidenceRef,
  requiredScope,
  nowSeconds = Math.floor(Date.now() / 1000),
  key = null
} = {}) {
  const ref = assertEvidenceRef(evidenceRef);
  const scope = String(requiredScope || '');
  if (!ALLOWED_SCOPES.has(scope)) {
    throw new Error('ForensiScope evidence access verification requires a valid scope.');
  }

  const parts = String(accessToken || '').split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    throw new Error('Invalid ForensiScope evidence access token.');
  }

  const secret = signingKey(key);
  const expected = signature(parts[1], secret);
  if (!safeEqual(parts[2], expected)) {
    throw new Error('ForensiScope evidence access signature verification failed.');
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64url(parts[1]));
  } catch {
    throw new Error('ForensiScope evidence access payload is invalid.');
  }

  if (
    payload?.v !== 1 ||
    payload?.aud !== AUDIENCE ||
    payload?.evidence_ref !== ref ||
    !Array.isArray(payload?.scopes)
  ) {
    throw new Error('ForensiScope evidence access token does not match this evidence reference.');
  }
  if (!payload.scopes.includes(scope)) {
    throw new Error(`ForensiScope evidence access token lacks required scope: ${scope}`);
  }
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) {
    throw new Error('ForensiScope evidence access token is missing valid time bounds.');
  }
  if (payload.iat > nowSeconds + 60) {
    throw new Error('ForensiScope evidence access token is not active yet.');
  }
  if (payload.exp <= nowSeconds) {
    throw new Error('ForensiScope evidence access token has expired.');
  }
  if (payload.exp - payload.iat > MAX_TTL_SECONDS) {
    throw new Error('ForensiScope evidence access token exceeds maximum lifetime.');
  }

  return {
    schema: 'evercraft.forensiscope.evidence-access-verification.v1',
    verified: true,
    evidence_ref: ref,
    required_scope: scope,
    scopes: [...payload.scopes],
    subject: payload.sub || null,
    issued_at_unix: payload.iat,
    expires_at_unix: payload.exp
  };
}
