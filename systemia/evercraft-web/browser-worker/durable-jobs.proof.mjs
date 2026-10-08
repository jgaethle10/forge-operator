// Real Chromium public-page canary. Runs against the CI Docker worker.
// Never makes a payment, submits a form, or claims deployed production proof.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { signDurableJobRequest } from './systemia-admission.mjs';

const origin = String(process.env.EVERCRAFT_BROWSER_PROOF_URL || 'http://127.0.0.1:18787');
const signingKey = String(process.env.EVERCRAFT_BROWSER_PROOF_SIGNING_KEY || '');
if (signingKey.length < 32) throw new Error('browser_proof_systemia_signing_key_required');
const base = { mission_key: 'systemia-browser-ci-canary', work_key: 'browser-ci-readonly-001' };
const request = async (method, path, body) => {
  const raw = body ? JSON.stringify(body) : '';
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...signDurableJobRequest(signingKey,{method,path,body:raw}),
    },
    body: body ? raw : undefined,
  });
  const json = await response.json();
  if (!response.ok) throw new Error('browser_proof_http_' + response.status + ':' + json.error);
  return json;
};
async function complete(id, timeout = 110_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const { job } = await request('GET', '/v1/jobs/' + id);
    if (['completed','failed','cancelled'].includes(job.state)) return job;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('browser_proof_job_timeout');
}
const runId = crypto.randomUUID();
const publicJob = {
  url: 'https://example.com/',
  timeout_ms: 12000,
  include_screenshot: true,
  actions: [
    { type: 'wait_for_selector', selector: 'body', timeout_ms: 5000 },
    { type: 'scroll', x: 0, y: 100 },
  ],
};
const created = (await request('POST', '/v1/jobs', {
  ...base, idempotency_key: 'canary-' + runId, job: publicJob,
})).job;
assert.equal(created.state, 'queued');
const success = await complete(created.id);
assert.equal(success.state, 'completed', JSON.stringify(success));
assert.equal(success.result.http_status, 200);
assert.equal(success.result.action_count, 2);
assert.match(success.result.evidence_receipt_sha256, /^[a-f0-9]{64}$/);
assert.match(success.result.screenshot_sha256, /^[a-f0-9]{64}$/);
assert.match(success.result.text_sha256, /^[a-f0-9]{64}$/);
assert.equal(success.result.final_url, 'https://example.com/');

const duplicate = (await request('POST', '/v1/jobs', {
  ...base, idempotency_key: 'canary-' + runId, job: publicJob,
})).job;
assert.equal(duplicate.id, created.id);
assert.equal(duplicate.deduplicated, true);

const failedCreate = (await request('POST', '/v1/jobs', {
  ...base, idempotency_key: 'failure-' + runId,
  job: {
    url: 'https://example.com/',
    timeout_ms: 3000,
    actions: [{ type: 'wait_for_selector', selector: '#evercraft-nonexistent-qa-sentinel', timeout_ms: 200 }],
  },
})).job;
const failed = await complete(failedCreate.id);
assert.equal(failed.state, 'failed');
assert.equal(failed.attempts, 2);
assert.equal(failed.failure_reason, 'browser_job_execution_failed');

const manifest = {
  schema: 'evercraft.browser.durable-canary.v1',
  execution_class: 'github_actions_docker_browser_not_production',
  origin: 'https://example.com/',
  successful_job_id: success.id,
  action_count: success.result.action_count,
  text_sha256: success.result.text_sha256,
  screenshot_sha256: success.result.screenshot_sha256,
  evidence_receipt_sha256: success.result.evidence_receipt_sha256,
  deduplicated_same_job: duplicate.id === success.id,
  controlled_failure_job_id: failed.id,
  controlled_failure_attempts: failed.attempts,
  controlled_failure_terminal_state: failed.state,
  crash_restart_recovery: 'unit_test_only',
  production_public_edge: 'not_verified',
};
const out = '/tmp/evercraft-browser-durable-canary.json';
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify(manifest) + '\n');
