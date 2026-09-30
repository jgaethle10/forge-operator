import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createNotificationFabric } from './fabric.mjs';
import { createRelayOutbox } from './outbox.mjs';
import { createRelayWorker } from './worker.mjs';
import { registerNotificationFabricRoutes } from './http.mjs';

function makeSubscription(principalId = 'owner', endpoint = 'https://push.example.test/message/worker') {
  const receiver = crypto.createECDH('prime256v1');
  receiver.generateKeys();
  return {
    principal_id: principalId,
    endpoint,
    keys: {
      p256dh: receiver.getPublicKey().toString('base64url'),
      auth: crypto.randomBytes(16).toString('base64url'),
    },
    audiences: ['company-ops'],
    preferences: { operational: true, transactional: true, safety: true },
  };
}

test('outbox deduplicates producer retries by idempotency key', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-outbox-'));
  const outbox = createRelayOutbox({ dataDir });
  const first = outbox.enqueue({
    kind: 'intent',
    idempotency_key: 'rivet-report-123',
    payload: { intent: { id: 'notice-1' } },
    now: 1_000,
  });
  const second = outbox.enqueue({
    kind: 'intent',
    idempotency_key: 'rivet-report-123',
    payload: { intent: { id: 'notice-1' } },
    now: 2_000,
  });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);
  assert.equal(outbox.stats().total, 1);
});

test('expired worker leases are recovered after process death', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-outbox-'));
  const outbox = createRelayOutbox({ dataDir });
  const job = outbox.enqueue({
    kind: 'intent',
    payload: { intent: { id: 'recover-me' } },
    now: 10_000,
  });
  const firstClaim = outbox.claim({ worker_id: 'worker-a', lease_ms: 1_000, now: 10_000 });
  assert.equal(firstClaim.length, 1);
  assert.equal(firstClaim[0].id, job.id);

  const tooEarly = outbox.claim({ worker_id: 'worker-b', lease_ms: 1_000, now: 10_999 });
  assert.equal(tooEarly.length, 0);

  const recovered = outbox.claim({ worker_id: 'worker-b', lease_ms: 1_000, now: 11_001 });
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, job.id);
  assert.equal(recovered[0].recovery_count, 1);
  assert.equal(recovered[0].attempts, 2);
  assert.equal(recovered[0].failures, 0);
});

test('worker retries failures with backoff then completes without losing the job', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-worker-'));
  const outbox = createRelayOutbox({ dataDir });
  let dispatches = 0;
  const fabric = {
    dispatchIntent: async (intent) => {
      dispatches += 1;
      if (dispatches === 1) throw new Error('temporary outage');
      return { intent, accepted: 1, realtime_delivered: 0, inboxed: 1, targeted_principal_ids: ['owner'] };
    },
    dispatchSignal: async () => ({}),
    store: {
      getInboxItem: () => null,
      recordDelivery: () => ({}),
    },
  };
  const worker = createRelayWorker({ fabric, outbox, workerId: 'worker-retry' });
  const job = outbox.enqueue({
    kind: 'intent',
    payload: { intent: { id: 'retry-1', title: 'Retry' } },
    max_attempts: 3,
    now: 50_000,
  });

  const first = await worker.runOnce({ now: 50_000 });
  assert.equal(first.results[0].status, 'retry');
  assert.equal(outbox.get(job.id).status, 'retry');

  const early = await worker.runOnce({ now: 50_999 });
  assert.equal(early.claimed, 0);

  const second = await worker.runOnce({ now: 51_000 });
  assert.equal(second.results[0].status, 'completed');
  assert.equal(outbox.get(job.id).status, 'completed');
  assert.equal(dispatches, 2);
});

test('poison jobs enter a dead-letter state instead of retrying forever', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-worker-'));
  const outbox = createRelayOutbox({ dataDir });
  const fabric = {
    dispatchIntent: async () => { throw new Error('permanent poison'); },
    dispatchSignal: async () => ({}),
    store: {
      getInboxItem: () => null,
      recordDelivery: () => ({}),
    },
  };
  const worker = createRelayWorker({ fabric, outbox, workerId: 'worker-dead' });
  const job = outbox.enqueue({
    kind: 'intent',
    payload: { intent: { id: 'poison-1' } },
    max_attempts: 2,
    now: 100_000,
  });

  await worker.runOnce({ now: 100_000 });
  assert.equal(outbox.get(job.id).status, 'retry');
  await worker.runOnce({ now: 101_000 });
  assert.equal(outbox.get(job.id).status, 'dead_letter');
  assert.match(outbox.get(job.id).last_error, /permanent poison/);
});

