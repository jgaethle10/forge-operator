import assert from 'node:assert/strict';
import test from 'node:test';
import {
  routeProductionNeed,
  routeProductionPlan,
  type CreativeDepartment,
} from './departments.js';
import type { ProductionNeed } from './types.js';

const visualNeed: ProductionNeed = {
  id: 'need-shot-1',
  kind: 'video',
  prompt: 'Animate the approved character reference walking through rain.',
  durationSec: 6,
  aspectRatio: '16:9',
  continuityDigest: 'abc123',
  requires: [
    'reference_identity',
    'commercial_rights',
    'provenance_receipt',
    'timing_control',
  ],
  status: 'planned',
};

const departments: CreativeDepartment[] = [
  {
    id: 'unverified-lab',
    name: 'Unverified Lab',
    enabled: true,
    executionState: 'declared',
    capabilities: [
      {
        kind: 'video',
        requirements: [
          'reference_identity',
          'commercial_rights',
          'provenance_receipt',
          'timing_control',
        ],
        maxDurationSec: 30,
        aspectRatios: ['16:9'],
        qualityTier: 5,
        costTier: 1,
        latencyTier: 1,
      },
    ],
  },
  {
    id: 'verified-fast',
    name: 'Verified Fast Department',
    enabled: true,
    executionState: 'verified',
    capabilities: [
      {
        kind: 'video',
        requirements: [
          'reference_identity',
          'commercial_rights',
          'provenance_receipt',
          'timing_control',
        ],
        maxDurationSec: 10,
        aspectRatios: ['16:9', '9:16'],
        qualityTier: 4,
        costTier: 2,
        latencyTier: 1,
      },
    ],
  },
  {
    id: 'verified-cheap-but-incomplete',
    name: 'Verified Incomplete Department',
    enabled: true,
    executionState: 'verified',
    capabilities: [
      {
        kind: 'video',
        requirements: ['commercial_rights', 'provenance_receipt'],
        maxDurationSec: 60,
        aspectRatios: ['16:9'],
        qualityTier: 5,
        costTier: 1,
        latencyTier: 1,
      },
    ],
  },
];

test('router ignores unverified providers even when their declared score is higher', () => {
  const route = routeProductionNeed(visualNeed, departments);
  assert.equal(route.status, 'routed');
  assert.equal(route.departmentId, 'verified-fast');
});

test('router refuses a provider that cannot satisfy continuity requirements', () => {
  const route = routeProductionNeed(visualNeed, [
    departments[2],
  ]);
  assert.equal(route.status, 'blocked');
});

test('router enforces duration and aspect-ratio constraints', () => {
  const tooLong: ProductionNeed = {
    ...visualNeed,
    id: 'need-too-long',
    durationSec: 45,
  };
  const route = routeProductionNeed(tooLong, [
    departments[1],
  ]);
  assert.equal(route.status, 'blocked');
});

test('speech routing requires a verified locked-voice department', () => {
  const speechNeed: ProductionNeed = {
    id: 'need-dialogue-1',
    kind: 'speech',
    prompt: 'We have to go.',
    speakerId: 'ember',
    voiceProfileId: 'voice-ember-v1',
    language: 'en',
    continuityDigest: 'abc123',
    requires: [
      'voice_profile',
      'commercial_rights',
      'provenance_receipt',
      'timing_control',
    ],
    status: 'planned',
  };

  const voiceDepartment: CreativeDepartment = {
    id: 'voice-a',
    name: 'Verified Voice Department',
    enabled: true,
    executionState: 'verified',
    capabilities: [
      {
        kind: 'speech',
        requirements: [
          'voice_profile',
          'commercial_rights',
          'provenance_receipt',
          'timing_control',
        ],
        maxDurationSec: 300,
        languages: ['en', 'es'],
        qualityTier: 5,
        costTier: 3,
        latencyTier: 2,
      },
    ],
  };

  const routes = routeProductionPlan(
    [visualNeed, speechNeed],
    [...departments, voiceDepartment],
  );

  assert.equal(routes[0]?.departmentId, 'verified-fast');
  assert.equal(routes[1]?.departmentId, 'voice-a');
});
