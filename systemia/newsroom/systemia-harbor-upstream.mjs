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
  const receiptIdentity = Object.freeze({
    source_department: department, mission_id: record.mission_id,
    artifact_id: record.artifact_id, revision: record.revision,
    source_receipt_ref: record.source_receipt_ref
  });
  try {
    // False by default. Untrusted booleans on record never satisfy these gates.
    if (checks.isRegisteredProducer?.(department) !== true) return hold('producer_not_verified');
    if (checks.verifySourceReceipt?.(receiptIdentity) !== true) return hold('source_receipt_not_verified');
    if (checks.verifyPublicProjection?.(receiptIdentity) !== true) return hold('privacy_projection_not_verified');
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
