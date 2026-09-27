import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildShotTournamentInventory,
  SHOT_JUDGE_ROLES,
  type ShotCandidate,
  type VisualObservationReceipt,
} from './shot-tournament.js';
import {
  runAssignment,
  reconcile,
} from './shot-tournament-saban-adapter.mjs';

function receipt(
  candidateId: string,
  metric: VisualObservationReceipt['metric'],
  score: number,
  threshold = 0.8,
  subjectId?: string,
): VisualObservationReceipt {
  return {
    schema: 'evercraft.fallen.visual-observation.v1',
    candidateId,
    metric,
    verifierId: `verifier-${metric}`,
    verifierState: 'verified',
    score,
    threshold,
    evidenceRefs: [`evidence:${candidateId}:${metric}`],
    subjectId,
  };
}

function candidate(
  id: string,
  beauty: number,
  subjectScore: number,
  truth: 'observed_source' | 'generated_visualization' = 'observed_source',
): ShotCandidate {
  return {
    id,
    shotId: 'shot-1',
    artifactPath: `./${id}.mp4`,
    artifactDigest: `sha256:${id}`,
    kind: 'video',
    durationSec: 5,
    aspectRatio: '16:9',
    sourceState: truth,
    provenance: 'complete',
    syntheticLabelPresent:
      truth === 'generated_visualization' ? true : undefined,
    subjectIds: ['naval-vessel'],
    observations: [
      receipt(id, 'subject_coverage', subjectScore, 0.85, 'naval-vessel'),
      receipt(id, 'composition', 0.9),
      receipt(id, 'motion_quality', 0.88),
      receipt(id, 'continuity', 0.92),
      receipt(id, 'brand_fidelity', 0.9),
      receipt(id, 'beauty', beauty),
      receipt(id, 'editability', 0.95),
    ],
  };
}

test('shot tournament requires multiple candidates from the same shot', () => {
  assert.throws(() =>
    buildShotTournamentInventory({
      shotId: 'shot-1',
      creativeGenomeDigest: 'genome-1',
      candidates: [candidate('only-one', 0.9, 0.9)],
    }),
  );

  const inventory = buildShotTournamentInventory({
    shotId: 'shot-1',
    creativeGenomeDigest: 'genome-1',
    candidates: [
      candidate('candidate-a', 0.9, 0.9),
      candidate('candidate-b', 0.8, 0.9),
    ],
  });

  assert.equal(inventory.jobs.length, 2);
  assert.deepEqual(inventory.requiredRoles, SHOT_JUDGE_ROLES);
});

test('tournament advances the stronger fully verified candidate', async () => {
  const candidates = [
    candidate('candidate-a', 0.96, 0.94),
    candidate('candidate-b', 0.82, 0.9),
  ];
  const results = [];

  for (const shot of candidates) {
    for (const role of SHOT_JUDGE_ROLES) {
      results.push(
        await runAssignment({
          assignment: {
            agent_id: `agent-${role}-${shot.id}`,
            role,
            item: { raw: { candidate: shot, creativeGenomeDigest: 'genome-1' } },
          },
        }),
      );
    }
  }

  const reconciled = await reconcile({
    results,
    plan: { roles: SHOT_JUDGE_ROLES },
  });

  assert.equal(reconciled.status, 'reconciled');
  assert.equal(reconciled.winner_candidate_id, 'candidate-a');
  assert.equal(reconciled.rankable_candidate_count, 2);
});

test('pretty-but-wrong candidate cannot win when required subject evidence fails', async () => {
  const prettyWrong = candidate('pretty-wrong', 0.99, 0.4);
  const solid = candidate('solid', 0.86, 0.92);
  const results = [];

  for (const shot of [prettyWrong, solid]) {
    for (const role of SHOT_JUDGE_ROLES) {
      results.push(
        await runAssignment({
          assignment: {
            agent_id: `agent-${role}-${shot.id}`,
            role,
            item: { raw: { candidate: shot, creativeGenomeDigest: 'genome-1' } },
          },
        }),
      );
    }
  }

  const reconciled = await reconcile({
    results,
    plan: { roles: SHOT_JUDGE_ROLES },
  });

  assert.equal(reconciled.winner_candidate_id, 'solid');
  assert.equal(
    reconciled.blocked.some(
      (item: any) =>
        item.candidate_id === 'pretty-wrong' &&
        item.hard_fail_roles.includes('subject_coverage_judge'),
    ),
    true,
  );
});

test('missing verified beauty observation blocks rather than inventing a score', async () => {
  const shot = candidate('missing-beauty', 0.9, 0.92);
  shot.observations = shot.observations.filter(
    (item) => item.metric !== 'beauty',
  );

  const result = await runAssignment({
    assignment: {
      agent_id: 'beauty-agent',
      role: 'beauty_judge',
      item: { raw: { candidate: shot, creativeGenomeDigest: 'genome-1' } },
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.score, 0);
  assert.match(result.findings.join(' '), /verified_visual_observation_missing/);
});

test('synthetic visual without a label hard-fails truth', async () => {
  const shot = candidate(
    'synthetic-unlabeled',
    0.95,
    0.95,
    'generated_visualization',
  );
  shot.syntheticLabelPresent = false;

  const result = await runAssignment({
    assignment: {
      agent_id: 'truth-agent',
      role: 'truth_judge',
      item: { raw: { candidate: shot, creativeGenomeDigest: 'genome-1' } },
    },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.hard_fail, true);
  assert.match(
    result.findings.join(' '),
    /synthetic_visualization_label_missing/,
  );
});
