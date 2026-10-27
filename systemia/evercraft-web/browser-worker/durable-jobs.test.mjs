import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableBrowserJobs } from './durable-jobs.mjs';

const sample = {
  url: 'https://example.com/',
  timeout_ms: 1000,
  viewport: { width: 1280, height: 720 },
  max_text_chars: 1000,
  include_screenshot: true,
  include_screenshot_base64: true,
  actions: [{ type: 'wait_for_selector', selector: 'h1', timeout_ms: 1000 }],
};
const envelope = (key = 'mission-test-0001') => ({
  job: sample, idempotency_key: key,
  mission_key: 'systemia-browser-mission-001',
  work_key: 'browser-work-001',
});
const proof = () => ({
  ok: true, engine: 'evercraft-owned-browser-worker-v1',
  requested_url: 'https://example.com/',
  final_url: 'https://example.com/',
  http_status: 200,
  text_sha256: 'a'.repeat(64),
  screenshot: { sha256: 'b'.repeat(64), base64: 'sensitive-binary' },
  evidence_receipt_sha256: 'c'.repeat(64),
  actions: [{ type: 'wait_for_selector', selector: 'h1', ok: true }],
  snapshot: { title: 'Example Domain', text: 'do not persist page body' },
});
async function until(fn, ms = 4000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const result = fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('job_test_timeout');
}
function isolated(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-browser-jobs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('idempotent job persists only bounded evidence and never a screenshot or body', async (t) => {
  const dir = isolated(t);
  let runs = 0;
  const q = new DurableBrowserJobs({ directory: dir, execute: async () => { runs++; return proof(); } });
  t.after(() => q.close());
  const one = q.submit(envelope());
  const same = q.submit(envelope());
  assert.equal(one.job, undefined);
  assert.equal(one.id, same.id);
  assert.equal(same.deduplicated, true);
  await until(() => q.get(one.id)?.state === 'completed');
  assert.equal(runs, 1);
  assert.equal(q.get(one.id).result.screenshot_sha256, 'b'.repeat(64));
  const disk = fs.readFileSync(path.join(dir, one.id + '.json'), 'utf8');
  assert.equal(disk.includes('sensitive-binary'), false);
  assert.equal(disk.includes('do not persist page body'), false);
  assert.equal(disk.includes('mission-test-0001'), false);
  assert.equal(disk.includes('include_screenshot_base64":true'), false);
  assert.equal(q.metrics().by_state.completed, 1);
  assert.equal(fs.statSync(path.join(dir, one.id + '.json')).mode & 0o777, 0o600);
});

test('controlled first-attempt failure is retried once, then receipted', async (t) => {
  const dir = isolated(t);
  let runs = 0;
  const q = new DurableBrowserJobs({
    directory: dir,
    execute: async () => { if (++runs === 1) throw new Error('private error no leak'); return proof(); },
  });
  t.after(() => q.close());
  const item = q.submit(envelope('retry-job-0001'));
  await until(() => q.get(item.id)?.state === 'completed');
  assert.equal(q.get(item.id).attempts, 2);
  assert.equal(runs, 2);
  assert.equal(JSON.stringify(q.get(item.id)).includes('private error no leak'), false);
});

test('restart requeues interrupted GET-only work and preserves identity', async (t) => {
  const dir = isolated(t);
  const q1 = new DurableBrowserJobs({ directory: dir, execute: async () => proof(), autoStart: false });
  const item = q1.submit(envelope('restart-job-0001'));
  q1.close();
  const file = path.join(dir, item.id + '.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.state = 'running';
  saved.attempts = 1;
  fs.writeFileSync(file, JSON.stringify(saved));
  const q2 = new DurableBrowserJobs({ directory: dir, execute: async () => proof() });
  t.after(() => q2.close());
  await until(() => q2.get(item.id)?.state === 'completed');
  assert.equal(q2.get(item.id).recovery_count, 1);
  assert.equal(q2.get(item.id).attempts, 2);
  assert.equal(q2.submit(envelope('restart-job-0001')).id, item.id);
});

test('cancelled pending job cannot execute, and key cannot mutate payload', async (t) => {
  const dir = isolated(t);
  let runs = 0;
  const q = new DurableBrowserJobs({ directory: dir, execute: async () => { runs++; return proof(); }, autoStart: false });
  t.after(() => q.close());
  const item = q.submit(envelope('cancelled-job-0001'));
  assert.equal(q.cancel(item.id).state, 'cancelled');
  q.pump();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(runs, 0);
  assert.equal(q.get(item.id).state, 'cancelled');
  assert.throws(() => q.submit({ ...envelope('cancelled-job-0001'), work_key: 'different-work-001' }),
    /durable_job_idempotency_conflict/);
  assert.throws(() => q.submit({
    ...envelope('unsafe-url-job'),
    job: { ...sample, url: 'https://example.com/?token=do-not-store' },
  }), /durable_job_sensitive_url_not_supported/);
});

test('restart after exhausted attempts fails closed rather than replaying', (t) => {
  const dir = isolated(t);
  const q = new DurableBrowserJobs({ directory: dir, execute: async () => proof(), autoStart: false });
  const item = q.submit(envelope('exhausted-job-001'));
  q.close();
  const file = path.join(dir, item.id + '.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.state = 'running';
  saved.attempts = 2;
  fs.writeFileSync(file, JSON.stringify(saved));
  const q2 = new DurableBrowserJobs({ directory: dir, execute: async () => { throw new Error('must_not_run'); } });
  t.after(() => q2.close());
  assert.equal(q2.get(item.id).state, 'failed');
  assert.equal(q2.get(item.id).failure_reason, 'recovery_attempts_exhausted');
});
