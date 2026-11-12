import test from "node:test";
import assert from "node:assert/strict";
import {
  createHomeParticipationJournal, appendHomeParticipationEvent,
  verifyHomeParticipationJournal, projectHomeParticipationJournal
} from "./journal.mjs";

const CID = "campaign:yakima-test";
const timestamp = "2026-10-28T20:00:00Z";
const campaign = (overrides = {}) => ({
  id: CID, currency: "USD", gross_collected_cents: 100000,
  refunds_cents: 0, processing_fees_cents: 3000, direct_delivery_costs_cents: 7000,
  settlement_evidence: { authority: "evercraft_payments", state: "provider_verified",
    receipt_ref: "synthetic:receipt:1", verified_at: timestamp },
  creator: { participant_id: "user:creator", adult_verified: true, review_state: "approved",
    consent_recorded: true, fraud_review: "clear" },
  content_rights_confirmed: true, ...overrides,
});
const contribution = (overrides = {}) => ({
  event_id: "claim:one", participant_id: "user:scout", role: "distribution",
  weight: 1, proof_ref: "synthetic:conversion:1",
  proof_type: "verified_attributed_conversion",
  consent_recorded: true, adult_verified: true, review_state: "approved",
  fraud_review: "clear", ...overrides
});
const event = (id, type, payload, overrides = {}) => ({
  id, campaign_id: CID, type, payload, recorded_at: timestamp,
  actor_ref: "system:synthetic-test", evidence_ref: "synthetic:proof:1", ...overrides
});
const record = (ledger, item) => appendHomeParticipationEvent(ledger, item, { expected_head_hash: ledger.head_hash });
const funded = () => record(createHomeParticipationJournal(CID),
  event("record:funding1", "funding_recorded", {campaign: campaign()}));

test("the empty journal is held, never zero-dollar earnings", () => {
  const ledger = createHomeParticipationJournal(CID);
  assert.equal(verifyHomeParticipationJournal(ledger).ok, true);
  const p = projectHomeParticipationJournal(ledger);
  assert.equal(p.status, "held");
  assert.equal(p.revenue_basis_cents, null);
  assert.equal(p.payouts_enabled, false);
  assert.equal(p.financial_authority_granted, false);
});

test("a funded projection has no payout authority and conserves cents", () => {
  const ledger = funded();
  const p = projectHomeParticipationJournal(ledger);
  assert.equal(p.status, "simulation_only");
  assert.equal(p.revenue_basis_cents, 90000);
  assert.equal(p.allocations.find(a => a.role === "creator").amount_cents, 54000);
  assert.equal(p.platform_allocation_cents, 22500);
  assert.equal(p.unallocated_cents, 13500);
  assert.equal(p.payouts_enabled, false);
  assert.equal(p.source_attestation, "not_verified_by_journal");
});

test("contributions can be revoked without deleting history", () => {
  let ledger = funded();
  ledger = record(ledger, event("record:claim", "contribution_recorded", {contribution: contribution()}));
  let p = projectHomeParticipationJournal(ledger);
  assert.equal(p.allocations.find(x => x.role === "distribution").amount_cents, 9000);
  ledger = record(ledger, event("record:revoke", "contribution_revoked",
    {target_event_id:"record:claim",reason:"attribution_disputed"}));
  p = projectHomeParticipationJournal(ledger);
  assert.equal(p.allocations.some(x => x.role === "distribution"), false);
  assert.equal(p.unallocated_cents, 13500);
  assert.equal(ledger.entries.length, 3);
  assert.equal(verifyHomeParticipationJournal(ledger).active_contributions, 0);
});

test("revoked funding holds all projections until a new snapshot is recorded", () => {
  let ledger = funded();
  const original = ledger.head_hash;
  ledger = record(ledger, event("record:revoked-funding", "funding_revoked",
    {target_event_id:"record:funding1",reason:"provider_refund"}));
  assert.equal(projectHomeParticipationJournal(ledger).status, "held");
  assert.equal(projectHomeParticipationJournal(ledger).revenue_basis_cents, null);
  ledger = record(ledger, event("record:funding2", "funding_recorded",
    {campaign: campaign({gross_collected_cents:50000,refunds_cents:10000})}));
  const p = projectHomeParticipationJournal(ledger);
  assert.equal(p.status, "simulation_only");
  assert.equal(p.revenue_basis_cents, 30000);
  assert.notEqual(ledger.head_hash, original);
});

