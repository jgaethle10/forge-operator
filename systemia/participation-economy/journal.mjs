import { createHash } from "node:crypto";
import { planHomeParticipation } from "./engine.mjs";

// In-memory, replayable, tamper-evident PLANNING journal. A hash chain does not
// prove who authored events and is not an immutable, externally anchored ledger.
// There is no public write endpoint, persistence, custody, or payout authority.
export const HOME_LEDGER_SCHEMA = "evercraft.home.participation-journal.v0.2";
const EVENT_TYPES = new Set([
  "funding_recorded", "funding_revoked",
  "contribution_recorded", "contribution_revoked",
]);
const MAX_RECORDS = 10000, MAX_BYTES = 65536;
const ref = x => typeof x === "string" && /^[A-Za-z0-9:_./-]{1,160}$/.test(x);
const hash = x => createHash("sha256").update(x).digest("hex");

function canonical(value, depth = 0) {
  if (depth > 24) throw new Error("journal_object_too_deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(v => canonical(v, depth + 1)).join(",") + "]";
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const names = Object.keys(value).sort();
    if (names.some(n => ["__proto__", "constructor", "prototype"].includes(n))) throw new Error("journal_unsafe_key");
    return "{" + names.map(n => JSON.stringify(n) + ":" + canonical(value[n], depth + 1)).join(",") + "}";
  }
  throw new Error("journal_non_json_value");
}
const copy = x => JSON.parse(canonical(x));
const genesis = campaignId => hash("EVERCRAFT_HOME_PARTICIPATION_DEMO_GENESIS\n" + campaignId);
const signature = entry => hash(entry.prev_hash + "\n" + canonical({
  seq: entry.seq,
  event: entry.event,
  prev_hash: entry.prev_hash,
}));
function assertFields(e, names) {
  if (Object.keys(e).sort().join("|") !== [...names].sort().join("|")) throw new Error("journal_event_shape_invalid");
}

function validateInput(event, campaignId) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("journal_event_invalid");
  assertFields(event, ["id","campaign_id","type","recorded_at","actor_ref","evidence_ref","payload"]);
  if (![event.id,event.campaign_id,event.actor_ref,event.evidence_ref].every(ref)) throw new Error("journal_event_refs_invalid");
  if (event.campaign_id !== campaignId) throw new Error("journal_campaign_mismatch");
  if (!EVENT_TYPES.has(event.type)) throw new Error("journal_event_type_invalid");
  if (typeof event.recorded_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(event.recorded_at) ||
      !Number.isFinite(Date.parse(event.recorded_at))) throw new Error("journal_timestamp_invalid");
  if (canonical(event).length > MAX_BYTES) throw new Error("journal_record_too_large");
  const p = event.payload;
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("journal_payload_invalid");
  if (event.type === "funding_recorded") {
    if (Object.keys(p).sort().join("|") !== "campaign") throw new Error("journal_funding_payload_invalid");
    if (p.campaign?.id !== campaignId) throw new Error("journal_campaign_mismatch");
    if (!ref(p.campaign.creator?.participant_id)) throw new Error("journal_creator_ref_invalid");
    // Fail on missing or malformed monetary fields instead of treating them as zero.
    for (const k of ["gross_collected_cents","refunds_cents","processing_fees_cents","direct_delivery_costs_cents"]) {
      if (!Number.isSafeInteger(p.campaign[k]) || p.campaign[k] < 0) throw new Error("journal_money_invalid_" + k);
    }
  } else if (event.type === "contribution_recorded") {
    if (Object.keys(p).sort().join("|") !== "contribution") throw new Error("journal_contribution_payload_invalid");
    if (!ref(p.contribution?.event_id) || !ref(p.contribution?.participant_id)) throw new Error("journal_contribution_ref_invalid");
  } else {
    if (Object.keys(p).sort().join("|") !== "reason|target_event_id") throw new Error("journal_reversal_payload_invalid");
    if (!ref(p.target_event_id) || !ref(p.reason)) throw new Error("journal_reversal_ref_invalid");
  }
  return copy(event);
}

