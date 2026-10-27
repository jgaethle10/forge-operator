import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// One process and one durable, access-controlled filesystem per queue.
// Never share this directory between workers without a distributed lease.
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const iso = () => new Date().toISOString();
const terminal = new Set(['completed', 'failed', 'cancelled']);
const safeUrl = (value) => {
  const url = new URL(String(value));
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString();
};
const publicRecord = (row) => {
  if (!row) return null;
  const { request, key_hash, request_hash, ...visible } = row;
  return structuredClone(visible);
};
function safeResult(result) {
  return {
    engine: String(result?.engine || '').slice(0, 100),
    mode: 'public_read_only',
    final_url: safeUrl(result?.final_url || result?.requested_url),
    http_status: Number(result?.http_status) || 0,
    title: String(result?.snapshot?.title || result?.title || '').slice(0, 160),
    text_sha256: String(result?.text_sha256 || '').slice(0, 64),
    screenshot_sha256: String(result?.screenshot?.sha256 || result?.screenshot_sha256 || '').slice(0, 64),
    evidence_receipt_sha256: String(result?.evidence_receipt_sha256 || '').slice(0, 64),
    action_count: Array.isArray(result?.actions) ? result.actions.length : 0,
  };
}

export class DurableBrowserJobs {
  constructor({ directory, execute, concurrency = 1, maxAttempts = 2, autoStart = true } = {}) {
    if (!directory || typeof execute !== 'function') throw new Error('durable_job_configuration_required');
    this.dir = path.resolve(directory);
    this.execute = execute;
    this.concurrency = Math.max(1, Math.min(8, concurrency));
    this.maxAttempts = Math.max(1, Math.min(3, maxAttempts));
    this.jobs = new Map();
    this.keys = new Map();
    this.active = new Map();
    this.closed = false;
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.dir, 0o700);
    for (const file of fs.readdirSync(this.dir).filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))) {
      const row = JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf8'));
      if (row.id + '.json' !== file || row.schema !== 'evercraft.browser.job.v1') {
        throw new Error('durable_job_corrupt_record');
      }
      if (this.keys.has(row.key_hash)) throw new Error('durable_job_duplicate_idempotency_key');
      this.jobs.set(row.id, row);
      this.keys.set(row.key_hash, row.id);
      if (row.state === 'running') {
        row.recovery_count = (row.recovery_count || 0) + 1;
        row.state = row.attempts < this.maxAttempts ? 'queued' : 'failed';
        row.failure_reason = row.state === 'failed' ? 'recovery_attempts_exhausted' : null;
        row.updated_at = iso();
        this.save(row);
      }
    }
    if (autoStart) queueMicrotask(() => this.pump());
  }

  save(row) {
    const filename = path.join(this.dir, row.id + '.json');
    const tmp = path.join(this.dir, '.' + row.id + '.' + crypto.randomBytes(6).toString('hex') + '.tmp');
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(row) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, filename);
    const dirfd = fs.openSync(this.dir, 'r');
    try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
    this.jobs.set(row.id, row);
  }

  submit({ job, idempotency_key, mission_key, work_key } = {}) {
    if (this.closed) throw new Error('durable_job_queue_closed');
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(String(idempotency_key || ''))) {
      throw new Error('durable_job_idempotency_key_required');
    }
    if (!/^[A-Za-z0-9._:-]{3,160}$/.test(String(mission_key || '')) ||
        !/^[A-Za-z0-9._:-]{3,160}$/.test(String(work_key || ''))) {
      throw new Error('durable_job_systemia_lineage_required');
    }
    const target = new URL(String(job?.url));
    // Query/fragment material can carry bearer tokens, PII and session state.
    // Never persist them or change URL semantics while replaying.
    if (target.search || target.hash || target.username || target.password) {
      throw new Error('durable_job_sensitive_url_not_supported');
    }
    const request = {
      ...job,
      url: target.toString(),
      include_screenshot_base64: false,
    };
    const key_hash = sha(idempotency_key);
    const request_hash = sha(JSON.stringify({ request, mission_key, work_key }));
    const priorId = this.keys.get(key_hash);
    if (priorId) {
      const prior = this.jobs.get(priorId);
      if (prior.request_hash !== request_hash) throw new Error('durable_job_idempotency_conflict');
      return { deduplicated: true, ...publicRecord(prior) };
    }
    if (this.jobs.size >= 1000) throw new Error('durable_job_capacity_exhausted');
    const id = crypto.randomUUID();
    const row = {
      schema: 'evercraft.browser.job.v1',
      id, mission_key, work_key,
      key_hash, request_hash, request,
      requested_url: safeUrl(request.url),
      state: 'queued', attempts: 0, recovery_count: 0,
      created_at: iso(), updated_at: iso(),
      started_at: null, finished_at: null,
      failure_reason: null, result: null,
    };
    this.save(row);
    this.keys.set(key_hash, id);
    queueMicrotask(() => this.pump());
    return { deduplicated: false, ...publicRecord(row) };
  }

  get(id) { return publicRecord(this.jobs.get(String(id))); }

  cancel(id) {
    const row = this.jobs.get(String(id));
    if (!row) return null;
    if (!terminal.has(row.state)) {
      row.state = 'cancelled';
      row.failure_reason = 'cancelled_by_authorized_operator';
      row.finished_at = row.updated_at = iso();
      this.save(row);
      this.active.get(row.id)?.abort();
    }
    return publicRecord(row);
  }

  async run(row) {
    const controller = new AbortController();
    this.active.set(row.id, controller);
    row.state = 'running';
    row.attempts++;
    row.started_at = row.updated_at = iso();
    this.save(row);
    const timeout = Math.min(90_000, Math.max(5_000,
      5_000 + (row.request.actions.length + 1) * row.request.timeout_ms));
    let timer;
    try {
      const timed = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('browser_job_timeout'));
        }, timeout);
      });
      const result = await Promise.race([
        Promise.resolve().then(() => this.execute(row.request, controller.signal)),
        timed,
      ]);
      if (row.state !== 'cancelled') {
        if (result?.ok !== true || !/^[a-f0-9]{64}$/.test(String(result.evidence_receipt_sha256 || ''))) {
          throw new Error('browser_job_invalid_evidence_receipt');
        }
        row.result = safeResult(result);
        row.state = 'completed';
        row.finished_at = row.updated_at = iso();
        this.save(row);
      }
    } catch (error) {
      if (row.state !== 'cancelled') {
        const known = new Set(['browser_job_timeout', 'browser_job_invalid_evidence_receipt']);
        const reason = known.has(error?.message) ? error.message : 'browser_job_execution_failed';
        if (row.attempts < this.maxAttempts) {
          row.state = 'queued';
          row.failure_reason = reason;
        } else {
          row.state = 'failed';
          row.failure_reason = reason;
          row.finished_at = iso();
        }
        row.updated_at = iso();
        this.save(row);
      }
    } finally {
      clearTimeout(timer);
      this.active.delete(row.id);
      if (!this.closed) setTimeout(() => this.pump(), row.state === 'queued' ? 250 : 0).unref();
    }
  }

  pump() {
    if (this.closed) return;
    while (this.active.size < this.concurrency) {
      const next = [...this.jobs.values()].find((row) => row.state === 'queued' && !this.active.has(row.id));
      if (!next) break;
      // run() marks the row active before its first await.
      void this.run(next);
    }
  }

  metrics() {
    const by_state = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const row of this.jobs.values()) by_state[row.state] = (by_state[row.state] || 0) + 1;
    return { by_state, active: this.active.size, recovered: [...this.jobs.values()].filter((r) => r.recovery_count > 0).length };
  }

  close() {
    this.closed = true;
    for (const controller of this.active.values()) controller.abort();
  }
}
