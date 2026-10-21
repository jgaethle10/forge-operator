import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFrameDeltas, assessCinematicSignals } from './cinematic-master-audit.mjs';

const policy = {
  minShortEdge: 1080, minFps: 23.9, sampleFps: 2,
  activeFrameDelta: .025, shotChangeDelta: .12,
  minActiveFraction: .30, maxLowChangeRunSec: 4,
};

test('repeated mostly static frames trigger motion observations', () => {
  const metrics = analyzeFrameDeltas([
    .004,.008,.006,.007,.010,.005,.012,.010,.010,.013,.018,
    .014,.005,.006,.010,.020,.008,.010,.013,.008,.009,.17,.020,.010,
  ], policy);
  assert.equal(metrics.longestLowChangeRunSec, 10.5);
  assert.equal(metrics.candidateHardTransitions, 1);
  assert.ok(metrics.activeFraction < .30);
});

test('poor-quality Relay-style export is rejected even when it plays', () => {
  const result = assessCinematicSignals({
    width: 512, height: 908, fps: 30, durationSec: 33.2,
    inspectCoverage: 1, samplePairs: 65, activeFraction: .0923,
    longestLowChangeRunSec: 5, candidateHardTransitions: 2,
  }, policy);
  assert.equal(result.status, 'rejected');
  assert.ok(result.reasons.includes('delivery_resolution_below_cinematic_target'));
  assert.ok(result.observations.includes('low_visual_activity_needs_creative_review'));
  assert.ok(result.observations.includes('extended_low_change_hold_needs_creative_review'));
  assert.equal(result.creativeApprovalGranted, false);
});

test('good render metrics cannot grant creative or publication approval', () => {
  const result = assessCinematicSignals({
    width: 1080, height: 1920, fps: 30, durationSec: 30,
    inspectCoverage: 1, samplePairs: 59, activeFraction: .70,
    longestLowChangeRunSec: 1.5, candidateHardTransitions: 7,
  }, policy);
  assert.equal(result.status, 'creative_review_required');
  assert.equal(result.creativeApprovalGranted, false);
});

test('insufficient evidence fails closed', () => {
  const result = assessCinematicSignals({
    width: 1920, height: 1080, fps: 30, durationSec: 5,
    inspectCoverage: 1, samplePairs: 1, activeFraction: 1,
    longestLowChangeRunSec: 0, candidateHardTransitions: 0,
  }, policy);
  assert.equal(result.status, 'rejected');
  assert.ok(result.reasons.includes('motion_evidence_insufficient'));
});
