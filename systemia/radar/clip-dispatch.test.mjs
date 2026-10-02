import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildRadarFacebookRequest,
  createRadarClipDispatcher
} from './clip-dispatch.mjs';

function pkg(overrides = {}) {
  return {
    schema: 'evercraft.clip.radar-release.v1',
    release_id: 'radar-release:abc123',
    source_edition_id: 'radar-edition:abc123',
    brand: 'evercraft',
    canonical_path: '/radar/releases/systemia-radar-proof/',
    derivatives: [{
      platform: 'facebook',
      copy: 'SYSTEMIA RADAR | REALITY BEFORE NARRATIVE\n\nA material evidence change cleared Radar.',
      character_count: 82,
      source_edition_id: 'radar-edition:abc123'
    }],
    evidence_sha256: 'a'.repeat(64),
    external_action_taken: false,
    ...overrides
  };
}

function response(status, body = {}) {
  return {
    status,
    async text() { return JSON.stringify(body); }
  };
}

test('builds a first-party Clip request bound to the owned Radar release URL', () => {
  const built = buildRadarFacebookRequest({
    clipPackage: pkg(),
    publicOrigin: 'https://fabric.evercraft.example',
    authorizationRef: 'policy:evercraft-radar-autopublish-v1'
  });
  assert.equal(built.status, 'ready');
  assert.equal(built.request.destination, 'facebook-page');
  assert.equal(built.request.brandKey, 'evercraft');
  assert.equal(
    built.request.metadata.link,
    'https://fabric.evercraft.example/radar/releases/systemia-radar-proof/'
  );
  assert.equal(built.request.authorization.approved, true);
});

test('missing owned public origin holds instead of publishing an unusable link', () => {
  const built = buildRadarFacebookRequest({
    clipPackage: pkg(),
    publicOrigin: '',
    authorizationRef: 'policy:evercraft-radar-autopublish-v1'
  });
  assert.equal(built.status, 'hold');
  assert.equal(built.reason, 'radar_public_origin_missing');
});

test('disabled dispatcher records held state without touching provider', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-clip-disabled-'));
  try {
    fs.mkdirSync(path.join(root, 'clip-outbox'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'clip-outbox', 'systemia-radar-proof.json'),
      JSON.stringify(pkg(), null, 2)
    );
    let calls = 0;
    const dispatcher = createRadarClipDispatcher({
      stateDir: root,
      enabled: false,
      publicOrigin: 'https://fabric.evercraft.example',
      authorizationRef: 'policy:evercraft-radar-autopublish-v1',
      fetchImpl: async () => { calls += 1; throw new Error('network must stay quiet'); },
      facebook: {
        pageId: '123',
        pageAccessToken: 'token',
        verified: true
      }
    });
    const run = await dispatcher.runOnce();
    assert.equal(run.published, 0);
    assert.equal(run.held, 1);
    assert.equal(calls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('verified Facebook path publishes once and then dedupes future cycles', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-clip-publish-'));
  try {
    fs.mkdirSync(path.join(root, 'clip-outbox'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'clip-outbox', 'systemia-radar-proof.json'),
      JSON.stringify(pkg(), null, 2)
    );

    let postCalls = 0;
    const fetchImpl = async (url, init = {}) => {
      if (init.method === 'POST') {
        postCalls += 1;
        return response(200, { id: '123_456' });
      }
      if (init.method === 'GET') {
        return response(200, { permalink_url: 'https://www.facebook.com/123/posts/456' });
      }
      throw new Error('unexpected provider request');
    };

    const dispatcher = createRadarClipDispatcher({
      stateDir: root,
      enabled: true,
      publicOrigin: 'https://fabric.evercraft.example',
      authorizationRef: 'policy:evercraft-radar-autopublish-v1',
      fetchImpl,
      facebook: {
        pageId: '123',
        pageAccessToken: 'token',
        verified: true
      }
    });

    const first = await dispatcher.runOnce();
    assert.equal(first.published, 1);
    assert.equal(postCalls, 1);
    assert.equal(first.receipts[0].url, 'https://www.facebook.com/123/posts/456');

    const second = await dispatcher.runOnce();
    assert.equal(second.attempted, 0);
    assert.equal(postCalls, 1);

    const state = dispatcher.state();
    assert.equal(state.outbox[0].receipt.status, 'published');
    assert.equal(state.outbox[0].receipt.remoteId, '123_456');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failed provider outcome is not automatically retried because the outcome may be ambiguous', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-clip-failure-'));
  try {
    fs.mkdirSync(path.join(root, 'clip-outbox'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'clip-outbox', 'systemia-radar-proof.json'),
      JSON.stringify(pkg(), null, 2)
    );

    let postCalls = 0;
    const dispatcher = createRadarClipDispatcher({
      stateDir: root,
      enabled: true,
      publicOrigin: 'https://fabric.evercraft.example',
      authorizationRef: 'policy:evercraft-radar-autopublish-v1',
      fetchImpl: async () => {
        postCalls += 1;
        throw new Error('network_outcome_unknown');
      },
      facebook: {
        pageId: '123',
        pageAccessToken: 'token',
        verified: true
      }
    });

    const first = await dispatcher.runOnce();
    assert.equal(first.failed, 1);
    assert.equal(postCalls, 1);

    const second = await dispatcher.runOnce();
    assert.equal(second.attempted, 0);
    assert.equal(postCalls, 1);

    const retry = await dispatcher.runOnce({ retryFailed: true });
    assert.equal(retry.failed, 1);
    assert.equal(postCalls, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R&B brand is blocked by Clip policy even if an outbox package is tampered', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-clip-blocked-'));
  try {
    fs.mkdirSync(path.join(root, 'clip-outbox'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'clip-outbox', 'systemia-radar-proof.json'),
      JSON.stringify(pkg({ brand: 'rnb-chicken-and-soul' }), null, 2)
    );

    let providerCalls = 0;
    const dispatcher = createRadarClipDispatcher({
      stateDir: root,
      enabled: true,
      publicOrigin: 'https://fabric.evercraft.example',
      authorizationRef: 'policy:evercraft-radar-autopublish-v1',
      fetchImpl: async () => {
        providerCalls += 1;
        return response(200, { id: 'should-not-happen' });
      },
      facebook: {
        pageId: '123',
        pageAccessToken: 'token',
        verified: true
      }
    });

    const run = await dispatcher.runOnce();
    assert.equal(run.failed, 1);
    assert.match(run.receipts[0].error, /brand_blocked/);
    assert.equal(providerCalls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
