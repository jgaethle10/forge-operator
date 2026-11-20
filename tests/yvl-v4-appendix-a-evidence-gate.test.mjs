import test from 'node:test';
import assert from 'node:assert/strict';
import {readYvlMatrix,validateYvlMatrix} from '../scripts/yvl-v4-appendix-a-evidence-gate.mjs';

const copy=()=>structuredClone(readYvlMatrix());
test('current YVL v4 source checkpoint is evidence-complete but NOT bid-qualified',()=>{
 const result=validateYvlMatrix(copy());
 assert.equal(result.valid,true);
 assert.equal(result.requirements,22);
 assert.equal(result.admissible_current_bid,false);
 assert.equal(result.original_source_recovered,false);
 assert.equal(result.submitted_proposal_verified,false);
 assert.ok(result.missing_evidence.includes('unverified_two_completed_library_cms_projects'));
 assert.equal(result.action,'HOLD_UNQUALIFIED_SUBMISSION');
});
test('YVL Appendix A requires one of the buyer-defined status labels per row',()=>{
 const matrix=copy();
 matrix.response_rows[0].status='completed';
 const result=validateYvlMatrix(matrix);
 assert.equal(result.valid,false);
 assert.ok(result.errors.includes('invalid_appendix_a_status'));
});
test('same requirement cannot be counted twice; incomplete matrix holds',()=>{
 const duplicate=copy();
 duplicate.response_rows[1].id=duplicate.response_rows[0].id;
 assert.ok(validateYvlMatrix(duplicate).errors.includes('duplicate_or_invalid_row_id'));
 const truncated=copy();
 truncated.response_rows=truncated.response_rows.slice(0,2);
 assert.ok(validateYvlMatrix(truncated).errors.includes('incomplete_appendix_response_rows'));
});
test('unavailable qualifying experience cannot be silently called included',()=>{
 const matrix=copy();
 matrix.response_rows.find(r=>r.id==='YVL-18').status='Included';
 assert.ok(validateYvlMatrix(matrix).errors.includes('false_eligibility_claim_in_unqualified_response'));
});
test('historical source cannot be marked recovered or customer-approved without independent evidence',()=>{
 const matrix=copy();
 matrix.prototype_state='original_zip_verified';
 matrix.response_rows[0].proven_in_current_source=true;
 matrix.partner_state='committed';
 matrix.submission_state='sent';
 const result=validateYvlMatrix(matrix);
 assert.equal(result.valid,false);
 for(const error of ['source_recovery_claim_requires_zip_sha256',
  'unverified_prototype_asserted_as_current_or_client_approved',
  'partner_claim_requires_signed_counterparty_evidence',
  'submission_claim_requires_independent_receipt'])assert.ok(result.errors.includes(error));
});
test('every requirement needs explanation and dependency not just a compliance checkmark',()=>{
 const matrix=copy();
 matrix.response_rows[2].description_evidence='Meets requirement';
 matrix.response_rows[3].additional_cost_or_dependency='';
 const result=validateYvlMatrix(matrix);
 assert.ok(result.errors.includes('inadequate_evidence_description'));
 assert.ok(result.errors.includes('missing_dependency_assessment'));
});
test('bid closes December 15 3PM Pacific regardless of third-party timezone errors',()=>{
 const matrix=copy();
 matrix.deadline_pacific='2026-12-16T15:00:00-08:00';
 assert.ok(validateYvlMatrix(matrix).errors.includes('deadline_drift'));
});
