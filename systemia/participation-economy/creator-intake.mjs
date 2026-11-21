// Evercraft public social Home: deterministic creator-story intake projection.
// No auth, media upload, public publication, payments, or payout authority.
export const CREATOR_STORY_SCHEMA = 'evercraft.home.creator-story.v0.1';
const DESTINATIONS = new Set(['home', 'evermaps', 'journal', 'clip']);
const FORMATS = new Set(['documentary', 'historical_story', 'photo_essay', 'research_note']);
const ref = x => typeof x === 'string' && /^[A-Za-z0-9:_./-]{1,160}$/.test(x);
const plain = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max && !/[<>\x00-\x08\x0b\x0e-\x1f]/.test(x);
const unique = xs => new Set(xs).size === xs.length;

/**
 * A pure, caller-asserted intake preview. Review evidence is not authenticated here.
 * All publication decisions require a separate trusted publisher and human policy gates.
 */
export function evaluateCreatorStory({ story, review = null } = {}) {
  if (!story || typeof story !== 'object' || Array.isArray(story)) throw new Error('story_required');
  if (!ref(story.id) || !ref(story.creator_ref) || !ref(story.asset_ref)) throw new Error('story_refs_invalid');
  if (!plain(story.title, 160) || !FORMATS.has(story.format)) throw new Error('story_metadata_invalid');
  if (!Array.isArray(story.destinations) || !story.destinations.length ||
      story.destinations.length > DESTINATIONS.size || !unique(story.destinations) ||
      story.destinations.some(d => !DESTINATIONS.has(d))) throw new Error('story_destinations_invalid');
  if (!Array.isArray(story.source_refs) || story.source_refs.length > 24 ||
      !unique(story.source_refs) || story.source_refs.some(x => !ref(x))) throw new Error('story_sources_invalid');
  // Specific gravesite coordinates and unreviewed living-person details do not
  // belong in this public-facing routing envelope.
  if (['latitude','longitude','coordinates','gps','private_person_data'].some(k => Object.hasOwn(story,k)))
    throw new Error('story_private_location_or_identity_field_forbidden');
  const heritage = story.heritage ?? null;
  if (heritage !== null && (!heritage || typeof heritage !== 'object' || Array.isArray(heritage) ||
      !ref(heritage.cemetery_ref) ||
      !['unverified','cemetery_only','verified_marker'].includes(heritage.location_confidence) ||
      (heritage.marker_ref !== undefined && !ref(heritage.marker_ref)) ||
      (heritage.location_confidence === 'verified_marker' && !ref(heritage.marker_ref)) ||
      Object.keys(heritage).some(k => !['cemetery_ref','marker_ref','location_confidence'].includes(k))))
    throw new Error('story_heritage_record_invalid');
  if (review !== null && (!review || typeof review !== 'object' || Array.isArray(review) ||
      !['approved','rejected','pending'].includes(review.decision) ||
      !ref(review.reviewer_ref) || !ref(review.evidence_ref)))
    throw new Error('story_review_invalid');

  const holds = [];
  if (story.creator_publish_opt_in !== true) holds.push('creator_publication_consent_required');
  if (story.rights_asserted !== true) holds.push('creator_rights_assertion_required');
  if (story.original_work_asserted !== true) holds.push('original_work_assertion_required');
  if (story.contains_private_family_content === true) holds.push('private_family_content_not_publishable');
  if (story.identifies_living_people === true && review?.living_people_privacy_clear !== true)
    holds.push('living_people_privacy_review_required');
  if (review?.decision !== 'approved') holds.push(review?.decision === 'rejected' ? 'editorial_rejected' : 'editorial_review_required');
  if (review?.moderation_clear !== true) holds.push('moderation_review_required');
  if (review?.rights_clear !== true) holds.push('rights_review_required');
  const routes = story.destinations.map(destination => {
    const reasons = [...holds];
    if (destination === 'evermaps') {
      if (!heritage || heritage.location_confidence === 'unverified' || !story.source_refs.length)
        reasons.push('heritage_place_and_source_verification_required');
      if (review?.heritage_clear !== true) reasons.push('heritage_record_review_required');
    }
    if (destination === 'journal') {
      if (!story.source_refs.length || review?.factual_clear !== true)
        reasons.push('journal_source_and_factual_review_required');
    }
    if (destination === 'clip') {
      if (story.format !== 'documentary' || review?.media_clear !== true)
        reasons.push('clip_video_and_media_review_required');
    }
    return {
      destination,
      state: reasons.length ? 'held' : 'candidate_for_trusted_publisher_review',
      hold_reasons: reasons,
      published: false,
    };
  });
  return {
    schema: CREATOR_STORY_SCHEMA,
    story_id: story.id,
    creator_ref: story.creator_ref,
    asset_ref: story.asset_ref,
    title: story.title.trim(),
    format: story.format,
    source_refs: [...story.source_refs],
    heritage: heritage ? { ...heritage } : null,
    routes,
    review_attestation: 'caller_asserted_not_authenticated',
    monetization_state: story.creator_revenue_opt_in === true
      ? 'opted_in_pending_verified_campaign_and_terms'
      : 'not_opted_in',
    campaign_id: null,
    earnings_cents: null,
    payable_cents: null,
    payouts_enabled: false,
    financial_authority_granted: false,
    published: false,
    boundary: 'Review is untrusted input here. No upload, publishing, social account, attribution, payout, or rights transfer occurs.',
  };
}
