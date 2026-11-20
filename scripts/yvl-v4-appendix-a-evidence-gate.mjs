import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Proposal evidence discipline. No customer data, network, Gmail, or submission.
// Caller assertions alone never prove an eligibility or procurement gate.
const ALLOWED=new Set(['Included','Configurable','Custom','Roadmap','Not available']);
const HARD_HOLDS=['unrecovered_original_v4_archives','unverified_two_completed_library_cms_projects',
 'missing_three_authorized_comparable_references','no_committed_substantive_us_partner',
 'no_current_vpat_acr_or_manual_accessibility_qa','unverified_us_hosting',
 'unverified_five_year_itemized_pricing','no_signed_addenda_acknowledgment'];
const mandatoryNotAvailable=new Set(['YVL-18','YVL-19']);
const sourceURL=new URL('../../docs/procurement/yvl-v4-vendor-response-matrix-20261120.json',import.meta.url);
export function validateYvlMatrix(matrix){
 const errors=[];
 if(matrix?.schema!=='evercraft.yvl.vendor-response-evidence.v1')errors.push('wrong_schema');
 if(matrix?.rfp!=='RFP-26-002')errors.push('wrong_rfp');
 if(matrix?.submission_state!=='not_submitted')errors.push('submission_claim_requires_independent_receipt');
 if(matrix?.partner_state!=='not_committed')errors.push('partner_claim_requires_signed_counterparty_evidence');
 if(matrix?.prototype_state!=='prior_generation_documented_archives_not_recovered')
  errors.push('source_recovery_claim_requires_zip_sha256');
 if(!Array.isArray(matrix?.response_rows)||matrix.response_rows.length<20)
  errors.push('incomplete_appendix_response_rows');
 const seen=new Set();
 for(const row of matrix?.response_rows||[]){
  if(!/^YVL-\d{2}$/.test(row.id||'')||seen.has(row.id))errors.push('duplicate_or_invalid_row_id');
  seen.add(row.id);
  if(!ALLOWED.has(row.status))errors.push('invalid_appendix_a_status');
  if(typeof row.section!=='string'||!row.section.trim()||typeof row.requirement!=='string'||!row.requirement.trim())
   errors.push('missing_requirement_or_section');
  if(typeof row.description_evidence!=='string'||row.description_evidence.trim().length<45)
   errors.push('inadequate_evidence_description');
  if(typeof row.additional_cost_or_dependency!=='string'||row.additional_cost_or_dependency.trim().length<25)
   errors.push('missing_dependency_assessment');
  if(row.proven_in_current_source!==false||row.customer_approved!==false)
   errors.push('unverified_prototype_asserted_as_current_or_client_approved');
  if(mandatoryNotAvailable.has(row.id)&&row.status!=='Not available')
   errors.push('false_eligibility_claim_in_unqualified_response');
 }
 if(matrix?.deadline_pacific!=='2026-12-15T15:00:00-08:00')
  errors.push('deadline_drift');
 return {schema:'evercraft.yvl.matrix-validation.v1',valid:errors.length===0,
  errors:[...new Set(errors)],requirements:matrix?.response_rows?.length||0,
  admissible_current_bid:false,original_source_recovered:false,
  customer_contract_verified:false,submitted_proposal_verified:false,
  missing_evidence:HARD_HOLDS,action:'HOLD_UNQUALIFIED_SUBMISSION'};
}
export function readYvlMatrix(){
 return JSON.parse(fs.readFileSync(sourceURL,'utf8'));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const result=validateYvlMatrix(readYvlMatrix());
 console.log(JSON.stringify(result,null,2));
 if(!result.valid)process.exitCode=1;
}
