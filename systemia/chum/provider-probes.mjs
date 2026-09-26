import fs from 'node:fs';
import crypto from 'node:crypto';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const suite = readJson('chum-probes/probe-suite.json');
const matrix = readJson('chum-probes/provider-matrix.json');

const bridgeUrl = String(process.env.CHUM_PROBE_BRIDGE_URL || process.env.NEXUS_PROBE_BRIDGE_URL || '').replace(/\/$/, '');
const bridgeToken = String(process.env.CHUM_PROBE_BRIDGE_TOKEN || process.env.NEXUS_PROBE_BRIDGE_TOKEN || '');
const genericAgentSearchUrl = String(process.env.CHUM_GENERIC_AGENT_SEARCH_URL || 'https://neuronto.com/search').trim();
const requestedProviders = String(process.env.CHUM_PROBE_PROVIDERS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const providers = requestedProviders.length ? requestedProviders : suite.providers;
const requestedCases = String(process.env.CHUM_PROBE_CASES || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const cases = requestedCases.length
  ? suite.cases.filter((testCase) => requestedCases.includes(testCase.case_id))
  : suite.cases;
const unknownRequestedCases = requestedCases.filter(
  (caseId) => !suite.cases.some((testCase) => testCase.case_id === caseId)
);
const timeoutMs = 45000;
const genericAgentTimeoutMs = 20000;
const genericAgentMaxAttempts = Math.max(1, Number(process.env.CHUM_GENERIC_AGENT_MAX_ATTEMPTS || 3));
const genericAgentRetryBaseMs = Math.max(0, Number(process.env.CHUM_GENERIC_AGENT_RETRY_BASE_MS || 1200));
const transientGenericAgentStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requireBridge = process.env.CHUM_REQUIRE_PROBE_BRIDGE === 'true' || process.argv.includes('--require-bridge');

const normalize = (value) => String(value || '').toLowerCase();
const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

function evaluate(testCase, response) {
  const citations = Array.isArray(response?.citations) ? response.citations : [];
  const urls = Array.isArray(response?.urls) ? response.urls : [];
  const haystack = [
    response?.text,
    ...urls,
    ...citations.map((c) => `${c?.title || ''} ${c?.url || ''}`)
  ].join('\n').toLowerCase();

  const aliases = [
    testCase.expected_product,
    ...(Array.isArray(testCase.expected_aliases) ? testCase.expected_aliases : [])
  ].filter(Boolean).map(normalize);
  const hosts = (testCase.expected_hosts || []).map(normalize);

  const expectedProductMentioned = aliases.some((alias) => alias && haystack.includes(alias));
  const expectedHostCited = hosts.some((host) => host && haystack.includes(host));
  const evercraftMentioned = haystack.includes('evercraft');
  const falsePositive = !testCase.expected_fit && (evercraftMentioned || expectedProductMentioned || expectedHostCited);

  return {
    expected_fit: Boolean(testCase.expected_fit),
    expected_product: testCase.expected_product || null,
    expected_product_mentioned: expectedProductMentioned,
    expected_host_cited: expectedHostCited,
    evercraft_mentioned: evercraftMentioned,
    control_false_positive: falsePositive,
    pickup_observed: Boolean(testCase.expected_fit && (expectedProductMentioned || expectedHostCited))
  };
}

async function runGenericAgentProbe(testCase, probeId, surface) {
  if (!genericAgentSearchUrl) {
    return { probe_id: probeId, provider: 'generic_agent', product_key: testCase.product_key, case_id: testCase.case_id, status: 'blocked', surface, blocked_reason: 'generic_agent_discovery_surface_not_configured', observed_at: new Date().toISOString() };
  }

  const source = (() => { try { return new URL(genericAgentSearchUrl).origin; } catch { return 'configured_generic_agent_search'; } })();
  let lastError = null;

  for (let attempt = 1; attempt <= genericAgentMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), genericAgentTimeoutMs);
    try {
      const response = await fetch(genericAgentSearchUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Evercraft-CHUM-Generic-Agent-Probe/1.1'
        },
        body: JSON.stringify({ query: { text: testCase.prompt }, federation: 'auto' }),
        signal: controller.signal
      });
      const bodyText = await response.text();

      if (!response.ok && transientGenericAgentStatuses.has(response.status) && attempt < genericAgentMaxAttempts) {
        lastError = `HTTP ${response.status}: ${bodyText.slice(0, 500)}`;
        await sleep(genericAgentRetryBaseMs * attempt);
        continue;
      }

      let body = null;
      try { body = JSON.parse(bodyText); } catch {}
      const results = Array.isArray(body?.results) ? body.results : [];
      const citations = results.slice(0, 10).map((row) => ({
        title: row?.displayName || row?.identifier || 'Federated agent discovery result',
        url: row?.url || row?.source || '',
        source: row?.source || null
      })).filter((row) => row.url);
      const urls = [...new Set(citations.map((row) => row.url))];
      const text = results.slice(0, 10).map((row) => [
        row?.displayName || row?.identifier || '',
        row?.description || '',
        row?.url || '',
        row?.source || ''
      ].filter(Boolean).join(' | ')).join('\n');

      const sanitized = {
        probe_id: probeId,
        provider: 'generic_agent',
        product_key: testCase.product_key,
        case_id: testCase.case_id,
        status: response.ok ? 'completed' : 'failed',
        surface,
        session_ref: null,
        text,
        citations,
        urls,
        screenshot_ref: null,
        provider_receipt: {
          schema: 'evercraft.chum.generic-agent-provider-receipt.v1',
          engine: 'federated_agent_discovery',
          source,
          http_status: response.status,
          result_count: results.length,
          attempt,
          max_attempts: genericAgentMaxAttempts,
          query_sha256: sha256(testCase.prompt),
          response_sha256: sha256(JSON.stringify(results)),
          observed_at: new Date().toISOString()
        },
        blocked_reason: null,
        error: response.ok ? null : `HTTP ${response.status}: ${bodyText.slice(0, 500)}`,
        observed_at: new Date().toISOString()
      };
      sanitized.evaluation = evaluate(testCase, sanitized);
      sanitized.response_sha256 = sha256(JSON.stringify({ text: sanitized.text, citations: sanitized.citations, urls: sanitized.urls }));
      return sanitized;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < genericAgentMaxAttempts) {
        await sleep(genericAgentRetryBaseMs * attempt);
        continue;
      }
      const failed = {
        probe_id: probeId,
        provider: 'generic_agent',
        product_key: testCase.product_key,
        case_id: testCase.case_id,
        status: 'failed',
        surface,
        session_ref: null,
        text: '',
        citations: [],
        urls: [],
        screenshot_ref: null,
        provider_receipt: {
          schema: 'evercraft.chum.generic-agent-provider-receipt.v1',
          engine: 'federated_agent_discovery',
          source,
          http_status: null,
          result_count: 0,
          attempt,
          max_attempts: genericAgentMaxAttempts,
          query_sha256: sha256(testCase.prompt),
          response_sha256: sha256('[]'),
          observed_at: new Date().toISOString()
        },
        blocked_reason: null,
        error: lastError,
        observed_at: new Date().toISOString()
      };
      failed.evaluation = evaluate(testCase, failed);
      failed.response_sha256 = sha256(JSON.stringify({ text: failed.text, citations: failed.citations, urls: failed.urls }));
      return failed;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError || 'generic_agent_probe_exhausted');
}

