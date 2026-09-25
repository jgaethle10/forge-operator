import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSeriesContinuity, compileSeriesEpisode } from './series.js';
import type { MediaProject, SeriesBible } from './types.js';

const bible: SeriesBible = {
  schema: 'evercraft.fallen.series-bible.v1',
  id: 'ember-fox-series',
  title: 'The Ember Fox',
  logline: 'A young fox protects a forest whose oldest stories are waking up.',
  styleRules: [
    'Painterly storybook animation with cinematic lighting.',
    'Keep character silhouettes recognizable across every shot.',
  ],
  entities: [
    {
      id: 'ember',
      kind: 'character',
      name: 'Ember',
      description: 'Small fox hero with a warm, alert voice.',
      immutableTraits: {
        species: 'fox',
        coat: 'rust-red',
        eyes: 'amber',
      },
      voiceProfileId: 'voice-ember-v1',
      referenceAssetIds: ['ember-reference'],
    },
    {
      id: 'old-pine',
      kind: 'location',
      name: 'The Old Pine',
      immutableTraits: {
        landmark: 'split-trunk-pine',
      },
    },
  ],
  canon: [
    {
      subjectId: 'ember',
      key: 'home',
      value: 'old-pine',
      locked: true,
      introducedEpisode: 1,
    },
  ],
};

const project: MediaProject = {
  id: 'ember-ep-002',
  title: 'The Lantern in the Rain',
  brief: {
    prompt: 'Create episode two. Ember discovers a lantern after a storm.',
    format: 'episode',
    durationSec: 180,
    aspectRatio: '16:9',
    seriesId: 'ember-fox-series',
    episodeId: 'ember-ep-002',
    episodeNumber: 2,
    style: 'storybook cinematic animation',
    dialogue: [
      {
        speakerId: 'ember',
        text: 'That light was not here yesterday.',
        emotion: 'curious',
      },
    ],
    continuityClaims: [
      { subjectId: 'ember', key: 'coat', value: 'rust-red' },
      { subjectId: 'ember', key: 'home', value: 'old-pine' },
      { subjectId: 'ember', key: 'found-object', value: 'brass-lantern' },
    ],
  },
  assets: [
    {
      id: 'ember-reference',
      path: './fixtures/ember-reference.png',
      kind: 'image',
      rights: 'owned',
      entityRefs: ['ember'],
      tags: ['hero', 'character'],
    },
  ],
};

test('series compiler locks character, voice, canon and synthetic generation prompts', () => {
  const plan = compileSeriesEpisode(project, bible);

  assert.equal(plan.schema, 'evercraft.fallen.series-plan.v1');
  assert.equal(plan.seriesId, 'ember-fox-series');
  assert.equal(plan.episodeId, 'ember-ep-002');
  assert.equal(plan.filmPlan.format, 'episode');
  assert.equal(plan.dialogue[0]?.voiceProfileId, 'voice-ember-v1');
  assert.equal(plan.continuity.status, 'pass');
  assert.equal(plan.canonReceipt.length, 64);
  assert.ok(plan.productionNeeds.some((need) => need.kind === 'video'));
  assert.ok(
    plan.productionNeeds.some(
      (need) =>
        need.kind === 'speech' &&
        need.voiceProfileId === 'voice-ember-v1' &&
        need.requires.includes('voice_profile'),
    ),
  );
  assert.ok(
    plan.filmPlan.generationRequests.every((request) =>
      request.prompt.includes('FALLEN CONTINUITY CONTRACT'),
    ),
  );
  assert.ok(
    plan.proposedCanon.some(
      (fact) =>
        fact.subjectId === 'ember' &&
        fact.key === 'found-object' &&
        fact.value === 'brass-lantern',
    ),
  );
});

test('continuity gate rejects an immutable character redesign', () => {
  const broken: MediaProject = {
    ...project,
    brief: {
      ...project.brief,
      continuityClaims: [
        { subjectId: 'ember', key: 'coat', value: 'snow-white' },
      ],
    },
  };

  assert.throws(
    () => compileSeriesEpisode(broken, bible),
    /Immutable trait violation/,
  );
});

test('continuity gate rejects locked canon contradictions', () => {
  const broken: MediaProject = {
    ...project,
    brief: {
      ...project.brief,
      continuityClaims: [
        { subjectId: 'ember', key: 'home', value: 'harbor-city' },
      ],
    },
  };

  assert.throws(
    () => compileSeriesEpisode(broken, bible),
    /Locked canon violation/,
  );
});

test('continuity gate rejects unknown visual identity references', () => {
  const broken: MediaProject = {
    ...project,
    assets: [
      {
        ...project.assets[0],
        entityRefs: ['not-a-real-character'],
      },
    ],
  };

  const report = checkSeriesContinuity(broken, bible);
  assert.equal(report.status, 'fail');
  assert.ok(
    report.checks.some(
      (check) =>
        check.type === 'asset' &&
        check.subjectId === 'not-a-real-character' &&
        check.status === 'fail',
    ),
  );
});

test('dialogue cannot silently drift to an unlocked voice', () => {
  const noVoiceBible: SeriesBible = {
    ...bible,
    entities: bible.entities.map((entity) =>
      entity.id === 'ember'
        ? { ...entity, voiceProfileId: undefined }
        : entity,
    ),
  };

  assert.throws(
    () => compileSeriesEpisode(project, noVoiceBible),
    /no locked voiceProfileId/,
  );
});
