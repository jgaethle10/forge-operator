/**
 * Trusted server-side Passport adapter for OS Files sharing.
 *
 * The caller MUST supply the actor ref from authenticated Evercraft Identity,
 * never from a browser request body. Passport's single-use permit must still
 * be consumed atomically by the eventual persistent link issuer. This read-only
 * adapter does not grant new authority, produce URLs, or consume permits.
 */
export function createPassportFileShareVerifier({
  passport,
  actorRef,
  permitId,
  now = () => Date.now()
} = {}) {
  if (typeof passport?.authorize !== "function" || typeof passport?.getActionPermitState !== "function") {
    throw new Error("passport_service_required");
  }
  if (typeof actorRef !== "string" || !actorRef.trim()) throw new Error("verified_actor_required");
  if (typeof permitId !== "string" || !permitId.trim()) throw new Error("passport_permit_required");
  if (typeof now !== "function") throw new Error("clock_required");

  return async (intent) => {
    const checkedMs = now();
    if (!Number.isFinite(checkedMs)) throw new Error("clock_invalid");
    if (intent?.schema !== "evercraft.os.files.share-intent.v1") throw new Error("share_intent_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(intent?.request_fingerprint || "")) {
      throw new Error("share_fingerprint_invalid");
    }
    const resource = "os-file:" + intent.artifact_ref;
    const scope = intent.audience === "external_public_link"
      ? "files.share_public"
      : intent.audience === "external_scoped_link"
        ? "files.share_scoped"
        : null;
    if (!scope) throw new Error("share_audience_invalid");

    const checkedAt = new Date(checkedMs).toISOString();
    const decision = passport.authorize({
      subject_ref: actorRef,
      product: "evercraft-os",
      scope,
      resource_ref: resource,
      at: checkedAt
    });
    if (decision?.decision !== "allow" || !decision?.grant_id) {
      throw new Error("passport_share_authorization_denied");
    }
    const permit = passport.getActionPermitState(permitId, { at: checkedAt });
    if (
      permit?.active !== true ||
      permit.grant_id !== decision.grant_id ||
      permit.actor_ref !== actorRef ||
      permit.product !== "evercraft-os" ||
      permit.scope !== scope ||
      permit.resource_ref !== resource ||
      permit.request_fingerprint !== intent.request_fingerprint
    ) throw new Error("passport_share_permit_invalid");

    return Object.freeze({
      issuer: "passport",
      authorized: true,
      request_fingerprint: intent.request_fingerprint,
      artifact_sha256: intent.artifact_sha256,
      audience: intent.audience,
      recipient_ref: intent.recipient_ref,
      checked_at: checkedAt,
      expires_at: new Date(checkedMs + Math.min(90, intent.ttl_seconds) * 1000).toISOString(),
      independently_verified: true,
      passport_grant_id: permit.grant_id,
      passport_permit_id: permitId,
      permit_consumed: false
    });
  };
}
