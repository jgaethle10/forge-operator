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

export function verifyEvercraftSession(token, secret, { now = new Date() } = {}) {
  const signingSecret = requiredString(secret, "identity_secret");
  const raw = requiredString(token, "session_token");
  const [encodedPayload, suppliedSignature, extra] = raw.split(".");
  if (!encodedPayload || !suppliedSignature || extra) throw new Error("session_token_invalid");

  const expectedSignature = signatureFor(encodedPayload, signingSecret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("session_signature_invalid");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("session_payload_invalid");
  }

  if (payload?.schema !== SESSION_SCHEMA) throw new Error("session_schema_invalid");
  const subjectRef = requiredString(payload.subject_ref, "subject_ref");
  const displayName = requiredString(payload.display_name, "display_name");
  const expiresAt = new Date(payload.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) throw new Error("session_expiry_invalid");
  if (now >= expiresAt) throw new Error("session_expired");

  return {
    schema: SESSION_SCHEMA,
    subject_ref: subjectRef,
    display_name: displayName,
    expires_at: expiresAt.toISOString(),
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
