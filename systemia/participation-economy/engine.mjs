// Evercraft Home Participation Economy v0.1
// Read-only, deterministic allocation planning. This module NEVER moves money,
// creates a payable, verifies provider receipts, or grants financial authority.
export const HOME_PARTICIPATION_SPLIT_BPS = Object.freeze({
  creator: 6000,
  distribution: 1000,
  community: 500,
  evercraft: 2500,
});
const BASIS_POINTS = 10000;
const MAX_EVENTS = 10000;

function money(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + "_must_be_nonnegative_safe_integer_cents");
  }
  return value;
}
function textRef(value) {
  return typeof value === "string" && /^[a-zA-Z0-9:_./-]{1,160}$/.test(value);
}
function exactPortions(cents, entries) {
  if (cents === 0) return entries.map((entry) => ({ ...entry, cents: 0 }));
  const totalWeight = entries.reduce((n, e) => n + BigInt(e.weight), 0n);
  if (!totalWeight) return entries.map((entry) => ({ ...entry, cents: 0 }));
  const parts = entries.map((entry, i) => {
    const numerator = BigInt(cents) * BigInt(entry.weight);
    return { ...entry, cents: Number(numerator / totalWeight), remainder: numerator % totalWeight, i };
  });
  let remaining = cents - parts.reduce((sum, entry) => sum + entry.cents, 0);
  const ranked = [...parts].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return String(a.key).localeCompare(String(b.key));
  });
  for (const entry of ranked) {
    if (!remaining) break;
    entry.cents++;
    remaining--;
  }
  return parts.map(({ remainder, i, ...entry }) => entry);
}
function eligibleAdult(value) {
  return value?.adult_verified === true && value?.review_state === "approved";
}
function checkContribution(row, creatorId) {
  if (!row || !textRef(row.event_id) || !textRef(row.participant_id)) return "invalid_identifiers";
  if (!["distribution", "community"].includes(row.role)) return "unsupported_role";
  if (!Number.isSafeInteger(row.weight) || row.weight < 1 || row.weight > 100) return "invalid_weight";
  if (!eligibleAdult(row)) return "eligibility_unverified";
  if (!textRef(row.proof_ref)) return "missing_proof";
  if (row.consent_recorded !== true) return "consent_unverified";
  if (row.fraud_review !== "clear") return "fraud_review_hold";
  if (row.participant_id === creatorId && row.role === "distribution") return "self_referral";
  if (row.role === "distribution" && row.proof_type !== "verified_attributed_conversion") return "unverified_conversion";
  if (row.role === "community" && row.proof_type !== "reviewed_community_work") return "unreviewed_work";
  return null;
}
function emptyPlan(reason, campaignId) {
  return {
    schema: "evercraft.home.participation-plan.v0.1",
    campaign_id: campaignId,
    status: "held",
    hold_reason: reason,
    revenue_basis_cents: null,
    allocations: [],
    unallocated_cents: null,
    platform_allocation_cents: null,
    payouts_enabled: false,
    financial_authority_granted: false,
    custody_state: "no_evercraft_custody_claim",
  };
}

/**
 * Produces a planning projection only. settlement_evidence is CALLER-ASSERTED;
 * a trusted Payments adapter must independently verify a source receipt before
 * any real accounting or payout workflow can exist.
 *
 * Required amounts are USD integer cents, never floats or implicit zeros.
 */
