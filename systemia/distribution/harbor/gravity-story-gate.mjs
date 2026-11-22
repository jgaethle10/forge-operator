import { createHash } from 'node:crypto';

/**
 * Offline, no-network admission gate for proposed Harbor news/entertainment posts.
 *
 * All registry, authorization, publisher, and review inputs MUST be supplied by
 * trusted Evercraft operator infrastructure. Never ingest them from untrusted
 * headlines, creator posts, customer DMs, or a model's unaudited output.
 *
 * Passing this gate does not publish, grant Meta access, approve editorial
 * claims, license media, create Journal content, or send first comments.
 */
export const HARBOR_STORY_SCHEMA = 'evercraft.harbor.live-story.v1';
export const HARBOR_FACEBOOK_JOB_SCHEMA = 'evercraft.harbor.facebook-page-job.v1';

const hash = content => createHash('sha256').update(content).digest('hex');
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isId = value => typeof value === 'string' && /^\d{5,32}$/.test(value);
const BLOCKED_DOMAINS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const FORBIDDEN_PUNCTUATION = /[\u2014\u2013]|--/;
const FROZEN_NAMES = new Set([
  'little red writing press', 'evercraft transparency atlas',
  'r&b chicken & soul', 'space dudz',
]);

function safePublicUrl(value, {ownedJournal = false} = {}) {
  if (!isText(value)) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.port ||
        !host.includes('.') || BLOCKED_DOMAINS.has(host) ||
        host.endsWith('.local') || host.endsWith('.internal') ||
        host.endsWith('.base44.app') || host === 'base44.app' ||
        /^(?:10|127|192\.168)\.\d+\.\d+\.\d+$/.test(host) ||
        /^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return false;
    if (ownedJournal && !/^(?:www\.)?(?:evercraft[a-z0-9-]*\.(?:com|net|org)|systemiacommandcenters\.com)$/.test(host) &&
      !host.endsWith('.systemiacommandcenters.com')) return false;
    return true;
  } catch { return false; }
}

// A newsroom homepage cannot stand in for a missing, article-specific permalink.
function isGenericJournalHome(value) {
  if (!isText(value)) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' &&
      u.hostname === 'fabric.systemiacommandcenters.com' &&
      /^\/journal\/?$/.test(u.pathname);
  } catch { return false; }
}
const PENDING_ARTICLE_PROMISE = /\b(?:filed for release|article link will be added|link will be added in (?:the )?comments|once (?:it|the article) is live)\b/i;
const ARTICLE_SPECIFIC_LANGUAGE = /\b(?:full edition|journal article|the article link|read the article)\b/i;

