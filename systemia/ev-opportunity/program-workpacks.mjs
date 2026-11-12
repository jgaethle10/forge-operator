import { createHash } from 'node:crypto';

// Offline, read-only solicitation-to-work-package compiler. Input is an
// independently sourced catalog. It does not scrape, contact, submit, charge,
// offer engineering services, import customer data, or write to production.
const PROGRAM_KINDS = new Set(['construction_procurement', 'competitive_grant']);
const EVIDENCE_STATES = new Set(['unknown', 'source_derived', 'applicant_asserted', 'independently_reviewed']);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const s = v => typeof v === 'string' ? v.trim() : '';
const validTime = v => ISO_INSTANT.test(s(v)) && Number.isFinite(Date.parse(v));
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq = a => [...new Set(a)];
const url = v => {
  try { const u = new URL(v); return u.protocol === 'https:' && Boolean(u.hostname) && !u.username && !u.password; }
  catch { return false; }
};
function validateProgram(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('program_object_required');
  if (!s(p.id) || !s(p.title) || !PROGRAM_KINDS.has(p.kind)) throw new Error('program_identity_or_kind_invalid');
  if (!validTime(p.deadline?.at) || !url(p.deadline?.official_source)) throw new Error('official_deadline_and_timezone_required');
  if (!url(p.official_url) || !url(p.buyer?.url)) throw new Error('official_program_and_buyer_urls_required');
  if (!Array.isArray(p.work_requirements) || !p.work_requirements.length) throw new Error('work_requirements_required');
  const ids = new Set();
  for (const r of p.work_requirements) {
    if (!s(r.id) || !s(r.label) || !['required','conditional','reference_only'].includes(r.applicability)) throw new Error('work_requirement_invalid');
    if (ids.has(r.id)) throw new Error('duplicate_requirement_id:'+r.id);
    ids.add(r.id);
    if (!url(r.primary_source)) throw new Error('requirement_source_invalid:'+r.id);
  }
}
function evidenceState(record, primary) {
  if (!record || !EVIDENCE_STATES.has(record.state)) return 'unknown';
  if (record.state !== 'independently_reviewed') return record.state;
  if (!url(record.source_url) || !s(record.reviewed_by) || !validTime(record.reviewed_at)) return 'applicant_asserted';
  if (!primary.includes(record.source_url)) return 'applicant_asserted';
  return 'independently_reviewed';
}
export function compileEvProgramWorkpack(program, {
  now = new Date().toISOString(),
  site = null,
  requirement_evidence = {},
  contractor = null,
} = {}) {
  validateProgram(program);
  if (!validTime(now)) throw new Error('now_offset_aware_iso_required');
  const p = structuredClone(program);
  const nowMs = Date.parse(now);
  const hrs = Math.round((Date.parse(p.deadline.at)-nowMs)/3600000*10)/10;
  const state = hrs < 0 ? 'EXPIRED' : hrs <= 72 ? 'URGENT' : 'OPEN';
  const blockers=[], gaps=[];
  const sourceUrls = [p.official_url,p.deadline.official_source,...p.work_requirements.map(r=>r.primary_source)];
  if (state === 'EXPIRED') blockers.push('submission_deadline_expired');
  if (p.official_documents_access !== 'full_current_revision_read') gaps.push('obtain_and_review_current_controlling_solicitation_and_addenda');
  if (p.submission?.method_verified !== true) gaps.push('verify_exact_submission_steps_in_current_documents');
  if (p.buyer?.relationship !== 'contracted') gaps.push('no_customer_contract_or_payment_evidence');

  const requirements = p.work_requirements.map(r => {
    const evidence = requirement_evidence[r.id] || {};
    const itemState = evidenceState(evidence, sourceUrls);
    if (r.applicability === 'required' && itemState !== 'independently_reviewed') gaps.push('requirement:'+r.id);
    if (r.applicability === 'conditional' && itemState === 'unknown') gaps.push('determine_applicability:'+r.id);
    return {id:r.id, label:r.label, applicability:r.applicability, source_url:r.primary_source,
      evidence_state:itemState, notes:s(r.notes), evidence_provided:!!requirement_evidence[r.id]};
  });
  if (p.kind === 'construction_procurement') {
    if (contractor?.licensed_for_scope !== true || contractor?.qualified_prime_verified !== true) blockers.push('qualified_licensed_prime_or_subcontract_path_missing');
    if (contractor?.bonding_insurance_verified !== true) gaps.push('verify_bonding_insurance_prevailing_wage_and_site_access');
    if (contractor?.submission_authorized === true) gaps.push('submission_authorization_is_external_not_provided_by_engine');
  }
  if (p.kind === 'competitive_grant') {
    if (!site || !s(site.address) || !s(site.station_id)) blockers.push('identified_station_and_address_required');
    if (site?.eligible_corridor_review !== 'independently_reviewed') blockers.push('official_corridor_eligibility_unverified');
    if (site?.prior_round_award_status !== 'independently_verified_not_awarded') blockers.push('existing_or_planned_awarded_site_exclusion_unresolved');
    if (site?.owner_site_control !== 'documented') blockers.push('site_control_documentation_missing');
    if (site?.utility_verification !== 'utility_issued') blockers.push('utility_confirmation_missing');
    if (site?.environmental_review !== 'documented') gaps.push('environmental_screening_needed');
    if (p.applicant?.eligibility !== 'independently_confirmed') blockers.push('eligible_applicant_not_confirmed');
  }
  if (p.asset_boundary !== 'independent_new_work_only') blockers.push('historical_asset_boundary_unresolved');
  const sourceContext = {
    official_url:p.official_url,
    deadline_source:p.deadline.official_source,
    research_sources:uniq(sourceUrls),
    source_revision:s(p.source_revision),
    technical_proof_not_contract:true
  };
  return {
    schema:'evercraft.ev-opportunity.program-workpack.v1',
    workpack_id:'evwp-'+sha({id:p.id,site_id:site?.station_id??null}).slice(0,18),
    title:p.title, program_id:p.id, kind:p.kind, buyer:p.buyer?.name||null,
    generated_at:now, deadline:{at:p.deadline.at, hours_remaining:hrs, state},
    official_references:sourceContext, evidence_requirements:requirements,
    held_reasons:uniq(blockers), research_gaps:uniq(gaps),
    package_state:blockers.length?'HELD':gaps.length?'RESEARCH':'INTERNAL_REVIEW',
    engagement_model:p.kind==='construction_procurement'?'qualified_prime_subcontract_support':'eligible_applicant_commissioned_planning_support',
    candidate_paid_scope:structuredClone(p.candidate_paid_scope||[]),
    next_48h:structuredClone(p.next_48h||[]),
    scope_limits:{client_authorization:false,outreach:false,proposal_submission:false,checkout:false,
      grant_award:false,contract_award:false,revenue_collected:false,licensed_engineering:false,
      construction_ready:false,external_publication:false},
    presentation:'INTERNAL PROCUREMENT/GRANT RESEARCH ONLY - NOT A SUBMITTED PROPOSAL OR SEALED DESIGN'
  };
}

export function compileEvProgramQueue(catalog, options={}) {
  if (!Array.isArray(catalog)) throw new Error('catalog_array_required');
  const programs = catalog.map(p => compileEvProgramWorkpack(p,options));
  return {schema:'evercraft.ev-opportunity.program-workpack-queue.v1',
    generated_at:options.now??new Date().toISOString(),
    count:programs.length, external_actions:0,
    programs:programs.sort((a,b)=>Date.parse(a.deadline.at)-Date.parse(b.deadline.at) || a.program_id.localeCompare(b.program_id))};
}
