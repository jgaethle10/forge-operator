import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import crypto from 'node:crypto';
import { createNotificationFabric } from './fabric.mjs';
import { generateVapidKeys, prepareWebPushRequest } from './web-push.mjs';
import { issueRelaySession, verifyRelaySession } from './session-token.mjs';
import { EventEmitter } from 'node:events';

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
    topic: 'relay_topic_123',
  });
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
  assert.match(request.headers.Authorization, /^vapid t=.+, k=.+$/);
  assert.equal(request.headers.Topic, 'relay_topic_123');
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
  const gatewayReceipt = result.receipts.find((receipt) => receipt.status === 'accepted_by_push_gateway');
  assert.ok(gatewayReceipt);
  assert.equal(gatewayReceipt.attempts, 2);
});


test('server-side product client sends the common intent contract with bearer auth', async () => {
  const { createNotificationClient } = await import('./client.mjs');
  const calls = [];
  const client = createNotificationClient({
    baseUrl: 'https://notify.evercraft.test',
    token: 'secret',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    },
  });
  await client.notify({ product: 'rivet', purpose: 'transactional', title: 'Ready', body: 'Open it' });
  await client.issueSession({ principal_id: 'owner', permissions: ['stream'] });
  await client.enqueue({ id: 'queued-1', product: 'rivet', purpose: 'transactional', title: 'Queued', body: 'Open it' }, { idempotencyKey: 'queued-1' });
  await client.getJob('job/with spaces');
  await client.requeueJob('job-1', { maxAttempts: 4 });
  assert.equal(calls[0].url, 'https://notify.evercraft.test/api/notifications/intents');
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret');
  assert.equal(calls[1].url, 'https://notify.evercraft.test/api/notifications/session-tokens');
  assert.equal(calls[2].init.headers['idempotency-key'], 'queued-1');
  assert.equal(calls[3].url, 'https://notify.evercraft.test/api/notifications/jobs/job%2Fwith%20spaces');
  assert.equal(calls[3].init.method, 'GET');
  assert.equal(calls[4].url, 'https://notify.evercraft.test/api/notifications/jobs/job-1/requeue');
  assert.equal(JSON.parse(calls[4].init.body).max_attempts, 4);
});


test('scoped Relay session tokens enforce expiry and permissions', () => {
  const secret = '0123456789abcdef0123456789abcdef';
  const issued = issueRelaySession({
    principal_id: 'owner',
    permissions: ['stream', 'inbox'],
    audiences: ['company-ops'],
    ttl_seconds: 600,
  }, secret, { now: 1_700_000_000_000 });
  const claims = verifyRelaySession(issued.token, secret, { permission: 'stream', now: 1_700_000_100_000 });
  assert.equal(claims.sub, 'owner');
  assert.deepEqual(claims.audiences, ['company-ops']);
  assert.throws(() => verifyRelaySession(issued.token, secret, { permission: 'ack', now: 1_700_000_100_000 }), /permission denied/);
  assert.throws(() => verifyRelaySession(issued.token, secret, { permission: 'stream', now: 1_700_001_000_000 }), /expired/);
});