test("repeated identical source event is idempotent even with stale expected head", () => {
  const initial = funded();
  const repeated = event("record:funding1", "funding_recorded", {campaign: campaign()});
  const got = appendHomeParticipationEvent(initial, repeated, {expected_head_hash:"wrong"});
  assert.deepEqual(got,initial);
  assert.equal(got.entries.length,1);
  assert.throws(() => appendHomeParticipationEvent(initial,
    event("record:funding1", "funding_recorded", {campaign: campaign({gross_collected_cents: 20000})}),
    {expected_head_hash: initial.head_hash}), /idempotency_conflict/);
});

test("optimistic head mismatch prevents new concurrent commits", () => {
  const ledger = funded();
  assert.throws(() => appendHomeParticipationEvent(ledger,
    event("record:other","contribution_recorded",{contribution: contribution()}),
    {expected_head_hash:"stale"}), /journal_stale_head/);
});

test("tampering with payload, chain, or head is rejected", () => {
  const ledger = funded();
  const altered = structuredClone(ledger);
  altered.entries[0].event.payload.campaign.gross_collected_cents = 999999;
  assert.equal(verifyHomeParticipationJournal(altered).ok, false);
  assert.throws(() => projectHomeParticipationJournal(altered), /journal_chain_tampered/);
  const head = structuredClone(ledger);
  head.head_hash = "a".repeat(64);
  assert.equal(verifyHomeParticipationJournal(head).reason, "journal_head_mismatch");
  assert.equal(verifyHomeParticipationJournal(ledger).ok, true);
});

test("invalid or repeated reversals fail closed", () => {
  const ledger = funded();
  assert.throws(() => record(ledger, event("record:bad","contribution_revoked",
    {target_event_id:"record:funding1",reason:"wrong_type"})), /reversal_target_invalid/);
  let next = record(ledger, event("record:rev","funding_revoked",
    {target_event_id:"record:funding1",reason:"chargeback"}));
  assert.throws(() => record(next, event("record:rev2","funding_revoked",
    {target_event_id:"record:funding1",reason:"chargeback_again"})), /reversal_target_invalid/);
});

test("claim IDs can never be reused after revocation", () => {
  let ledger = funded();
  ledger = record(ledger, event("record:claim", "contribution_recorded", {contribution: contribution()}));
  ledger = record(ledger, event("record:revoke", "contribution_revoked",
    {target_event_id:"record:claim",reason:"fraud"}));
  assert.throws(() => record(ledger, event("record:claim-again","contribution_recorded",
    {contribution:contribution({participant_id:"user:another"})})), /duplicate_claim_id/);
});

test("source-campaign mismatches, missing dollars, invalid timestamps and malformed IDs reject", () => {
  const start = createHomeParticipationJournal(CID);
  assert.throws(() => record(start,event("record:wrong","funding_recorded",
    {campaign:campaign({id:"campaign:other"})})), /campaign_mismatch/);
  const incomplete = campaign();
  delete incomplete.refunds_cents;
  assert.throws(() => record(start,event("record:missing","funding_recorded",
    {campaign:incomplete})), /journal_money_invalid_refunds_cents/);
  assert.throws(() => record(start,event("record:badtime","funding_recorded",
    {campaign:campaign()}, {recorded_at:"yesterday"})), /journal_timestamp_invalid/);
  assert.throws(() => record(start,event("space id","funding_recorded",
    {campaign:campaign()})), /journal_event_refs_invalid/);
});

test("two active funding records and duplicate record IDs cannot create extra balances", () => {
  const initial = funded();
  assert.throws(() => record(initial,event("record:funding2","funding_recorded",
    {campaign:campaign()})),/journal_active_funding_conflict/);
  assert.equal(verifyHomeParticipationJournal(initial).entry_count,1);
});

test("caller can mutate their copy, but previously returned journal stays independent", () => {
  const first = funded();
  const contributionPayload = contribution();
  const ev = event("record:claim","contribution_recorded",{contribution:contributionPayload});
  const next = record(first,ev);
  contributionPayload.weight = 100;
  ev.payload.contribution.participant_id = "user:bad";
  assert.equal(next.entries[1].event.payload.contribution.weight,1);
  assert.equal(first.entries.length,1);
  assert.equal(verifyHomeParticipationJournal(next).ok,true);
});
