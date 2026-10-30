import {createHash} from 'node:crypto';

// Evercraft Systemia value-proof ledger, v1.
// A proof-filtered scorecard, not a payment processor or production telemetry source.
export const VALUE_PROOF_SCHEMA = 'evercraft.systemia.value-proof.v1';

const SOURCES = Object.freeze({
  inquiry_received: 'authorized_intake',
  payment_confirmed: 'payment_provider',
  refund_confirmed: 'payment_provider',
  delivered: 'delivery_service',
  customer_accepted: 'customer_attestation',
  value_confirmed: 'customer_attestation',
  cost_finalized: 'cost_ledger'
});
const MONEY_FIELD = Object.freeze({
  payment_confirmed: 'amount_cents',
  refund_confirmed: 'amount_cents',
  cost_finalized: 'cost_cents'
});
const TEXT = /^[a-z0-9][a-z0-9._:-]{0,119}$/i;
const EVENT_KEYS = new Set([
  'event_id','product_key','job_key','kind','occurred_at','evidence',
  'amount_cents','cost_cents','currency','baseline_minutes','actual_minutes'
]);
const EVIDENCE_KEYS = new Set(['source','ref']);

function fail(code) { throw new Error(code); }
function token(value, name) {
  if (typeof value !== 'string' || !TEXT.test(value)) fail(name + '_invalid');
  return value;
}
function cents(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) fail(name + '_invalid');
  return value;
}
function minutes(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) fail(name + '_invalid');
  return value;
}
function strictFields(obj, allowed, name) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail(name + '_invalid');
  for (const k of Object.keys(obj)) if (!allowed.has(k)) fail(name + '_unknown_field_' + k);
}
export function normalizeValueProofEvent(raw) {
  strictFields(raw, EVENT_KEYS, 'event');
  const kind = raw.kind;
  if (!Object.hasOwn(SOURCES, kind)) fail('kind_unknown');
  strictFields(raw.evidence, EVIDENCE_KEYS, 'evidence');
  const event = {
    event_id: token(raw.event_id, 'event_id'),
    product_key: token(raw.product_key, 'product_key'),
    job_key: token(raw.job_key, 'job_key'),
    kind,
    occurred_at: raw.occurred_at,
    evidence: {
      source: raw.evidence.source,
      ref: token(raw.evidence.ref, 'evidence_ref')
    }
  };
  if (event.evidence.source !== SOURCES[kind]) fail('evidence_source_mismatch');
  if (typeof event.occurred_at !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(event.occurred_at) ||
      !Number.isFinite(Date.parse(event.occurred_at))) fail('occurred_at_invalid');
  if (MONEY_FIELD[kind]) {
    const field = MONEY_FIELD[kind];
    event[field] = cents(raw[field], field);
    if (raw.currency !== 'USD') fail('currency_unsupported_v1');
    event.currency = 'USD';
    if (kind !== 'cost_finalized' && event[field] === 0) fail('payment_amount_zero');
  }
  if (kind === 'value_confirmed') {
    event.baseline_minutes = minutes(raw.baseline_minutes, 'baseline_minutes');
    event.actual_minutes = minutes(raw.actual_minutes, 'actual_minutes');
  }
  const permitted = new Set(['event_id','product_key','job_key','kind','occurred_at','evidence']);
  if (MONEY_FIELD[kind]) {
    permitted.add(MONEY_FIELD[kind]);
    permitted.add('currency');
  }
  if (kind === 'value_confirmed') {
    permitted.add('baseline_minutes');
    permitted.add('actual_minutes');
  }
  for (const key of Object.keys(raw)) if (!permitted.has(key)) fail('field_not_allowed_for_kind_' + key);
  return event;
}
const fresh = () => ({
  inquiries: new Set(), paid: new Map(), refunds: new Map(), deliveries: new Set(),
  acceptance: new Set(), value: new Map(), costs: new Map(), recorded: 0
});
function outcomeSummary(key, jobs) {
  const accepted = [...jobs.acceptance].filter(id => jobs.deliveries.has(id));
  const measured = [...jobs.value.entries()].filter(([id]) => jobs.acceptance.has(id) && jobs.deliveries.has(id));
  const money = entries => [...entries.values()].reduce((sum, n) => sum + n, 0);
  return {
    product_key: key,
    verified_events_in_supplied_ledger: jobs.recorded,
    inquiry_jobs: jobs.inquiries.size,
    provider_paid_jobs: jobs.paid.size,
    provider_paid_gross_cents: money(jobs.paid),
    provider_refund_receipts: jobs.refunds.size,
    provider_refunds_cents: money(jobs.refunds),
    delivered_jobs: jobs.deliveries.size,
    customer_accepted_deliveries: accepted.length,
    measured_customer_effort_jobs: measured.length,
    measured_minutes_saved: measured.reduce((sum,[,v]) => sum + v.baseline_minutes - v.actual_minutes,0),
    direct_cost_finalized_jobs: jobs.costs.size,
    recorded_direct_cost_cents: money(jobs.costs),
    business_profit_cents: null,
    confidence: 'verified_submitted_receipts_only_not_complete_market_or_bank_coverage'
  };
}
export function eventClaimDigest(raw) {
  return createHash('sha256').update(JSON.stringify(normalizeValueProofEvent(raw)),'utf8').digest('hex');
}
export async function buildValueProofScorecard(rawEvents, {verifyEvidence} = {}) {
  if (!Array.isArray(rawEvents)) fail('events_must_be_array');
  if (typeof verifyEvidence !== 'function') fail('trusted_verifier_required');
  const seen = new Map(), usedReceipts = new Set(), verified = [], held = [];
  for (const raw of rawEvents) {
    const event = normalizeValueProofEvent(raw);
    const canonical = JSON.stringify(event);
    if (seen.has(event.event_id)) {
      if (seen.get(event.event_id) !== canonical) fail('conflicting_duplicate_event_id');
      continue; // exact retry is idempotent
    }
    seen.set(event.event_id, canonical);
    let proof;
    try { proof = await verifyEvidence(event); } catch { proof = null; }
    // Never accept a caller-supplied verified flag, a checkout URL, or a bare receipt ref.
    if (!proof || proof.verified !== true ||
        proof.source !== event.evidence.source || proof.ref !== event.evidence.ref ||
        proof.claim_sha256 !== eventClaimDigest(event)) {
      held.push({event_id:event.event_id,reason:'independent_evidence_unverified'});
      continue;
    }
    const receiptKey = event.evidence.source + ':' + event.evidence.ref;
    if (usedReceipts.has(receiptKey)) {
      held.push({event_id:event.event_id,reason:'receipt_reused_across_events'});
      continue;
    }
    usedReceipts.add(receiptKey);
    verified.push(event);
  }
  const products = new Map();
  for (const event of verified) {
    const jobs = products.get(event.product_key) || fresh();
    products.set(event.product_key,jobs);
    const id = event.job_key;
    jobs.recorded++;
    if (event.kind === 'inquiry_received') jobs.inquiries.add(id);
    if (event.kind === 'delivered') jobs.deliveries.add(id);
    if (event.kind === 'customer_accepted') jobs.acceptance.add(id);
    if (event.kind === 'payment_confirmed') {
      if (jobs.paid.has(id)) {
        held.push({event_id:event.event_id,reason:'multiple_payment_receipts_for_job_need_reconciliation'});
        jobs.recorded--;
      } else jobs.paid.set(id,event.amount_cents);
    }
    if (event.kind === 'refund_confirmed') {
      const refundKey = event.evidence.ref;
      if (!jobs.refunds.has(refundKey)) jobs.refunds.set(refundKey,event.amount_cents);
    }
    if (event.kind === 'cost_finalized') {
      if (jobs.costs.has(id)) {
        held.push({event_id:event.event_id,reason:'cost_revision_needs_reconciliation'});
        jobs.recorded--;
      } else jobs.costs.set(id,event.cost_cents);
    }
    if (event.kind === 'value_confirmed') {
      if (jobs.value.has(id)) {
        held.push({event_id:event.event_id,reason:'value_revision_needs_reconciliation'});
        jobs.recorded--;
      } else jobs.value.set(id,{baseline_minutes:event.baseline_minutes,actual_minutes:event.actual_minutes});
    }
  }
  return {
    schema: VALUE_PROOF_SCHEMA,
    coverage: 'Only independently verified submitted events; zero counts are not proof that no other events exist.',
    products: [...products.entries()].sort(([a],[b])=>a.localeCompare(b))
      .map(([key,jobs])=>outcomeSummary(key,jobs)),
    verified_event_count: verified.length - held.filter(x=>x.reason!=='independent_evidence_unverified').length,
    held_events: held
  };
}
