import { createHash } from 'node:crypto';

// Standalone, offline-only Evercraft EV opportunity qualification.
// It consumes explicitly provided public-source metadata. No scraping,
// payment, outreach, customer-data import, or legacy runtime is performed.
const KIND = new Set(['site_host', 'procurement', 'grant', 'developer_pain']);
const EVIDENCE = new Set(['official_notice', 'official_public_record', 'permissioned_partner', 'other_public']);
const SOURCE_RIGHTS = new Set(['independent_cleared', 'unverified', 'restricted']);
const CONTEXT = new Set(['verified', 'source_derived', 'modeled', 'unknown']);
const REVIEW = new Set(['unreviewed', 'reviewed', 'approved']);
const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const copy = (x) => structuredClone(x);
const str = (v) => typeof v === 'string' ? v.trim() : '';
const iso = (v) => datePattern.test(str(v)) && Number.isFinite(Date.parse(v));
const webUrl = (v) => {
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && Boolean(u.hostname); }
  catch { return false; }
};
const unique = (a) => [...new Set(a)];
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sourceKey = (s) => [s.claim, s.url, s.observed_at, s.classification, s.rights].join('|');

function normalizeSource(source) {
  return {
    claim: str(source?.claim), url: str(source?.url), observed_at: str(source?.observed_at),
    classification: EVIDENCE.has(source?.classification) ? source.classification : 'other_public',
    rights: SOURCE_RIGHTS.has(source?.rights) ? source.rights : 'unverified',
    provenance_note: str(source?.provenance_note),
  };
}

function field(input, name) {
  const value = input?.[name];
  return {
    state: CONTEXT.has(value?.state) ? value.state : 'unknown',
    value: value?.value === undefined || value?.value === '' ? null : copy(value.value),
    source_url: str(value?.source_url),
    reviewed_at: iso(value?.reviewed_at) ? value.reviewed_at : null,
  };
}

export function assessEvOpportunity(candidate, { now = new Date().toISOString() } = {}) {
  if (!iso(now)) throw new Error('now_must_be_offset_aware_iso');
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('candidate_object_required');
  const c = copy(candidate);
  const reasons = [], missing = [], blocked = [];
  const sources = unique((Array.isArray(c.sources) ? c.sources : []).map(normalizeSource).map(sourceKey))
    .map(key => (Array.isArray(c.sources) ? c.sources : []).map(normalizeSource).find(s => sourceKey(s) === key));
  const qualifyingSources = sources.filter(s => s.claim && webUrl(s.url) && iso(s.observed_at) && Date.parse(s.observed_at) <= Date.parse(now) + 60000);
  const clearedSources = qualifyingSources.filter(s => s.rights === 'independent_cleared');
  const restrictedSources = sources.filter(s => s.rights === 'restricted');

  const kind = KIND.has(c.kind) ? c.kind : null;
  if (!kind) missing.push('valid_opportunity_kind');
  if (!str(c.name)) missing.push('opportunity_name');
  if (!str(c.location?.country) || !str(c.location?.region)) missing.push('country_and_region');
  if (!str(c.buyer?.type)) missing.push('buyer_type');
  if (!webUrl(c.buyer?.public_url)) missing.push('verifiable_buyer_public_url');
  if (!str(c.need)) missing.push('documented_buyer_problem');
  if (!str(c.paid_scope)) missing.push('specific_payable_scope');
  if (!qualifyingSources.length) missing.push('source_claim_url_and_timestamp');
  if (!clearedSources.length) missing.push('independent_source_rights_review');
  if (sources.some(s => s.rights === 'unverified')) reasons.push('some_source_licenses_unverified');
  if (restrictedSources.length) blocked.push('restricted_source_present');

  // Safe-by-default IP gate. Absence of a lineage classification is NOT proof of independence.
  if (c.lineage?.status !== 'independent_cleared') blocked.push('lineage_clearance_missing');
  if (c.lineage?.protected_customer_material === true) blocked.push('protected_customer_material_present');
  if (c.lineage?.disputed_asset === true) blocked.push('disputed_asset_present');
  if (c.governance?.ev_commercial_clearance !== true) blocked.push('commercial_clearance_missing');

  const deadline = c.deadline || {};
  let deadlineState = 'unverified', hoursRemaining = null;
  if (deadline.applicable === false) {
    deadlineState = 'none';
  } else if (!iso(deadline.at) || !webUrl(deadline.source_url) || !iso(deadline.verified_at)) {
    missing.push('official_deadline_timestamp_source_and_verification');
  } else if (!clearedSources.some(s => s.url === deadline.source_url)) {
    missing.push('deadline_source_in_cleared_evidence');
  } else {
    hoursRemaining = Math.round((Date.parse(deadline.at) - Date.parse(now)) / 3600000 * 10) / 10;
    if (hoursRemaining < 0) deadlineState = 'expired';
    else if (hoursRemaining <= 72) deadlineState = 'urgent';
    else deadlineState = 'open';
    if (deadlineState === 'expired') blocked.push('deadline_expired');
    if (Date.parse(deadline.verified_at) > Date.parse(now) + 60000) missing.push('deadline_check_from_future');
  }

  const site = {};
  for (const key of ['parcel', 'charger_competition', 'utility_capacity', 'parking_geometry', 'accessibility', 'site_control']) {
    site[key] = field(c.site, key);
    if (site[key].state === 'verified' && (site[key].value === null || !iso(site[key].reviewed_at) || !webUrl(site[key].source_url) || !clearedSources.some(s => s.url === site[key].source_url))) {
      site[key].state = 'unknown'; site[key].value = null;
      missing.push('verified_'+key+'_needs_cleared_source');
    }
    if (site[key].state === 'unknown') missing.push(key+'_unknown');
  }
  const planReview = REVIEW.has(c.plan?.qa_state) ? c.plan.qa_state : 'unreviewed';
  if (c.plan?.construction_document === true || c.plan?.engineer_sealed === true) blocked.push('unverified_engineering_authority');
  if (planReview !== 'approved') reasons.push('preliminary_layout_requires_independent_visual_review');
  if (site.utility_capacity.state !== 'verified') reasons.push('utility_capacity_unverified_no_interconnection_claim');

  // Score evidence completeness/attention only. Never predict ROI or installation feasibility.
  const triagePoints = [
    qualifyingSources.length ? 20 : 0,
    clearedSources.length ? 15 : 0,
    str(c.buyer?.type) && webUrl(c.buyer?.public_url) ? 15 : 0,
    str(c.need) && str(c.paid_scope) ? 15 : 0,
    ['open', 'urgent', 'none'].includes(deadlineState) ? 15 : 0,
    site.parcel.state !== 'unknown' ? 10 : 0,
    site.charger_competition.state !== 'unknown' ? 10 : 0,
  ].reduce((sum, n) => sum + n, 0);
  const status = blocked.length ? 'HELD' : missing.length ? 'RESEARCH' : 'REVIEW_READY';
  // No external publication authority is implemented here. An input flag alone cannot authorize it.
  const publicPreviewAllowed = false;
  const workItems = [
    'Recheck current primary notice and beneficiary/contractor requirements',
    'Confirm parcel/site control and existing charging competition',
    'Request utility capacity, service point and tariff verification',
    'Prepare source-labelled conceptual layout, not for construction',
    'Obtain independent technical and visual QA',
    'Confirm licensed engineer/electrical contractor scope where required',
    'Prepare bounded paid proposal only after commercial authorization'
  ];
  const idMaterial = { kind, name: str(c.name), location: c.location || {}, buyer_url: str(c.buyer?.public_url) };
  return {
    schema: 'evercraft.ev-opportunity.assessment.v1',
    id: 'ev-'+hash(idMaterial).slice(0,16),
    title: str(c.name), kind, location: c.location || {},
    assessed_at: now, status, triage_points: triagePoints,
    triage_semantics: 'evidence completeness and actionability only, not feasibility, project value or award probability',
    deadline: { state: deadlineState, at: iso(deadline.at) ? deadline.at : null, hours_remaining: hoursRemaining },
    verified_claims: clearedSources.map(s => ({ claim: s.claim, url: s.url, observed_at: s.observed_at, classification: s.classification })),
    site, buyer_type: str(c.buyer?.type), paid_scope_hypothesis: str(c.paid_scope),
    controls: {
      source_rights_checked: clearedSources.length > 0 && !sources.some(s => s.rights !== 'independent_cleared'),
      commercial_authorization_checked: c.governance?.ev_commercial_clearance === true && c.lineage?.status === 'independent_cleared',
      public_preview_allowed: publicPreviewAllowed,
      external_outreach_allowed: false,
      checkout_allowed: false,
      automated_payment_allowed: false,
      construction_ready: false,
      grant_is_revenue: false,
    },
    hold_reasons: unique(blocked), missing_evidence: unique(missing), review_notes: unique(reasons), next_work: workItems,
    candidate_hash: hash(c)
  };
}

