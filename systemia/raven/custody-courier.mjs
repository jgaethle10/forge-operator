// Restricted, offline cryptographic primitive. NOT an HTTP handler or secret-export API.
// The owner-authorized legacy backend must supply values inside its own trusted runtime.
// Neither this module nor its challenge authenticates the caller or grants secret access.
const te = new TextEncoder();
const td = new TextDecoder();

export const LEGACY_RAVEN_FIELDS = Object.freeze([
  "FOUNDER_PHONE_NUMBER",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "NUMERAI_API_KEY",
  "LULU_AUTH_HEADER",
  "KAGGLE_API_TOKEN",
]);

const ALLOWED = new Set(LEGACY_RAVEN_FIELDS);
const MAX_FIELD_CHARS = 16384;
const MAX_CIPHERTEXT_CHARS = 131072;
const MAX_WRAPPED_KEY_CHARS = 1024;
const b64 = (v) => {
  const bytes = v instanceof Uint8Array ? v : new Uint8Array(v);
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).split("+").join("-").split("/").join("_").replace(/=+$/, "");
};
const fromB64 = (s) => {
  if (!/^[A-Za-z0-9_-]+$/.test(String(s || ""))) throw new Error("invalid_envelope_encoding");
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
function cleanFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("invalid_custody_fields");
  const names = Object.keys(fields);
  if (!names.length || names.length > LEGACY_RAVEN_FIELDS.length ||
      names.some(n => !ALLOWED.has(n) || typeof fields[n] !== "string" || fields[n].length === 0 || fields[n].length > MAX_FIELD_CHARS)) {
    throw new Error("invalid_custody_fields");
  }
  return names.sort();
}
function context(challenge) {
  return te.encode(JSON.stringify({
    schema: "evercraft.raven.custody-challenge.v1",
    id: challenge.id,
    expires_at: challenge.expires_at,
  }));
}

export async function createPrivateReceiverSession({ now = Date.now(), ttlMs = 300000 } = {}) {
  if (!Number.isSafeInteger(now) || ttlMs < 1000 || ttlMs > 300000) throw new Error("invalid_custody_expiry");
  const keys = await crypto.subtle.generateKey({
    name: "RSA-OAEP",
    modulusLength: 3072,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  }, false, ["encrypt", "decrypt"]);
  const challenge = Object.freeze({
    schema: "evercraft.raven.custody-challenge.v1",
    id: crypto.randomUUID(),
    expires_at: now + ttlMs,
    public_jwk: await crypto.subtle.exportKey("jwk", keys.publicKey),
  });
  let used = false;
  return {
    challenge,
    async consume(bundle, { now: at = Date.now() } = {}) {
      // A receiver session is in-memory and can be consumed only once.
      if (used) throw new Error("custody_challenge_consumed");
      used = true;
      if (at > challenge.expires_at) throw new Error("custody_challenge_expired");
      if (bundle?.schema !== "evercraft.raven.custody-envelope.v1" ||
          bundle?.challenge_id !== challenge.id ||
          bundle?.expires_at !== challenge.expires_at) throw new Error("custody_challenge_mismatch");
      if (typeof bundle.wrapped_key !== "string" || bundle.wrapped_key.length > MAX_WRAPPED_KEY_CHARS ||
          typeof bundle.ciphertext !== "string" || bundle.ciphertext.length > MAX_CIPHERTEXT_CHARS ||
          typeof bundle.iv !== "string" || bundle.iv.length !== 16 ||
          !Number.isSafeInteger(bundle.field_count) || bundle.field_count < 1 ||
          bundle.field_count > LEGACY_RAVEN_FIELDS.length) throw new Error("custody_envelope_invalid");
      const aad = context(challenge);
      const wrappedKey = fromB64(bundle.wrapped_key);
      const aesBytes = new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, keys.privateKey, wrappedKey));
      try {
        const aes = await crypto.subtle.importKey("raw", aesBytes, "AES-GCM", false, ["decrypt"]);
        const data = new Uint8Array(await crypto.subtle.decrypt({
          name: "AES-GCM",
          iv: fromB64(bundle.iv),
          additionalData: aad,
          tagLength: 128,
        }, aes, fromB64(bundle.ciphertext)));
        try {
          const fields = JSON.parse(td.decode(data));
          const names = cleanFields(fields);
          if (names.length !== bundle.field_count) throw new Error("custody_envelope_count_mismatch");
          // Returned only to a private receiver process; seal immediately and never log.
          return fields;
        } finally {
          // Best effort for intermediate buffers; returned JS strings are not zeroizable.
          data.fill(0);
        }
      } finally {
        aesBytes.fill(0);
      }
    },
  };
}

export async function sealCustodyForReceiver(challenge, fields, { now = Date.now() } = {}) {
  if (challenge?.schema !== "evercraft.raven.custody-challenge.v1" ||
      typeof challenge.id !== "string" || !challenge.id ||
      !Number.isSafeInteger(challenge.expires_at) ||
      now > challenge.expires_at || challenge.expires_at - now > 300000) {
    throw new Error("custody_challenge_unusable");
  }
  const names = cleanFields(fields);
  const publicKey = await crypto.subtle.importKey("jwk", challenge.public_jwk, {
    name: "RSA-OAEP", hash: "SHA-256",
  }, false, ["encrypt"]);
  const aesBytes = crypto.getRandomValues(new Uint8Array(32));
  const aesKey = await crypto.subtle.importKey("raw", aesBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = te.encode(JSON.stringify(fields));
  let ciphertext;
  let wrappedKey;
  try {
    ciphertext = await crypto.subtle.encrypt({
      name: "AES-GCM", iv, additionalData: context(challenge), tagLength: 128,
    }, aesKey, plaintext);
    wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, aesBytes);
  } finally {
    aesBytes.fill(0);
    // Best effort: JS strings from caller remain in memory until garbage-collected.
    plaintext.fill(0);
  }
  return {
    schema: "evercraft.raven.custody-envelope.v1",
    challenge_id: challenge.id,
    expires_at: challenge.expires_at,
    field_count: names.length,
    wrapped_key: b64(wrappedKey),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    plaintext_echoed: false,
  };
}