export function assessHarborGravityStory(story, context = {}) {
  if (story?.schema !== HARBOR_STORY_SCHEMA) throw new Error('gravity_story_schema_invalid');
  const blockers = [];
  const commentBlockers = [];
  const add = (ok, reason) => { if (!ok) blockers.push(reason); };
  const addComment = (ok, reason) => { if (!ok) commentBlockers.push(reason); };

  add(isText(story.story_id) && story.story_id.length <= 160, 'story_id_missing_or_invalid');
  add(isText(story.headline) && story.headline.length <= 250, 'headline_missing_or_invalid');
  const uncertainty = story.uncertainty_label;
  add(['CONFIRMED', 'ATTRIBUTED_DEVELOPING'].includes(uncertainty), 'source_not_editorially_eligible');
  const evidence = Array.isArray(story.evidence) ? story.evidence : [];
  add(evidence.length > 0, 'no_source_evidence');
  for (const [i, e] of evidence.entries()) {
    add(safePublicUrl(e?.source_url), `source_url_invalid_${i}`);
    add(['primary', 'credible_reporting', 'original_creator'].includes(e?.source_kind), `source_kind_invalid_${i}`);
    add(isText(e?.checked_at_utc) && !Number.isNaN(Date.parse(e.checked_at_utc)), `source_checked_at_missing_${i}`);
  }
  add(context.review?.claim_check === 'PASSED', 'trusted_editorial_claim_review_missing');
  add(context.review?.attribution_check === 'PASSED', 'trusted_attribution_review_missing');
  add(context.review?.safety_check === 'PASSED', 'trusted_safety_review_missing');

  const text = story.post?.message;
  add(isText(text) && text.length <= 5000, 'post_message_missing_or_too_long');
  if (isText(text)) {
    add(!FORBIDDEN_PUNCTUATION.test(text), 'publishing_punctuation_standard_failed');
    add(!text.split(/\n\s*\n/).some(p => /^\s*and\b/i.test(p)), 'paragraph_starts_with_and');
  }
  const link = story.post?.link;
  add(link === undefined || safePublicUrl(link), 'post_link_invalid');

  const targets = Array.isArray(story.targets) ? story.targets : [];
  add(targets.length === 1, 'one_target_per_release_packet_required');
  const target = targets[0];
  const id = target?.page_id;
  add(isId(id), 'target_page_id_invalid');
  add(isText(target?.relevance_reason), 'page_relevance_missing');
  const registry = Array.isArray(context.approvedPages) ? context.approvedPages : [];
  const page = registry.find(p => p?.page_id === id);
  add(Boolean(page), 'page_not_in_trusted_registry');
  if (page) {
    add(page.status === 'ACTIVE', 'page_not_active');
    add(page.provider === 'facebook', 'unsupported_publisher_provider');
    add(page.founder_approved === true, 'page_founder_approval_missing');
    add(page.identity_verified === true, 'provider_identity_readback_missing');
    add(isText(page.current_name) && page.current_name === page.approved_name, 'page_approved_name_mismatch');
    add(!FROZEN_NAMES.has(String(page.current_name).toLowerCase().trim()), 'excluded_frozen_or_held_page');
    add(Array.isArray(page.approved_beats) && page.approved_beats.includes(story.category), 'story_outside_page_beat');
  }
  const recent = Array.isArray(context.publishedKeys) ? context.publishedKeys : [];
  const angle = story.post?.angle ?? story.category;
  const dedupKey = isText(story.story_id) && isId(id) && isText(angle)
    ? hash(JSON.stringify([story.story_id, id, angle.trim().toLowerCase(), story.post?.update_version ?? 0])) : null;
  add(Boolean(dedupKey) && !recent.includes(dedupKey), 'duplicate_story_page_angle_update');

  const media = Array.isArray(story.media) ? story.media : [];
  add(story.media_search?.attempted === true, 'media_search_not_recorded');
  if (!media.length) add(story.media_search?.outcome === 'NO_SAFE_MEDIA_FOUND', 'media_missing_without_reason');
  for (const [i, m] of media.entries()) {
    add(safePublicUrl(m?.url), `media_url_invalid_${i}`);
    add(['link-only', 'native-share', 'rights-cleared-reupload', 'original'].includes(m?.usage), `media_usage_invalid_${i}`);
    if (m?.usage === 'rights-cleared-reupload') {
      add(m.rights_status === 'VERIFIED' && isText(m.rights_receipt), `upload_rights_receipt_missing_${i}`);
    }
    if (m?.usage === 'original') {
      add(m.owner_status === 'VERIFIED' && isText(m.owner_receipt), `original_media_ownership_missing_${i}`);
    }
  }
  add(context.review?.media_rights_check === 'PASSED', 'trusted_media_review_missing');

  // No Journal/comment path is allowed to silently authorize the Page post.
  const journal = story.journal || {};
  const journalLive = journal.state === 'JOURNAL_LIVE' && safePublicUrl(journal.canonical_url, {ownedJournal: true}) && context.journal?.urlReadback === journal.canonical_url && context.journal?.editorialAccepted === true;
  // Journal-branded social posts cannot advertise an unserved article.
  // A source-first dispatch remains possible during an editorial backlog, but
  // only when the actual post links to an independently checked original source.
  const isJournalPage = page?.current_name === 'Evercraft Journal';
  if (isJournalPage) {
    add(!PENDING_ARTICLE_PROMISE.test(text || ''), 'journal_unreleased_article_promise_forbidden');
    if (!journalLive) {
      add(!ARTICLE_SPECIFIC_LANGUAGE.test(text || ''), 'journal_article_claim_requires_live_permalink');
      const sourceLinks = evidence.map(e => e?.source_url).filter(isText);
      add(sourceLinks.some(url => text?.includes(url) || link === url),
        'journal_pending_post_must_link_verified_original_source');
    }
    const urlsInText = isText(text) ? [...text.matchAll(/https:\/\/[^\s<>"']+/gi)].map(m => m[0].replace(/[),.;!?]+$/, '')) : [];
    add(!([link, ...urlsInText].some(isGenericJournalHome) && ARTICLE_SPECIFIC_LANGUAGE.test(text || '')),
      'journal_homepage_cannot_replace_article_permalink');
  }

  const comment = story.first_comment || {};
  const providerPostId = context.providerPostId;
  const published = context.publishedPostReceipt || {};
  const publishedKeys = Array.isArray(context.publishedKeys) ? context.publishedKeys : [];
  const postSha256 = isId(id) && isText(text)
    ? hash(JSON.stringify([id, text, link ?? ''])) : null;
  const verifiedOriginalPost = isText(providerPostId) &&
    published.status === 'PUBLISHED' && published.independently_read_back === true &&
    published.provider_post_id === providerPostId && published.page_id === id &&
    published.dedup_key === dedupKey && published.post_sha256 === postSha256 &&
    publishedKeys.includes(dedupKey);
  addComment(journalLive, 'verified_live_owned_journal_missing');
  addComment(comment.state === 'REQUESTED' && comment.target_post_id === providerPostId &&
    isText(providerPostId), 'exact_provider_post_target_missing');
  addComment(verifiedOriginalPost, 'verified_original_post_receipt_missing');
  addComment(context.commentAuthority?.permitted === true, 'separate_comment_authority_missing');
  const approvedComment = `For the full story, original sources, context, and updates: ${journal.canonical_url || ''}`;
  addComment(context.commentAuthority?.approvedTextHash === hash(approvedComment), 'exact_comment_text_approval_missing');
  const commentKey = isText(providerPostId) && journalLive
    ? hash(JSON.stringify([providerPostId, journal.canonical_url])) : null;
  addComment(Boolean(commentKey) &&
    !((Array.isArray(context.sentCommentKeys) ? context.sentCommentKeys : []).includes(commentKey)),
    'duplicate_journal_comment');
  const postReady = blockers.length === 0;
  // A verified original post is intentionally a duplicate for a second Page
  // POST. It may still receive one separately authorized Journal comment.
  // Every other Page/story/review failure must continue to block comments.
  const commentReady = commentBlockers.length === 0 &&
    blockers.every(code => code === 'duplicate_story_page_angle_update');
  return Object.freeze({
    schema: 'evercraft.harbor.gravity-story-assessment.v1',
    status: postReady ? 'READY_FOR_AUTHORIZED_OPERATOR_REVIEW' : 'HOLD',
    blockers, dedup_key: dedupKey,
    post_sha256: postSha256, comment_dedup_key: commentKey,
    page_id: isId(id) ? id : null,
    journal_state: journalLive ? 'VERIFIED_LIVE' : 'PENDING_OR_UNVERIFIED',
    comment_status: commentReady ? 'READY_FOR_SEPARATE_COMMENT_OPERATOR_REVIEW' : 'COMMENT_HELD',
    comment_blockers: commentReady ? [] : commentBlockers,
    // Not dispatched: existing Facebook worker has separate SHA-scoped operator approval.
    facebook_job_candidate: postReady ? {
      schema: HARBOR_FACEBOOK_JOB_SCHEMA, page_id: id, message: text,
      ...(link ? {link} : {}),
    } : null,
    first_comment_candidate: commentReady ? {post_id: context.providerPostId, message: approvedComment} : null,
    publishing_performed: false,
    commenting_performed: false,
  });
}
