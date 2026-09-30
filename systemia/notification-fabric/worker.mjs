import crypto from 'node:crypto';

function normalizeAckPolicy(value = {}) {
  if (!value || value.required !== true) return null;
  return {
    required: true,
    mode: value.mode === 'all' ? 'all' : 'any',
    within_seconds: Math.max(15, Math.min(Number(value.within_seconds ?? 300), 7 * 24 * 60 * 60)),
    max_escalations: Math.max(0, Math.min(Number(value.max_escalations ?? 2), 5)),
    escalation_interval_seconds: Math.max(15, Math.min(Number(value.escalation_interval_seconds ?? 300), 24 * 60 * 60)),
    title_prefix: String(value.title_prefix || 'UNACKNOWLEDGED').slice(0, 40),
  };
}

function ackSatisfied(fabric, principalIds, notificationId, mode) {
  if (!principalIds.length) return true;
  const flags = principalIds.map((principalId) => Boolean(fabric.store.getInboxItem(principalId, notificationId)?.acknowledged_at));
  return mode === 'all' ? flags.every(Boolean) : flags.some(Boolean);
}

export function createRelayWorker(options = {}) {
  const fabric = options.fabric;
  const outbox = options.outbox;
  if (!fabric || !outbox) throw new Error('Relay worker requires fabric and outbox.');
  const workerId = String(options.workerId || `relay-${process.pid}-${crypto.randomUUID()}`);
  const leaseMs = Math.max(1000, Math.min(Number(options.leaseMs ?? 30000), 15 * 60 * 1000));
  const batchSize = Math.max(1, Math.min(Number(options.batchSize ?? 10), 100));
  const intervalMs = Math.max(100, Math.min(Number(options.intervalMs ?? 1000), 60000));
  let timer = null;
  let running = false;
  let lastRunAt = null;
  let lastError = null;

  async function scheduleAckWatch(intent, result, now = Date.now()) {
    const policy = normalizeAckPolicy(intent.acknowledgement);
    const principals = Array.isArray(result.targeted_principal_ids) ? result.targeted_principal_ids : [];
    if (!policy || !principals.length || policy.max_escalations <= 0) return null;
    return outbox.enqueue({
      kind: 'ack_watch',
      idempotency_key: `ack-watch:${intent.id}:1`,
      not_before_ms: now + policy.within_seconds * 1000,
      max_attempts: 8,
      payload: {
        notification_id: intent.id,
        original_intent: intent,
        principal_ids: principals,
        policy,
        escalation_level: 1,
      },
      now,
    });
  }

  async function handleIntent(job, now) {
    const result = await fabric.dispatchIntent(job.payload.intent);
    const watch = await scheduleAckWatch(job.payload.intent, result, now);
    return {
      kind: 'intent',
      notification_id: result.intent?.id || job.payload.intent?.id || null,
      accepted: result.accepted || 0,
      realtime_delivered: result.realtime_delivered || 0,
      inboxed: result.inboxed || 0,
      ack_watch_job_id: watch?.id || null,
    };
  }

  async function handleSignal(job) {
    const result = await fabric.dispatchSignal(job.payload.signal);
    return {
      kind: 'signal',
      signal_id: result.decision?.id || null,
      severity: result.decision?.severity || null,
      pushed: Boolean(result.push),
    };
  }

  async function handleAckWatch(job, now) {
    const payload = job.payload || {};
    const policy = normalizeAckPolicy(payload.policy);
    const principals = Array.isArray(payload.principal_ids) ? payload.principal_ids.map(String) : [];
    if (!policy) return { kind: 'ack_watch', status: 'policy_missing' };

    if (ackSatisfied(fabric, principals, payload.notification_id, policy.mode)) {
      fabric.store.recordDelivery({
        schema: 'systemia.notification.delivery.v3',
        notification_id: payload.notification_id,
        status: 'ack_watch_satisfied',
        principal_ids: principals,
        at: new Date(now).toISOString(),
      });
      return { kind: 'ack_watch', status: 'acknowledged', notification_id: payload.notification_id };
    }

    const level = Math.max(1, Number(payload.escalation_level || 1));
    const original = payload.original_intent || {};
    const escalationId = `${payload.notification_id}:escalation:${level}`;
    const escalation = await fabric.dispatchIntent({
      ...original,
      id: escalationId,
      schema: 'systemia.notification.intent.v3',
      purpose: original.purpose === 'safety' ? 'safety' : 'operational',
      priority: 'critical',
      title: `${policy.title_prefix}: ${String(original.title || 'Critical notification')}`.slice(0, 140),
      body: `Relay has not received the required acknowledgement. ${String(original.body || '')}`.slice(0, 1200),
      recipient_ids: principals,
      audiences: [],
      acknowledgement: null,
      dedupe_key: `ack-escalation:${payload.notification_id}:${level}`,
      dedupe_window_seconds: policy.escalation_interval_seconds,
      data: {
        ...(original.data || {}),
        relay_escalation: {
          original_notification_id: payload.notification_id,
          level,
          reason: 'acknowledgement_missing',
        },
      },
    });

    fabric.store.recordDelivery({
      schema: 'systemia.notification.delivery.v3',
      notification_id: payload.notification_id,
      status: 'ack_escalated',
      escalation_notification_id: escalation.intent?.id || escalationId,
      escalation_level: level,
      principal_ids: principals,
      at: new Date(now).toISOString(),
    });

    let nextWatchJobId = null;
    if (level < policy.max_escalations) {
      const next = outbox.enqueue({
        kind: 'ack_watch',
        idempotency_key: `ack-watch:${payload.notification_id}:${level + 1}`,
        not_before_ms: now + policy.escalation_interval_seconds * 1000,
        max_attempts: 8,
        payload: { ...payload, escalation_level: level + 1 },
        now,
      });
      nextWatchJobId = next.id;
    }
    return {
      kind: 'ack_watch',
      status: 'escalated',
      notification_id: payload.notification_id,
      escalation_level: level,
      next_watch_job_id: nextWatchJobId,
    };
  }

  async function processJob(job, now) {
    if (job.kind === 'intent') return handleIntent(job, now);
    if (job.kind === 'signal') return handleSignal(job);
    if (job.kind === 'ack_watch') return handleAckWatch(job, now);
    throw new Error(`Unsupported Relay job kind: ${job.kind}`);
  }

  async function runOnce(optionsRun = {}) {
    if (running) return { worker_id: workerId, skipped: true, reason: 'already_running' };
    running = true;
    const now = Number(optionsRun.now ?? Date.now());
    lastRunAt = new Date(now).toISOString();
    const claimed = outbox.claim({
      worker_id: workerId,
      lease_ms: leaseMs,
      limit: optionsRun.limit ?? batchSize,
      now,
    });
    const results = [];
    try {
      for (const job of claimed) {
        try {
          const result = await processJob(job, now);
          outbox.complete(job.id, result, { now });
          fabric.store.recordDelivery({
            schema: 'systemia.relay.job-receipt.v1',
            job_id: job.id,
            notification_id: result?.notification_id || null,
            status: 'job_completed',
            kind: job.kind,
            attempt: job.attempts,
            at: new Date(now).toISOString(),
          });
          results.push({ job_id: job.id, status: 'completed', result });
        } catch (error) {
          const failed = outbox.fail(job.id, error, { now });
          const status = failed?.status === 'dead_letter' ? 'job_dead_letter' : 'job_retry_scheduled';
          fabric.store.recordDelivery({
            schema: 'systemia.relay.job-receipt.v1',
            job_id: job.id,
            status,
            kind: job.kind,
            attempt: job.attempts,
            error: String(error?.message || error).slice(0, 1000),
            at: new Date(now).toISOString(),
          });
          results.push({ job_id: job.id, status: failed?.status || 'failed', error: String(error?.message || error) });
        }
      }
      lastError = null;
      return { worker_id: workerId, claimed: claimed.length, results };
    } catch (error) {
      lastError = String(error?.message || error);
      throw error;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      runOnce().catch((error) => { lastError = String(error?.message || error); });
    }, intervalMs);
    timer.unref?.();
    runOnce().catch((error) => { lastError = String(error?.message || error); });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function snapshot() {
    return {
      schema: 'systemia.relay.worker-state.v1',
      worker_id: workerId,
      running,
      started: Boolean(timer),
      last_run_at: lastRunAt,
      last_error: lastError,
      lease_ms: leaseMs,
      batch_size: batchSize,
      interval_ms: intervalMs,
    };
  }

  return { workerId, runOnce, start, stop, snapshot };
}
