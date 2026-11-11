import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRivetFreshnessDecision} from './rivet-freshness-governance-review.mjs';

test('review evidence reproduces decision change with no observed sessions',()=>{
 const e=reviewRivetFreshnessDecision();
 assert.equal(e.schema,'evercraft.rivet.freshness-owner-review-witness.v1');
 assert.equal(e.synthetic_observed_session_rows,0);
 assert.equal(e.baseline_decision,'SCREENING INCOMPLETE');
 assert.equal(e.with_refresh_decision,'DEEPER DILIGENCE JUSTIFIED');
 assert.equal(e.freshness_alone_changes_report_decision,true);
 assert.equal(e.refresh_added_without_observed_usage,true);
 assert.equal(e.baseline_strongest_count,2);
 assert.equal(e.with_refresh_strongest_count,3);
});
test('synthetic reproduction never approves protected RIVET baseline or partner release',()=>{
 const e=reviewRivetFreshnessDecision();
 assert.equal(e.mode,'synthetic_no_mutation');
 assert.equal(e.protected_source_modified,false);
 assert.equal(e.protected_test_modified,false);
 assert.equal(e.partner_or_owner_approval_observed,false);
 assert.equal(e.assessment_authority,false);
 assert.equal(e.customer_suitability_proved,false);
 assert.equal(e.governance_status,'owner_review_required_possible_evidence_rating_inflation');
 assert.match(e.next_gate,/partner_owner_decision/);
});
