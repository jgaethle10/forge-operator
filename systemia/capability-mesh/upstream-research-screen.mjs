// Read-only source-candidate screen. Never installs, promotes, purchases compute or grants execution authority.
const DECISIONS=new Set(['pattern_only','reference_only','research_candidate','hold']);
const KINDS=new Set(['repository','idea_file']);
const LICENSE=new Set(['required','no_external_code_proposed','mit_file_observed','mit_file_observed_model_rights_separate']);
const clean=v=>typeof v==='string'?v.trim():'';
export function screenUpstreamCatalog(catalog){
 if(!catalog||catalog.schema!=='evercraft.upstream-candidate-screen.v1'||!Array.isArray(catalog.candidates))throw Error('invalid_upstream_catalog');
 const seen=new Set();
 const candidates=catalog.candidates.map(c=>{
  if(!clean(c.id)||seen.has(c.id)||!KINDS.has(c.kind)||!DECISIONS.has(c.decision)||!LICENSE.has(c.license_review))throw Error('invalid_candidate_contract');
  seen.add(c.id);
  if(!/^https:\/\/(github\.com|gist\.github\.com)\/[^/]+\/[^/]+/.test(clean(c.source_url)))throw Error('candidate_source_invalid');
  if(!clean(c.existing_evercraft_owner)||!clean(c.proposed_use)||!Array.isArray(c.known_constraints))throw Error('candidate_review_missing');
  if(c.real_runtime_test!==false||c.paid_customer_effect_verified!==false)throw Error('research_catalog_must_not_claim_unverified_results');
  return Object.freeze({
   id:c.id,kind:c.kind,source_url:c.source_url,existing_owner:c.existing_evercraft_owner,decision:c.decision,next_step:c.proposed_use,
   licensing_review_required:c.license_review==='required'||c.license_review.includes('model_rights_separate'),
   admitted:false,runtime_verified:false,customer_ready:false,revenue_verified:false,execution_authority:'none'
  });
 });
 return Object.freeze({schema:'evercraft.upstream-candidate-screen.result.v1',checked_source_date:catalog.captured_at,total:candidates.length,
  allowed_to_install:0,allowed_to_run_on_owned_nodes:0,requires_systemia_review:true,candidates});
}