function replay(ledger) {
  if (!ledger || ledger.schema !== HOME_LEDGER_SCHEMA || !ref(ledger.campaign_id) ||
      !Array.isArray(ledger.entries) || ledger.entries.length > MAX_RECORDS ||
      !/^[a-f0-9]{64}$/.test(ledger.head_hash || "")) throw new Error("journal_structure_invalid");
  let prev = genesis(ledger.campaign_id);
  let funding = null;
  const contributions = new Map(), recordIndex = new Map(), claimIds = new Set();
  for (const [index, entry] of ledger.entries.entries()) {
    if (!entry || Object.keys(entry).sort().join("|") !== "event|hash|prev_hash|seq") throw new Error("journal_entry_shape_invalid");
    const normalized = validateInput(entry.event, ledger.campaign_id);
    if (entry.seq !== index + 1 || entry.prev_hash !== prev || entry.hash !== signature(entry)) {
      throw new Error("journal_chain_tampered");
    }
    // No duplicate event IDs even if the contents differ. Replay check protects against
    // malicious input and inconsistent rehydrated snapshots.
    if (recordIndex.has(normalized.id)) throw new Error("journal_duplicate_record_id");
    const p = normalized.payload;
    if (normalized.type === "funding_recorded") {
      if (funding) throw new Error("journal_active_funding_conflict");
      funding = { event_id: normalized.id, campaign: p.campaign };
    }
    if (normalized.type === "funding_revoked") {
      if (!funding || funding.event_id !== p.target_event_id) throw new Error("journal_funding_reversal_target_invalid");
      funding = null;
    }
    if (normalized.type === "contribution_recorded") {
      if (claimIds.has(p.contribution.event_id)) throw new Error("journal_duplicate_claim_id");
      claimIds.add(p.contribution.event_id);
      contributions.set(normalized.id, { value: p.contribution, revoked: false });
    }
    if (normalized.type === "contribution_revoked") {
      const source = contributions.get(p.target_event_id);
      if (!source || source.revoked) throw new Error("journal_contribution_reversal_target_invalid");
      source.revoked = true;
    }
    recordIndex.set(normalized.id, normalized);
    prev = entry.hash;
  }
  if (ledger.head_hash !== prev) throw new Error("journal_head_mismatch");
  return { funding, contributions, recordIndex };
}

export function createHomeParticipationJournal(campaignId) {
  if (!ref(campaignId)) throw new Error("journal_campaign_id_required");
  return { schema: HOME_LEDGER_SCHEMA, campaign_id: campaignId, entries: [], head_hash: genesis(campaignId) };
}

export function verifyHomeParticipationJournal(ledger) {
  try {
    const state = replay(ledger);
    return { ok: true, campaign_id: ledger.campaign_id, entry_count: ledger.entries.length,
      head_hash: ledger.head_hash, active_funding: Boolean(state.funding),
      active_contributions: [...state.contributions.values()].filter(x => !x.revoked).length,
      boundary: "self_consistent_hash_chain_not_external_attestation" };
  } catch (error) { return {ok: false, reason: String(error.message || error)}; }
}

// expectedHead implements optimistic concurrency. A repeated identical ID is idempotent;
// a repeated ID with changed content fails, even if submitted with an old head.
export function appendHomeParticipationEvent(ledger, event, { expected_head_hash } = {}) {
  const state = replay(ledger);
  const normalized = validateInput(event, ledger.campaign_id);
  const existing = state.recordIndex.get(normalized.id);
  if (existing) {
    if (canonical(existing) === canonical(normalized)) return copy(ledger);
    throw new Error("journal_idempotency_conflict");
  }
  if (expected_head_hash !== ledger.head_hash) throw new Error("journal_stale_head");
  if (ledger.entries.length >= MAX_RECORDS) throw new Error("journal_full");
  const entry = {seq: ledger.entries.length + 1, event: normalized, prev_hash: ledger.head_hash};
  entry.hash = signature(entry);
  const next = { ...ledger, entries: [...ledger.entries, entry], head_hash: entry.hash };
  replay(next); // Reject invalid reversal, duplicate claim, or conflicting funding before returning.
  return copy(next);
}

export function projectHomeParticipationJournal(ledger) {
  const state = replay(ledger);
  if (!state.funding) {
    return { schema: "evercraft.home.participation-journal-projection.v0.2",
      campaign_id: ledger.campaign_id, journal_head_hash: ledger.head_hash,
      journal_event_count: ledger.entries.length, status: "held",
      hold_reason: "no_active_funding_snapshot", allocations: [], revenue_basis_cents: null,
      payouts_enabled: false, financial_authority_granted: false,
      custody_state: "no_evercraft_custody_claim",
      source_attestation: "not_verified_by_journal" };
  }
  const contributions = [...state.contributions.values()].filter(x => !x.revoked).map(x => x.value);
  const plan = planHomeParticipation({campaign: state.funding.campaign, contributions});
  return {
    ...plan,
    schema: "evercraft.home.participation-journal-projection.v0.2",
    journal_head_hash: ledger.head_hash,
    journal_event_count: ledger.entries.length,
    funding_record_id: state.funding.event_id,
    active_contribution_count: contributions.length,
    source_attestation: "not_verified_by_journal",
    payouts_enabled: false,
    financial_authority_granted: false,
    custody_state: "no_evercraft_custody_claim",
  };
}