export function rankEvOpportunities(candidates, { now = new Date().toISOString() } = {}) {
  if (!Array.isArray(candidates)) throw new Error('candidates_array_required');
  const assessed = candidates.map(c => assessEvOpportunity(c, { now }));
  const kept = new Map();
  for (const row of assessed) {
    const prior = kept.get(row.id);
    if (!prior) { kept.set(row.id, row); continue; }
    if (prior.candidate_hash !== row.candidate_hash) {
      // Never let a duplicate record overwrite a conflicting evidence state.
      kept.set(row.id, {
        ...prior, status: 'HELD',
        hold_reasons: unique([...prior.hold_reasons, ...row.hold_reasons, 'conflicting_candidate_versions']),
        verified_claims: [],
        controls: { ...prior.controls, public_preview_allowed: false, checkout_allowed: false, external_outreach_allowed: false }
      });
    }
  }
  const bands = { REVIEW_READY: 0, RESEARCH: 1, HELD: 2 };
  const opportunities = [...kept.values()].sort((a, b) => bands[a.status] - bands[b.status] || b.triage_points - a.triage_points || a.id.localeCompare(b.id));
  return { schema:'evercraft.ev-opportunity.queue.v1', generated_at: now, source_candidates: candidates.length, unique_candidates: opportunities.length,
    commercial_state: 'preauthorization_research_only', execution_mode: 'offline_read_only', opportunities };
}

// Only information with reviewed, independent source rights appears as a fact.
// A teaser does not imply a report or full site plan has already been completed.
export function prepareEvEvidencePreview(assessment) {
  if (assessment?.schema !== 'evercraft.ev-opportunity.assessment.v1') throw new Error('assessment_required');
  return {
    schema: 'evercraft.ev-opportunity.preview.v1', opportunity_id: assessment.id, title: assessment.title,
    banner: 'RESEARCH PREVIEW ONLY - NOT FOR CONSTRUCTION - NO OFFER OR CUSTOMER COMMITMENT',
    publication_state: assessment.controls.public_preview_allowed ? 'eligible_for_authorized_review' : 'internal_only',
    supported_findings: copy(assessment.verified_claims), unresolved: copy(assessment.missing_evidence),
    preliminary_work_scope: copy(assessment.next_work),
    commercial_next_step: 'Qualify buyer and scope; clear rights; prepare project-specific paid proposal with approval',
    proof_of_completed_engineering: false, price_offered: null, payment_url: null,
  };
}
