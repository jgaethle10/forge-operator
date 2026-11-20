import {preflightFounderPersonalPost} from '../creator/founder-editorial-preflight.mjs';
// Source-only, non-executable projection from Systemia-owned evidence to Harbor.
// Never grants research, external-contact, publishing or customer-delivery authority.
// Trusted callbacks must be supplied by the eventual resident Systemia runtime.

export const SYSTEMIA_HARBOR_SCHEMA = 'evercraft.systemia.harbor.upstream-candidate.v1';
const SOURCE_STATES = new Set(['observed', 'reported', 'modeled', 'inferred', 'disputed', 'verified']);
const REVIEW_STATES = new Set(['not_started', 'in_progress', 'independent_reviewed']);
const validId = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9._:-]{1,127}$/i.test(s);
const validDept = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,79}$/.test(s);

function safePublicUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      && !url.hostname.endsWith('.local');
  } catch { return false; }
}

const hold = (reason) => ({
  action: 'hold',
  reason,
  candidate: null,
  publication_authority: false,
  outreach_authority: false,
  reverse_research_authority: false
});

/**
 * Project a bounded PUBLIC-SAFE source artifact into an editorial candidate.
 * This does not fetch, run a mission, mutate a ledger or transmit to Harbor.
 * Callbacks MUST be backed by authenticated Systemia registry, receipt and
 * privacy/projection policies. Mock callbacks establish synthetic tests only.
 */
export function prepareSystemiaHarborCandidate(record, checks = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return hold('record_missing');
  const department = record.source_department;
  if (!validDept(department) || department === 'harbor') return hold('invalid_upstream_producer');
  if (record.destination !== 'harbor' || record.via !== 'systemia') return hold('wrong_direction');
  if (record.sensitivity !== 'public') return hold('public_projection_not_established');
  if (!validId(record.mission_id) || !validId(record.artifact_id)
      || !validId(record.revision) || !validId(record.source_receipt_ref)) {
    return hold('source_identity_incomplete');
  }
  if (typeof record.public_safe_summary !== 'string'
      || !record.public_safe_summary.trim()
      || record.public_safe_summary.length > 2400) return hold('summary_invalid');
  if (!REVIEW_STATES.has(record.review_state)) return hold('review_state_missing');
  if (!Array.isArray(record.claims) || !record.claims.length || record.claims.length > 32) {
    return hold('claims_missing_or_unbounded');
  }
  const claims = [];
  for (const claim of record.claims) {
    if (!validId(claim?.claim_id) || typeof claim?.text !== 'string'
        || !claim.text.trim() || claim.text.length > 1200
        || !SOURCE_STATES.has(claim.evidence_state)
        || !Array.isArray(claim.source_urls) || !claim.source_urls.length
        || claim.source_urls.length > 12 || !claim.source_urls.every(safePublicUrl)
        || typeof claim.uncertainty !== 'string' || claim.uncertainty.length > 1200) {
      return hold('claim_evidence_incomplete');
    }
    claims.push({
      claim_id: claim.claim_id, text: claim.text.trim(),
      evidence_state: claim.evidence_state,
      source_urls: [...new Set(claim.source_urls)],
      uncertainty: claim.uncertainty
    });
  }
  // Bind the exact public-facing text and every claim to the trusted source revision.
  // A source receipt which validates only mission/artifact IDs is insufficient.
  const publicPayload = Object.freeze({
    summary: record.public_safe_summary.trim(),
    claims: claims.map((claim) => ({...claim}))
  });
  const receiptIdentity = Object.freeze({
    source_department: department, mission_id: record.mission_id,
    artifact_id: record.artifact_id, revision: record.revision,
    source_receipt_ref: record.source_receipt_ref
  });
  try {
    // False by default. Untrusted booleans on record never satisfy these gates.
    if (checks.isRegisteredProducer?.(department) !== true) return hold('producer_not_verified');
    if (checks.verifySourceReceipt?.(receiptIdentity) !== true) return hold('source_receipt_not_verified');
    if (checks.verifyPublicProjection?.(receiptIdentity, publicPayload) !== true) return hold('privacy_projection_not_verified');
  } catch {
    return hold('trusted_verifier_failed');
  }

  return {
    action: 'staged_for_harbor_review',
    reason: 'verified_upstream_candidate_only',
    candidate: {
      schema: SYSTEMIA_HARBOR_SCHEMA,
      direction: 'department_to_systemia_to_harbor',
      source: receiptIdentity,
      destination: 'harbor',
      public_safe_summary: record.public_safe_summary.trim(),
      review_state: record.review_state,
      claims,
      required_next_gates: [
        'independent_substantive_review_where_required',
        'journal_claim_reactor_and_10_of_10_editorial_gate',
        'media_rights_and_sensitivity_check',
        'systemia_scoped_publication_approval',
        'provider_or_journal_live_readback'
      ],
      publication_authority: false,
      outreach_authority: false,
      research_dispatch_authority: false,
      customer_delivery_authority: false
    },
    publication_authority: false,
    outreach_authority: false,
    reverse_research_authority: false
  };
}


