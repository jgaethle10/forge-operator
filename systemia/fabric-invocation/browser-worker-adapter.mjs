import { createHash } from 'node:crypto';
import { redactUrl, sanitizeJob } from '../evercraft-web/browser-worker/policy.mjs';

export const PUBLIC_BROWSER_CAPABILITY = 'evercraft.web.browser.public.v1';
const ENGINE = 'evercraft-owned-browser-worker-v1';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function browserEvidence(body) {
  // Order and fields match the native Browser Worker v1 evidence contract.
  return {
    engine: body.engine,
    mode: body.mode,
    requested_url: body.requested_url,
    final_url: body.final_url,
    http_status: body.http_status,
    title: body.title,
    text_sha256: body.text_sha256,
    screenshot_sha256: body.screenshot_sha256,
    actions: body.actions,
    blocked_network_events: body.blocked_network_events,
    console_errors: body.console_errors,
    started_at: body.started_at,
    finished_at: body.finished_at,
    duration_ms: body.duration_ms,
    boundaries: body.boundaries,
  };
}

function verifyReadOnlyEvidence(body, expectedUrl) {
  if (body?.ok !== true || body.engine !== ENGINE || body.mode !== 'public_read_only') return false;
  if (body.requested_url !== redactUrl(expectedUrl)) return false;
  const b = body.boundaries;
  if (!b || b.fresh_context_per_job !== true || b.persisted_cookies !== false ||
      b.outbound_cookie_headers_stripped !== true ||
      b.outbound_authorization_headers_stripped !== true ||
      b.private_and_reserved_targets_blocked !== true ||
      b.dns_pinned_outbound_proxy !== true || b.websocket_blocked !== true ||
      b.form_submit_action_supported !== false || b.arbitrary_click_action_supported !== false ||
      b.downloads_allowed !== false) return false;
  if (JSON.stringify(b.allowed_network_methods) !== JSON.stringify(['GET', 'HEAD', 'OPTIONS']) ||
      JSON.stringify(b.allowed_destination_ports) !== JSON.stringify([80, 443])) return false;
  if (!Array.isArray(body.actions) || !Array.isArray(body.blocked_network_events) ||
      !Array.isArray(body.console_errors)) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(body.text_sha256 || ''))) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(body.evidence_receipt_sha256 || ''))) return false;
  const actualDigest = sha256(JSON.stringify(browserEvidence(body)));
  return actualDigest === body.evidence_receipt_sha256.toLowerCase();
}

/**
 * Adapter for an operator-supplied, PRIVATE owned Browser Worker runtime.
 * No URL, credential or direct public bypass is accepted here.
 * Private Yard/Compute route attestation must be supplied by the caller.
 */
export function createPrivateBrowserWorkerAdapter({ runtime, routeVerifier } = {}) {
  if (!runtime || typeof runtime.browse !== 'function' || typeof runtime.health !== 'function') {
    throw new Error('fabric_private_browser_runtime_required');
  }
  if (typeof routeVerifier !== 'function') throw new Error('fabric_browser_route_verifier_required');
  const expected = new Map();

  return {
    async workerInvoker({ capability_key, payload, correlation_id, signal, deadline_ms }) {
      if (capability_key !== PUBLIC_BROWSER_CAPABILITY) {
        throw new Error('fabric_browser_capability_not_allowed');
      }
      if (signal?.aborted) throw new Error('fabric_browser_aborted_before_dispatch');
      if (!Number.isInteger(deadline_ms) || deadline_ms < 1000 || deadline_ms > 30000) {
        throw new Error('fabric_browser_deadline_invalid');
      }
      const job = sanitizeJob(payload || {});
      // A real browser navigation cannot meaningfully finish in 20ms. The
      // coordinator must grant a bounded worker deadline >= 1000ms.
      const health = await runtime.health();
      if (health?.ok !== true || health.service !== 'evercraft-owned-browser-worker' ||
          health.engine !== ENGINE ||
          await routeVerifier({ health, capability_key }) !== true) {
        throw new Error('fabric_browser_private_route_unverified');
      }
      const key = String(correlation_id || '');
      if (!/^sha256:[a-f0-9]{64}$/.test(key)) throw new Error('fabric_browser_correlation_invalid');
      expected.set(key, job.url.toString());
      try {
        const response = await runtime.browse({
          url: job.url.toString(),
          actions: job.actions,
          timeout_ms: Math.max(1000, Math.min(job.timeout_ms, deadline_ms)),
          max_text_chars: job.max_text_chars,
          viewport: job.viewport,
          include_screenshot: false,
          include_screenshot_base64: false,
        });
        return response;
      } catch (error) {
        expected.delete(key);
        throw error;
      }
    },
    async workerReceiptVerifier({ capability_key, correlation_id, worker_receipt }) {
      if (capability_key !== PUBLIC_BROWSER_CAPABILITY) return false;
      const key = String(correlation_id || '');
      const target = expected.get(key);
      expected.delete(key);
      if (!target) return false;
      return verifyReadOnlyEvidence(worker_receipt, target);
    },
  };
}