async function runProbe(provider, testCase) {
  const probeId = `${testCase.case_id}:${provider}`;
  const surface = matrix.providers.find((p) => p.provider === provider)?.surface || 'unknown';

  if (!testCase.enabled) {
    return { probe_id: probeId, provider, product_key: testCase.product_key, case_id: testCase.case_id, status: 'blocked', surface, blocked_reason: testCase.blocked_reason || 'case_disabled', observed_at: new Date().toISOString() };
  }

  if (provider === 'generic_agent') {
    return runGenericAgentProbe(testCase, probeId, surface);
  }

  if (!bridgeUrl || !bridgeToken) {
    return { probe_id: probeId, provider, product_key: testCase.product_key, case_id: testCase.case_id, status: 'blocked', surface, blocked_reason: 'authorized_probe_bridge_not_configured', observed_at: new Date().toISOString() };
  }

  const payload = {
    schema: 'evercraft.chum.cross-llm-probe.request.v1',
    probe_id: probeId,
    provider,
    surface,
    clean_session: true,
    prompt: testCase.prompt,
    capture: { text: true, citations: true, urls: true, screenshot: true },
    constraints: { no_brand_seed: true, no_prior_context: true, no_external_actions: true }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeUrl}/v1/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bridgeToken}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({ status: 'failed', error: 'bridge_non_json_response' }));

    const sanitized = {
      probe_id: probeId,
      provider,
      product_key: testCase.product_key,
      case_id: testCase.case_id,
      status: body.status || (response.ok ? 'completed' : 'failed'),
      surface: body.surface || surface,
      session_ref: body.session_ref || null,
      text: body.text || '',
      citations: Array.isArray(body.citations) ? body.citations : [],
      urls: Array.isArray(body.urls) ? body.urls : [],
      screenshot_ref: body.screenshot_ref || null,
      provider_receipt: body.provider_receipt || null,
      blocked_reason: body.blocked_reason || null,
      error: body.error || (!response.ok ? `HTTP ${response.status}` : null),
      observed_at: new Date().toISOString()
    };
    sanitized.evaluation = evaluate(testCase, sanitized);
    sanitized.response_sha256 = sha256(JSON.stringify({ text: sanitized.text, citations: sanitized.citations, urls: sanitized.urls }));
    return sanitized;
  } finally {
    clearTimeout(timer);
  }
}

const startedAt = new Date();
const receipt = {
  schema: 'evercraft.chum.cross-llm-run-receipt.v1',
  run_id: `chum-cross-llm-${startedAt.toISOString().replace(/[:.]/g, '-')}`,
  started_at: startedAt.toISOString(),
  bridge_configured: Boolean(bridgeUrl && bridgeToken),
  providers,
  requested_cases: requestedCases,
  selected_cases: cases.map((testCase) => testCase.case_id),
  unknown_requested_cases: unknownRequestedCases,
  results: []
};

