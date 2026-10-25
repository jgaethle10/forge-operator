import test from 'node:test';
import assert from 'node:assert/strict';
import { triage } from '../../scripts/opportunity-radar/triage.mjs';

const base = { title: 'Watershed data integration', publisher: 'Example Agency', notice_id: 'X-1', source_url: 'https://example.org/notice/1', eligibility: 'eligible', status: 'verified_open', candidate_capabilities: ['FAIE'], scores: {technical_fit:5, demonstrated_readiness:3, deadline_feasibility:4, potential_value:4, mission_fit:5} };
const clock = {checkedAt:'2026-10-25T19:00:00.000Z'};
test('verified eligible lead requires owner review, never auto-contact', () => {
 const [r] = triage([base],clock);
 assert.equal(r.score,21); assert.equal(r.review_state,'owner_review_required'); assert.equal(r.no_contact_without_approval,true);
});
test('deduplicates identical source records', () => assert.equal(triage([base,base],clock).length,1));
test('unknown eligibility and scores cannot become approved', () => {
 const [r]=triage([{...base,eligibility:'unknown',scores:{}}],clock);
 assert.equal(r.review_state,'verify_before_action'); assert.equal(r.score,null);
});
test('ineligible, expired, closed and held EV opportunities are blocked', () => {
 for (const patch of [{eligibility:'ineligible'},{deadline_at:'2026-10-24T00:00:00Z'},{status:'closed'},{candidate_capabilities:['AliEV']}]) {
   assert.equal(triage([{...base,...patch}],clock)[0].review_state,'blocked');
 }
});
test('invalid source URLs and invalid deadline are rejected', () => {
 assert.throws(()=>triage([{...base,source_url:'file:///etc/passwd'}],clock));
 assert.throws(()=>triage([{...base,deadline_at:'tomorrow'}],clock));
});
