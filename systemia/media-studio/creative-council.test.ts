import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreativeCouncilInventory, CREATIVE_COUNCIL_CREW } from './creative-council.js';
import { runAssignment, reconcile } from './creative-council-saban-adapter.mjs';
import type { FilmPlan } from './types.js';

const plan: FilmPlan = {
  schema: 'evercraft.media.plan.v1',
  projectId: 'week-in-motion-proof',
  title: 'Week in Motion proof',
  prompt: 'Show battleships and tanks as part of a global intelligence segment.',
  format: 'social_short',
  aspectRatio: '16:9',
  durationSec: 10,
  scenes: [
    {
      id: 'scene-1',
      beat: 'hook',
      assetId: 'destroyer-footage',
      sourcePath: './destroyer.mp4',
      mediaKind: 'video',
      durationSec: 5,
      motion: 'cover',
      transition: 'cut',
      intent: 'Open on the actual naval subject.'
    }
  ],
  generationRequests: [
    {
      id: 'gen-semantic-1-armored-vehicle',
      reason: 'semantic_coverage_gap',
      prompt: 'MUST-SHOW visual coverage: tank or armored vehicle.',
      durationSec: 3,
      aspectRatio: '16:9',
      status: 'requested',
      coverageRequirementId: 'coverage-2-armored-vehicle',
      subjectId: 'armored-vehicle'
    }
  ],
  visualCoverage: [
    {
      id: 'coverage-1-naval-vessel',
      subjectId: 'naval-vessel',
      subjectLabel: 'naval vessel',
      preferredTreatment: 'documentary_or_verified_visualization',
      minScreenTimeSec: 2.5,
      matchedAssetIds: ['destroyer-footage'],
      status: 'covered'
    },
    {
      id: 'coverage-2-armored-vehicle',
      subjectId: 'armored-vehicle',
      subjectLabel: 'tank or armored vehicle',
      preferredTreatment: 'documentary_or_verified_visualization',
      minScreenTimeSec: 2.5,
      matchedAssetIds: [],
      status: 'missing'
    }
  ],
  provenance: [],
  warnings: [],
  createdAt: '2026-09-27T00:00:00.000Z'
};

test('creative council inventory turns scenes and semantic gaps into agent-ready shot missions', () => {
  const inventory = buildCreativeCouncilInventory(plan);
  assert.equal(inventory.schema, 'evercraft.fallen.creative-council-inventory.v1');
  assert.equal(inventory.jobs.length, 2);
  assert.equal(CREATIVE_COUNCIL_CREW.length, 10);

  const scene = inventory.jobs.find((job) => job.shot.sourceType === 'scene')?.shot;
  assert.deepEqual(scene?.subjectIds, ['naval-vessel']);

  const generated = inventory.jobs.find(
    (job) => job.shot.sourceType === 'generation_request',
  )?.shot;
  assert.deepEqual(generated?.subjectIds, ['armored-vehicle']);
});

test('creative agents produce visual-first notes and truth boundaries', async () => {
  const inventory = buildCreativeCouncilInventory(plan);
  const shot = inventory.jobs[0];

  const camera = await runAssignment({
    assignment: {
      agent_id: 'camera-1',
      role: 'cinematography_director',
      item: { raw: shot }
    }
  });

  assert.equal(camera.status, 'completed');
  assert.match(camera.proposal.directives.join(' '), /foreground/i);
  assert.match(camera.proposal.reject_if.join(' '), /flat_card_sequence/);

  const truth = await runAssignment({
    assignment: {
      agent_id: 'truth-1',
      role: 'documentary_truth_guard',
      item: { raw: shot }
    }
  });

  assert.equal(truth.proposal.visualization_label_required_if_synthetic, true);
  assert.match(truth.proposal.reject_if.join(' '), /synthetic_presented_as_evidence/);
});

test('reconciliation produces one multi-department shot genome when all creative roles report', async () => {
  const inventory = buildCreativeCouncilInventory(plan);
  const shot = inventory.jobs[0];
  const results = [];

  for (const binding of CREATIVE_COUNCIL_CREW) {
    results.push(
      await runAssignment({
        assignment: {
          agent_id: `agent-${binding.role}`,
          role: binding.role,
          item: { raw: shot }
        }
      })
    );
  }

  const reconciled = await reconcile({
    results,
    plan: { roles: CREATIVE_COUNCIL_CREW.map((item) => item.role) }
  });

  assert.equal(reconciled.status, 'reconciled');
  assert.equal(reconciled.blueprints.length, 1);
  assert.equal(
    reconciled.blueprints[0].status,
    'ready_for_asset_or_provider_routing',
  );
  assert.ok(reconciled.blueprints[0].creative_genome.camera);
  assert.ok(reconciled.blueprints[0].creative_genome.sound);
  assert.ok(reconciled.blueprints[0].creative_genome.beauty);
  assert.ok(reconciled.blueprints[0].rejection_contract.includes('typewriter_wall'));
});
