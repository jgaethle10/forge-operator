// Synthetic sponsor campaign, for inspecting the Home participation model only.
import { planHomeParticipation } from "./engine.mjs";
const campaign = {
  id: "campaign:yakima-story-demo",
  currency: "USD",
  gross_collected_cents: 50000,
  refunds_cents: 0,
  processing_fees_cents: 1500,
  direct_delivery_costs_cents: 8500,
  settlement_evidence: {
    authority: "evercraft_payments",
    state: "provider_verified",
    receipt_ref: "synthetic:payment:receipt",
    verified_at: "2026-10-28T20:00:00Z"
  },
  creator: {
    participant_id: "participant:filmmaker",
    adult_verified: true, review_state: "approved",
    consent_recorded: true, fraud_review: "clear"
  },
  content_rights_confirmed: true,
};
const contributions = [
  {
    event_id:"synthetic:conversion:01",
    participant_id:"participant:local-curator",
    role:"distribution", weight:3,
    adult_verified:true, review_state:"approved",
    proof_ref:"synthetic:proof:01", consent_recorded:true, fraud_review:"clear",
    proof_type:"verified_attributed_conversion"
  },
  {
    event_id:"synthetic:contribution:02",
    participant_id:"participant:caption-editor",
    role:"community", weight:1,
    adult_verified:true, review_state:"approved",
    proof_ref:"synthetic:proof:02", consent_recorded:true, fraud_review:"clear",
    proof_type:"reviewed_community_work"
  }
];
const result = planHomeParticipation({campaign,contributions});
console.log(JSON.stringify({
  demonstration:"synthetic_unverified_no_money_movement",
  sponsor_example_usd:500,
  ...result
},null,2));
