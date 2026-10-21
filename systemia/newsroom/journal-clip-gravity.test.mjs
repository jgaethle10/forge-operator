import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildGravityClipFallbackRequest,
  dispatchGravityClipFallback,
} from './journal-clip-gravity.mjs';

const now = new Date('2026-10-21T17:55:00.000Z');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

function release(){
  const copy = 'North Toledo authorities are responding to a hazardous chemical release. Follow the latest official instructions rather than relying on photos of dense fog. Current city updates: https://toledo.oh.gov/news/2026/10/21/hazmat-evacuation-in-north-toledo';
  return {
    schema: 'evercraft.journal.clip-gravity-release.v1',
    story_id: 'journal:toledo-hazmat:2026-10-21',
    title: 'Toledo chemical release: official guidance and evidence boundaries',
    status: 'approved',
    approved_copy: copy,
    sensitivity: {state: 'public_unclassified'},
    editorial_gate: {status: 'accepted', score: 10},
    systemia_release: {
      status: 'accepted', publication_authority: true,
      receipt_ref: 'systemia:journal:toledo:release:1',
      approved_at: '2026-10-21T17:00:00.000Z',
    },
    distribution_approval: {
      approved: true, authorization_ref: 'operator:journal-gravity:2026-10-21',
      destinations: ['facebook-page'],
      approved_at: '2026-10-21T17:05:00.000Z',
      copy_sha256: sha(copy),
    },
    freshness_expires_at: '2026-10-21T23:59:00.000Z',
    claims_receipt_ref: 'systemia:toledo:claim-reactor:1',
    sources: [
      {source_id: 'city', url: 'https://toledo.oh.gov/news/2026/10/21/hazmat-evacuation-in-north-toledo', evidence_state: 'verified', verified_at: '2026-10-21T16:45:00.000Z'},
      {source_id: 'county', url: 'https://lucascountyhealth.com/public-health-advisory-glycidyl-methacrylate-gma-chemical-release-in-toledo/', evidence_state: 'reported', verified_at: '2026-10-21T16:50:00.000Z'},
    ],
  };
}
const opts = {now};
const stateRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'journal-gravity-'));
const credential = () => ({safe_status: {facebook: 'resolved'}, config: {pageId: 'test-page', pageAccessToken: 'test-token'}});
const adapterFactory = () => ({
  destination: 'facebook-page', verified: true,
  async publish(input) {
    assert.equal(input.metadata.link, '');
    assert.match(input.metadata.message, /toledo.oh.gov/);
    return {
      state: 'published', remoteId: 'test_100',
      url: 'https://www.facebook.com/test/posts/100',
      sourceRefs: ['test-provider-receipt'],
    };
  },
});

test('Gravity routes an independently approved source-cited release without requiring Journal', () => {
  const request = buildGravityClipFallbackRequest(release(), opts);
  assert.equal(request.metadata.link, '');
  assert.equal(request.metadata.campaign, 'journal-gravity-continuity');
  assert.equal(request.authorization.approved, true);
  assert.equal(request.lineage.mode, 'independent_text_social_no_journal_url');
  assert.equal(request.lineage.source_refs.length, 2);
});

test('dry run never resolves credentials or calls provider', async () => {
  const result = await dispatchGravityClipFallback({
    release: release(), now, stateRoot: stateRoot(), fire: false,
    resolveCredential: () => { throw new Error('should_not_resolve_credentials'); },
    publisher: () => { throw new Error('should_not_publish'); },
  });
  assert.equal(result.status, 'preflight_only');
  assert.equal(result.provider_published, false);
});

test('no Systemia release, no social publishing', () => {
  const input = release();
  input.systemia_release.publication_authority = false;
  assert.throws(() => buildGravityClipFallbackRequest(input, opts), /systemia_release_receipt_required/);
});

test('rejects a green editorial label without 10 of 10', () => {
  const input = release();
  input.editorial_gate.score = 9;
  assert.throws(() => buildGravityClipFallbackRequest(input, opts), /editorial_10_of_10_required/);
});

test('rejects altered post copy without matching approval digest', () => {
  const input = release();
  input.approved_copy += ' Extra claim.';
  assert.throws(() => buildGravityClipFallbackRequest(input, opts), /approval_copy_digest_mismatch/);
});

test('rejects expired breaking-news releases', () => {
  const input = release();
  input.freshness_expires_at = '2026-10-21T17:00:00Z';
  assert.throws(() => buildGravityClipFallbackRequest(input, opts), /release_stale_or_future/);
});

test('rejects two sources from a single source host', () => {
  const input = release();
  input.sources[1].url = 'https://toledo.oh.gov/emergency';
  assert.throws(() => buildGravityClipFallbackRequest(input, opts), /independent_sources_required/);
});

test('does not share a broken Journal URL with followers', () => {
  const input = release();
  input.approved_copy += ' https://journal.evercraft.global/unavailable';
  input.distribution_approval.copy_sha256 = sha(input.approved_copy);
  assert.throws(() => buildGravityClipFallbackRequest(input, opts), /unavailable_journal_link_forbidden/);
});

test('provider receipt is durable and a second attempt never calls the provider', async () => {
  const dir = stateRoot();
  let calls = 0;
  const publisher = async (args) => {
    calls++;
    const result = await args.adapters[0].publish({metadata: args.request.metadata});
    return {schema: 'evercraft.clip.social-publish-receipt.v1', status: 'published', remoteId: result.remoteId, url: result.url};
  };
  const first = await dispatchGravityClipFallback({
    release: release(), now, stateRoot: dir, fire: true,
    resolveCredential: credential, adapterFactory, publisher,
  });
  assert.equal(first.status, 'provider_published');
  assert.equal(first.provider_published, true);
  const second = await dispatchGravityClipFallback({
    release: release(), now, stateRoot: dir, fire: true,
    resolveCredential: () => {throw new Error('credentials should not be touched');},
    adapterFactory, publisher,
  });
  assert.equal(second.status, 'duplicate_or_reconciliation_hold');
  assert.equal(second.provider_published, true);
  assert.equal(calls, 1);
  assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.json')).length, 1);
});

test('ambiguous or failed publish returns manual reconciliation hold, never blind retry', async () => {
  const dir = stateRoot();
  let calls = 0;
  const args = {
    release: release(), now, stateRoot: dir, fire: true,
    resolveCredential: credential, adapterFactory,
    publisher: async () => {
      calls++;
      throw new Error('provider_timeout_after_possible_publish');
    },
  };
  const first = await dispatchGravityClipFallback(args);
  assert.equal(first.status, 'manual_reconciliation_required');
  assert.equal(first.provider_published, false);
  const second = await dispatchGravityClipFallback(args);
  assert.equal(second.status, 'duplicate_or_reconciliation_hold');
  assert.equal(calls, 1);
});

test('no Facebook credential means zero provider calls', async () => {
  const dir = stateRoot();
  let calls = 0;
  await assert.rejects(() => dispatchGravityClipFallback({
    release: release(), now, stateRoot: dir, fire: true,
    resolveCredential: () => ({safe_status: {facebook: 'missing'}}),
    adapterFactory,
    publisher: async () => {calls++;},
  }), /facebook_credential_unavailable/);
  assert.equal(calls, 0);
});