for (const provider of providers) {
  if (!suite.providers.includes(provider)) {
    receipt.results.push({ provider, status: 'blocked', blocked_reason: 'provider_not_in_approved_probe_suite' });
    continue;
  }
  for (const testCase of cases) {
    try {
      receipt.results.push(await runProbe(provider, testCase));
    } catch (error) {
      receipt.results.push({
        probe_id: `${testCase.case_id}:${provider}`,
        provider,
        product_key: testCase.product_key,
        case_id: testCase.case_id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        observed_at: new Date().toISOString()
      });
    }
  }
}

receipt.completed_at = new Date().toISOString();
const consumerResults = receipt.results.filter((r) => r.provider && r.provider !== 'generic_agent');
const machineResults = receipt.results.filter((r) => r.provider === 'generic_agent');
receipt.summary = {
  completed: receipt.results.filter((r) => r.status === 'completed').length,
  blocked: receipt.results.filter((r) => r.status === 'blocked').length,
  failed: receipt.results.filter((r) => r.status === 'failed').length,
  consumer_completed: consumerResults.filter((r) => r.status === 'completed').length,
  consumer_blocked: consumerResults.filter((r) => r.status === 'blocked').length,
  machine_completed: machineResults.filter((r) => r.status === 'completed').length,
  machine_blocked: machineResults.filter((r) => r.status === 'blocked').length,
  pickup_observed: receipt.results.filter((r) => r.evaluation?.pickup_observed).length,
  expected_product_mentions: receipt.results.filter((r) => r.evaluation?.expected_product_mentioned).length,
  expected_host_citations: receipt.results.filter((r) => r.evaluation?.expected_host_cited).length,
  control_false_positives: receipt.results.filter((r) => r.evaluation?.control_false_positive).length
};
receipt.measurement_state = receipt.summary.failed > 0 && receipt.summary.completed > 0
  ? 'partial_failure'
  : receipt.summary.failed > 0
    ? 'failed'
    : receipt.summary.machine_completed > 0 && receipt.summary.consumer_completed === 0
      ? 'machine_only_measured'
      : receipt.summary.completed > 0 && receipt.summary.blocked > 0
        ? 'partial_measurement'
        : receipt.summary.completed > 0
          ? 'measured'
          : !receipt.bridge_configured
            ? 'blocked_bridge_not_configured'
            : 'configured_no_completed_probes';

fs.mkdirSync('artifacts/chum', { recursive: true });
fs.writeFileSync('artifacts/chum/provider-probe-latest.json', JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM Provider Probe Receipt',
  '',
  `Run: ${receipt.run_id}`,
  `Bridge configured: ${receipt.bridge_configured ? 'yes' : 'no'}`,
  `Measurement state: ${receipt.measurement_state}`,
  `Completed: ${receipt.summary.completed}`,
  `Consumer completed: ${receipt.summary.consumer_completed}`,
  `Machine-client completed: ${receipt.summary.machine_completed}`,
  `Blocked: ${receipt.summary.blocked}`,
  `Failed: ${receipt.summary.failed}`,
  `Observed expected pickup: ${receipt.summary.pickup_observed}`,
  `Control false positives: ${receipt.summary.control_false_positives}`,
  '',
  '| Provider | Case | Product | Status | Pickup | Mention | Citation |',
  '|---|---|---|---|---|---|---|',
  ...receipt.results.map((r) => `| ${r.provider || ''} | ${r.case_id || ''} | ${r.product_key || 'control'} | ${r.status} | ${r.evaluation?.pickup_observed ? 'yes' : 'no'} | ${r.evaluation?.expected_product_mentioned ? 'yes' : 'no'} | ${r.evaluation?.expected_host_cited ? 'yes' : 'no'} |`)
];
fs.writeFileSync('artifacts/chum/provider-probe-latest.md', md.join('\n') + '\n');

console.log(JSON.stringify({ run_id: receipt.run_id, bridge_configured: receipt.bridge_configured, measurement_state: receipt.measurement_state, require_bridge: requireBridge, summary: receipt.summary }));

if (requestedCases.length && unknownRequestedCases.length) {
  throw new Error(`CHUM provider probe requested unknown case(s): ${unknownRequestedCases.join(', ')}`);
}
if (requestedCases.length && cases.length === 0) {
  throw new Error('CHUM provider probe case filter selected zero cases.');
}
if (requireBridge && !receipt.bridge_configured) {
  throw new Error('CHUM provider probes are required for this run, but no authorized probe bridge is configured.');
}
if (requireBridge && receipt.summary.consumer_completed === 0) {
  throw new Error('CHUM consumer provider probes are required for this run, but zero consumer-chat probes completed.');
}
if (requireBridge && receipt.summary.consumer_blocked > 0) {
  throw new Error(`CHUM consumer provider probe run contains ${receipt.summary.consumer_blocked} blocked probe(s).`);
}
if (requireBridge && receipt.summary.failed > 0) {
  throw new Error(`CHUM provider probe run contains ${receipt.summary.failed} failed probe(s).`);
}