export function planHomeParticipation({ campaign, contributions = [] } = {}) {
  if (!campaign || !textRef(campaign.id)) throw new Error("campaign_id_required");
  if (!Array.isArray(contributions) || contributions.length > MAX_EVENTS) throw new Error("contributions_invalid_or_too_many");
  const gross = money(campaign.gross_collected_cents, "gross_collected");
  const refunds = money(campaign.refunds_cents, "refunds");
  const fees = money(campaign.processing_fees_cents, "processing_fees");
  const costs = money(campaign.direct_delivery_costs_cents, "direct_delivery_costs");
  const deduction = refunds + fees + costs;
  if (!Number.isSafeInteger(deduction)) throw new Error("deductions_out_of_range");
  if (campaign.currency !== "USD") return emptyPlan("unsupported_currency", campaign.id);
  if (deduction > gross) return emptyPlan("deductions_exceed_collected", campaign.id);
  const evidence = campaign.settlement_evidence;
  if (
    evidence?.authority !== "evercraft_payments" ||
    evidence?.state !== "provider_verified" ||
    !textRef(evidence?.receipt_ref) ||
    !textRef(evidence?.verified_at)
  ) return emptyPlan("settlement_receipt_verification_required", campaign.id);
  if (!textRef(campaign.creator?.participant_id)) return emptyPlan("creator_identity_missing", campaign.id);
  if (campaign.content_rights_confirmed !== true) return emptyPlan("content_rights_not_confirmed", campaign.id);

  const basis = gross - deduction;
  const [creatorBucket, distributionBucket, communityBucket, evercraftBucket] = exactPortions(
    basis,
    Object.entries(HOME_PARTICIPATION_SPLIT_BPS).map(([key, weight]) => ({ key, weight }))
  ).map(({ cents }) => cents);

  const creatorId = campaign.creator.participant_id;
  const allocations = [];
  const held = [];
  const rejected = [];
  if (eligibleAdult(campaign.creator) && campaign.creator.consent_recorded === true && campaign.creator.fraud_review === "clear") {
    allocations.push({ role: "creator", participant_id: creatorId, amount_cents: creatorBucket, status: "simulated_not_payable" });
  } else {
    held.push({ bucket: "creator", amount_cents: creatorBucket, reason: "creator_eligibility_hold" });
  }

  // Duplicate attribution events are ALL excluded, regardless of row order.
  const ids = new Map();
  for (const row of contributions) {
    const id = String(row?.event_id ?? "");
    ids.set(id, (ids.get(id) || 0) + 1);
  }
  const qualified = [];
  for (const row of contributions) {
    let reason = ids.get(String(row?.event_id ?? "")) > 1 ? "duplicate_event" : checkContribution(row, creatorId);
    if (reason) rejected.push({ event_id: String(row?.event_id ?? ""), reason });
    else qualified.push(row);
  }

  for (const [role, bucket] of [["distribution", distributionBucket], ["community", communityBucket]]) {
    const group = qualified.filter((r) => r.role === role).sort((a,b) => a.event_id.localeCompare(b.event_id));
    if (!group.length) {
      held.push({ bucket: role, amount_cents: bucket, reason: "no_qualified_contributions" });
      continue;
    }
    const shares = exactPortions(bucket, group.map((row) => ({ key: row.event_id, weight: row.weight, participant_id: row.participant_id })));
    const byParticipant = new Map();
    for (const share of shares) byParticipant.set(share.participant_id, (byParticipant.get(share.participant_id) || 0) + share.cents);
    for (const [participant_id, amount_cents] of [...byParticipant].sort(([a], [b]) => a.localeCompare(b))) {
      allocations.push({ role, participant_id, amount_cents, status: "simulated_not_payable" });
    }
  }

  const unallocated = held.reduce((sum, item) => sum + item.amount_cents, 0);
  const allocated = allocations.reduce((sum, item) => sum + item.amount_cents, 0);
  if (!Number.isSafeInteger(allocated + unallocated + evercraftBucket) || allocated + unallocated + evercraftBucket !== basis) {
    throw new Error("allocation_conservation_failure");
  }
  return {
    schema: "evercraft.home.participation-plan.v0.1",
    campaign_id: campaign.id,
    status: "simulation_only",
    currency: "USD",
    revenue_basis_cents: basis,
    basis_formula: "collected_minus_refunds_processing_fees_direct_delivery_costs",
    input_evidence_state: "caller_asserted_not_independently_verified_by_planner",
    allocations,
    held_allocations: held,
    rejected_contributions: rejected,
    unallocated_cents: unallocated,
    platform_allocation_cents: evercraftBucket,
    split_basis_points: HOME_PARTICIPATION_SPLIT_BPS,
    payouts_enabled: false,
    financial_authority_granted: false,
    custody_state: "no_evercraft_custody_claim",
    boundary: "No money movement, account balance, receivable, payable, custody, escrow, or earnings promise is created by this plan.",
  };
}
