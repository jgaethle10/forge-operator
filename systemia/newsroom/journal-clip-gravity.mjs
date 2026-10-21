#!/usr/bin/env node
// Gravity continuity lane: an independently approved Journal story can reach Clip
// without requiring the Journal domain to be online. No recurring auto-fire.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { publishClipSocialPost } from '../clip/social-publisher-runtime.mjs';
import { createFacebookPagePublisherAdapter } from '../clip/facebook-page-publisher.mjs';
import { resolveFacebookPageCredential } from '../clip/facebook-page-credential-resolver.mjs';

const clean = (v) => String(v ?? '').trim();
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const RELEASE_SCHEMA = 'evercraft.journal.clip-gravity-release.v1';
const RECEIPT_SCHEMA = 'evercraft.journal.clip-gravity-receipt.v1';
const DESTINATION = 'facebook-page';

function date(value, field) {
  const result = new Date(value);
  if (!clean(value) || !Number.isFinite(result.getTime())) throw new Error('gravity_' + field + '_invalid');
  return result.getTime();
}
function validSource(input) {
  if (!clean(input?.source_id)) throw new Error('gravity_source_id_missing');
  if (!['verified', 'reported', 'public_source'].includes(clean(input?.evidence_state))) {
    throw new Error('gravity_source_evidence_state_invalid');
  }
  const parsed = new URL(clean(input.url));
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('gravity_source_https_required');
  if (parsed.hostname.endsWith('.base44.app') || parsed.hostname.endsWith('.local')) {
    throw new Error('gravity_source_legacy_provider_blocked');
  }
  date(input.verified_at, 'source_verified_at');
  return parsed;
}

/**
 * This validates an ALREADY approved social release, not an AI draft.
 * The trusted release authority is the Systemia publishing process that creates
 * the release record. A receipt reference alone cannot authorize publication.
 */
export function buildGravityClipFallbackRequest(release, {now = new Date()} = {}) {
  if (release?.schema !== RELEASE_SCHEMA) throw new Error('gravity_release_schema_invalid');
  if (release?.status !== 'approved' || !clean(release.story_id) || !clean(release.title)) {
    throw new Error('gravity_story_not_approved');
  }
  if (release?.sensitivity?.state !== 'public_unclassified') throw new Error('gravity_sensitivity_blocked');
  const risk = clean(release.risk_class);
  if (!['ordinary', 'public_safety'].includes(risk)) throw new Error('gravity_risk_class_required');
  if (release?.editorial_gate?.status !== 'accepted' || Number(release.editorial_gate.score) !== 10) {
    throw new Error('gravity_editorial_10_of_10_required');
  }
  if (release?.systemia_release?.status !== 'accepted' ||
      !clean(release.systemia_release.receipt_ref) ||
      release.systemia_release.publication_authority !== true) {
    throw new Error('gravity_systemia_release_receipt_required');
  }
  const approved = release?.distribution_approval;
  if (approved?.approved !== true || !clean(approved.authorization_ref) ||
      !Array.isArray(approved.destinations) || !approved.destinations.includes(DESTINATION)) {
    throw new Error('gravity_distribution_authority_required');
  }
  const copy = clean(release.approved_copy);
  if (copy.length < 80 || copy.length > 4000) throw new Error('gravity_approved_copy_length_invalid');
  if (clean(approved.copy_sha256) !== sha256(copy)) throw new Error('gravity_approval_copy_digest_mismatch');
  if (/https?:\/\/[^\s]*(?:journal\.evercraft\.global|fabric\.systemiacommandcenters\.com\/journal|base44\.app)/i.test(copy)) {
    throw new Error('gravity_unavailable_journal_link_forbidden');
  }
  const clock = now instanceof Date ? now.getTime() : date(now, 'clock');
  const signedAt = date(release.systemia_release.approved_at, 'systemia_approved_at');
  const expires = date(release.freshness_expires_at, 'freshness_expires_at');
  if (expires <= clock || signedAt > clock + 60000) throw new Error('gravity_release_stale_or_future');
  const distributionApprovedAt = date(approved.approved_at, 'distribution_approved_at');
  if (distributionApprovedAt > clock + 60000) {
    throw new Error('gravity_distribution_approval_future');
  }
  if (risk === 'public_safety') {
    if (release.qualified_public_safety_review?.approved !== true ||
        !clean(release.qualified_public_safety_review.receipt_ref)) {
      throw new Error('gravity_public_safety_human_review_required');
    }
    if (clock - distributionApprovedAt > 60 * 60 * 1000 ||
        clock - signedAt > 2 * 60 * 60 * 1000 ||
        expires - clock > 6 * 60 * 60 * 1000) {
      throw new Error('gravity_public_safety_review_or_expiry_out_of_window');
    }
  }
  const sources = Array.isArray(release.sources) ? release.sources : [];
  if (sources.length < 2) throw new Error('gravity_two_sources_required');
  const hosts = new Set();
  const ids = new Set();
  for (const source of sources) {
    const url = validSource(source);
    if (ids.has(clean(source.source_id))) throw new Error('gravity_source_id_duplicate');
    ids.add(clean(source.source_id));
    hosts.add(url.hostname.replace(/^www\./, ''));
    const verifiedAt = date(source.verified_at, 'source_verified_at');
    if (verifiedAt > clock + 60000) {
      throw new Error('gravity_source_verification_future');
    }
    if (risk === 'public_safety' && clock - verifiedAt > 2 * 60 * 60 * 1000) {
      throw new Error('gravity_public_safety_source_stale');
    }
  }
  if (hosts.size < 2) throw new Error('gravity_independent_sources_required');
  if (!sources.some((source) => copy.includes(clean(source.url)))) {
    throw new Error('gravity_copy_must_link_to_a_verified_source');
  }
  // Every URL in the approved body must be an evidence source, not a third-party
  // redirect or a broken web edition. No anonymous link preflight is skipped.
  const evidenceUrls = new Set(sources.map((s) => clean(s.url)));
  for (const match of copy.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const linked = match[0].replace(/[),.;!?]+$/, '');
    if (!evidenceUrls.has(linked)) throw new Error('gravity_copy_contains_unverified_url');
  }
  if (!clean(release.claims_receipt_ref)) throw new Error('gravity_claims_receipt_required');
  return {
    schema: 'evercraft.clip.social-publish-request.v1',
    id: 'gravity:' + sha256(clean(release.story_id) + ':' + DESTINATION).slice(0,24),
    destination: DESTINATION,
    brandKey: 'evercraft-journal',
    authorization: {
      approved: true,
      authorizationRef: clean(approved.authorization_ref),
    },
    metadata: {
      title: clean(release.title),
      message: copy,
      link: '',
      campaign: 'journal-gravity-continuity',
    },
    lineage: {
      story_id: clean(release.story_id),
      systemia_public_release: clean(release.systemia_release.receipt_ref),
      claims_receipt_ref: clean(release.claims_receipt_ref),
      source_refs: sources.map((s) => clean(s.source_id)),
      mode: 'independent_text_social_no_journal_url',
    },
  };
}

