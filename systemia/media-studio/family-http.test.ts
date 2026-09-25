import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerFallenFamilyRoutes } from './family-http.js';

async function withServer(run: (origin: string) => Promise<void>) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  registerFallenFamilyRoutes(app, {
    ai: {
      interactions: {
        create: async () => {
          throw new Error('provider should not be called in this test');
        },
      },
      models: {
        generateVideos: async () => {
          throw new Error('provider should not be called in this test');
        },
      },
      operations: {},
      files: {},
    },
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      INTEGER: 'INTEGER',
    },
    generateContentWithFallback: async () => {
      throw new Error('story provider intentionally unavailable');
    },
    parseGeminiError: (error: any) => ({
      statusCode: 503,
      statusText: 'UNAVAILABLE',
      userMessage: error?.message || 'unavailable',
    }),
    rateLimit: () => (_req, _res, next) => next(),
  });

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test port.');
    await run('http://127.0.0.1:' + String(address.port));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('family quickstart builds a valid episode even when the story provider is unavailable', async () => {
  await withServer(async (origin) => {
    const response = await fetch(origin + '/api/fallen/family/episode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seriesTitle: 'The Family Show',
        episodeTitle: 'The Blanket Fort',
        premise: 'The family builds an enormous blanket fort and the dog keeps stealing the pillows.',
        style: 'Warm 2D storybook cartoon',
        characters: [
          {
            id: 'mom',
            name: 'Mom',
            role: 'Parent',
            description: 'Warm, funny, quick thinker.',
          },
          {
            id: 'kid',
            name: 'Kid',
            role: 'Kid',
            description: 'Curious and energetic.',
          },
        ],
      }),
    });

    const payload: any = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.story.scenes.length, 6);
    assert.equal(payload.data.bible.schema, 'evercraft.fallen.series-bible.v1');
    assert.equal(payload.data.seriesPlan.schema, 'evercraft.fallen.series-plan.v1');
    assert.equal(payload.data.seriesPlan.continuity.status, 'pass');
    assert.equal(payload.data.seriesPlan.canonReceipt.length, 64);
    assert.ok(payload.data.seriesPlan.productionNeeds.length >= 1);
    assert.equal(payload.data.provider.story, 'deterministic-fallback');
  });
});

test('reference imagery fails closed without explicit provider consent', async () => {
  await withServer(async (origin) => {
    const response = await fetch(origin + '/api/fallen/family/character-sheet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        consent: false,
        characters: [
          {
            id: 'mom',
            name: 'Mom',
            photoDataUrl: 'data:image/jpeg;base64,YQ==',
          },
        ],
      }),
    });

    const payload: any = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.match(payload.error, /consent/i);
  });
});
