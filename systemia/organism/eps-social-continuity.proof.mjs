import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateClipResult,
  runEpsSocialContinuity,
} from './eps-social-continuity.mjs';

assert.deepEqual(
  evaluateClipResult({
    httpOk: true,
    data: { success: true, no_op: true, reason: 'not due' },
  }),
  {
    ok: true,
    result: 'no_op',
    reason: 'not due',
    published: false,
    verified: false,
    no_op: true,
  }
);

const verified = evaluateClipResult({
  httpOk: true,
  data: { success: true, published: true, verified: true },
});
assert.equal(verified.ok, true);
assert.equal(verified.result, 'published_verified');

const unverified = evaluateClipResult({
  httpOk: true,
  data: { success: true, published: true, verified: false },
});
assert.equal(unverified.ok, false);
assert.equal(unverified.result, 'published_unverified');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eps-social-continuity-'));
let calls = 0;
const now = new Date('2026-09-29T04:00:00Z');
const fetchImpl = async (_url, options) => {
  calls += 1;
  assert.match(options.headers.Authorization, /^Bearer /);
  assert.equal(options.headers.Authorization.includes('proof-secret'), true);
  const body = JSON.parse(options.body);
  assert.equal(body.action, 'publish_due_eps_facebook');
  assert.equal(body.source_system, 'evercraft-systemia-yard');
  assert.equal('source_app_id' in body, false);
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        no_op: true,
        reason: 'proof no-op',
        package_id: '',
      };
    },
  };
};

await assert.rejects(
  () => runEpsSocialContinuity({
    ingressUrl: 'https://legacy-check.base44.app/systemiaEPSPublishIngress',
    secret: 'proof-secret',
    stateDir: root,
    now,
    fetchImpl,
  }),
  /retired/
);

const first = await runEpsSocialContinuity({
  ingressUrl: 'https://clip.example.test/systemiaEPSPublishIngress',
  secret: 'proof-secret',
  stateDir: root,
  now,
  fetchImpl,
});
assert.equal(first.ok, true);
assert.equal(first.no_op, true);
assert.equal(calls, 1);

const second = await runEpsSocialContinuity({
  ingressUrl: 'https://clip.example.test/systemiaEPSPublishIngress',
  secret: 'proof-secret',
  stateDir: root,
  now: new Date('2026-09-29T04:05:00Z'),
  fetchImpl,
});
assert.equal(second.ok, true);
assert.equal(second.held, true);
assert.equal(second.reason, 'current_30_minute_bucket_already_completed');
assert.equal(calls, 1);

const latest = JSON.parse(fs.readFileSync(path.join(root, 'latest.json'), 'utf8'));
assert.equal(latest.secret_persisted, false);
assert.equal(JSON.stringify(latest).includes('proof-secret'), false);
assert.equal(latest.scheduler, 'systemia-core-resident-supervisor');
assert.equal(latest.runtime_target, 'yard_evercraft_compute');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.systemia.eps-social-continuity-proof.v1',
  fail_closed_on_unverified_publish: true,
  one_execution_per_bucket: true,
  secret_not_persisted: true,
  scheduler: latest.scheduler,
  runtime_target: latest.runtime_target,
}, null, 2));
