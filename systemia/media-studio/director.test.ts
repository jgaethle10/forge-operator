import assert from 'node:assert/strict';
import test from 'node:test';
import { compileFilmPlan } from './director.js';
import type { MediaProject } from './types.js';

const project: MediaProject = {
  id: 'test-project',
  title: 'Test Commercial',
  brief: {
    prompt:
      'Create a sharp commercial for a local service business focused on craftsmanship and a clear call to action.',
    format: 'commercial',
    durationSec: 30,
    aspectRatio: '9:16',
    cta: 'Book your estimate',
  },
  assets: [
    {
      id: 'hero',
      path: './hero.jpg',
      kind: 'image',
      rights: 'owned',
      tags: ['hero', 'brand'],
    },
    {
      id: 'work',
      path: './work.mp4',
      kind: 'video',
      durationSec: 20,
      rights: 'owned',
      tags: ['work', 'detail'],
    },
    {
      id: 'result',
      path: './result.jpg',
      kind: 'image',
      rights: 'owned',
      tags: ['result', 'after'],
    },
  ],
};

test('compileFilmPlan creates an editable story timeline', () => {
  const plan = compileFilmPlan(project);
  assert.equal(plan.schema, 'evercraft.media.plan.v1');
  assert.equal(plan.scenes.length, 5);
  assert.equal(plan.aspectRatio, '9:16');
  assert.equal(plan.scenes.at(-1)?.beat, 'cta');
  assert.equal(plan.scenes.at(-1)?.screenText, 'Book your estimate');
  assert.ok(plan.durationSec > 20 && plan.durationSec <= 30.1);
  assert.equal(plan.provenance.every((record) => record.rights === 'owned'), true);
});

test('restricted assets are rejected', () => {
  assert.throws(() =>
    compileFilmPlan({
      ...project,
      assets: [
        {
          id: 'blocked',
          path: './blocked.jpg',
          kind: 'image',
          rights: 'restricted',
        },
      ],
    }),
  );
});
