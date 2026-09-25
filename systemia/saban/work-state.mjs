import crypto from 'node:crypto';

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function id(prefix, seed) {
  return `${prefix}-${crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 16)}`;
}

export function createWorkState({ softwareId, assignments, leaseSeconds = 300, maxAttempts = 3, createdAt = Date.now() }) {
  const jobs = {};
  for (const assignment of assignments || []) {
    const jobId = id('job', `${softwareId}:${assignment.agent_id}:${assignment.work?.kind}:${assignment.work?.key}`);
    jobs[jobId] = {
      job_id: jobId,
      software_id: softwareId,
      agent_id: assignment.agent_id,
      role: assignment.role,
      work: assignment.work,
      item: assignment.item ?? null,
      state: 'queued',
      attempts: 0,
      max_attempts: maxAttempts,
      lease_seconds: leaseSeconds,
      lease: null,
      checkpoint: null,
      result: null,
      error: null,
      created_at: nowIso(createdAt),
      updated_at: nowIso(createdAt)
    };
  }

  return {
    schema: 'evercraft.saban.work-state.v1',
    software_id: softwareId,
    created_at: nowIso(createdAt),
    updated_at: nowIso(createdAt),
    jobs
  };
}

export function expireLeases(state, now = Date.now()) {
  let changed = false;
  for (const job of Object.values(state.jobs || {})) {
    if (job.state !== 'leased' || !job.lease?.expires_at) continue;
    if (Date.parse(job.lease.expires_at) > now) continue;

    job.state = job.attempts >= job.max_attempts ? 'dead_letter' : 'queued';
    job.error = {
      code: 'lease_expired',
      message: 'Worker lease expired before completion.'
    };
    job.lease = null;
    job.updated_at = nowIso(now);
    changed = true;
  }
  if (changed) state.updated_at = nowIso(now);
  return state;
}

export function leaseNext(state, { workerId, now = Date.now(), leaseSeconds = null } = {}) {
  if (!workerId) throw new Error('workerId is required');
  expireLeases(state, now);

  const job = Object.values(state.jobs || {})
    .filter((row) => row.state === 'queued')
    .sort((a, b) =>
      a.attempts - b.attempts ||
      a.created_at.localeCompare(b.created_at) ||
      a.job_id.localeCompare(b.job_id)
    )[0];

  if (!job) return null;

  job.attempts += 1;
  const ttl = Number(leaseSeconds ?? job.lease_seconds ?? 300);
  job.state = 'leased';
  job.lease = {
    worker_id: workerId,
    acquired_at: nowIso(now),
    heartbeat_at: nowIso(now),
    expires_at: nowIso(now + ttl * 1000)
  };
  job.updated_at = nowIso(now);
  state.updated_at = nowIso(now);
  return structuredClone(job);
}

export function heartbeat(state, { jobId, workerId, now = Date.now(), leaseSeconds = null }) {
  const job = state.jobs?.[jobId];
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (job.state !== 'leased' || job.lease?.worker_id !== workerId) {
    throw new Error('Heartbeat rejected: worker does not own the active lease.');
  }

  const ttl = Number(leaseSeconds ?? job.lease_seconds ?? 300);
  job.lease.heartbeat_at = nowIso(now);
  job.lease.expires_at = nowIso(now + ttl * 1000);
  job.updated_at = nowIso(now);
  state.updated_at = nowIso(now);
  return structuredClone(job);
}

export function checkpoint(state, { jobId, workerId, data, now = Date.now() }) {
  const job = state.jobs?.[jobId];
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (job.state !== 'leased' || job.lease?.worker_id !== workerId) {
    throw new Error('Checkpoint rejected: worker does not own the active lease.');
  }

  job.checkpoint = {
    at: nowIso(now),
    data: data ?? null
  };
  job.updated_at = nowIso(now);
  state.updated_at = nowIso(now);
  return structuredClone(job);
}

export function complete(state, { jobId, workerId, result, now = Date.now() }) {
  const job = state.jobs?.[jobId];
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (job.state !== 'leased' || job.lease?.worker_id !== workerId) {
    throw new Error('Completion rejected: worker does not own the active lease.');
  }

  job.state = 'completed';
  job.result = result ?? null;
  job.error = null;
  job.lease = null;
  job.updated_at = nowIso(now);
  state.updated_at = nowIso(now);
  return structuredClone(job);
}

export function fail(state, { jobId, workerId, error, retry = true, now = Date.now() }) {
  const job = state.jobs?.[jobId];
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (job.state !== 'leased' || job.lease?.worker_id !== workerId) {
    throw new Error('Failure rejected: worker does not own the active lease.');
  }

  const canRetry = retry && job.attempts < job.max_attempts;
  job.state = canRetry ? 'queued' : 'dead_letter';
  job.error = {
    code: error?.code || 'worker_failed',
    message: error?.message || String(error || 'Worker failed.')
  };
  job.lease = null;
  job.updated_at = nowIso(now);
  state.updated_at = nowIso(now);
  return structuredClone(job);
}

export function summarizeWorkState(state, now = Date.now()) {
  expireLeases(state, now);
  const counts = {};
  for (const job of Object.values(state.jobs || {})) {
    counts[job.state] = (counts[job.state] || 0) + 1;
  }
  return {
    software_id: state.software_id,
    total: Object.keys(state.jobs || {}).length,
    counts,
    checkpointed: Object.values(state.jobs || {}).filter((job) => job.checkpoint).length,
    retried: Object.values(state.jobs || {}).filter((job) => job.attempts > 1).length
  };
}
