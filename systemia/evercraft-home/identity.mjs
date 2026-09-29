import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_SCHEMA = "evercraft.identity.session.v1";

function requiredString(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function signatureFor(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function parsePayload(encodedPayload) {
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("session_payload_invalid");
  }
}

function normalizeKeyring(keys) {
  if (typeof keys === "string") {
    const secret = requiredString(keys, "identity_secret");
    return { legacy: secret, primary: secret };
  }
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
    throw new Error("identity_keyring_required");
  }
  const result = {};
  for (const [keyId, value] of Object.entries(keys)) {
    const id = requiredString(keyId, "signing_key_id");
    const secret = requiredString(value, "identity_secret");
    if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(id)) throw new Error("signing_key_id_invalid");
    if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("signing_secret_too_short");
    result[id] = secret;
  }
  if (!Object.keys(result).length) throw new Error("identity_keyring_required");
  return result;
}

export function verifyEvercraftSession(token, keyringOrSecret, { now = new Date() } = {}) {
  const raw = requiredString(token, "session_token");
  const [encodedPayload, suppliedSignature, extra] = raw.split(".");
  if (!encodedPayload || !suppliedSignature || extra) throw new Error("session_token_invalid");

  const payload = parsePayload(encodedPayload);
  if (payload?.schema !== SESSION_SCHEMA) throw new Error("session_schema_invalid");

  const keyring = normalizeKeyring(keyringOrSecret);
  const keyId = payload.signing_key_id ? String(payload.signing_key_id) : "legacy";
  const signingSecret = keyring[keyId];
  if (!signingSecret) throw new Error("session_signing_key_unknown");

  const expectedSignature = signatureFor(encodedPayload, signingSecret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("session_signature_invalid");
  }

  const subjectRef = requiredString(payload.subject_ref, "subject_ref");
  const displayName = requiredString(payload.display_name, "display_name");
  const sessionId = requiredString(payload.session_id, "session_id");
  const issuedAt = new Date(payload.issued_at);
  const expiresAt = new Date(payload.expires_at);
  if (!Number.isFinite(issuedAt.getTime())) throw new Error("session_issued_at_invalid");
  if (!Number.isFinite(expiresAt.getTime())) throw new Error("session_expiry_invalid");
  if (now >= expiresAt) throw new Error("session_expired");

  return {
    schema: SESSION_SCHEMA,
    session_id: sessionId,
    subject_ref: subjectRef,
    display_name: displayName,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    signing_key_id: keyId,
    issuer_ref: payload.issuer_ref ? String(payload.issuer_ref) : null,
  };
}

export function authorizeEvercraftHome(passport, session, { at = new Date().toISOString(), scope = "home.read" } = {}) {
  if (!passport || typeof passport.authorize !== "function") throw new Error("passport_required");
  const decision = passport.authorize({
    subject_ref: session.subject_ref,
    product: "evercraft-home",
    scope,
    at,
  });

  if (decision.decision !== "allow") {
    const error = new Error("home_access_denied");
    error.decision = decision;
    throw error;
  }

  return decision;
}

export const evercraftSessionSchema = SESSION_SCHEMA;
