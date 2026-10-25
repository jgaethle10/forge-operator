import assert from 'node:assert/strict';
import test from 'node:test';
import { assessClientCommercialRelease, COMMERCIAL_RELEASE_SCHEMA } from './commercial-release-preflight.mjs';

const SHA = 'a'.repeat(64);
const good = () => ({
  schema: COMMERCIAL_RELEASE_SCHEMA,
  order: {
    id: 'fixture-local-brand-001',
    scopeConfirmed: true,
    expectedDurationSec: 30,
    aspectRatio: '9:16',
    channels: ['facebook'],
    includesNarration: true,
  },
  storyboard: { beats: [
    { id: 'intro', role: 'hook', durationSec: 4, purpose: 'Show product within the first seconds' },
    { id: 'proof', role: 'body', durationSec: 20, purpose: 'Show the actual service in action' },
    { id: 'end', role: 'cta', durationSec: 6, purpose: 'Give one real next step' },
  ] },
  renderReceipt: {
    schema: 'evercraft.fallen.timeline-export-receipt.v1',
    sha256: SHA, durationSec: 30, width: 1080, height: 1920, fps: 30,
    videoCodec: 'h264', audioCodec: 'aac', inputAssetIds: ['hero', 'logo', 'music'],
  },
  masterQc: {
    schema: 'evercraft.fallen.master-qc-receipt.v1',
    status: 'accepted', sha256: SHA, measurements: { durationSec: 30, width: 1080, height: 1920 },
  },
  audioQc: {
    schema: 'evercraft.fallen.commercial-audio-qc.v1', status: 'accepted', masterSha256: SHA,
    measurements: { streamCount: 1, integratedLufs: -15.8, truePeakDbtp: -1.6 },
  },
  clipManifest: {
    schema: 'evercraft.clip.media-intake.v1', media: { sha256: SHA },
  },
  productionGrade: {
    schema: 'evercraft.fallen.production-grade-report.v1',
    status: 'accepted',
    beatReports: [
      { beatId: 'intro', status: 'accepted', reasons: [] },
      { beatId: 'proof', status: 'accepted', reasons: [] },
      { beatId: 'end', status: 'accepted', reasons: [] },
    ],
  },
  rights: ['hero', 'logo', 'music'].map(assetId => ({
    assetId, status: 'verified', permittedUses: ['commercial_video'],
    evidenceRef: 'fixture:permission:' + assetId, reviewedBy: 'producer', reviewedAt: '2026-10-25T12:00:00Z',
  })),
  creativeReview: {
    reviewedBy: 'producer', reviewedAt: '2026-10-25T12:00:00Z',
    checks: {
      brandAccurate: true, subjectVisible: true, mobileReadable: true,
      motionAndContinuity: true, factualClaimsVerified: true,
      musicAndVoiceBalanced: true, clearCallToAction: true,
      naturalVoiceAndPronunciation: true,
    },
  },
  clientApproval: { status: 'pending' },
});

test('review-ready package has independent technical and human gates without delivery authority', () => {
  const receipt = assessClientCommercialRelease(good());
  assert.equal(receipt.status, 'ready_for_client_preview');
  assert.deepEqual(receipt.reasons, []);
  assert.equal(receipt.masterSha256, SHA);
  assert.equal(receipt.boundaries.deliveryAuthorityGranted, false);
  assert.equal(receipt.boundaries.publicationAuthorityGranted, false);
  assert.equal(receipt.promotionalReuseAuthorized, false);
  assert.match(receipt.reportDigest, /^[a-f0-9]{64}$/);
});

test('client approval requires evidence and still never grants a send or publish right', () => {
  const input = good();
  input.clientApproval = { status: 'approved' };
  assert.equal(assessClientCommercialRelease(input).status, 'blocked');
  input.clientApproval = { status: 'approved', evidenceRef: 'fixture:client-message', approvedAt: '2026-10-25T12:05:00Z' };
  const result = assessClientCommercialRelease(input);
  assert.equal(result.status, 'reviewed_for_delivery');
  assert.equal(result.boundaries.deliveryAuthorityGranted, false);
  assert.equal(result.promotionalReuseAuthorized, false);
});

