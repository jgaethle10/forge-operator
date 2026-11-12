import assert from 'node:assert/strict';
import test from 'node:test';
import { assessEvOpportunity, prepareEvEvidencePreview, rankEvOpportunities } from '../systemia/ev-opportunity/engine.mjs';

const now = '2026-11-11T12:00:00-08:00';
const primary = 'https://example.com/public-procurement/2026-ev-001';
const src = { claim: 'An EV planning request exists in an illustrative official notice', url: primary,
  observed_at: '2026-11-11T10:00:00-08:00', classification: 'official_notice', rights: 'independent_cleared' };
const fixture = () => ({
  kind: 'procurement', name: 'TEST ONLY: County EV planning bid',
  location: { country: 'US', region: 'WA', place: 'Example County' },
  buyer: { type: 'county procurement', public_url: primary },
  need: 'Requested site planning and charger opportunity screening',
  paid_scope: 'Vendor-paid planning package subject to bid award',
  sources: [{...src}], lineage: { status: 'independent_cleared', protected_customer_material: false, disputed_asset: false },
  governance: { ev_commercial_clearance: true },
  deadline: { applicable: true, at: '2026-11-12T15:00:00-08:00', verified_at: now, source_url: primary },
  site: { parcel: { state: 'source_derived', value: 'illustrative parcel', source_url: primary },
    charger_competition: {state:'unknown'}, utility_capacity:{state:'unknown'} },
  plan: { qa_state: 'unreviewed' }
});

test('unknown is never zero and no engineer-ready claims', () => {
  const out = assessEvOpportunity(fixture(), { now });
  assert.equal(out.site.utility_capacity.value, null);
  assert.equal(out.site.utility_capacity.state, 'unknown');
  assert.equal(out.controls.construction_ready, false);
  assert.equal(out.controls.external_outreach_allowed, false);
  assert.equal(out.controls.checkout_allowed, false);
  assert.equal(out.deadline.state, 'urgent');
  assert.equal(out.status, 'RESEARCH');
});

test('missing legal clearance fails closed even if other evidence is strong', () => {
  const x = fixture(); delete x.lineage;
  x.governance = { ev_commercial_clearance: false };
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.status, 'HELD');
  assert.ok(out.hold_reasons.includes('lineage_clearance_missing'));
  assert.ok(out.hold_reasons.includes('commercial_clearance_missing'));
});

test('restricted evidence blocks use and prevents public previews', () => {
  const x = fixture(); x.sources.push({ ...src, claim:'confidential attached material', rights:'restricted' });
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.status, 'HELD');
  assert.equal(prepareEvEvidencePreview(out).publication_state, 'internal_only');
});

test('claimed verification is downgraded without a cleared source reference', () => {
  const x = fixture(); x.site.utility_capacity = { state:'verified', value:'500 kW', source_url:'https://example.com/unreviewed' };
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.site.utility_capacity.state, 'unknown');
  assert.equal(out.site.utility_capacity.value, null);
  assert.ok(out.missing_evidence.includes('verified_utility_capacity_needs_cleared_source'));
});

test('false source timestamp and unsupported deadline do not get urgency', () => {
  const x = fixture(); x.deadline.at = '2026-11-12'; x.deadline.source_url = 'https://example.com/unsupported';
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.deadline.state, 'unverified');
  assert.ok(out.missing_evidence.includes('official_deadline_timestamp_source_and_verification'));
});

test('expired deadlines are marked held', () => {
  const x = fixture(); x.deadline.at = '2026-11-09T12:00:00-08:00';
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.deadline.state, 'expired');
  assert.equal(out.status, 'HELD');
});

test('grant not treated as direct revenue', () => {
  const x = fixture(); x.kind='grant';
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.controls.grant_is_revenue, false);
  assert.equal(out.controls.automated_payment_allowed, false);
});

test('preview does not invent an engineering deliverable, price, or payment link', () => {
  const out = prepareEvEvidencePreview(assessEvOpportunity(fixture(), { now }));
  assert.equal(out.proof_of_completed_engineering, false);
  assert.equal(out.price_offered, null);
  assert.equal(out.payment_url, null);
  assert.equal(out.supported_findings.length, 1);
});

test('future-dated sources do not count as verified facts', () => {
  const x = fixture(); x.sources[0].observed_at = '2028-01-01T00:00:00Z';
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.verified_claims.length, 0);
  assert.ok(out.missing_evidence.includes('source_claim_url_and_timestamp'));
});

test('input approvals never turn into publication or outreach permission', () => {
  const x = fixture(); x.plan.qa_state = 'approved';
  const out = assessEvOpportunity(x, { now });
  assert.equal(out.controls.public_preview_allowed, false);
  assert.equal(out.controls.external_outreach_allowed, false);
});

test('conflicting duplicates hold instead of favoring an optimistic record', () => {
  const first=fixture(); const second=fixture();
  second.sources[0].rights = 'restricted';
  const out = rankEvOpportunities([first, second], { now });
  assert.equal(out.unique_candidates, 1);
  assert.equal(out.opportunities[0].status, 'HELD');
  assert.ok(out.opportunities[0].hold_reasons.includes('conflicting_candidate_versions'));
  assert.equal(out.opportunities[0].verified_claims.length, 0);
});

test('queue is deterministic and deduplicates identical site opportunity', () => {
  const list = [fixture(), fixture()];
  const before = structuredClone(list);
  const out = rankEvOpportunities(list, { now });
  assert.equal(out.unique_candidates, 1);
  assert.equal(out.source_candidates, 2);
  assert.deepEqual(list, before);
  assert.equal(out.execution_mode, 'offline_read_only');
  assert.equal(out.opportunities[0].id, assessEvOpportunity(fixture(), { now }).id);
});
