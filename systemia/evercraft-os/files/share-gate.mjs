import { createHash } from "node:crypto";

const AUDIENCES = new Set(["external_public_link", "external_scoped_link"]);
const CLASSES = new Set(["public_release", "recipient_delivery", "internal_archive", "private_source"]);
const MAX_TTL_SECONDS = 24 * 60 * 60;
const MAX_PROOF_AGE_MS = 30 * 60 * 1000;
const SHA_PATTERN = /^sha256:[a-f0-9]{64}$/;

const hash = (value) => "sha256:" + createHash("sha256").update(JSON.stringify(value)).digest("hex");

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(field + "_required");
  return value.trim();
}

export function buildOsFileShareIntent({
  artifactRef, artifactSha256, classification, audience, recipientRef = null,
  purpose, ttlSeconds = 3600
} = {}) {
  const asset = required(artifactRef, "artifact_ref");
  const digest = required(artifactSha256, "artifact_sha256");
  if (!SHA_PATTERN.test(digest)) throw new Error("artifact_sha256_invalid");
  if (!CLASSES.has(classification)) throw new Error("classification_invalid");
  if (!AUDIENCES.has(audience)) throw new Error("audience_invalid");
  const recipient = recipientRef === null ? null : required(recipientRef, "recipient_ref");
  if (audience === "external_scoped_link" && !recipient) throw new Error("recipient_ref_required");
  if (audience === "external_public_link" && recipient) throw new Error("public_link_recipient_must_be_null");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error("ttl_seconds_out_of_range");
  }
  const body = {
    schema: "evercraft.os.files.share-intent.v1",
    artifact_ref: asset,
    artifact_sha256: digest,
    classification,
    audience,
    recipient_ref: recipient,
    purpose: required(purpose, "purpose"),
    ttl_seconds: ttlSeconds
  };
  return Object.freeze({ ...body, request_fingerprint: hash(body) });
}

function hold(request, reason) {
  return Object.freeze({
    schema: "evercraft.os.files.share-gate.v1",
    state: "HOLD",
    reason,
    request_fingerprint: request?.request_fingerprint || null,
    link_created: false
  });
}

/**
 * An internal server-side policy gate, not an HTTP endpoint or a link issuer.
 * The three callbacks MUST be independent trusted adapters, not caller-supplied
 * booleans or a producer-generated receipt. It deliberately never mints URLs.
 */
export async function evaluateOsFileShare(intent, adapters = {}, { now = Date.now() } = {}) {
  if (!Number.isFinite(now)) throw new Error("now_invalid");
  let expected;
  try {
    expected = buildOsFileShareIntent({
      artifactRef: intent?.artifact_ref,
      artifactSha256: intent?.artifact_sha256,
      classification: intent?.classification,
      audience: intent?.audience,
      recipientRef: intent?.recipient_ref,
      purpose: intent?.purpose,
      ttlSeconds: intent?.ttl_seconds
    });
  } catch {
    return hold(intent, "invalid_share_intent");
  }
  if (expected.request_fingerprint !== intent?.request_fingerprint) {
    return hold(expected, "share_intent_tampered");
  }
  if (expected.classification === "internal_archive" || expected.classification === "private_source") {
    return hold(expected, "private_artifact_must_not_be_shared");
  }
  if (expected.audience === "external_public_link" && expected.classification !== "public_release") {
    return hold(expected, "public_link_requires_public_release");
  }
  const keys = ["passport", "systemia", "shipping"];
  if (keys.some((key) => typeof adapters[key] !== "function")) {
    return hold(expected, "independent_verifier_missing");
  }
  const results = await Promise.allSettled(keys.map((key) => adapters[key](expected)));
  for (let i = 0; i < keys.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled") return hold(expected, keys[i] + "_verification_failed");
    const proof = result.value;
    const checked = Date.parse(proof?.checked_at);
    const expires = Date.parse(proof?.expires_at);
    if (
      proof?.issuer !== keys[i] ||
      proof?.authorized !== true ||
      proof?.request_fingerprint !== expected.request_fingerprint ||
      proof?.artifact_sha256 !== expected.artifact_sha256 ||
      proof?.audience !== expected.audience ||
      proof?.recipient_ref !== expected.recipient_ref ||
      proof?.independently_verified !== true ||
      !Number.isFinite(checked) ||
      !Number.isFinite(expires) ||
      checked > now + 30_000 ||
      now - checked > MAX_PROOF_AGE_MS ||
      expires <= now ||
      expires > now + expected.ttl_seconds * 1000
    ) return hold(expected, keys[i] + "_evidence_invalid_or_stale");
  }
  return Object.freeze({
    schema: "evercraft.os.files.share-gate.v1",
    state: "READY_FOR_LINK_ISSUANCE",
    request_fingerprint: expected.request_fingerprint,
    artifact_sha256: expected.artifact_sha256,
    audience: expected.audience,
    recipient_ref: expected.recipient_ref,
    max_ttl_seconds: expected.ttl_seconds,
    verifier_issuers: keys,
    link_created: false
  });
}