test('realtime presence suppresses redundant normal push but critical notifications fan out', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const sent = [];
  const writes = [];
  class FakeResponse extends EventEmitter {
    write(chunk) { writes.push(String(chunk)); return true; }
    end() {}
  }
  const fabric = createNotificationFabric({
    dataDir,
    sendPush: async (_subscription, payload) => {
      sent.push(payload);
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe(makeSubscription());
  fabric.realtimeHub.connect({
    principalId: 'owner',
    res: new FakeResponse(),
    metadata: { audiences: ['company-ops'], products: [] },
  });

  const normal = await fabric.dispatchIntent({
    product: 'rivet',
    purpose: 'transactional',
    priority: 'normal',
    title: 'Ready',
    body: 'Your report is ready',
    recipient_ids: ['owner'],
  });
  assert.equal(normal.realtime_delivered, 1);
  assert.equal(normal.push_suppressed, 1);
  assert.equal(sent.length, 0);
  assert.equal(normal.inboxed, 1);

  const critical = await fabric.dispatchIntent({
    product: 'rivet',
    purpose: 'safety',
    priority: 'critical',
    title: 'Critical',
    body: 'Immediate action required',
    recipient_ids: ['owner'],
  });
  assert.equal(critical.realtime_delivered, 1);
  assert.equal(critical.accepted, 1);
  assert.equal(sent.length, 1);
  fabric.realtimeHub.closeAll();
});

test('audience-only realtime sessions receive Relay notifications without a push subscription', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const writes = [];
  class FakeResponse extends EventEmitter {
    write(chunk) { writes.push(String(chunk)); return true; }
    end() {}
  }
  const fabric = createNotificationFabric({ dataDir, sendPush: async () => ({ ok: true, status: 201 }) });
  fabric.realtimeHub.connect({
    principalId: 'operator-2',
    res: new FakeResponse(),
    metadata: { audiences: ['company-ops'], products: ['journal'] },
  });
  const result = await fabric.dispatchIntent({
    product: 'journal',
    purpose: 'operational',
    priority: 'normal',
    title: 'Journal update',
    body: 'New newsroom package is ready',
    audiences: ['company-ops'],
  });
  assert.equal(result.targeted_principals, 1);
  assert.equal(result.realtime_delivered, 1);
  assert.equal(result.inboxed, 1);
  assert.equal(result.accepted, 0);
  assert.ok(writes.some((chunk) => chunk.includes('Journal update')));
  fabric.realtimeHub.closeAll();
});

test('quiet hours keep normal traffic in inbox while critical traffic bypasses quiet hours', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const sent = [];
  const fabric = createNotificationFabric({
    dataDir,
    now: '2026-09-30T12:00:00.000Z',
    sendPush: async (_subscription, payload) => {
      sent.push(payload);
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe({
    ...makeSubscription(),
    quiet_hours: { enabled: true, start: '00:00', end: '23:59', timezone: 'UTC' },
  });
  const normal = await fabric.dispatchIntent({
    product: 'journal', purpose: 'operational', priority: 'normal', title: 'Normal', body: 'Quiet', recipient_ids: ['owner'],
  });
  assert.equal(normal.push_suppressed, 1);
  assert.equal(sent.length, 0);
  const urgent = await fabric.dispatchIntent({
    product: 'journal', purpose: 'safety', priority: 'critical', title: 'Urgent', body: 'Wake up', recipient_ids: ['owner'],
  });
  assert.equal(urgent.accepted, 1);
  assert.equal(sent.length, 1);
});

test('human acknowledgement is durable and receipt ledger is tamper evident', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const fabric = createNotificationFabric({ dataDir, sendPush: async () => ({ ok: true, status: 201, retryAfter: null }) });
  await fabric.dispatchIntent({
    id: 'notice-ack-1',
    product: 'rivet',
    purpose: 'transactional',
    priority: 'normal',
    title: 'Ready',
    body: 'Open report',
    recipient_ids: ['owner'],
  });
  const ack = fabric.acknowledge('owner', 'notice-ack-1');
  assert.equal(ack.acknowledged_at !== null, true);
  assert.equal(fabric.store.verifyDeliveryLedger().valid, true);

  const ledgerFile = path.join(dataDir, 'delivery-ledger.ndjson');
  const lines = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n');
  const first = JSON.parse(lines[0]);
  first.status = 'tampered';
  lines[0] = JSON.stringify(first);
  fs.writeFileSync(ledgerFile, lines.join('\n') + '\n');
  assert.equal(fabric.store.verifyDeliveryLedger().valid, false);
});


test('attention budget suppresses ordinary OS push while critical traffic bypasses the budget', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const sent = [];
  const fabric = createNotificationFabric({
    dataDir,
    attentionLimits: { transactional: 1 },
    sendPush: async (_subscription, payload) => {
      sent.push(payload);
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe(makeSubscription());

  const first = await fabric.dispatchIntent({
    id: 'budget-1',
    product: 'rivet',
    purpose: 'transactional',
    priority: 'normal',
    title: 'First',
    body: 'First push',
    recipient_ids: ['owner'],
  });
  const second = await fabric.dispatchIntent({
    id: 'budget-2',
    product: 'rivet',
    purpose: 'transactional',
    priority: 'normal',
    title: 'Second',
    body: 'Second push',
    recipient_ids: ['owner'],
  });
  const critical = await fabric.dispatchIntent({
    id: 'budget-critical',
    product: 'rivet',
    purpose: 'safety',
    priority: 'critical',
    title: 'Critical',
    body: 'Critical bypass',
    recipient_ids: ['owner'],
  });

  assert.equal(first.accepted, 1);
  assert.equal(second.accepted, 0);
  assert.equal(second.push_suppressed, 1);
  assert.ok(second.receipts.some((receipt) => receipt.reason === 'attention_budget'));
  assert.equal(critical.accepted, 1);
  assert.equal(sent.length, 2);
});


test('keyed receipt ledger reports HMAC mode and verifies intact receipts', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const fabric = createNotificationFabric({
    dataDir,
    receiptSecret: '0123456789abcdef0123456789abcdef',
    sendPush: async () => ({ ok: true, status: 201, retryAfter: null }),
  });
  await fabric.dispatchIntent({
    id: 'signed-ledger-1',
    product: 'journal',
    purpose: 'operational',
    priority: 'normal',
    title: 'Signed',
    body: 'Receipt proof',
    recipient_ids: ['owner'],
  });
  const head = fabric.store.deliveryLedgerHead();
  const verified = fabric.store.verifyDeliveryLedger();
  assert.equal(head.mode, 'hmac-sha256');
  assert.equal(verified.mode, 'hmac-sha256');
  assert.equal(verified.valid, true);
});


test('multiple devices consume one human attention budget slot', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notify-'));
  const sent = [];
  const fabric = createNotificationFabric({
    dataDir,
    attentionLimits: { transactional: 1 },
    sendPush: async (subscription) => {
      sent.push(subscription.endpoint);
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  const firstDevice = makeSubscription();
  const secondDevice = { ...makeSubscription(), endpoint: 'https://push.example.test/message/456' };
  fabric.subscribe(firstDevice);
  fabric.subscribe(secondDevice);

  const first = await fabric.dispatchIntent({
    id: 'multi-device-1',
    product: 'rivet',
    purpose: 'transactional',
    priority: 'normal',
    title: 'One human event',
    body: 'Fan out to devices',
    recipient_ids: ['owner'],
  });
  const second = await fabric.dispatchIntent({
    id: 'multi-device-2',
    product: 'rivet',
    purpose: 'transactional',
    priority: 'normal',
    title: 'Second human event',
    body: 'Budget should suppress',
    recipient_ids: ['owner'],
  });

  assert.equal(first.accepted, 2);
  assert.equal(second.accepted, 0);
  assert.equal(second.push_suppressed, 2);
  assert.equal(sent.length, 2);
});


test('marketing realtime delivery requires an opted-in subscription', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-marketing-consent-'));
  const writes = [];
  class FakeResponse extends EventEmitter {
    write(chunk) { writes.push(String(chunk)); return true; }
    end() {}
  }
  const fabric = createNotificationFabric({
    dataDir,
    sendPush: async () => ({ ok: true, status: 201, retryAfter: null }),
  });
  fabric.realtimeHub.connect({
    principalId: 'owner',
    res: new FakeResponse(),
    metadata: { audiences: ['company-ops'], products: [] },
  });

  const withoutOptIn = await fabric.dispatchIntent({
    id: 'marketing-no-opt-in',
    product: 'journal',
    purpose: 'marketing',
    priority: 'normal',
    title: 'Newsletter',
    body: 'New issue',
    audiences: ['company-ops'],
    consent_basis: 'explicit_opt_in',
  });
  assert.equal(withoutOptIn.targeted_principals ?? 0, 0);
  assert.equal(withoutOptIn.realtime_delivered, 0);
  assert.equal(writes.some((chunk) => chunk.includes('Newsletter')), false);

  fabric.subscribe({
    ...makeSubscription(),
    preferences: {
      operational: true,
      transactional: true,
      safety: true,
      marketing: true,
    },
  });
  const withOptIn = await fabric.dispatchIntent({
    id: 'marketing-opted-in',
    product: 'journal',
    purpose: 'marketing',
    priority: 'normal',
    title: 'Newsletter allowed',
    body: 'New issue',
    audiences: ['company-ops'],
    consent_basis: 'explicit_opt_in',
  });
  assert.equal(withOptIn.targeted_principals, 1);
  assert.equal(withOptIn.realtime_delivered, 1);
  fabric.realtimeHub.closeAll();
});


test('hung push transports are aborted instead of pinning Relay indefinitely', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-push-timeout-'));
  let aborted = false;
  const fabric = createNotificationFabric({
    dataDir,
    pushAttempts: 1,
    pushTimeoutMs: 250,
    sendPush: async (_subscription, _payload, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      }, { once: true });
    }),
  });
  fabric.subscribe(makeSubscription());
  const started = Date.now();
  const result = await fabric.dispatchIntent({
    id: 'hung-push-1',
    product: 'rivet',
    purpose: 'transactional',
    title: 'Timeout proof',
    body: 'Gateway never answers',
    recipient_ids: ['owner'],
  });
  const elapsed = Date.now() - started;
  assert.equal(aborted, true);
  assert.equal(result.accepted, 0);
  assert.ok(result.receipts.some((receipt) => receipt.status === 'delivery_failed'));
  assert.ok(elapsed < 2000);
});


