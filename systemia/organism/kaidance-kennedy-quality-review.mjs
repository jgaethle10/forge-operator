// Read-only Kennedy visual-quality handoff for the EXISTING Kaidance company pulse.
// This validator does not start render jobs, grant a Saban lease or certify a plan.
import {createHash} from 'node:crypto';

export const kennedyQualityHash = value =>
  'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');

const HEX40=/^[a-f0-9]{40}$/;
const HASH=/^sha256:[a-f0-9]{64}$/;
const PROOF_SCHEMA='evercraft.kennedy.quality-proof.v1';

function candidate(action,proofRef=null,priority=2){
 return {work_key:'kennedy:visual-quality-readback',
  lane_key:'kennedy-design-quality',priority,action,
  authority:'systemia_operator_review_required',execution_authorized:false,
  source_edits_authorized:false,production_release_authorized:false,
  engineering_authority:false,receipt_ref:proofRef};
}
function held(status,action){
 return {status,source_commit:null,quality_gate:'unverified',
  actual_development_completed:false,production_ready:false,
  review_candidates:[candidate(action,null,status==='invalid'?1:2)]};
}

// Input must be emitted by an authorized, private KSS test/visual-review step;
// a matching content hash proves only payload integrity, not producer identity.
// Absent, stale and untrusted inputs never become "improvement complete".
export function classifyKennedyQualityReceipt(value,now=new Date()){
 if(value===null||value===undefined)
  return held('not_connected','connect_owned_kennedy_ci_visual_proof_to_private_heartbeat');
 const clock=+new Date(now);
 const age=clock-Date.parse(value?.observed_at||'');
 if(!Number.isFinite(clock)||!Number.isFinite(age)||age< -60000)
  return held('invalid','reconcile_kennedy_quality_receipt_clock');
 if(age>15*60000)
  return held('stale','refresh_kennedy_visual_qa_evidence');
 if(value.schema!==PROOF_SCHEMA||
    value.product_key!=='kennedy-space-station'||
    value.authority?.execution_authorized!==false||
    value.authority?.production_release_authorized!==false||
    value.authority?.engineering_authority!==false||
    value.authority?.actual_development_completed!==false||
    value.authority?.customer_data_used!==false||
    !HEX40.test(value.source_commit||'')||
    !['synthetic_fixture','verified_licensed_source'].includes(value.source_rights_state)||
    typeof value.tests?.source_contract_passed!=='boolean'||
    typeof value.tests?.render_test_passed!=='boolean'||
    typeof value.tests?.pdf_visual_review_passed!=='boolean'||
    !['needs_improvement','human_visual_review_required'].includes(value.quality_gate)||
    !Array.isArray(value.gaps)||value.gaps.length>12||
    !value.gaps.every(x=>typeof x==='string'&&/^[a-z][a-z0-9_]{2,79}$/.test(x))||
    !HASH.test(value.receipt_hash||'')||
    value.receipt_hash!==kennedyQualityHash({...value,receipt_hash:null}))
  return held('invalid','reconcile_kennedy_untrusted_visual_qa_receipt');

 const allProofs=value.tests.source_contract_passed&&
   value.tests.render_test_passed&&value.tests.pdf_visual_review_passed;
 // Synthetic green tests never confer site-specific, licensed engineering readiness.
 const action=!value.tests.source_contract_passed||!value.tests.render_test_passed
  ?'repair_kennedy_source_or_render_regression'
  :!value.tests.pdf_visual_review_passed
    ?'review_kennedy_actual_pdf_page_images'
    :value.source_rights_state==='synthetic_fixture'
      ?'qualify_licensed_registered_site_imagery_before_real_plan'
      :'review_kennedy_real_site_spatial_evidence_and_visual_quality';
 return {status:'verified_review_receipt',source_commit:value.source_commit,
   quality_gate:value.quality_gate,source_rights_state:value.source_rights_state,
   tests:value.tests,gaps:value.gaps,
   // All three checks can pass on a synthetic fixture without shipping anything.
   observed_quality_proofs_complete:Boolean(allProofs),
   actual_development_completed:false,production_ready:false,
   review_candidates:[candidate(action,value.receipt_hash)]};
}