test('unacknowledged critical work escalates and later acknowledgement stops the ladder', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-worker-'));
  const sent = [];
  const fabric = createNotificationFabric({
    dataDir,
    sendPush: async (_subscription, payload) => {
      sent.push(payload);
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe(makeSubscription());
  const outbox = createRelayOutbox({ dataDir });
  const worker = createRelayWorker({ fabric, outbox, workerId: 'worker-ack' });
  const intent = fabric.prepareIntent({
    id: 'critical-ack-1',
    product: 'systemia',
    purpose: 'operational',
    priority: 'critical',
    title: 'Production outage',
    body: 'A critical production path is down.',
    recipient_ids: ['owner'],
    acknowledgement: {
      required: true,
      mode: 'any',
      within_seconds: 15,
      max_escalations: 2,
      escalation_interval_seconds: 15,
      title_prefix: 'STILL UNACKNOWLEDGED',
    },
  });
  const job = outbox.enqueue({
    kind: 'intent',
    payload: { intent },
    idempotency_key: 'critical-ack-1',
    now: 1_000_000,
  });

  await worker.runOnce({ now: 1_000_000 });
  assert.equal(outbox.get(job.id).status, 'completed');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].acknowledgement.required, true);
  assert.equal(sent[0].acknowledgement.due_at, new Date(1_015_000).toISOString());

  const firstWatch = Object.values(JSON.parse(fs.readFileSync(outbox.file, 'utf8')).jobs)
    .find((entry) => entry.kind === 'ack_watch' && entry.payload?.escalation_level === 1);
  assert.ok(firstWatch);
  assert.equal(Date.parse(firstWatch.not_before_at), 1_015_000);

  await worker.runOnce({ now: 1_015_000 });
  assert.equal(sent.length, 2);
  assert.match(sent[1].title, /^STILL UNACKNOWLEDGED:/);

  const acknowledged = fabric.acknowledge('owner', 'critical-ack-1');
  assert.ok(acknowledged?.acknowledged_at);

  await worker.runOnce({ now: 1_030_000 });
  assert.equal(sent.length, 2);
  const secondWatch = Object.values(JSON.parse(fs.readFileSync(outbox.file, 'utf8')).jobs)
    .find((entry) => entry.kind === 'ack_watch' && entry.payload?.escalation_level === 2);
  assert.equal(secondWatch.status, 'completed');
  assert.equal(secondWatch.result.status, 'acknowledged');
});

test('stable Web Push Topic is reused for the same logical notification', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-topic-'));
  const topics = [];
  const fabric = createNotificationFabric({
    dataDir,
    sendPush: async (_subscription, _payload, options) => {
      topics.push(options.topic);
      return { ok: true, status: 201, retryAfter: null };
    },
  });
  fabric.subscribe(makeSubscription());
  await fabric.dispatchIntent({
    id: 'same-logical-event',
    product: 'rivet',
    purpose: 'transactional',
    title: 'Report',
    body: 'Ready',
    recipient_ids: ['owner'],
  });
  await fabric.dispatchIntent({
    id: 'same-logical-event',
    product: 'rivet',
    purpose: 'transactional',
    title: 'Report',
    body: 'Ready again',
    recipient_ids: ['owner'],
  });
  assert.equal(topics.length, 2);
  assert.equal(topics[0], topics[1]);
  assert.match(topics[0], /^[A-Za-z0-9_-]{1,32}$/);
});


test('idempotency key reuse with different content is rejected', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-idempotency-'));
  const outbox = createRelayOutbox({ dataDir });
  outbox.enqueue({
    kind: 'intent',
    idempotency_key: 'same-key',
    fingerprint_source: { report_id: 'a' },
    payload: { intent: { id: 'a' } },
    now: 1_000,
  });
  assert.throws(() => outbox.enqueue({
    kind: 'intent',
    idempotency_key: 'same-key',
    fingerprint_source: { report_id: 'b' },
    payload: { intent: { id: 'b' } },
    now: 2_000,
  }), /different request/);
});

test('dead letters can be explicitly requeued with a fresh attempt budget', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-requeue-'));
  const outbox = createRelayOutbox({ dataDir });
  const fabric = {
    dispatchIntent: async () => { throw new Error('still bad'); },
    dispatchSignal: async () => ({}),
    store: { getInboxItem: () => null, recordDelivery: () => ({}) },
  };
  const worker = createRelayWorker({ fabric, outbox, workerId: 'worker-requeue' });
  const job = outbox.enqueue({
    kind: 'intent',
    payload: { intent: { id: 'dead-requeue-1' } },
    max_attempts: 1,
    now: 5_000,
  });
  await worker.runOnce({ now: 5_000 });
  assert.equal(outbox.get(job.id).status, 'dead_letter');
  const requeued = outbox.requeueDeadLetter(job.id, { now: 6_000, max_attempts: 3 });
  assert.equal(requeued.status, 'retry');
  assert.equal(requeued.attempts, 0);
  assert.equal(requeued.failures, 0);
  assert.equal(requeued.max_attempts, 3);
  assert.equal(requeued.dead_lettered_at, null);
});

