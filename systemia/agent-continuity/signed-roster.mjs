import crypto from "node:crypto";
import { signedAgentEvidenceMessage, verifySignedAgentEvidence } from "./signed-evidence.mjs";

const norm = (v) => String(v ?? "").trim().toLowerCase();
const arr = (v) => Array.isArray(v) ? v : [];
const hash = (value) => "sha256:" + crypto.createHash("sha256").update(value).digest("hex");

/** Deterministic digest of independently signed registry evidence, not caller text. */
export function signedRosterDigest(envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("registry_envelope_required");
  return hash(signedAgentEvidenceMessage(envelope));
}

/**
 * Independently authenticate a complete owned registry observation.
 * Count alone is never proof: every commissioned role must have a unique
 * immutable active identity; Sentinel/Juniper must remain protocols.
 */
export function verifyCommissionedRoster({
  request,
  preflightEvidence,
  rosterEnvelope,
  trustedKeys,
  now = new Date(),
  maxAgeMs = 15 * 60_000,
} = {}) {
  if (!verifySignedAgentEvidence({
    envelope: rosterEnvelope,
    kind: "registry_snapshot",
    trustedKeys,
    now,
  })) return { verified: false, reason: "commissioned_registry_signature_invalid" };
  const snapshot = rosterEnvelope.payload;
  if (snapshot?.schema !== "evercraft.agent-continuity.registry-snapshot.v1" ||
      snapshot?.source?.system !== "evercraft-owned-raven-nexus" ||
      !snapshot?.source?.source_receipt_ref) {
    return { verified: false, reason: "commissioned_registry_origin_or_schema_invalid" };
  }
  const observed = Date.parse(snapshot.source.observed_at || "");
  const clock = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(observed) || !Number.isFinite(clock) ||
      observed > clock || clock - observed > maxAgeMs) {
    return { verified: false, reason: "commissioned_registry_observation_stale" };
  }
  const roles = arr(snapshot.role_profiles);
  const ids = roles.map((role) => norm(role?.id));
  if (!ids.length || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return { verified: false, reason: "commissioned_registry_role_identity_invalid" };
  }
  if (roles.some((role) => ["juniper", "sentinel"].includes(norm(role?.id)) ||
    ["juniper", "sentinel"].includes(norm(role?.name)))) {
    return { verified: false, reason: "commissioned_dna_counted_as_agent" };
  }
  const protocols = arr(snapshot.dna_protocols);
  for (const name of ["juniper", "sentinel"]) {
    const matches = protocols.filter((p) => norm(p?.id || p?.name) === name);
    if (matches.length !== 1 ||
        norm(matches[0]?.kind) !== "embedded" ||
        norm(matches[0]?.status) !== "active" ||
        matches[0]?.counts_as_agent !== false) {
      return { verified: false, reason: "commissioned_" + name + "_protocol_invalid" };
    }
  }
  const active = new Set(roles.filter((r) => norm(r?.status) === "active").map((r) => norm(r.id)));
  const assigned = arr(request?.assigned_agents).map(norm);
  if (!assigned.length || new Set(assigned).size !== assigned.length ||
      assigned.some((id) => !active.has(id))) {
    return { verified: false, reason: "commissioned_roster_missing_assigned_role" };
  }
  const authorized = arr(preflightEvidence?.payload?.role_ids).map(norm);
  if (assigned.length !== authorized.length ||
      assigned.slice().sort().some((id, i) => id !== authorized.slice().sort()[i])) {
    return { verified: false, reason: "commissioned_registry_request_preflight_mismatch" };
  }
  if (preflightEvidence.payload.registry_snapshot_hash !== signedRosterDigest(rosterEnvelope)) {
    return { verified: false, reason: "commissioned_registry_digest_mismatch" };
  }
  const lineups = arr(snapshot.lineups);
  const lineupIds = lineups.map((lineup) => norm(lineup?.id));
  if (lineupIds.some((id) => !id) || new Set(lineupIds).size !== lineupIds.length ||
      lineups.some((lineup) => arr(lineup?.role_ids)
        .some((id) => !ids.includes(norm(id))))) {
    return { verified: false, reason: "commissioned_registry_lineup_reference_invalid" };
  }
  return {
    verified: true,
    digest: signedRosterDigest(rosterEnvelope),
    role_count: roles.length,
    active_role_count: active.size,
    lineup_count: lineups.length,
    signed_at: rosterEnvelope.issued_at,
  };
}
