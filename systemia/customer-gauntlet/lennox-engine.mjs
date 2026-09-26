import crypto from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 20000;
const FAILURE_RX = /application error|internal server error|something went wrong|unexpected error|page not found|404 not found/i;
const PLACEHOLDER_BRAND_RX = /<title[^>]*>\s*(base44 app|vite app|react app|untitled)\s*<\/title>/i;
const CTA_RX = /\b(buy|purchase|checkout|continue|start|order|upgrade|get report|see pricing|pricing|sign in|open report|check my site|review offer)\b/i;
const INTERACTIVE_RX = /<(a|button|input|select|textarea|form)\b/i;
const LABEL_RX = /<(label|button)\b|aria-label=|aria-labelledby=/i;
const LANG_RX = /<html[^>]+lang=/i;
const VIEWPORT_RX = /<meta[^>]+name=["']viewport["'][^>]*>/i;

const sha = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

function expectedPrices(offer) {
  const source = [
    offer?.pricing,
    ...(Array.isArray(offer?.offers) ? offer.offers.flatMap(row => [row?.price, row?.price_usd, row?.name]) : [])
  ].filter(Boolean).join(' ');
  const matches = [...source.matchAll(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)]
    .map(match => match[1].replace(/,/g,''));
  return [...new Set(matches)];
}

function containsExpectedPrice(text, prices) {
  if (!prices.length) return null;
  const normalized = String(text || '').replace(/,/g,'');
  return prices.some(value => normalized.includes('$' + value) || normalized.includes('$ ' + value));
}

async function fetchText(url, { personaId, sessionId, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/json,text/plain;q=0.8,*/*;q=0.2',
        'user-agent': `Evercraft-Raven-Nexus-Lennox/1.0 (${personaId || 'unknown'})`,
        'x-evercraft-lennox-node': personaId || 'unknown',
        'x-evercraft-lennox-session': sessionId || 'unknown',
        'cache-control': 'no-cache'
      },
      signal: controller.signal
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      content_type: response.headers.get('content-type') || '',
      bytes: Buffer.byteLength(text),
      latency_ms: Date.now() - started,
      text,
      response_sha256: sha(text)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      final_url: String(url || ''),
      content_type: '',
      bytes: 0,
      latency_ms: Date.now() - started,
      text: '',
      response_sha256: sha(''),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function highConfidenceFindings({ offer, persona, response, expectedPriceValues }) {
  const findings = [];
  const text = String(response?.text || '');

  if (!response?.ok || !response?.bytes || FAILURE_RX.test(text.slice(0, 8000))) {
    findings.push({
      code: 'broken_cta',
      severity: 'P1',
      stage: 'lennox_protocol',
      detail: response?.error || `customer target returned HTTP ${response?.status || 0}`
    });
    return findings;
  }

  if (!/^https:\/\//i.test(response.final_url || '')) {
    findings.push({
      code: 'unsafe_transport',
      severity: 'P1',
      stage: 'lennox_protocol',
      detail: `customer target resolved to non-HTTPS URL: ${response.final_url || 'unknown'}`
    });
  }

  if (PLACEHOLDER_BRAND_RX.test(text)) {
    findings.push({
      code: 'severe_brand_mismatch',
      severity: 'P1',
      stage: 'brand',
      detail: 'Public customer surface exposes a placeholder application title.'
    });
  }

  const priceMatch = containsExpectedPrice(text, expectedPriceValues);
  if (priceMatch === false && expectedPriceValues.length && /checkout|buy|purchase|pricing|price|\$/i.test(text)) {
    findings.push({
      code: 'pricing_not_visible',
      severity: 'P2',
      stage: 'promise',
      detail: `Expected published price signal not found on customer target: ${expectedPriceValues.map(v=>'$'+v).join(', ')}`
    });
  }

  if (!CTA_RX.test(text) && INTERACTIVE_RX.test(text)) {
    findings.push({
      code: 'weak_copy',
      severity: 'P2',
      stage: 'conversion',
      detail: 'Interactive customer surface has no obvious purchase/start/continue CTA language.'
    });
  }

  if (persona?.viewport === 'mobile' && !VIEWPORT_RX.test(text)) {
    findings.push({
      code: 'mobile_metadata_missing',
      severity: 'P2',
      stage: 'mobile',
      detail: 'Mobile Lennox node did not observe a viewport meta declaration.'
    });
  }

  if (persona?.id === 'lennox-accessibility') {
    if (!LANG_RX.test(text)) {
      findings.push({
        code: 'accessibility_metadata_missing',
        severity: 'P2',
        stage: 'accessibility',
        detail: 'HTML language metadata was not observed.'
      });
    }
    if (INTERACTIVE_RX.test(text) && !LABEL_RX.test(text)) {
      findings.push({
        code: 'accessibility_label_signal_missing',
        severity: 'P2',
        stage: 'accessibility',
        detail: 'Interactive markup was observed without basic label/ARIA/button text signals.'
      });
    }
  }

  return findings;
}

export async function runLocalLennox({ offer, persona, reviewUrl, buyerUrl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const sessionId = sha(`${offer?.public_id || 'offer'}:${persona?.id || 'persona'}:${Date.now()}:${crypto.randomUUID()}`).slice(0,24);
  const targetUrl = buyerUrl || reviewUrl || offer?.public_url || null;
  const blockedChecks = [
    'rendered_screenshot_capture',
    'visual_clipping',
    'javascript_console_errors',
    'javascript_form_interaction',
    'keyboard_tab_order',
    'broken_image_scan',
    'blank_state_scan',
    'rendered_brand_metadata',
    'checkout_submit',
    'provider_payment_verification',
    'entitlement_verification',
    'fulfillment_verification'
  ];

  if (!targetUrl) {
    return {
      status: 'FAILED',
      engine: 'raven_nexus_lennox_local_v1',
      session_id: sessionId,
      findings: [{
        code: 'broken_cta',
        severity: 'P1',
        stage: 'lennox_protocol',
        detail: 'No customer target URL was available.'
      }],
      blocked_checks: blockedChecks
    };
  }

  const expectedPriceValues = expectedPrices(offer);
  const first = await fetchText(targetUrl, { personaId: persona?.id, sessionId, timeoutMs });
  const attempts = [{ kind:'initial', ...first }];
  let findings = highConfidenceFindings({ offer, persona, response:first, expectedPriceValues });

  if (persona?.id === 'lennox-returning' || persona?.tests?.includes('reopen_purchase')) {
    const reopened = await fetchText(targetUrl, { personaId: persona?.id, sessionId, timeoutMs });
    attempts.push({ kind:'reopen', ...reopened });
    if (!reopened.ok || !reopened.bytes) {
      findings.push({
        code: 'customer_cannot_access_purchase',
        severity: 'P0',
        stage: 'recovery',
        detail: 'Returning Lennox node could not reopen the customer target.'
      });
    }
  }

  if (persona?.id === 'lennox-concurrent' || persona?.tests?.includes('two_tabs')) {
    const [a,b] = await Promise.all([
      fetchText(targetUrl, { personaId: persona?.id, sessionId: sessionId+'-a', timeoutMs }),
      fetchText(targetUrl, { personaId: persona?.id, sessionId: sessionId+'-b', timeoutMs })
    ]);
    attempts.push({ kind:'concurrent_a', ...a }, { kind:'concurrent_b', ...b });
    if (!a.ok || !b.ok) {
      findings.push({
        code: 'concurrent_customer_path_failure',
        severity: 'P1',
        stage: 'concurrency',
        detail: `Concurrent customer reads diverged: A=${a.status}, B=${b.status}`
      });
    }
  }

  if (persona?.id === 'lennox-checkout-retry' || persona?.tests?.includes('refresh_checkout')) {
    const retry = await fetchText(targetUrl, { personaId: persona?.id, sessionId, timeoutMs });
    attempts.push({ kind:'retry', ...retry });
    if (!retry.ok || !retry.bytes) {
      findings.push({
        code: 'checkout_cancel_loop',
        severity: 'P1',
        stage: 'recovery',
        detail: 'Checkout/review target was not readable on retry.'
      });
    }
  }

  findings = findings.filter((row,index,array) =>
    array.findIndex(other => other.code===row.code && other.stage===row.stage && other.detail===row.detail) === index
  );

  return {
    status: findings.some(f=>f.severity==='P0'||f.severity==='P1') ? 'COMPLETED_WITH_FINDINGS' : 'COMPLETED_PARTIAL',
    engine: 'raven_nexus_lennox_local_v1',
    owned_execution: true,
    independent_session: true,
    session_id: sessionId,
    target_url: targetUrl,
    checks_completed: [
      'transport_reachability',
      'redirect_resolution',
      'nonempty_response',
      'https_transport',
      'placeholder_brand_detection',
      'published_price_signal',
      'cta_language_signal',
      'mobile_viewport_metadata',
      'basic_accessibility_metadata',
      ...(attempts.some(a=>a.kind==='reopen')?['reopen_purchase']:[]),
      ...(attempts.some(a=>a.kind.startsWith('concurrent_'))?['concurrent_reads']:[]),
      ...(attempts.some(a=>a.kind==='retry')?['retry_read']:[])
    ],
    blocked_checks: blockedChecks,
    findings,
    attempts: attempts.map(a => ({
      kind:a.kind,
      ok:a.ok,
      status:a.status,
      final_url:a.final_url,
      content_type:a.content_type,
      bytes:a.bytes,
      latency_ms:a.latency_ms,
      response_sha256:a.response_sha256,
      error:a.error || null
    }))
  };
}
