import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessFallenSignatureQuality,
  FALLEN_SIGNATURE_SCHEMA,
  REQUIRED_CREATIVE_CHECKS,
  REQUIRED_PLAYBACK_CHECKS,
} from './fallen-signature-gate.mjs';

const SHA = 'a'.repeat(64);
const REPORT_SHA = 'b'.repeat(64);
const release = () => ({
  schema: 'evercraft.fallen.client-commercial-release-report.v1',
  status: 'ready_for_client_preview',
  reasons: [],
  masterSha256: SHA,
  reportDigest: REPORT_SHA,
});
const review = () => ({
  schema: FALLEN_SIGNATURE_SCHEMA,
  masterSha256: SHA,
  releaseReportDigest: REPORT_SHA,
  reviewedBy: 'fixture-director',
  reviewedAt: '2026-11-16T19:00:00Z',
  signoffEvidenceRef: 'private-review:director-review',
  overallDecision: 'approved',
  unresolvedDefects: [],
  checks: Object.fromEntries(REQUIRED_CREATIVE_CHECKS.map(name => [
    name, {passed:true,evidenceRef:'private-review:frame-and-story:' + name},
  ])),
  playback: Object.fromEntries(REQUIRED_PLAYBACK_CHECKS.map(name => [
    name, {passed:true,evidenceRef:'private-review:device:' + name},
  ])),
  voiceAudition: {passed:true,evidenceRef:'private-review:voice-take',pronunciationVerified:true},
  noNarrationConfirmed: false,
});
const check = (overrides={}) => assessFallenSignatureQuality({
  release: release(), review: review(), includesNarration: true, ...overrides,
});
test('all signatures, voice audition and playback clear only a client-preview review', () => {
  const result = check();
  assert.equal(result.status, 'signature_ready_for_client_preview');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.masterSha256,SHA);
  assert.match(result.reportDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.boundaries.clientDeliveryAuthorityGranted,false);
  assert.equal(result.boundaries.publicationAuthorityGranted,false);
  assert.equal(result.boundaries.stationSpecificDeliverySpecsNotVerified,true);
});
test('client approved upstream can only become reviewed, never auto-published', () => {
  const upstream = release();
  upstream.status = 'reviewed_for_delivery';
  const result = check({release:upstream});
  assert.equal(result.status,'signature_reviewed_for_delivery');
  assert.equal(result.boundaries.broadcastPlacementAuthorityGranted,false);
});
test('a clean technical master alone cannot obtain a premium label', () => {
  const result = check({review:undefined});
  assert.equal(result.status,'blocked');
  assert.ok(result.reasons.includes('signature_review_schema_invalid'));
  assert.ok(result.reasons.includes('signature_final_decision_not_approved'));
});
test('new encode or updated upstream clearance invalidates an old creative review', () => {
  const original = review();
  const newer = release();
  newer.masterSha256 = 'c'.repeat(64);
  newer.reportDigest = 'd'.repeat(64);
  const result = check({release:newer,review:original});
  assert.ok(result.reasons.includes('signature_review_master_mismatch'));
  assert.ok(result.reasons.includes('signature_review_upstream_changed'));
});
test('bad voice, unverified pronunciation and broken music block with no override', () => {
  const proof = review();
  proof.voiceAudition.pronunciationVerified = false;
  proof.checks.appropriateOriginalOrLicensedMusic.passed = false;
  const result = check({review:proof});
  assert.ok(result.reasons.includes('signature_voice_audition_failed'));
  assert.ok(result.reasons.includes('signature_creative_failed:appropriateOriginalOrLicensedMusic'));
});
test('repetitive shots, placeholder footage and poor motion are hard blockers', () => {
  const proof = review();
  proof.checks.variedShotsWithoutAccidentalRepetition.passed = false;
  proof.checks.noPlaceholderMediaOrVisibleArtifacts.evidenceRef = '';
  proof.checks.intentionalMotionAndPacing.passed = false;
  const result = check({review:proof});
  assert.equal(result.status,'blocked');
  assert.ok(result.reasons.includes('signature_creative_failed:variedShotsWithoutAccidentalRepetition'));
  assert.ok(result.reasons.includes('signature_creative_failed:noPlaceholderMediaOrVisibleArtifacts'));
  assert.ok(result.reasons.includes('signature_creative_failed:intentionalMotionAndPacing'));
});
test('both phone audio and desktop visual playback are mandatory', () => {
  const proof = review();
  proof.playback.phoneSpeaker.passed = false;
  delete proof.playback.desktopScreen;
  const result = check({review:proof});
  assert.ok(result.reasons.includes('signature_playback_failed:phoneSpeaker'));
  assert.ok(result.reasons.includes('signature_playback_failed:desktopScreen'));
});
test('even a signed review cannot hide unresolved defects', () => {
  const proof = review();
  proof.unresolvedDefects = [{severity:'major',note:'voice sounds robotic'}];
  assert.ok(check({review:proof}).reasons.includes('signature_open_defects'));
});
test('nonnarrated commercial requires explicit confirmation of voice scope', () => {
  const proof = review();
  let result = check({review:proof,includesNarration:false});
  assert.ok(result.reasons.includes('signature_no_narration_unconfirmed'));
  proof.noNarrationConfirmed=true;
  result=check({review:proof,includesNarration:false});
  assert.equal(result.status,'signature_ready_for_client_preview');
  assert.ok(check({review:proof,includesNarration:undefined}).reasons.includes('signature_narration_scope_unknown'));
});
test('upstream missing, blocked, or unsigned means no client-ready assertion', () => {
  const upstream=release();
  upstream.status='blocked';
  upstream.reasons=['audio_qc_not_accepted'];
  const proof=review();
  proof.reviewedBy='';
  proof.reviewedAt='garbage';
  proof.signoffEvidenceRef='';
  const result=check({release:upstream,review:proof});
  assert.ok(result.reasons.includes('signature_upstream_not_accepted'));
  assert.ok(result.reasons.includes('signature_upstream_reasons_present'));
  assert.ok(result.reasons.includes('signature_review_unsigned'));
});
