import assert from 'node:assert/strict';
import test from 'node:test';
import { compileFilmPlan } from './director.js';
import type { MediaProject } from './types.js';

test('creates must-show generation requests for concrete subjects missing from source coverage', () => {
  const project: MediaProject = {
    id: 'world-intel-test',
    brief: {
      prompt: 'Explain battleships, tanks, and wildfire movement around the world.',
      format: 'social_short',
      durationSec: 20,
      aspectRatio: '9:16',
    },
    assets: [
      {
        id: 'brand-card',
        path: './brand-card.png',
        kind: 'image',
        rights: 'owned',
        tags: ['brand', 'title'],
      },
    ],
  };

  const plan = compileFilmPlan(project);
  const missing = plan.visualCoverage?.filter((item) => item.status === 'missing') ?? [];
  assert.equal(missing.length, 3);

  const semantic = plan.generationRequests.filter(
    (request) => request.reason === 'semantic_coverage_gap',
  );
  assert.equal(semantic.length, 3);
  assert.match(semantic.map((request) => request.prompt).join(' '), /naval vessel/i);
  assert.match(semantic.map((request) => request.prompt).join(' '), /tank or armored vehicle/i);
  assert.match(semantic.map((request) => request.prompt).join(' '), /wildfire/i);
  assert.match(semantic.map((request) => request.prompt).join(' '), /do not substitute generic typography/i);
});

test('recognizes concrete source coverage from tags and does not request duplicate synthetic coverage', () => {
  const project: MediaProject = {
    id: 'covered-world-intel-test',
    brief: {
      prompt: 'Show battleships and tanks while explaining force movement.',
      format: 'commercial',
      durationSec: 24,
      aspectRatio: '16:9',
    },
    assets: [
      {
        id: 'destroyer-footage',
        path: './destroyer.mp4',
        kind: 'video',
        durationSec: 12,
        rights: 'licensed',
        tags: ['destroyer', 'warship', 'naval'],
      },
      {
        id: 'armor-footage',
        path: './armor.mp4',
        kind: 'video',
        durationSec: 12,
        rights: 'licensed',
        tags: ['tank', 'armored vehicle'],
      },
      {
        id: 'brand-endcard',
        path: './end.png',
        kind: 'image',
        rights: 'owned',
        tags: ['brand', 'logo'],
      },
    ],
  };

  const plan = compileFilmPlan(project);
  assert.equal(plan.visualCoverage?.every((item) => item.status === 'covered'), true);
  assert.equal(
    plan.generationRequests.some((request) => request.reason === 'semantic_coverage_gap'),
    false,
  );

  const used = new Set(plan.scenes.map((scene) => scene.assetId));
  assert.equal(used.has('destroyer-footage'), true);
  assert.equal(used.has('armor-footage'), true);
});