test('outbox pruning removes only old terminal jobs and releases idempotency keys', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-prune-'));
  const outbox = createRelayOutbox({ dataDir });
  const old = outbox.enqueue({
    kind: 'intent',
    idempotency_key: 'old-terminal-key',
    payload: { intent: { id: 'old' } },
    now: 1_000,
  });
  outbox.complete(old.id, { ok: true }, { now: 2_000 });
  const live = outbox.enqueue({
    kind: 'intent',
    idempotency_key: 'live-key',
    payload: { intent: { id: 'live' } },
    now: 3_000,
  });
  const result = outbox.prune({
    now: 100_000,
    completed_retention_ms: 60_000,
    dead_retention_ms: 60_000,
    max_retained: 100,
  });
  assert.equal(result.removed, 1);
  assert.equal(outbox.get(old.id), null);
  assert.ok(outbox.get(live.id));
  const reused = outbox.enqueue({
    kind: 'intent',
    idempotency_key: 'old-terminal-key',
    payload: { intent: { id: 'new' } },
    now: 101_000,
  });
  assert.equal(reused.duplicate, false);
});

test('acknowledgement target reconstruction survives a deduped recovery result', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-ack-recovery-'));
  const outbox = createRelayOutbox({ dataDir });
  const receipts = [];
  const fabric = {
    dispatchIntent: async (intent) => ({
      intent,
      deduped: true,
      accepted: 0,
      realtime_delivered: 0,
      inboxed: 0,
      targeted_principal_ids: [],
    }),
    dispatchSignal: async () => ({}),
    resolvePrincipals: () => ['owner'],
    store: {
      getInboxItem: () => ({ id: 'recover-ack', acknowledged_at: null }),
      recordDelivery: (event) => { receipts.push(event); return event; },
    },
  };
  const worker = createRelayWorker({ fabric, outbox, workerId: 'worker-ack-recovery' });
  const job = outbox.enqueue({
    kind: 'intent',
    payload: {
      intent: {
        id: 'recover-ack',
        title: 'Recover',
        body: 'Recover',
        acknowledgement: {
          required: true,
          within_seconds: 15,
          max_escalations: 1,
          escalation_interval_seconds: 15,
        },
      },
    },
    now: 10_000,
  });
  await worker.runOnce({ now: 10_000 });
  const jobs = Object.values(JSON.parse(fs.readFileSync(outbox.file, 'utf8')).jobs);
  const watch = jobs.find((entry) => entry.kind === 'ack_watch');
  assert.ok(watch);
  assert.deepEqual(watch.payload.principal_ids, ['owner']);
});


test('registered Relay runtime exposes canonical durable enqueue without leaking outbox internals to products', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-runtime-'));
  const app = {
    use() {},
    get() {},
    post() {},
    delete() {},
  };
  const relay = registerNotificationFabricRoutes(app, {
    dataDir,
    workerEnabled: false,
    ingestToken: 'test-ingest-token',
    sendPush: async () => ({ ok: true, status: 201, retryAfter: null }),
  });
  const raw = {
    id: 'runtime-enqueue-1',
    product: 'rivet',
    purpose: 'transactional',
    title: 'Report ready',
    body: 'Your RIVET report is ready.',
    recipient_ids: ['owner'],
  };
  const first = relay.enqueueIntent(raw, { idempotencyKey: 'rivet:runtime-enqueue-1' });
  const second = relay.enqueueIntent(raw, { idempotencyKey: 'rivet:runtime-enqueue-1' });
  assert.equal(first.job.duplicate, false);
  assert.equal(second.job.duplicate, true);
  assert.equal(first.job.id, second.job.id);
  assert.equal(first.intent.id, 'runtime-enqueue-1');
  assert.equal(relay.outbox.get(first.job.id).kind, 'intent');
});


test('repeated lease recovery does not exhaust the real failure budget', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-crash-budget-'));
  const outbox = createRelayOutbox({ dataDir });
  const job = outbox.enqueue({
    kind: 'intent',
    payload: { intent: { id: 'crash-budget-1' } },
    max_attempts: 1,
    now: 1_000,
  });
  for (let i = 0; i < 5; i += 1) {
    const now = 1_000 + i * 2_000;
    const claimed = outbox.claim({ worker_id: `crashed-${i}`, lease_ms: 1_000, now });
    assert.equal(claimed.length, 1);
  }
  const recovered = outbox.get(job.id);
  assert.equal(recovered.failures, 0);
  assert.equal(recovered.status, 'processing');

  const fabric = {
    dispatchIntent: async (intent) => ({
      intent,
      accepted: 1,
      realtime_delivered: 0,
      inboxed: 1,
      targeted_principal_ids: [],
    }),
    dispatchSignal: async () => ({}),
    store: { getInboxItem: () => null, recordDelivery: () => ({}) },
  };
  const worker = createRelayWorker({ fabric, outbox, workerId: 'healthy-worker', leaseMs: 1_000 });
  const result = await worker.runOnce({ now: 11_001 });
  assert.equal(result.results[0].status, 'completed');
  assert.equal(outbox.get(job.id).status, 'completed');
  assert.equal(outbox.get(job.id).failures, 0);
});
