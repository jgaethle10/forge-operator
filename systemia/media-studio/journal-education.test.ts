import assert from 'node:assert/strict';
import test from 'node:test';
import { compileJournalEducationStage, type JournalFallenProductionBrief } from './journal-education.js';

function validBrief(): JournalFallenProductionBrief {
  return {
    contract: 'evercraft.fallen.journal.production.v1',
    package_key: 'journal:test:volcano',
    mission_key: 'evercraft-journal-newsroom-os-2026-09-28',
    work_key: 'journal-education-package-v1',
    story: {
      title: 'What the Volcano Is Actually Doing',
      education_goal: 'Explain the observed change, its geography and why it matters.',
      desk: 'world',
    },
    evidence: {
      source_refs: ['source:observatory'],
      evidence_refs: ['evidence:signal-001'],
      evidence_state: 'authoritative',
      confidence: 'high',
      freshness_state: 'fresh',
      volatile_claims: [{
        claim_key: 'eruption-status',
        claim: 'Current activity state',
        source_ref: 'source:observatory',
        freshness_state: 'fresh',
      }],
    },
    rights: { visual_rights_state: 'not_required' },
    audience_tracks: ['general'],
    derivative_plan: [{ format: 'youtube_short' }],
    visual_story: {
      id: 'volcano-current-state',
      headline: 'placeholder replaced by canonical title',
      durationSec: 24,
      aspectRatio: '9:16',
      map: {
        centerLat: 46.2,
        centerLon: -122.2,
        zoom: 3,
        points: [{
          id: 'volcano',
          lat: 46.2,
          lon: -122.2,
          label: 'Observed activity',
          evidenceState: 'public_source',
          sourceRefs: ['source:observatory'],
        }],
      },
      metrics: [{
        id: 'signal',
        label: 'Observed signal',
        value: 12,
        unit: 'units',
        evidenceState: 'public_source',
        sourceRefs: ['evidence:signal-001'],
      }],
      timeline: {
        startSec: 0,
        endSec: 24,
        events: [{
          id: 'latest',
          t: 12,
          label: 'Latest verified observation',
          evidenceState: 'public_source',
          sourceRefs: ['source:observatory'],
        }],
      },
    },
  };
}

test('compiles a fresh evidence-bound Journal package into a Fallen stage without publication authority', () => {
  const bundle = compileJournalEducationStage(validBrief());
  assert.equal(bundle.schema, 'evercraft.fallen.journal-stage-bundle.v1');
  assert.equal(bundle.stage.schema, 'evercraft.fallen.visual-stage.v1');
  assert.equal(bundle.stage.height, 1920);
  assert.equal(bundle.stage.width, 1080);
  assert.equal(bundle.stage.layers.some((layer) => layer.kind === 'geo'), true);
  assert.equal(bundle.receipt.status, 'accepted');
  assert.equal(bundle.receipt.publication_authority, false);
  assert.equal(bundle.receipt.package_key, 'journal:test:volcano');
});

test('fails closed on stale Journal current-state knowledge', () => {
  const brief = validBrief();
  brief.evidence.freshness_state = 'stale';
  assert.throws(
    () => compileJournalEducationStage(brief),
    /blocks freshness state: stale/i,
  );
});

test('fails closed when a visual cites evidence outside the approved Journal package', () => {
  const brief = validBrief();
  brief.visual_story.map!.points![0].sourceRefs = ['source:not-in-package'];
  assert.throws(
    () => compileJournalEducationStage(brief),
    /outside the approved package/i,
  );
});

test('requires verified rights before Journal source media enters the Fallen stage', () => {
  const brief = validBrief();
  brief.visual_story.subjectMedia = {
    sourcePath: './tmp/source.mp4',
    mediaKind: 'video',
    evidenceState: 'public_source',
    sourceRefs: ['source:observatory'],
  };
  assert.throws(
    () => compileJournalEducationStage(brief),
    /visual rights are verified/i,
  );
});