test('expired business events are refused before inbox or transport delivery', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-expiry-'));
  const sent = [];
  const fabric = createNotificationFabric({
    dataDir,
    now: '2026-10-01T12:00:00.000Z',
    sendPush: async (_subscription, payload) => {
      sent.push(payload);
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe(makeSubscription());
  const result = await fabric.dispatchIntent({
    id: 'stale-1',
    product: 'rivet',
    purpose: 'transactional',
    title: 'Stale report',
    body: 'This should never surface.',
    recipient_ids: ['owner'],
    expires_at: '2026-10-01T11:59:59.000Z',
  });
  assert.equal(result.expired, true);
  assert.equal(result.inboxed, 0);
  assert.equal(result.accepted, 0);
  assert.equal(sent.length, 0);
  assert.equal(fabric.listInbox('owner').length, 0);
  assert.ok(result.receipts.some((receipt) => receipt.status === 'expired'));
});

test('Relay rejects malformed timing, unsafe URLs and oversized data at admission', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-admission-'));
  const fabric = createNotificationFabric({ dataDir, sendPush: async () => ({ ok: true, status: 201 }) });
  const base = { product: 'rivet', purpose: 'transactional', title: 'Valid', body: 'Valid' };
  assert.throws(() => fabric.prepareIntent({ ...base, ttl_seconds: 'banana' }), /ttl_seconds must be an integer/);
  assert.throws(() => fabric.prepareIntent({ ...base, url: 'javascript:alert(1)' }), /credential-free HTTPS URL/);
  assert.throws(() => fabric.prepareIntent({ ...base, body: 'x'.repeat(1201) }), /Notification body exceeds/);
  assert.throws(() => fabric.prepareIntent({ ...base, data: { blob: 'x'.repeat(17000) } }), /16 KiB/);
  assert.throws(() => fabric.prepareIntent({ ...base, recipient_ids: Array.from({ length: 501 }, (_, i) => `user-${i}`) }), /500-item Relay limit/);
});
