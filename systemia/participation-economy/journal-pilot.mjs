// Read-only end-to-end simulation: qualify a contributor, then reverse funding.
// Every proof, participant, and monetary value below is synthetic.
import {
  createHomeParticipationJournal, appendHomeParticipationEvent,
  projectHomeParticipationJournal, verifyHomeParticipationJournal
} from "./journal.mjs";
const cid = "campaign:yakima-documentary-demo";
const when = "2026-10-28T20:00:00Z";
const actor = "system:synthetic-pilot";
const write = (journal, id, type, payload) => appendHomeParticipationEvent(journal,
  { id, campaign_id:cid, type, payload, actor_ref:actor, recorded_at:when,
    evidence_ref:"synthetic:source:" + id },
  {expected_head_hash:journal.head_hash});

let journal = createHomeParticipationJournal(cid);
journal = write(journal,"record:funding","funding_recorded", {campaign:{
  id:cid,currency:"USD",gross_collected_cents:50000,refunds_cents:0,
  processing_fees_cents:1500,direct_delivery_costs_cents:8500,
  settlement_evidence:{authority:"evercraft_payments",state:"provider_verified",
    receipt_ref:"synthetic:receipt:500",verified_at:when},
  creator:{participant_id:"person:maker",adult_verified:true,review_state:"approved",
    consent_recorded:true,fraud_review:"clear"},
  content_rights_confirmed:true
}});
journal = write(journal,"record:discovery","contribution_recorded",{contribution:{
  event_id:"claim:discovery",participant_id:"person:discoverer",role:"distribution",
  weight:1,proof_ref:"synthetic:conversion",proof_type:"verified_attributed_conversion",
  adult_verified:true,review_state:"approved",consent_recorded:true,fraud_review:"clear"
}});
journal = write(journal,"record:community","contribution_recorded",{contribution:{
  event_id:"claim:caption-work",participant_id:"person:captioner",role:"community",
  weight:1,proof_ref:"synthetic:review",proof_type:"reviewed_community_work",
  adult_verified:true,review_state:"approved",consent_recorded:true,fraud_review:"clear"
}});
const before = projectHomeParticipationJournal(journal);
journal = write(journal,"record:funding-reversal","funding_revoked",
  {target_event_id:"record:funding",reason:"synthetic:refund"});
const after = projectHomeParticipationJournal(journal);
if (!verifyHomeParticipationJournal(journal).ok || before.revenue_basis_cents !== 40000
  || before.payouts_enabled !== false || after.status !== "held"
  || after.revenue_basis_cents !== null || after.payouts_enabled !== false) {
  throw new Error("pilot_safety_contract_failed");
}
console.log(JSON.stringify({
  demonstration:"synthetic_only_not_a_wallet",
  journal_verification: verifyHomeParticipationJournal(journal),
  before_refund:before,after_refund:after
},null,2));
