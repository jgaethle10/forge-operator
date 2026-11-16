/**
 * External Agent Skills: metadata-only admission, fail-closed.
 * No fetch, execution, install, credentials, customer data or side effects.
 */
const SHA256=/^[a-f0-9]{64}$/;
const GIT_COMMIT=/^[a-f0-9]{40}$/;
const PERMISSIVE=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause']);
const BANNED_AUTHORITY=new Set(['exec','shell','credentials','network','customer_data','payments','outbound_contact','publish']);
const clean=(v)=>typeof v==='string'?v.trim():'';

export function evaluateExternalSkill(candidate={}){
  const blockers=[];
  const id=clean(candidate.id);
  if(!/^[a-z][a-z0-9-]{2,79}$/.test(id)) blockers.push('invalid_id');
  if(!clean(candidate.product_key)) blockers.push('missing_product_binding');
  if(clean(candidate.execution_mode)!=='instructions_only') blockers.push('execution_not_read_only');
  const source=candidate.source||{};
  const commit=clean(source.commit).toLowerCase();
  const repository=clean(source.repository), filePath=clean(source.path);
  if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository)) blockers.push('untrusted_repository_locator');
  if(!GIT_COMMIT.test(commit)) blockers.push('commit_not_pinned');
  if(!/^skills\/(?:[\w.-]+\/)*SKILL\.md$/.test(filePath)||filePath.split('/').some(p=>p==='.'||p==='..')) blockers.push('skill_path_invalid');
  if(!SHA256.test(clean(source.sha256).toLowerCase())) blockers.push('source_digest_missing');
  const legal=candidate.legal||{};
  if(!PERMISSIVE.has(clean(legal.spdx))) blockers.push('license_not_preapproved');
  if(legal.reviewed!==true) blockers.push('license_review_unverified');
  if(!clean(legal.notice_path)) blockers.push('license_notice_missing');
  const review=candidate.review||{};
  for(const key of ['source_reviewed','dependencies_reviewed','sandbox_passed','fixture_comparison_passed','product_contract_checked','owner_approved']){
    if(review[key]!==true) blockers.push(key+'_missing');
  }
  const scopes=Array.isArray(candidate.requested_scopes)?candidate.requested_scopes:[];
  for(const scope of scopes) if(BANNED_AUTHORITY.has(scope)) blockers.push('forbidden_scope:'+scope);
  if(!Array.isArray(candidate.requested_scopes)||scopes.length>0) blockers.push('requested_scopes_must_be_explicit_empty_array');
  return {
    id:id||null,
    product_key:clean(candidate.product_key)||null,
    state:blockers.length?'quarantined':'eligible_for_separate_contract_admission',
    blockers,
    executable:false,
    product_live_verified:false,
    customer_data_allowed:false,
    payment_or_contact_authorized:false
  };
}

export function evaluateExternalSkillRegistry(registry){
  const candidates=Array.isArray(registry?.candidates)?registry.candidates:[];
  const results=candidates.map(evaluateExternalSkill);
  return {schema:'evercraft.external-skill-intake-assessment.v1',count:results.length,eligible:results.filter(x=>x.state==='eligible_for_separate_contract_admission').length,results};
}