test('audio from a different render is rejected even if reported accepted', () => {
  const input = good();
  input.audioQc.masterSha256 = 'b'.repeat(64);
  const receipt = assessClientCommercialRelease(input);
  assert.equal(receipt.status, 'blocked');
  assert.ok(receipt.reasons.includes('audio_digest_mismatch'));
});

test('client footage, music, and logos each require verified commercial-use evidence', () => {
  const input = good();
  input.rights = input.rights.filter(x => x.assetId !== 'music');
  assert.ok(assessClientCommercialRelease(input).reasons.includes('rights_missing_asset:music'));
  input.rights.push({ assetId: 'music', status: 'pending', permittedUses: [], evidenceRef: '', reviewedBy: '', reviewedAt: '' });
  const receipt = assessClientCommercialRelease(input);
  assert.ok(receipt.reasons.includes('rights_not_verified:music'));
  assert.ok(receipt.reasons.includes('rights_commercial_scope_missing:music'));
});

test('a pretty export cannot hide the wrong aspect, short runtime or missing CTA', () => {
  const input = good();
  input.renderReceipt.width = 1920;
  input.renderReceipt.height = 1080;
  input.renderReceipt.durationSec = 26;
  input.storyboard.beats[2].role = 'body';
  const receipt = assessClientCommercialRelease(input);
  assert.ok(receipt.reasons.includes('render_aspect_ratio_mismatch'));
  assert.ok(receipt.reasons.includes('render_duration_mismatch'));
  assert.ok(receipt.reasons.includes('storyboard_missing_cta'));
});

test('unnatural narration, unreadable mobile text or unsigned reviews block release', () => {
  const input = good();
  input.creativeReview.checks.naturalVoiceAndPronunciation = false;
  input.creativeReview.checks.mobileReadable = false;
  input.creativeReview.reviewedBy = '';
  const receipt = assessClientCommercialRelease(input);
  assert.ok(receipt.reasons.includes('creative_review_failed:naturalVoiceAndPronunciation'));
  assert.ok(receipt.reasons.includes('creative_review_failed:mobileReadable'));
  assert.ok(receipt.reasons.includes('creative_review_unsigned'));
});

test('client asks for changes and cannot be marked delivery-reviewed', () => {
  const input = good();
  input.clientApproval = { status: 'changes_requested' };
  assert.ok(assessClientCommercialRelease(input).reasons.includes('client_changes_requested'));
});

test('only separate explicit permission allows periodic customer showcases', () => {
  const input = good();
  input.clientApproval = { status: 'approved', evidenceRef: 'client:approved', approvedAt: '2026-10-25T12:00:00Z' };
  assert.equal(assessClientCommercialRelease(input).promotionalReuseAuthorized, false);
  input.promotionalReuse = { authorized: true, evidenceRef: 'client:promotional-permission' };
  assert.equal(assessClientCommercialRelease(input).promotionalReuseAuthorized, true);
});

test('incomplete input produces blockers rather than a misleading green status', () => {
  const input = good();
  input.audioQc = undefined;
  input.rights = [];
  input.creativeReview = undefined;
  const receipt = assessClientCommercialRelease(input);
  assert.equal(receipt.status, 'blocked');
  assert.ok(receipt.reasons.includes('audio_qc_not_accepted'));
  assert.ok(receipt.reasons.includes('rights_missing_asset:hero'));
  assert.ok(receipt.reasons.includes('creative_review_unsigned'));
});

test('all storyboard beats require accepted production-grade visual coverage', () => {
  const input = good();
  input.productionGrade.beatReports = input.productionGrade.beatReports.filter(x => x.beatId !== 'proof');
  let receipt = assessClientCommercialRelease(input);
  assert.equal(receipt.status, 'blocked');
  assert.ok(receipt.reasons.includes('production_grade_beat_missing:proof'));
  input.productionGrade.beatReports.push({ beatId: 'proof', status: 'rejected', reasons: ['hero_media_missing'] });
  receipt = assessClientCommercialRelease(input);
  assert.ok(receipt.reasons.includes('production_grade_beat_rejected:proof'));
});
