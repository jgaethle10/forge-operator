import assert from 'node:assert/strict';
import { buildIBMiBuyerResearchQueue } from './ibmi-direct-buyer-queue.mjs';

const initial = buildIBMiBuyerResearchQueue({
  buyers: [
    {
      company:'Example Manufacturer',
      source_ref:'https://example.test/careers/ibmi',
      source_key:'example-manufacturer',
      score:94,
      evidence_quality:100,
      technology_use_state:'observed_public_strong',
      release_state:'unknown',
      observed_release:null,
      upgrade_need_state:'unknown',
      recommended_offer_key:'ibmi_estate_xray_250',
      observed_at:'2026-09-26T22:00:00Z',
    },
    {
      company:'Known 7.4 Operator',
      source_ref:'https://example.test/ibmi74',
      source_key:'known-74',
      score:88,
      evidence_quality:96,
      technology_use_state:'observed_public_strong',
      release_state:'observed_public_exact_release',
      observed_release:'7.4',
      upgrade_need_state:'possible_public_signal_not_confirmed',
      recommended_offer_key:'ibmi_74_deadline_xray_250',
      observed_at:'2026-09-26T22:00:00Z',
    },
  ],
  previous: [],
});

assert.equal(initial.count, 2);
assert.equal(initial.priority_count, 1);
assert.equal(initial.research_count, 1);
assert.equal(initial.prospects[0].buying_intent_state, 'unknown');
assert.equal(initial.prospects[0].contact_state, 'unverified');
assert.equal(initial.prospects[0].automated_send_allowed, false);
assert.equal(initial.prospects[0].recommended_offer_key, 'ibmi_estate_xray_250');
assert.equal(initial.prospects[1].recommended_offer_key, 'ibmi_74_deadline_xray_250');

const reviewed = {
  ...initial.prospects[0],
  contact_state:'verified_public_business_contact',
  outreach_state:'founder_review_ready',
  last_contact_research_at:'2026-09-26T22:05:00Z',
};

const next = buildIBMiBuyerResearchQueue({
  buyers:[{
    company:'Example Manufacturer',
    source_ref:'https://example.test/careers/ibmi',
    source_key:'example-manufacturer',
    score:96,
    evidence_quality:100,
    technology_use_state:'observed_public_strong',
    release_state:'unknown',
    recommended_offer_key:'ibmi_estate_xray_250',
    observed_at:'2026-09-26T22:10:00Z',
  }],
  previous:[reviewed, initial.prospects[1]],
});

assert.equal(next.prospects.find(x=>x.company==='Example Manufacturer').contact_state, 'verified_public_business_contact');
assert.equal(next.prospects.find(x=>x.company==='Example Manufacturer').outreach_state, 'founder_review_ready');
assert.equal(next.prospects.find(x=>x.company==='Known 7.4 Operator').queue_state, 'stale_reverify');

console.log(JSON.stringify({
  ok:true,
  count:initial.count,
  priority_count:initial.priority_count,
  research_count:initial.research_count,
  preserves_human_state:true,
  stale_reverify:true,
}));
