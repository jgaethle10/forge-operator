import { admitProofFirstOutreach } from '../../../systemia/proof-first-sales/engine.mjs';

/**
 * Rockies Wheel Lab candidate -> shared Systemia Proof-First Sales preflight.
 *
 * Current Wheel Lab capability is SOURCE_ONLY, even when CI and local UI QA pass.
 * The public_https_verified state must come from a future independently verified
 * release receipt in an owned authority, not a string supplied by a prospect row.
 *
 * This adapter cannot send email, publish a URL, mint an approval, or change
 * the Interaction Ledger. It deliberately ignores caller-supplied proof_state
 * and human_approval_state until an attested promotion path is implemented.
 */
export function wheelLabOutreachPreflight(candidate = {}, now = new Date()) {
  const business = String(candidate.business || '').trim();
  const prospect_key = String(candidate.prospect_key || '').trim();
  const publicEvidence = Array.isArray(candidate.public_source_refs)
    ? candidate.public_source_refs.filter(ref => typeof ref === 'string' && /^https:\/\//i.test(ref))
    : [];
  // A shop advertising custom wheels does NOT prove it has a quoting pain.
  const reviewedPainRef = String(candidate.independent_pain_review_ref || '').trim();
  const sourceGrounded = publicEvidence.length > 0 &&
    candidate.public_service_relevance === true &&
    candidate.documented_pain_confirmed === true &&
    /^independent-review:[a-z0-9][a-z0-9:/._-]{7,}$/i.test(reviewedPainRef);

  const base = admitProofFirstOutreach({
    prospect_key,
    business,
    pain_evidence_state: sourceGrounded ? 'source_grounded' : 'unknown',
    proof_state: 'repo_only',
    opted_out: candidate.opted_out === true,
    unanswered_outbound: Number(candidate.unanswered_outbound || 0),
    max_unanswered_outbound: 2,
    cooldown_hours: 72,
    last_outbound_at: candidate.last_outbound_at || null,
    human_approval_state: 'missing',
    human_approval_ref: null
  }, now);

  return {
    ...base,
    public_demo_url: null,
    public_demo_verification_receipt: null,
    interaction_ledger_preflight_receipt: null,
    // A Gmail draft is preparation, not a sent touch or relationship permission.
    drafted_message_is_outreach: false,
    contact_permission: false,
    public_publish_permission: false,
    send_authority: false,
    review_provenance_refs: publicEvidence.slice(0, 8),
    blockers: [
      ...(sourceGrounded ? [] : ['ground_public_relevance']),
      'systemia_canonical_mission_admission',
      'owned_public_https_demo_and_external_canary',
      'interaction_ledger_preflight',
      'exact_message_human_approval',
      'send_permit'
    ],
    note: 'No email, DM, call, contact form or public release is authorized by this result.'
  };
}
