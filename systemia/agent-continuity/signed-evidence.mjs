import crypto from "node:crypto";

const safe = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const nonempty = (v) => safe(v).length > 0;
const norm = (v) => safe(v).toLowerCase();

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
}

export function signedAgentEvidenceMessage(envelope) {
  const { signature, ...body } = envelope || {};
  return Buffer.from("evercraft.agent-continuity.evidence.v1\n" + stable(body));
}

/** Never accept public keys supplied by a request or an evidence envelope. */
export function verifySignedAgentEvidence({
  envelope,
  kind,
  trustedKeys = {},
  now = new Date(),
  maxLifetimeMs = 300_000,
} = {}) {
  if (!envelope || envelope.schema !== "evercraft.agent-continuity.signed-evidence.v1" ||
      envelope.kind !== kind) return false;
  const ids = trustedKeys?.[kind];
  const key = ids && Object.prototype.hasOwnProperty.call(ids, envelope.key_id)
    ? ids[envelope.key_id] : null;
  if (!key || !envelope.payload || typeof envelope.payload !== "object" ||
      Array.isArray(envelope.payload)) return false;
  const issued = Date.parse(envelope.issued_at || "");
  const expires = Date.parse(envelope.expires_at || "");
  const clock = now instanceof Date ? now.getTime() : Date.parse(now);
  if (![issued, expires, clock].every(Number.isFinite) ||
      issued > clock || expires <= clock || expires <= issued ||
      expires - issued > maxLifetimeMs || clock - issued > maxLifetimeMs) return false;
  const signature = safe(envelope.signature);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  const bytes = Buffer.from(signature, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== signature) return false;
  try {
    const message = signedAgentEvidenceMessage(envelope);
    if (message.length > 65536) return false;
    const publicKey = crypto.createPublicKey(key);
    if (publicKey.asymmetricKeyType !== "ed25519") return false;
    return crypto.verify(null, message, publicKey, bytes);
  } catch {
    return false;
  }
}

function sameIds(left, right) {
  const a = list(left).map(norm);
  const b = list(right).map(norm);
  return a.length > 0 && a.length === b.length &&
    new Set(a).size === a.length && new Set(b).size === b.length &&
    a.slice().sort().every((value, i) => value === b.slice().sort()[i]) &&
    !a.some((id) => ["sentinel", "juniper"].includes(id));
}
function resultHash(reviewers, synthesis) {
  const normalized = list(reviewers).map(({ reviewer_id, text }) => ({
    reviewer_id: safe(reviewer_id), response_hash: crypto.createHash("sha256").update(safe(text)).digest("hex"),
  }));
  return "sha256:" + crypto.createHash("sha256").update(stable({
    reviewers: normalized,
    synthesis: safe(synthesis?.text),
  })).digest("hex");
}

/**
 * Real commissioned reviews need separate owned authority proofs, preflight
 * nonce consumption and Juniper post-run writeback. Missing integration holds.
 * The inference model itself never signs or authorizes these proofs.
 */
export function createCommissionedTeamGate({
  trustedKeys,
  readPreflight,
  readCompletion,
  consumeNonce,
  now = () => new Date(),
} = {}) {
  return {
    async preflight(request) {
      if (typeof readPreflight !== "function" || typeof consumeNonce !== "function")
        return { allowed: false, reason: "commissioned_attestation_source_not_configured" };
      let evidence;
      try { evidence = await readPreflight(request); }
      catch { return { allowed: false, reason: "commissioned_preflight_unavailable" }; }
      if (!verifySignedAgentEvidence({
        envelope: evidence, kind: "dispatch_preflight", trustedKeys, now: now(),
      })) return { allowed: false, reason: "commissioned_preflight_signature_invalid" };
      const p = evidence.payload;
      if (p.request_id !== request.request_id || p.mission_key !== request.mission_key ||
          p.work_key !== request.work_key || !sameIds(p.role_ids, request.assigned_agents) ||
          !nonempty(p.preflight_id) ||
          p.juniper?.memory_read !== "passed" || !nonempty(p.juniper?.read_receipt_ref) ||
          p.sentinel?.guard !== "passed" || !nonempty(p.sentinel?.guard_receipt_ref) ||
          !nonempty(p.passport_receipt_ref) || !nonempty(p.execution_gate_receipt_ref) ||
          !nonempty(p.registry_snapshot_hash)) {
        return { allowed: false, reason: "commissioned_preflight_scope_or_dna_invalid" };
      }
      let consumed = false;
      try {
        // Required atomic durable claim; caller cannot merely assert success.
        consumed = await consumeNonce({
          preflight_id: p.preflight_id,
          request_id: request.request_id,
          mission_key: request.mission_key,
          expires_at: evidence.expires_at,
        }) === true;
      } catch { /* Denied when no durable replay protection. */ }
      if (!consumed) return { allowed: false, reason: "commissioned_preflight_nonce_not_claimed" };
      return {
        allowed: true,
        preflight_id: p.preflight_id,
        role_ids: [...p.role_ids],
        registry_snapshot_hash: p.registry_snapshot_hash,
      };
    },

    async completion({ request, preflight, reviewers, synthesis }) {
      if (!preflight?.allowed || typeof readCompletion !== "function")
        return { allowed: false, reason: "commissioned_memory_writeback_unavailable" };
      const review_result_hash = resultHash(reviewers, synthesis);
      let evidence;
      try { evidence = await readCompletion({ request, preflight, review_result_hash }); }
      catch { return { allowed: false, reason: "commissioned_memory_writeback_unavailable" }; }
      if (!verifySignedAgentEvidence({
        envelope: evidence, kind: "dispatch_completion", trustedKeys, now: now(),
      })) return { allowed: false, reason: "commissioned_completion_signature_invalid" };
      const p = evidence.payload;
      if (p.request_id !== request.request_id || p.mission_key !== request.mission_key ||
          p.work_key !== request.work_key || p.preflight_id !== preflight.preflight_id ||
          p.review_result_hash !== review_result_hash ||
          p.juniper?.memory_writeback !== "recorded" || !nonempty(p.juniper?.writeback_receipt_ref)) {
        return { allowed: false, reason: "commissioned_completion_binding_or_writeback_invalid" };
      }
      return { allowed: true, completion_ref: safe(p.completion_ref) || null };
    },
  };
}
