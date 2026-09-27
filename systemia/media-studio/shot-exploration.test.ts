import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileExplorationBatch,
  compileShotExploration,
} from './shot-exploration.js';
import type {
  CreativeCouncilInventory,
  CreativeCouncilReconciliation,
  CreativeShotMission,
} from './creative-council.js';

const worldShot: CreativeShotMission = {
  id: 'creative-scene-1',
  sourceType: 'scene',
  sourceId: 'scene-1',
  beat: 'hook',
  durationSec: 5,
  aspectRatio: '16:9',
  storyPrompt: 'Show battleships and tanks moving through a global intelligence story.',
  intent: 'Open on the actual naval subject and reveal the geography around it.',
  sourcePath: './destroyer.mp4',
  mediaKind: 'video',
  subjectIds: ['naval-vessel'],
  coverage: [
    {
      id: 'coverage-1',
      subjectId: 'naval-vessel',
      subjectLabel: 'naval vessel',
      preferredTreatment: 'documentary_or_verified_visualization',
      minScreenTimeSec: 2.5,
      matchedAssetIds: ['destroyer'],
      status: 'covered',
    },
  ],
  crew: [],
};

test('world-intelligence shot gets genuinely different creative strategies', () => {
  const exploration = compileShotExploration(worldShot, 'genome-1');
  assert.equal(exploration.variants.length, 4);
  assert.deepEqual(
    exploration.variants.map((item) => item.strategy),
    [
      'source_first_documentary',
      'spatial_data_fusion',
      'cinematic_scale',
      'proof_detail',
    ],
  );
  assert.equal(exploration.variants[0]?.syntheticAllowed, false);
  assert.equal(exploration.variants[1]?.syntheticLabelRequired, true);
  assert.match(exploration.variants[0]?.prompt ?? '', /naval vessel/i);
  assert.match(exploration.variants[1]?.prompt ?? '', /Synthetic elements are visualization/i);
});

test('product shot explores real capture, workflow, proof and human context instead of random seeds', () => {
  const productShot: CreativeShotMission = {
    ...worldShot,
    id: 'creative-product',
    storyPrompt: 'Show how RIVET turns an address into an EV charging report.',
    intent: 'Demonstrate the real RIVET workflow and result.',
    subjectIds: [],
    coverage: [],
    sourcePath: './rivet-ui.mp4',
  };

  const exploration = compileShotExploration(productShot, 'genome-2');
  assert.deepEqual(
    exploration.variants.map((item) => item.strategy),
    [
      'product_capture',
      'workflow_spatial',
      'data_proof',
      'human_context',
    ],
  );
  assert.equal(exploration.variants[0]?.acquisitionPolicy, 'product_capture_first');
  assert.match(exploration.variants[0]?.prompt ?? '', /real product/i);
  assert.match(exploration.variants[2]?.prompt ?? '', /result, report, metric/i);
});

test('exploration batch binds variants to the reconciled specialist creative genome', () => {
  const inventory: CreativeCouncilInventory = {
    schema: 'evercraft.fallen.creative-council-inventory.v1',
    projectId: 'project-1',
    title: 'Week in Motion',
    aspectRatio: '16:9',
    durationSec: 5,
    jobs: [
      {
        kind: 'fallen_creative_shot',
        key: worldShot.id,
        shot: worldShot,
      },
    ],
  };

  const reconciliation: CreativeCouncilReconciliation = {
    schema: 'evercraft.fallen.creative-council-reconciliation.v1',
    status: 'reconciled',
    shot_count: 1,
    blocked_shot_count: 0,
    blueprints: [
      {
        shot_id: worldShot.id,
        status: 'ready_for_asset_or_provider_routing',
        missing_roles: [],
        findings: [],
        creative_genome: {
          camera: {
            directives: ['Use foreground, subject and background layers.'],
          },
          art_direction: {
            directives: ['Typography supports the image; it does not become the image.'],
          },
        },
        rejection_contract: ['typewriter_wall', 'flat_card_sequence'],
      },
    ],
  };

  const batch = compileExplorationBatch(inventory, reconciliation);
  assert.equal(batch.shots.length, 1);
  assert.equal(batch.creativeGenomeDigest.length, 64);
  assert.equal(batch.shots[0]?.creativeGenomeDigest.length, 64);
  assert.notEqual(
    batch.shots[0]?.creativeGenomeDigest,
    batch.creativeGenomeDigest,
  );
  assert.match(
    batch.shots[0]?.variants[0]?.prompt ?? '',
    /Use foreground, subject and background layers/i,
  );
  assert.equal(
    batch.shots[0]?.variants[0]?.mustAvoid.includes('typewriter_wall'),
    true,
  );
});
