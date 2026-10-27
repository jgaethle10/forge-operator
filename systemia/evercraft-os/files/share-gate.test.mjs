import test from "node:test";
import assert from "node:assert/strict";
import { buildOsFileShareIntent, evaluateOsFileShare } from "./share-gate.mjs";

const now = Date.parse("2026-10-14T16:00:00.000Z");
const digest = "sha256:" + "a".repeat(64);
const base = () => buildOsFileShareIntent({
  artifactRef: "artifact:graphics:release-14",
  artifactSha256: digest,
  classification: "public_release",
  audience: "external_public_link",
  purpose: "approved cinematic sample",
  ttlSeconds: 3600
});
const proofFor = (issuer, intent, extra = {}) => ({
  issuer, authorized: true,
  request_fingerprint: intent.request_fingerprint,
  artifact_sha256: intent.artifact_sha256,
  audience: intent.audience,
  recipient_ref: intent.recipient_ref,
  checked_at: new Date(now).toISOString(),
  expires_at: new Date(now + 600_000).toISOString(),
  independently_verified: true,
  ...extra
});
const adapters = (overrides = {}) => Object.fromEntries(
  ["passport", "systemia", "shipping"].map((issuer) => [
    issuer,
    async (intent) => proofFor(issuer, intent, overrides[issuer] || {})
  ])
);

test("all three independent receipts unlock ONLY link issuance, not a link", async () => {
  const outcome = await evaluateOsFileShare(base(), adapters(), { now });
  assert.equal(outcome.state, "READY_FOR_LINK_ISSUANCE");
  assert.equal(outcome.link_created, false);
  assert.deepEqual(outcome.verifier_issuers, ["passport", "systemia", "shipping"]);
  assert.equal(outcome.artifact_sha256, digest);
  assert.equal(outcome.url, undefined);
});
test("no verification adapters fail closed", async () => {
  assert.equal((await evaluateOsFileShare(base(), {}, { now })).reason, "independent_verifier_missing");
});
test("single missing shipping verifier blocks promotion", async () => {
  const a = adapters(); delete a.shipping;
  assert.equal((await evaluateOsFileShare(base(), a, { now })).state, "HOLD");
});
test("internal source never receives external access", async () => {
  const intent = buildOsFileShareIntent({
    artifactRef: "source:private", artifactSha256: digest, classification: "private_source",
    audience: "external_public_link", purpose: "mistake"
  });
  assert.equal((await evaluateOsFileShare(intent, adapters(), { now })).reason, "private_artifact_must_not_be_shared");
});
test("internal archives never receive external scoped access", async () => {
  const intent = buildOsFileShareIntent({
    artifactRef: "archive:private", artifactSha256: digest, classification: "internal_archive",
    audience: "external_scoped_link", recipientRef: "partner:123", purpose: "mistake"
  });
  assert.equal((await evaluateOsFileShare(intent, adapters(), { now })).state, "HOLD");
});
test("recipient delivery is not an anonymous public release", async () => {
  const intent = buildOsFileShareIntent({
    artifactRef: "proposal:1", artifactSha256: digest, classification: "recipient_delivery",
    audience: "external_public_link", purpose: "review"
  });
  assert.equal((await evaluateOsFileShare(intent, adapters(), { now })).reason, "public_link_requires_public_release");
});
test("scoped delivery binds exact recipient and passes when verified", async () => {
  const intent = buildOsFileShareIntent({
    artifactRef: "proposal:1", artifactSha256: digest, classification: "recipient_delivery",
    audience: "external_scoped_link", recipientRef: "partner:123", purpose: "review", ttlSeconds: 700
  });
  const result = await evaluateOsFileShare(intent, adapters(), { now });
  assert.equal(result.state, "READY_FOR_LINK_ISSUANCE");
  assert.equal(result.recipient_ref, "partner:123");
  assert.equal((await evaluateOsFileShare(intent, adapters({ shipping: { recipient_ref: "partner:other" } }), { now })).state, "HOLD");
});
test("intent mutation is detected by digest", async () => {
  const intent = { ...base(), purpose: "surreptitiously changed" };
  assert.equal((await evaluateOsFileShare(intent, adapters(), { now })).reason, "share_intent_tampered");
});
test("wrong artifact checksum in any independent proof blocks access", async () => {
  const result = await evaluateOsFileShare(base(), adapters({ shipping: { artifact_sha256: "sha256:" + "b".repeat(64) } }), { now });
  assert.equal(result.reason, "shipping_evidence_invalid_or_stale");
});
test("stale and future-dated shipping attestations fail closed", async () => {
  const stale = await evaluateOsFileShare(base(), adapters({ shipping: { checked_at: new Date(now - 31 * 60_000).toISOString() } }), { now });
  assert.equal(stale.state, "HOLD");
  const future = await evaluateOsFileShare(base(), adapters({ shipping: { checked_at: new Date(now + 60_000).toISOString() } }), { now });
  assert.equal(future.state, "HOLD");
});
test("shipping expiry beyond requested lifetime is rejected", async () => {
  const result = await evaluateOsFileShare(base(), adapters({ shipping: { expires_at: new Date(now + 2 * 3600_000).toISOString() } }), { now });
  assert.equal(result.state, "HOLD");
});
test("unverified or failed callback cannot unblock external sharing", async () => {
  const result = await evaluateOsFileShare(base(), adapters({ shipping: { independently_verified: false } }), { now });
  assert.equal(result.state, "HOLD");
  const failing = adapters(); failing.shipping = async () => { throw new Error("connection_failed"); };
  assert.equal((await evaluateOsFileShare(base(), failing, { now })).reason, "shipping_verification_failed");
});
test("invalid recipient, digest, and excessive ttl rejected", () => {
  assert.throws(() => buildOsFileShareIntent({ artifactRef: "x", artifactSha256: "fake", classification: "public_release", audience: "external_public_link", purpose: "review" }), /artifact_sha256_invalid/);
  assert.throws(() => buildOsFileShareIntent({ artifactRef: "x", artifactSha256: digest, classification: "recipient_delivery", audience: "external_scoped_link", purpose: "review" }), /recipient_ref_required/);
  assert.throws(() => buildOsFileShareIntent({ artifactRef: "x", artifactSha256: digest, classification: "public_release", audience: "external_public_link", ttlSeconds: 90_000, purpose: "review" }), /ttl_seconds_out_of_range/);
});