/**
 * A durable claim is written BEFORE any provider call. An interrupted call
 * becomes a manual reconciliation hold, not an automatic duplicate retry.
 */
export async function dispatchGravityClipFallback({
  release, stateRoot, now = new Date(), fire = false,
  resolveCredential = () => resolveFacebookPageCredential(),
  adapterFactory = createFacebookPagePublisherAdapter,
  fetchImpl = globalThis.fetch,
  publisher = publishClipSocialPost,
} = {}) {
  const request = buildGravityClipFallbackRequest(release, {now});
  if (!fire) return {
    schema: RECEIPT_SCHEMA, status: 'preflight_only', request_id: request.id,
    approved_story: request.lineage.story_id, destination: DESTINATION,
    journal_url_required: false, provider_published: false,
  };
  if (!clean(stateRoot)) throw new Error('gravity_durable_state_root_required');
  const root = path.resolve(stateRoot);
  fs.mkdirSync(root, {recursive: true, mode: 0o700});
  const stateFile = path.join(root, request.id + '.json');
  const safeWrite = (value) => {
    const tmp = stateFile + '.new';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
    fs.renameSync(tmp, stateFile);
  };
  if (fs.existsSync(stateFile)) {
    const previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      schema: RECEIPT_SCHEMA, status: 'duplicate_or_reconciliation_hold',
      request_id: request.id, prior_status: previous.status || 'unknown',
      provider_published: previous.provider_published === true,
      prior_receipt: previous.provider_receipt || null,
    };
  }
  const credential = resolveCredential();
  if (credential?.safe_status?.facebook !== 'resolved') {
    throw new Error('gravity_facebook_credential_unavailable');
  }
  const adapter = adapterFactory({
    ...credential.config,
    fetchImpl, verified: true, allowPublish: true,
  });
  const state = {
    schema: RECEIPT_SCHEMA,
    status: 'attempting_manual_reconciliation_if_interrupted',
    request_id: request.id, story_id: request.lineage.story_id,
    started_at: new Date().toISOString(),
    approved_copy_sha256: sha256(request.metadata.message),
    provider_published: false,
    authority_ref: request.authorization.authorizationRef,
    journal_url_required: false,
  };
  // Exclusive claim to guard concurrent processes, not just sequential calls.
  let fd;
  try {
    fd = fs.openSync(stateFile, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n');
    fs.closeSync(fd);
  } catch (err) {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    if (err?.code === 'EEXIST') {
      return {
        schema: RECEIPT_SCHEMA, status: 'duplicate_or_reconciliation_hold',
        request_id: request.id, provider_published: false,
      };
    }
    throw err;
  }
  try {
    const receipt = await publisher({
      request, adapters: [adapter],
      policy: {
        allowPublishing: true,
        allowedDestinations: [DESTINATION],
        blockedBrandKeys: ['rnb-chicken-and-soul'],
      },
    });
    const success = receipt?.status === 'published';
    const final = {
      ...state,
      status: success ? 'provider_published' : 'manual_reconciliation_required',
      provider_published: success,
      provider_receipt: receipt,
      completed_at: new Date().toISOString(),
    };
    safeWrite(final);
    return final;
  } catch (err) {
    const final = {
      ...state, status: 'manual_reconciliation_required',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    };
    safeWrite(final);
    return final;
  }
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: journal-clip-gravity.mjs <approved-release.json> [--fire]');
  const fire = process.argv.includes('--fire');
  const release = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const stateRoot = process.env.EVERCRAFT_CLIP_GRAVITY_STATE_DIR ||
    path.join(os.homedir(), '.local/share/evercraft/journal-clip-gravity');
  const receipt = await dispatchGravityClipFallback({
    release, fire, stateRoot,
    resolveCredential: () => resolveFacebookPageCredential({
      credentialStateDir: process.env.EVERCRAFT_CREDENTIAL_STATE_DIR,
    }),
  });
  console.log(JSON.stringify(receipt, null, 2));
  if (fire && receipt.status !== 'provider_published' &&
      !(receipt.status === 'duplicate_or_reconciliation_hold' && receipt.provider_published)) {
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
