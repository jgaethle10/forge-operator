import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShotSelectionReceipt } from './shot-selection.js';
import { admitProductionResult } from './production-runtime.js';
import type {
  ProductionArtifact,
  ProductionNeed,
  ProductionReceipt,
} from './types.js';
import type { ShotCandidate } from './shot-tournament.js';

const candidate: ShotCandidate = {
  id: 'winner-a',
  shotId: 'shot-1',
  artifactPath: './winner-a.mp4',
  artifactDigest: 'sha256:winner-a',
  kind: 'video',
  durationSec: 6,
  aspectRatio: '16:9',
  sourceState: 'licensed_source',
  provenance: 'complete',
  subjectIds: [],
  observations: [],
};

const tournament = {
  schema: 'evercraft.fallen.shot-tournament-reconciliation.v1' as const,
  status: 'reconciled' as const,
  winner_candidate_id: candidate.id,
  winner_artifact_digest: candidate.artifactDigest,
  creative_genome_digest: 'genome-123',
  candidate_count: 2,
};

test('shot selection receipt seals the exact tournament winner artifact', () => {
  const receipt = buildShotSelectionReceipt({
    needId: 'need-video-1',
    tournament,
    candidates: [candidate],
    selectedAt: '2026-09-27T18:00:00.000Z',
  });

  assert.equal(receipt.candidateId, 'winner-a');
  assert.equal(receipt.artifactDigest, 'sha256:winner-a');
  assert.equal(receipt.creativeGenomeDigest, 'genome-123');
  assert.equal(receipt.tournamentReceiptDigest.length, 64);
});

test('production admission rejects an artifact swapped after tournament selection', () => {
  const need: ProductionNeed = {
    id: 'need-video-1',
    kind: 'video',
    durationSec: 6,
    aspectRatio: '16:9',
    continuityDigest: 'continuity-1',
    requires: ['commercial_rights', 'provenance_receipt', 'timing_control'],
    status: 'planned',
  };

  const selectionReceipt = buildShotSelectionReceipt({
    needId: need.id,
    tournament,
    candidates: [candidate],
    selectedAt: '2026-09-27T18:00:00.000Z',
  });

  const artifact: ProductionArtifact = {
    path: './different-file.mp4',
    digest: 'sha256:different-file',
    kind: 'video',
    durationSec: 6,
    aspectRatio: '16:9',
  };

  const productionReceipt: ProductionReceipt = {
    schema: 'evercraft.fallen.production-receipt.v1',
    needId: need.id,
    departmentId: 'video-dept',
    continuityDigest: need.continuityDigest,
    artifactDigest: artifact.digest,
    commercialRights: 'allowed',
    provenance: 'complete',
    durationSec: 6,
    generatedAt: '2026-09-27T18:00:00.000Z',
  };

  const admission = admitProductionResult({
    need,
    route: {
      needId: need.id,
      status: 'routed',
      departmentId: 'video-dept',
      reason: 'verified',
    },
    artifact,
    receipt: productionReceipt,
    selectionReceipt,
  });

  assert.equal(admission.status, 'rejected');
  assert.match(admission.reasons.join(' '), /tournament-selected shot digest/i);
});
