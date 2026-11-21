import {createHash} from 'node:crypto';

// Evidence preflight for independent Evercraft conceptual EV plan sets.
// This checks declared metadata only; it DOES NOT render geometry, inspect imagery,
// confirm utility capacity, verify a survey, or replace a licensed engineer.
const t = v => typeof v === 'string' ? v.trim() : '';
const norm = v => t(v).toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '');
const uniq = a => [...new Set(a)];
const url = v => {try {let u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!!u.hostname;}catch{return false;}};
const stamp = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

export function assessConceptPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('plan_object_required');
  const holds=[], checks=[], followups=[];
  const site=plan.site || {};
  if (!t(plan.project_id)) holds.push('project_id_missing');
  if (!t(site.canonical_address)) holds.push('canonical_site_address_missing');
  if (!t(site.parcel_id)) holds.push('parcel_identifier_missing');
  if (!url(site.source_url) || !stamp(site.verified_at)) holds.push('site_primary_source_and_timestamp_missing');
  if (!['cleared_independent','unknown','restricted'].includes(site.rights)) holds.push('site_source_rights_unclassified');
  if (site.rights!=='cleared_independent') holds.push('site_source_rights_not_cleared');
  if (plan.lineage?.independent_cleared!==true) holds.push('plan_lineage_not_cleared');
  if (plan.brand?.historical_asset===true) holds.push('historical_brand_asset_present');

  const sheets=Array.isArray(plan.sheets) ? plan.sheets : [];
  const required=new Set(['site_concept','area_context']);
  if (!sheets.length) holds.push('no_sheets');
  const seen=new Set();
  for (const sheet of sheets) {
    const id=t(sheet?.sheet_id);
    if (!id || seen.has(id)) holds.push('duplicate_or_missing_sheet_id');
    seen.add(id);
    required.delete(sheet?.role);
    if (norm(sheet?.site_address)!==norm(site.canonical_address)) holds.push('sheet_address_mismatch:'+id);
    if (t(sheet?.parcel_id)!==t(site.parcel_id)) holds.push('sheet_parcel_mismatch:'+id);
    if (sheet?.status!=='PRELIMINARY_NOT_FOR_CONSTRUCTION') holds.push('unqualified_sheet_status:'+id);
    if (sheet?.geometry_origin!=='source_derived_and_modeled' && sheet?.geometry_origin!=='source_derived') holds.push('geometry_origin_unclassified:'+id);
    if (sheet?.modeling_disclosure!==true) holds.push('modeling_disclosure_missing:'+id);
  }
  if (required.size) holds.push('required_sheet_roles_missing:'+Array.from(required).sort().join(','));

  const imagery=Array.isArray(plan.imagery)?plan.imagery:[];
  if (!imagery.length) holds.push('imagery_evidence_missing');
  for (const source of imagery) {
    if (!url(source?.url) || !stamp(source?.captured_or_updated_at)) holds.push('imagery_provenance_incomplete');
    if (source?.reuse_rights!=='cleared_independent') holds.push('imagery_reuse_not_cleared');
    if (source?.coordinate_fit_reviewed!==true) holds.push('imagery_coordinate_fit_not_reviewed');
  }

  const proposed=plan.proposed || {};
  if (!Number.isInteger(proposed.stalls) || proposed.stalls<1) holds.push('stall_count_invalid');
  if (!t(proposed.evse_class)) holds.push('evse_type_missing');
  if (proposed.utility_capacity_verified===true && !url(proposed.utility_verification_url)) holds.push('utility_claim_without_primary_receipt');
  if (proposed.utility_capacity_verified!==true) followups.push('Utility service point, capacity, transformer and interconnection are FIELD VERIFY');
  if (proposed.accessible_route_verified!==true) followups.push('Accessible stall, access aisle, route, grades and signage require qualified field/design verification');
  if (proposed.trench_verified!==true) followups.push('Trench, conflicts, restoration and underground utilities remain conceptual');
  if (proposed.site_control_verified!==true) followups.push('Property owner/site control and permission to develop remain unverified');
  if (proposed.survey_verified!==true) followups.push('Existing dimensions, curbs, slopes and parcel geometry require survey / field verification');

  if (plan.qa?.hash_verified===true) checks.push('byte_integrity_asserted_by_input_only');
  if (plan.qa?.visual_review==='approved') checks.push('visual_review_asserted_by_input_only');
  else holds.push('independent_visual_review_missing');
  if (plan.qa?.technical_review==='approved') checks.push('technical_review_asserted_by_input_only');
  else holds.push('independent_technical_review_missing');
  if (plan.qa?.address_source_crosscheck!==true) holds.push('address_source_crosscheck_missing');
  if (plan.qa?.image_to_parcel_crosscheck!==true) holds.push('image_to_parcel_crosscheck_missing');
  if (plan.qa?.hash_verified!==true) holds.push('artifact_integrity_check_missing');
  const state=holds.length?'HOLD':'REVIEW_READY';
  const snapshot={project_id:t(plan.project_id),canonical_site_address:t(site.canonical_address),parcel_id:t(site.parcel_id),sheet_ids:sheets.map(s=>t(s?.sheet_id)),source_url:t(site.source_url)};
  return {
    schema:'evercraft.ev-opportunity.concept-plan-qa.v1', state,
    project_id:t(plan.project_id), evidence_fingerprint:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    hold_reasons:uniq(holds), declared_checks:checks, field_verification_notes:followups,
    limitations:'Preflight validates user-provided metadata, NOT actual map-image alignment, built plans, source ownership, engineering suitability, file hash, or completed reviews.',
    output_class:'PRELIMINARY_NOT_FOR_CONSTRUCTION',
    can_publish:false, can_send_to_buyer:false, can_sell:false, can_permit:false, can_construct:false
  };
}
