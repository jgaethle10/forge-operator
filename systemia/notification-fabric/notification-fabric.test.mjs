import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import crypto from 'node:crypto';
import { createNotificationFabric } from './fabric.mjs';
import { generateVapidKeys, prepareWebPushRequest } from './web-push.mjs';

function makeSubscription() {
  const receiver = crypto.createECDH('prime256v1');
  receiver.generateKeys();
  return {
    principal_id: 'owner',
    endpoint: 'https://push.example.test/message/123',
    keys: {
      p256dh: receiver.getPublicKey().toString('base64url'),
      auth: crypto.randomBytes(16).toString('base64url'),
    },
    audiences: ['company-ops'],
    preferences: { operational: true, transactional: true, safety: true },
  };
}

test('VAPID keys and encrypted request are standards-shaped', () => {
  const keys = generateVapidKeys();
  assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);
  assert.equal(Buffer.from(keys.privateKey, 'base64url').length, 32);
  const subscription = makeSubscription();
  const request = prepareWebPushRequest(subscription, { title: 'Test', body: 'Hello' }, {
    vapidPublicKey: keys.publicKey,
    vapidPrivateKey: keys.privateKey,
    vapidSubject: 'mailto:ops@example.com',
  });
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
  assert.match(request.headers.Authorization, /^vapid t=.+, k=.+$/);
  assert.ok(request.body.length > 86);
});

test('intent dispatch targets opted-in subscriptions and dedupes repeats', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const sent = [];
  const fabric = createNotificationFabric({
    dataDir,
    vapidPublicKey: 'test-public',
    vapidPrivateKey: 'test-private',
    vapidSubject: 'mailto:ops@example.com',
    sendPush: async (subscription, payload) => {
      sent.push({ subscription, payload });
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe(makeSubscription());
  const first = await fabric.dispatchIntent({
    product: 'rivet', purpose: 'operational', priority: 'high', title: 'RIVET', body: 'Report ready',
    audiences: ['company-ops'], dedupe_key: 'report:123', dedupe_window_seconds: 60,
  });
  const second = await fabric.dispatchIntent({
    product: 'rivet', purpose: 'operational', priority: 'high', title: 'RIVET', body: 'Report ready',
    audiences: ['company-ops'], dedupe_key: 'report:123', dedupe_window_seconds: 60,
  });
  assert.equal(first.delivered, 1);
  assert.equal(second.deduped, true);
  assert.equal(sent.length, 1);
});

test('marketing requires explicit opt-in basis', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const fabric = createNotificationFabric({ dataDir, sendPush: async () => ({ ok: true, status: 201 }) });
  await assert.rejects(() => fabric.dispatchIntent({ purpose: 'marketing', title: 'Sale', body: 'Hello' }), /explicit_opt_in/);
});

test('critical Signal Fabric events become immediate operator push intents', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const sent = [];
  const fabric = createNotificationFabric({
    dataDir,
    sendPush: async (_subscription, payload) => { sent.push(payload); return { ok: true, status: 201 }; },
  });
  fabric.subscribe(makeSubscription());
  const result = await fabric.dispatchSignal({
    product: 'journal', source: 'runtime', status: 'down', evidence_state: 'live_verified',
    impact: 'production_outage', summary: 'Journal is unreachable', recipient: 'company-ops',
  });
  assert.equal(result.decision.severity, 'critical');
  assert.equal(result.push.delivered, 1);
  assert.equal(sent[0].purpose, 'operational');
  assert.equal(sent[0].priority, 'critical');
});


test('transient push failures retry and gateway acceptance is not mislabeled as human delivery', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  let attempts = 0;
  const fabric = createNotificationFabric({
    dataDir,
    sleep: async () => {},
    sendPush: async () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, status: 503, retryAfter: null }
        : { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe(makeSubscription());
  const result = await fabric.dispatchIntent({
    product: 'systemia', purpose: 'operational', title: 'Retry', body: 'Retry proof', audiences: ['company-ops'],
  });
  assert.equal(attempts, 2);
  assert.equal(result.accepted, 1);
  assert.equal(result.receipts[0].status, 'accepted_by_push_gateway');
  assert.equal(result.receipts[0].attempts, 2);
});
