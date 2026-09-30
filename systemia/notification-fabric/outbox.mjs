import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') {
      return { schema: 'systemia.relay.outbox.v1', jobs: {}, idempotency: {} };
    }
    throw error;
  }
}

function writeState(file, state) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

function iso(ms) {
  return new Date(Number(ms)).toISOString();
}

function safeError(error) {
  return String(error?.message || error || 'Unknown Relay worker error.').slice(0, 2000);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function requestFingerprint(kind, value) {
  return crypto.createHash('sha256').update(String(kind || '') + '\n' + canonical(value)).digest('hex');
}

export function createRelayOutbox(options = {}) {
  const root = path.resolve(options.dataDir || '.systemia-state/notifications');
  const file = options.file || path.join(root, 'relay-outbox.json');

  function mutate(fn) {
    const state = readState(file);
    const result = fn(state);
    writeState(file, state);
    return result;
  }

  function get(jobId) {
    const state = readState(file);
    return state.jobs?.[String(jobId || '')] || null;
  }

  function enqueue(input = {}) {
    return mutate((state) => {
      const idempotencyKey = String(input.idempotency_key || '').trim() || null;
      if (idempotencyKey && idempotencyKey.length > 256) throw new Error('Relay idempotency key exceeds 256 characters.');
      const fingerprint = requestFingerprint(input.kind || 'intent', input.fingerprint_source ?? input.payload ?? {});
      if (idempotencyKey) {
        const existingId = state.idempotency?.[idempotencyKey];
        const existing = existingId ? state.jobs?.[existingId] : null;
        if (existing) {
          if (existing.request_fingerprint && existing.request_fingerprint !== fingerprint) {
            throw new Error('Relay idempotency key was reused with a different request.');
          }
          return { ...existing, duplicate: true };
        }
      }
      const now = Number(input.now ?? Date.now());
      const id = String(input.id || crypto.randomUUID());
      const notBeforeMs = Number(input.not_before_ms ?? now);
      const job = {
        schema: 'systemia.relay.job.v1',
        id,
        kind: String(input.kind || 'intent'),
        payload: input.payload ?? {},
        idempotency_key: idempotencyKey,
        request_fingerprint: fingerprint,
        status: 'pending',
        attempts: 0,
        max_attempts: Math.max(1, Math.min(Number(input.max_attempts ?? 8), 50)),
        not_before_at: iso(notBeforeMs),
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        result: null,
        recovery_count: 0,
        created_at: iso(now),
        updated_at: iso(now),
        completed_at: null,
        dead_lettered_at: null,
      };
      state.jobs[id] = job;
      if (idempotencyKey) state.idempotency[idempotencyKey] = id;
      return { ...job, duplicate: false };
    });
  }

  function claim(options = {}) {
    return mutate((state) => {
      const now = Number(options.now ?? Date.now());
      const workerId = String(options.worker_id || '').trim();
      if (!workerId) throw new Error('Relay worker_id is required.');
      const leaseMs = Math.max(1000, Math.min(Number(options.lease_ms ?? 30000), 15 * 60 * 1000));
      const limit = Math.max(1, Math.min(Number(options.limit ?? 10), 100));

      for (const job of Object.values(state.jobs || {})) {
        if (job.status !== 'processing') continue;
        const leaseExpires = Date.parse(job.lease_expires_at || '');
        if (Number.isFinite(leaseExpires) && leaseExpires <= now) {
          job.status = 'retry';
          job.lease_owner = null;
          job.lease_expires_at = null;
          job.recovery_count = Number(job.recovery_count || 0) + 1;
          job.updated_at = iso(now);
        }
      }

      const due = Object.values(state.jobs || {})
        .filter((job) => ['pending', 'retry'].includes(job.status))
        .filter((job) => Date.parse(job.not_before_at || '') <= now)
        .sort((a, b) => {
          const aTime = Date.parse(a.not_before_at || a.created_at || '');
          const bTime = Date.parse(b.not_before_at || b.created_at || '');
          return aTime - bTime || String(a.id).localeCompare(String(b.id));
        })
        .slice(0, limit);

      for (const job of due) {
        job.status = 'processing';
        job.attempts = Number(job.attempts || 0) + 1;
        job.lease_owner = workerId;
        job.lease_expires_at = iso(now + leaseMs);
        job.updated_at = iso(now);
      }
      return due.map((job) => structuredClone(job));
    });
  }

  function complete(jobId, result, options = {}) {
    return mutate((state) => {
      const job = state.jobs?.[String(jobId || '')];
      if (!job) return null;
      const now = Number(options.now ?? Date.now());
      job.status = 'completed';
      job.result = result ?? null;
      job.lease_owner = null;
      job.lease_expires_at = null;
      job.updated_at = iso(now);
      job.completed_at = iso(now);
      return structuredClone(job);
    });
  }

  function fail(jobId, error, options = {}) {
    return mutate((state) => {
      const job = state.jobs?.[String(jobId || '')];
      if (!job) return null;
      const now = Number(options.now ?? Date.now());
      job.last_error = safeError(error);
      job.lease_owner = null;
      job.lease_expires_at = null;
      const exhausted = Number(job.attempts || 0) >= Number(job.max_attempts || 1);
      if (exhausted || options.dead_letter === true) {
        job.status = 'dead_letter';
        job.dead_lettered_at = iso(now);
      } else {
        const base = Math.max(250, Number(options.base_backoff_ms ?? 1000));
        const cap = Math.max(base, Number(options.max_backoff_ms ?? 5 * 60 * 1000));
        const exponent = Math.max(0, Number(job.attempts || 1) - 1);
        const backoff = Math.min(cap, base * (2 ** exponent));
        job.status = 'retry';
        job.not_before_at = iso(now + backoff);
      }
      job.updated_at = iso(now);
      return structuredClone(job);
    });
  }

  function requeueDeadLetter(jobId, options = {}) {
    return mutate((state) => {
      const job = state.jobs?.[String(jobId || '')];
      if (!job || job.status !== 'dead_letter') return null;
      const now = Number(options.now ?? Date.now());
      job.status = 'retry';
      job.attempts = 0;
      job.not_before_at = iso(now);
      job.lease_owner = null;
      job.lease_expires_at = null;
      job.last_error = null;
      job.dead_lettered_at = null;
      job.updated_at = iso(now);
      if (options.max_attempts !== undefined) {
        job.max_attempts = Math.max(1, Math.min(Number(options.max_attempts), 50));
      }
      return structuredClone(job);
    });
  }

  function prune(options = {}) {
    return mutate((state) => {
      const now = Number(options.now ?? Date.now());
      const completedRetentionMs = Math.max(60_000, Number(options.completed_retention_ms ?? 7 * 24 * 60 * 60 * 1000));
      const deadRetentionMs = Math.max(completedRetentionMs, Number(options.dead_retention_ms ?? 30 * 24 * 60 * 60 * 1000));
      const maxRetained = Math.max(100, Math.min(Number(options.max_retained ?? 10_000), 100_000));
      const removable = [];
      for (const job of Object.values(state.jobs || {})) {
        const updated = Date.parse(job.updated_at || job.created_at || '');
        if (!Number.isFinite(updated)) continue;
        if (job.status === 'completed' && updated <= now - completedRetentionMs) removable.push(job);
        if (job.status === 'dead_letter' && updated <= now - deadRetentionMs) removable.push(job);
      }
      removable.sort((a, b) => Date.parse(a.updated_at || '') - Date.parse(b.updated_at || ''));
      const all = Object.values(state.jobs || {});
      const overage = Math.max(0, all.length - maxRetained);
      const terminalOldest = all
        .filter((job) => ['completed', 'dead_letter'].includes(job.status))
        .sort((a, b) => Date.parse(a.updated_at || '') - Date.parse(b.updated_at || ''));
      const ids = new Set(removable.map((job) => job.id));
      for (const job of terminalOldest.slice(0, overage)) ids.add(job.id);
      for (const id of ids) {
        const job = state.jobs[id];
        if (!job) continue;
        delete state.jobs[id];
        if (job.idempotency_key && state.idempotency?.[job.idempotency_key] === id) {
          delete state.idempotency[job.idempotency_key];
        }
      }
      return { removed: ids.size, retained: Object.keys(state.jobs || {}).length };
    });
  }

  function stats(options = {}) {
    const state = readState(file);
    const now = Number(options.now ?? Date.now());
    const statuses = {};
    let oldestPendingAt = null;
    for (const job of Object.values(state.jobs || {})) {
      statuses[job.status] = (statuses[job.status] || 0) + 1;
      if (['pending', 'retry'].includes(job.status)) {
        const created = Date.parse(job.created_at || '');
        if (Number.isFinite(created) && (oldestPendingAt === null || created < oldestPendingAt)) oldestPendingAt = created;
      }
    }
    return {
      schema: 'systemia.relay.outbox-stats.v1',
      total: Object.keys(state.jobs || {}).length,
      statuses,
      oldest_pending_at: oldestPendingAt === null ? null : iso(oldestPendingAt),
      oldest_pending_age_ms: oldestPendingAt === null ? 0 : Math.max(0, now - oldestPendingAt),
    };
  }

  return { root, file, enqueue, claim, complete, fail, get, requeueDeadLetter, prune, stats };
}
