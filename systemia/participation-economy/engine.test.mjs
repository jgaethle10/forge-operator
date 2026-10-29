import test from "node:test";
import assert from "node:assert/strict";
import { HOME_PARTICIPATION_SPLIT_BPS, planHomeParticipation } from "./engine.mjs";

const creator = () => ({
  participant_id: "user:maker", adult_verified: true, review_state: "approved",
  consent_recorded: true, fraud_review: "clear"
});
const campaign = (overrides = {}) => ({
  id: "campaign:sample", currency: "USD",
  gross_collected_cents: 100000,
  refunds_cents: 10000,
  processing_fees_cents: 3000,
  direct_delivery_costs_cents: 7000,
  settlement_evidence: {
    authority: "evercraft_payments", state: "provider_verified",
    receipt_ref: "payments:receipt:sample", verified_at: "2026-10-28T20:00:00Z"
  },
  creator: creator(), content_rights_confirmed: true, ...overrides
});
const event = (overrides = {}) => ({
  event_id: "event:a", participant_id: "user:distributor",
  role: "distribution", weight: 1, adult_verified: true,
  review_state: "approved", proof_ref: "source:receipt:a",
  consent_recorded: true, fraud_review: "clear",
  proof_type: "verified_attributed_conversion", ...overrides
});
function total(result) {
  return result.allocations.reduce((sum, x) => sum + x.amount_cents, 0)
    + result.unallocated_cents + result.platform_allocation_cents;
}

test("split conserves every cent and holds missing community participation", () => {
  const result = planHomeParticipation({ campaign: campaign(), contributions: [event()] });
  assert.equal(result.status, "simulation_only");
  assert.equal(result.revenue_basis_cents, 80000);
  assert.equal(result.allocations.find((x) => x.role === "creator").amount_cents, 48000);
  assert.equal(result.allocations.find((x) => x.role === "distribution").amount_cents, 8000);
  assert.equal(result.platform_allocation_cents, 20000);
  assert.equal(result.unallocated_cents, 4000);
  assert.equal(total(result), 80000);
  assert.equal(result.payouts_enabled, false);
  assert.equal(result.financial_authority_granted, false);
  assert.equal(result.custody_state, "no_evercraft_custody_claim");
  assert.equal(Object.values(HOME_PARTICIPATION_SPLIT_BPS).reduce((a,b) => a+b,0), 10000);
});

test("creator and both contribution roles can qualify without creating a payable", () => {
  const contributions = [
    event(), event({ event_id: "event:b", participant_id: "user:curator",
      role: "community", proof_type: "reviewed_community_work" })
  ];
  const result = planHomeParticipation({ campaign: campaign(), contributions });
  assert.equal(result.allocations.length, 3);
  assert.equal(result.unallocated_cents, 0);
  assert.equal(total(result), 80000);
  assert.ok(result.allocations.every((x) => x.status === "simulated_not_payable"));
});

test("duplicates invalidate all claims, without first-wins leakage", () => {
  const contributions = [
    event(), event({ participant_id: "user:other", proof_ref: "receipt:second" })
  ];
  const result = planHomeParticipation({ campaign: campaign(), contributions });
  assert.equal(result.rejected_contributions.filter((x) => x.reason === "duplicate_event").length, 2);
  assert.equal(result.unallocated_cents, 12000);
  assert.equal(total(result), 80000);
});

test("self-referrals and fraudulent contributions never earn allocation", () => {
  const contributions = [
    event({ event_id: "event:self", participant_id: "user:maker" }),
    event({ event_id: "event:fraud", participant_id: "user:fraud", fraud_review: "pending" })
  ];
  const result = planHomeParticipation({ campaign: campaign(), contributions });
  assert.deepEqual(result.rejected_contributions.map((x) => x.reason), ["self_referral", "fraud_review_hold"]);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.unallocated_cents, 12000);
});

test("missing cash, fee or cost data cannot silently become zero", () => {
  for (const key of ["gross_collected_cents","refunds_cents","processing_fees_cents","direct_delivery_costs_cents"]) {
    const input = campaign();
    delete input[key];
    assert.throws(() => planHomeParticipation({ campaign: input }), /must_be_nonnegative_safe_integer_cents/);
  }
  assert.throws(() => planHomeParticipation({campaign: campaign({ gross_collected_cents: 1.2 })}), /safe_integer/);
});

test("unknown settlement, missing rights, or invalid basis stays held", () => {
  assert.equal(planHomeParticipation({campaign: campaign({settlement_evidence: null})}).hold_reason, "settlement_receipt_verification_required");
  assert.equal(planHomeParticipation({campaign: campaign({content_rights_confirmed: false})}).hold_reason, "content_rights_not_confirmed");
  assert.equal(planHomeParticipation({campaign: campaign({refunds_cents: 100001})}).hold_reason, "deductions_exceed_collected");
  assert.equal(planHomeParticipation({campaign: campaign({currency: "EUR"})}).hold_reason, "unsupported_currency");
});

test("fractional splitting conserves cents and is insensitive to event order", () => {
  const c = campaign({
    gross_collected_cents: 101, refunds_cents: 0,
    processing_fees_cents: 0, direct_delivery_costs_cents: 0
  });
  const rows = [
    event({event_id:"event:b",participant_id:"user:b",weight:3}),
    event({event_id:"event:a",participant_id:"user:a",weight:1}),
    event({event_id:"event:c",participant_id:"user:c",weight:2,role:"community",proof_type:"reviewed_community_work"})
  ];
  const first = planHomeParticipation({ campaign: c, contributions: rows });
  const reversed = planHomeParticipation({campaign: c, contributions: [...rows].reverse()});
  assert.equal(total(first),101);
  assert.deepEqual(first.allocations,reversed.allocations);
  assert.equal(first.unallocated_cents,0);
});

test("unverified action types, missing consent and minors are excluded", () => {
  const result = planHomeParticipation({campaign:campaign(),contributions:[
    event({event_id:"event:click",proof_type:"click"}),
    event({event_id:"event:no-consent",consent_recorded:false}),
    event({event_id:"event:minor",adult_verified:false}),
    event({event_id:"event:unknown",role:"invite"})
  ]});
  assert.equal(result.allocations.length,1);
  assert.deepEqual(result.rejected_contributions.map(r=>r.reason),[
    "unverified_conversion","consent_unverified","eligibility_unverified","unsupported_role"
  ]);
});
