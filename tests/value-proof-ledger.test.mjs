import test from 'node:test';
import assert from 'node:assert/strict';
import {buildValueProofScorecard,normalizeValueProofEvent,VALUE_PROOF_SCHEMA,eventClaimDigest} from '../systemia/value-proof/ledger.mjs';

const at = '2026-10-29T23:00:00.000Z';
const sources = {
  inquiry_received:'authorized_intake', payment_confirmed:'payment_provider',
  refund_confirmed:'payment_provider', delivered:'delivery_service',
  customer_accepted:'customer_attestation', value_confirmed:'customer_attestation',
  cost_finalized:'cost_ledger'
};
function event(kind, suffix, product_key='work-saban', job_key='job-1', extra={}) {
  return {
    event_id:'evt-' + suffix, product_key, job_key, kind, occurred_at:at,
    evidence:{source:sources[kind],ref:'receipt-' + suffix},
    ...( ['payment_confirmed','refund_confirmed','cost_finalized'].includes(kind) ? {currency:'USD'} : {} ),
    ...extra
  };
}
const fakeTrustedAdapter = async e => ({
  verified:true,source:e.evidence.source,ref:e.evidence.ref,claim_sha256:eventClaimDigest(e)
}); // Test double ONLY: production requires authoritative provider-specific adapters.

test('fail closed without independent evidence verification', async () => {
  const payment = event('payment_confirmed','paid',undefined,undefined,{amount_cents:2900});
  await assert.rejects(buildValueProofScorecard([payment]), /trusted_verifier_required/);
  const fakeFlag = {...payment,verified:true};
  assert.throws(()=>normalizeValueProofEvent(fakeFlag), /unknown_field/);
  const untrusted = await buildValueProofScorecard([payment],{verifyEvidence:async()=>({verified:true})});
  assert.equal(untrusted.verified_event_count,0);
  assert.equal(untrusted.products.length,0);
  assert.equal(untrusted.held_events[0].reason,'independent_evidence_unverified');
});
test('scorecards separate paid, delivery, acceptance and confirmed effort', async () => {
  const input = [
    event('inquiry_received','inquiry'),
    event('payment_confirmed','paid','work-saban','job-1',{amount_cents:2900}),
    event('cost_finalized','cost','work-saban','job-1',{cost_cents:1100}),
    event('delivered','delivery'),
    event('customer_accepted','accept'),
    event('value_confirmed','saved','work-saban','job-1',{baseline_minutes:120,actual_minutes:35}),
    event('delivered','research-delivery','evercraft-research','report-2'),
    event('delivered','boardroom-delivery','ai-boardroom','decision-3'),
    event('delivered','media-delivery','forensiscope','media-4'),
    event('customer_accepted','orphan-accept','forensiscope','missing-delivery')
  ];
  const scored = await buildValueProofScorecard([...input,input[1]],{verifyEvidence:fakeTrustedAdapter});
  assert.equal(scored.schema,VALUE_PROOF_SCHEMA);
  assert.equal(scored.verified_event_count,10);
  assert.equal(scored.products.length,4);
  const work=scored.products.find(p=>p.product_key==='work-saban');
  assert.equal(work.provider_paid_jobs,1);
  assert.equal(work.provider_paid_gross_cents,2900);
  assert.equal(work.customer_accepted_deliveries,1);
  assert.equal(work.measured_minutes_saved,85);
  assert.equal(work.recorded_direct_cost_cents,1100);
  assert.equal(work.business_profit_cents,null);
  const media=scored.products.find(p=>p.product_key==='forensiscope');
  assert.equal(media.customer_accepted_deliveries,0);
  assert.equal(media.provider_paid_jobs,0);
  assert.match(scored.coverage,/not proof/);
});
test('duplicate mutation conflicts and second paid receipt is held for reconciliation', async () => {
  const a=event('payment_confirmed','a','work-saban','one',{amount_cents:2900});
  const b=event('payment_confirmed','b','work-saban','one',{amount_cents:2900});
  const scored=await buildValueProofScorecard([a,b],{verifyEvidence:fakeTrustedAdapter});
  assert.equal(scored.products[0].provider_paid_jobs,1);
  assert.equal(scored.verified_event_count,1);
  assert.equal(scored.held_events[0].reason,'multiple_payment_receipts_for_job_need_reconciliation');
  await assert.rejects(buildValueProofScorecard([a,{...a,amount_cents:3000}],{verifyEvidence:fakeTrustedAdapter}),/conflicting_duplicate_event_id/);
});
test('verified refunds do not become bank settlement or business profit', async () => {
  const paid=event('payment_confirmed','charge','evercraft-research','report-1',{amount_cents:5000});
  const refund=event('refund_confirmed','refund','evercraft-research','report-1',{amount_cents:1000});
  const scored=await buildValueProofScorecard([paid,refund],{verifyEvidence:fakeTrustedAdapter});
  assert.equal(scored.products[0].provider_paid_gross_cents,5000);
  assert.equal(scored.products[0].provider_refunds_cents,1000);
  assert.equal(scored.products[0].business_profit_cents,null);
});
test('reject mismatched evidence source and invented economic values', () => {
  assert.throws(()=>normalizeValueProofEvent(event('payment_confirmed','bad','work-saban','x',{amount_cents:-1})),/amount_cents_invalid/);
  assert.throws(()=>normalizeValueProofEvent(event('payment_confirmed','currency','work-saban','x',{amount_cents:100,currency:'EUR'})),/currency_unsupported_v1/);
  assert.throws(()=>normalizeValueProofEvent({...event('payment_confirmed','missing','work-saban','x',{amount_cents:100}),currency:undefined}),/currency_unsupported_v1/);
  assert.throws(()=>normalizeValueProofEvent(event('value_confirmed','bad','work-saban','x',{baseline_minutes:12,actual_minutes:1.2})),/actual_minutes_invalid/);
  assert.throws(()=>normalizeValueProofEvent({...event('delivered','bad'),evidence:{source:'payment_provider',ref:'fake'}}),/evidence_source_mismatch/);
  assert.throws(()=>normalizeValueProofEvent({...event('delivered','bad'),actual_minutes:1}),/field_not_allowed_for_kind/);
});

test('a receipt ref alone cannot verify a changed amount or job', async () => {
  const payment=event('payment_confirmed','bind','work-saban','job-a',{amount_cents:100});
  const claimedDigest=eventClaimDigest(payment);
  const tampered={...payment,amount_cents:900};
  const score=await buildValueProofScorecard([tampered],{verifyEvidence:async e=>({
    verified:true,source:e.evidence.source,ref:e.evidence.ref,claim_sha256:claimedDigest
  })});
  assert.equal(score.products.length,0);
  assert.equal(score.held_events[0].reason,'independent_evidence_unverified');
});

test('one upstream payment receipt cannot be counted for two jobs', async () => {
  const a=event('payment_confirmed','same','work-saban','job-1',{amount_cents:1200});
  const b={...event('payment_confirmed','second','work-saban','job-2',{amount_cents:1200}),evidence:a.evidence};
  const score=await buildValueProofScorecard([a,b],{verifyEvidence:fakeTrustedAdapter});
  assert.equal(score.verified_event_count,1);
  assert.equal(score.products[0].provider_paid_jobs,1);
  assert.equal(score.held_events[0].reason,'receipt_reused_across_events');
});
