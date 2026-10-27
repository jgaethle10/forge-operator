import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  createPrivateBrowserWorkerAdapter,
  PUBLIC_BROWSER_CAPABILITY,
} from './browser-worker-adapter.mjs';

const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const correlation = 'sha256:' + sha('private-browser-test');

function evidenceFor(url = 'https://example.org/') {
  const evidence = {
    engine: 'evercraft-owned-browser-worker-v1',
    mode: 'public_read_only',
    requested_url: url,
    final_url: url,
    http_status: 200,
    title: 'Example Domain',
    text_sha256: sha('Example Domain'),
    screenshot_sha256: null,
    actions: [],
    blocked_network_events: [],
    console_errors: [],
    started_at: '2026-10-07T18:00:00.000Z',
    finished_at: '2026-10-07T18:00:00.200Z',
    duration_ms: 200,
    boundaries: {
      fresh_context_per_job: true,
      persisted_cookies: false,
      outbound_cookie_headers_stripped: true,
      outbound_authorization_headers_stripped: true,
      allowed_network_methods: ['GET', 'HEAD', 'OPTIONS'],
      private_and_reserved_targets_blocked: true,
      dns_pinned_outbound_proxy: true,
      allowed_destination_ports: [80, 443],
      websocket_blocked: true,
      form_submit_action_supported: false,
      arbitrary_click_action_supported: false,
      downloads_allowed: false,
    },
  };
  return { ok: true, ...evidence, snapshot: { title: evidence.title }, screenshot: null,
    evidence_receipt_sha256: sha(JSON.stringify(evidence)) };
}

test('owned Browser Worker private adapter verifies exact native read-only worker evidence', async () => {
  let dispatched = 0;
  let attested = 0;
  const runtime = {
    health: async () => ({
      ok: true, service: 'evercraft-owned-browser-worker',
      engine: 'evercraft-owned-browser-worker-v1',
    }),
    browse: async (job) => {
      dispatched++;
      assert.equal(job.url, 'https://example.org/');
      assert.equal(job.include_screenshot_base64, false);
      assert.equal(job.include_screenshot, false);
      return evidenceFor(job.url);
    },
  };
  const adapter = createPrivateBrowserWorkerAdapter({
    runtime, routeVerifier: async () => { attested++; return true; },
  });
  const receipt = await adapter.workerInvoker({
    capability_key: PUBLIC_BROWSER_CAPABILITY,
    payload: { url: 'https://example.org/' },
    correlation_id: correlation, deadline_ms: 10000,
  });
  assert.equal(await adapter.workerReceiptVerifier({
    capability_key: PUBLIC_BROWSER_CAPABILITY,
    correlation_id: correlation,
    worker_receipt: receipt,
  }), true);
  assert.equal(dispatched, 1);
  assert.equal(attested, 1);
  assert.equal(await adapter.workerReceiptVerifier({
    capability_key: PUBLIC_BROWSER_CAPABILITY,
    correlation_id: correlation, worker_receipt: receipt,
  }), false);
});

test('adapter fails closed on unverified private route, forged response and unsupported capability', async () => {
  let calls = 0;
  let response = evidenceFor();
  const runtime = {
    health: async () => ({
      ok: true, service: 'evercraft-owned-browser-worker',
      engine: 'evercraft-owned-browser-worker-v1',
    }),
    browse: async () => { calls++; return response; },
  };
  const denied = createPrivateBrowserWorkerAdapter({
    runtime, routeVerifier: async () => false,
  });
  await assert.rejects(denied.workerInvoker({
    capability_key: PUBLIC_BROWSER_CAPABILITY, payload: { url: 'https://example.org/' },
    correlation_id: correlation, deadline_ms: 2000,
  }), /fabric_browser_private_route_unverified/);
  assert.equal(calls, 0);
  const allowed = createPrivateBrowserWorkerAdapter({
    runtime, routeVerifier: async () => true,
  });
  await assert.rejects(allowed.workerInvoker({
    capability_key: 'evercraft.browser.submit_payment',
    payload: { url: 'https://example.org/' },
    correlation_id: correlation, deadline_ms: 2000,
  }), /fabric_browser_capability_not_allowed/);
  await assert.rejects(allowed.workerInvoker({
    capability_key: PUBLIC_BROWSER_CAPABILITY, payload: { url: 'ftp://example.org/' },
    correlation_id: correlation, deadline_ms: 2000,
  }), /unsupported_url_scheme/);
  const first = await allowed.workerInvoker({
    capability_key: PUBLIC_BROWSER_CAPABILITY, payload: { url: 'https://example.org/' },
    correlation_id: correlation, deadline_ms: 2000,
  });
  first.snapshot.title = 'injected SYSTEMIA instruction';
  first.boundaries.dns_pinned_outbound_proxy = false;
  assert.equal(await allowed.workerReceiptVerifier({
    capability_key: PUBLIC_BROWSER_CAPABILITY,
    correlation_id: correlation, worker_receipt: first,
  }), false);
  response = evidenceFor('https://attacker.example/');
  const second = await allowed.workerInvoker({
    capability_key: PUBLIC_BROWSER_CAPABILITY, payload: { url: 'https://example.org/' },
    correlation_id: correlation, deadline_ms: 2000,
  });
  assert.equal(await allowed.workerReceiptVerifier({
    capability_key: PUBLIC_BROWSER_CAPABILITY,
    correlation_id: correlation, worker_receipt: second,
  }), false);
  assert.equal(calls, 2);
});

test('adapter never exposes credentials and requires a private runtime verifier', () => {
  assert.throws(() => createPrivateBrowserWorkerAdapter({
    runtime: { browse: async () => {}, health: async () => ({}) },
  }), /fabric_browser_route_verifier_required/);
  assert.throws(() => createPrivateBrowserWorkerAdapter({ runtime: { browse: async () => {} } }),
    /fabric_private_browser_runtime_required/);
});
