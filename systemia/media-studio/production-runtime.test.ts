import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductionRoute } from './departments.js';
import {
  admitProductionResult,
  buildSabanProductionInventory,
  reconcileProductionResults,
} from './production-runtime.js';
import type {
  IdentityEvidence,
  ProductionArtifact,
  ProductionNeed,
  ProductionReceipt,
} from './types.js';

const videoNeed: ProductionNeed = {
  id: 'need-video-1',
  kind: 'video',
  prompt: 'Animate Ember crossing the clearing.',
  durationSec: 6,
  aspectRatio: '16:9',
  continuityEntityIds: ['ember'],
  continuityDigest: 'canon-digest-1',
  requires: [
    'reference_identity',
    'commercial_rights',
    'provenance_receipt',
    'timing_control',
  ],
  status: 'planned',
};

const videoRoute: ProductionRoute = {
  needId: videoNeed.id,
  status: 'routed',
  departmentId: 'video-dept-a',
  departmentName: 'Video Department A',
  score: 420,
  reason: 'verified',
};

const videoArtifact: ProductionArtifact = {
  path: './generated/ember-clearing.mp4',
  digest: 'sha256:video-artifact',
  kind: 'video',
  durationSec: 6.02,
  aspectRatio: '16:9',
};

const videoReceipt: ProductionReceipt = {
  schema: 'evercraft.fallen.production-receipt.v1',
  needId: videoNeed.id,
  departmentId: 'video-dept-a',
  continuityDigest: videoNeed.continuityDigest,
  artifactDigest: videoArtifact.digest,
  commercialRights: 'allowed',
  provenance: 'complete',
  durationSec: 6.02,
  providerModel: 'provider-neutral-proof-model',
  providerRequestId: 'proof-request-001',
  generatedAt: '2026-09-25T20:30:00.000Z',
};

const identityEvidence: IdentityEvidence[] = [
  {
    entityId: 'ember',
    verifierId: 'fallen-identity-verifier-v1',
    verifierState: 'verified',
    score: 0.94,
    threshold: 0.88,
    referenceAssetIds: ['ember-reference'],
    candidateDigest: videoArtifact.digest,
  },
];

test('accepts a generated visual only when route, digest, rights, provenance, timing and identity all agree', () => {
  const admission = admitProductionResult({
    need: videoNeed,
    route: videoRoute,
    artifact: videoArtifact,
    receipt: videoReceipt,
    identityEvidence,
  });

  assert.equal(admission.status, 'accepted');
  assert.deepEqual(admission.reasons, []);
});

test('rejects continuity identity evidence below threshold', () => {
  const admission = admitProductionResult({
    need: videoNeed,
    route: videoRoute,
    artifact: videoArtifact,
    receipt: videoReceipt,
    identityEvidence: [
      {
        ...identityEvidence[0],
        score: 0.71,
      },
    ],
  });

  assert.equal(admission.status, 'rejected');
  assert.match(admission.reasons.join(' '), /identity evidence/i);
});

test('rejects artifact substitution after generation', () => {
  const admission = admitProductionResult({
    need: videoNeed,
    route: videoRoute,
    artifact: {
      ...videoArtifact,
      digest: 'sha256:substituted-file',
    },
    receipt: videoReceipt,
    identityEvidence,
  });

  assert.equal(admission.status, 'rejected');
  assert.match(admission.reasons.join(' '), /artifact digest/i);
});

test('rejects a voice that drifts from the locked voice profile', () => {
  const need: ProductionNeed = {
    id: 'need-speech-1',
    kind: 'speech',
    prompt: 'The lantern is awake.',
    speakerId: 'ember',
    voiceProfileId: 'voice-ember-v1',
    continuityEntityIds: ['ember'],
    continuityDigest: 'canon-digest-1',
    requires: [
      'voice_profile',
      'commercial_rights',
      'provenance_receipt',
      'timing_control',
    ],
    status: 'planned',
  };

  const route: ProductionRoute = {
    needId: need.id,
    status: 'routed',
    departmentId: 'voice-dept-a',
    reason: 'verified',
  };

  const artifact: ProductionArtifact = {
    path: './generated/ember-line.wav',
    digest: 'sha256:speech-artifact',
    kind: 'audio',
    durationSec: 2.4,
  };

  const receipt: ProductionReceipt = {
    schema: 'evercraft.fallen.production-receipt.v1',
    needId: need.id,
    departmentId: 'voice-dept-a',
    continuityDigest: need.continuityDigest,
    artifactDigest: artifact.digest,
    commercialRights: 'allowed',
    provenance: 'complete',
    voiceProfileId: 'voice-somebody-else',
    durationSec: 2.4,
    generatedAt: '2026-09-25T20:30:00.000Z',
  };

  const admission = admitProductionResult({
    need,
    route,
    artifact,
    receipt,
  });

  assert.equal(admission.status, 'rejected');
  assert.match(admission.reasons.join(' '), /locked voice profile/i);
});

test('episode reconciliation fails closed if any production artifact is rejected', () => {
  const accepted = admitProductionResult({
    need: videoNeed,
    route: videoRoute,
    artifact: videoArtifact,
    receipt: videoReceipt,
    identityEvidence,
  });

  const rejected = admitProductionResult({
    need: videoNeed,
    route: videoRoute,
    artifact: videoArtifact,
    receipt: {
      ...videoReceipt,
      commercialRights: 'unknown',
    },
    identityEvidence,
  });

  const result = reconcileProductionResults([accepted, rejected]);
  assert.equal(result.status, 'rejected');
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 1);
});

test('production needs become bounded Saban inventory without changing continuity digests', () => {
  const inventory = buildSabanProductionInventory([videoNeed]);
  assert.equal(inventory.schema, 'evercraft.fallen.saban-production-inventory.v1');
  assert.equal(inventory.jobs.length, 1);
  assert.equal(inventory.jobs[0]?.kind, 'fallen_production_need');
  assert.equal(inventory.jobs[0]?.key, videoNeed.id);
  assert.equal(inventory.jobs[0]?.continuity_digest, videoNeed.continuityDigest);
  assert.equal(inventory.jobs[0]?.need.continuityEntityIds?.[0], 'ember');
});