/**
 * Creator-channel branch of the EXISTING Systemia -> Harbor evidence handoff.
 * This takes only independently verified upstream projections and delegates
 * founder-style checks to the canonical policy/example loader. It is not a
 * personal Meta publisher, a human editor, or a source URL fetcher.
 *
 * Additional "upstream_claim_id" bindings are required on each proposed
 * factual creator claim, preventing unreviewed model-generated extra claims
 * from riding alongside an otherwise source-bound upstream artifact.
 */
export function prepareSystemiaFounderCreatorReview({
  upstreamRecord,creatorDraft,trustedChecks={},repoRoot
}={}){
  const hold=(reason,detail=[])=>Object.freeze({
    schema:'evercraft.systemia.harbor.founder-creator-review.v1',
    status:'HOLD',reason,blockers:detail,
    candidate:null,publication_authority:false,personal_account_authority:false,
    media_rights_granted:false,provider_posted:false,editorial_review_completed:false
  });
  const upstream=prepareSystemiaHarborCandidate(upstreamRecord,trustedChecks);
  if(upstream.action!=='staged_for_harbor_review')return hold('unverified_upstream_evidence',[upstream.reason]);
  const c=upstream.candidate;
  const source=creatorDraft?.upstream_source;
  if(!source||Object.keys(c.source).some(k=>source[k]!==c.source[k])||
     Object.keys(source).some(k=>!(k in c.source)))
    return hold('creator_upstream_revision_not_bound');
  if(!Array.isArray(creatorDraft?.claims)||!creatorDraft.claims.length)
    return hold('creator_claims_missing');
  const factualClaims=new Map(c.claims.map(x=>[x.claim_id,x]));
  const creatorSources=new Map((Array.isArray(creatorDraft.sources)?
    creatorDraft.sources:[]).map(s=>[s.id,s.url]));
  const usedClaims=new Set();
  const truthStates={
    verified:new Set(['confirmed','attributed','uncertain']),
    reported:new Set(['attributed','uncertain']),
    observed:new Set(['attributed','uncertain']),
    modeled:new Set(['forecast','uncertain']),
    inferred:new Set(['uncertain']),
    disputed:new Set(['uncertain'])
  };
  for(const item of creatorDraft.claims){
    const matched=factualClaims.get(item.upstream_claim_id);
    if(!matched||usedClaims.has(item.upstream_claim_id))
      return hold('creator_claim_not_in_verified_upstream');
    usedClaims.add(item.upstream_claim_id);
    if(!truthStates[matched.evidence_state]?.has(item.truth_state))
      return hold('creator_claim_truth_state_inflated');
    const resolved=(Array.isArray(item.source_ids)?item.source_ids:[])
      .map(x=>creatorSources.get(x));
    if(!resolved.length||resolved.some(x=>typeof x!=='string')||
       resolved.some(url=>!matched.source_urls.includes(url))||
       new Set(resolved).size!==resolved.length)
      return hold('creator_claim_sources_not_bound_to_upstream');
    if(typeof item.copy_span!=='string'||item.copy_span.length<15||
       !creatorDraft.copy?.includes(item.copy_span))
      return hold('creator_claim_span_not_in_exact_copy');
  }
  // Every submitted source has to be used for one of the verified upstream
  // factual claims. New source claims go through Systemia evidence first.
  const allowed=new Set(c.claims.flatMap(claim=>claim.source_urls));
  if(!Array.isArray(creatorDraft.sources)||
     creatorDraft.sources.some(s=>!allowed.has(s?.url)))
    return hold('creator_extra_unreviewed_source');
  let editorial;
  try{
    editorial=preflightFounderPersonalPost(creatorDraft,
      repoRoot?{repoRoot}:{});
  }catch{
    return hold('canonical_policy_or_candidate_preflight_unavailable');
  }
  if(editorial.status!=='READY_FOR_INDEPENDENT_EDITORIAL_REVIEW')
    return hold('founder_canonical_editorial_preflight_held',editorial.blockers);
  return Object.freeze({
    schema:'evercraft.systemia.harbor.founder-creator-review.v1',
    status:'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW',
    reason:'verified_systemia_projection_and_canonical_founder_preflight',
    blockers:[],
    candidate:{
      schema:'evercraft.creator.editorial-review-handoff.v1',
      upstream_source:{...c.source},
      story_ref:editorial.story_ref,
      exact_copy_sha256:editorial.exact_copy_sha256,
      policy_source_hashes:editorial.canonical_policy_sources,
      founder_example_receipt:editorial.documented_founder_example,
      claim_binding_count:usedClaims.size,
      next_action:'INDEPENDENT_FOUNDER_VOICE_FACT_RIGHTS_AND_PLATFORM_REVIEW',
      // Exact text is already in the owner-private creator draft; this
      // cross-department receipt does not duplicate personal prose.
      contains_personal_copy:false,verified_by_live_systemia:false,
      self_attested_claims_accepted:false
    },
    publication_authority:false,
    personal_account_authority:false,media_rights_granted:false,
    provider_posted:false,editorial_review_completed:false
  });
}
