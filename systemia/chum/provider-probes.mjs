import fs from 'node:fs';
import crypto from 'node:crypto';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const suite = readJson('chum-probes/probe-suite.json');
const matrix = readJson('chum-probes/provider-matrix.json');

const bridgeUrl = String(process.env.CHUM_PROBE_BRIDGE_URL || process.env.NEXUS_PROBE_BRIDGE_URL || '').replace(/\/$/, '');
const bridgeToken = String(process.env.CHUM_PROBE_BRIDGE_TOKEN || process.env.NEXUS_PROBE_BRIDGE_TOKEN || '');
const requestedProviders = String(process.env.CHUM_PROBE_PROVIDERS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const providers = requestedProviders.length ? requestedProviders : suite.providers;
const timeoutMs = 45000;
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

async function runProbe(provider, testCase) {
  const probeId = `${testCase.case_id}:${provider}`;
  const surface = matrix.providers.find((p) => p.provider === provider)?.surface || 'unknown';

  if (!testCase.enabled) {
    return { probe_id: probeId, provider, product_key: testCase.product_key, case_id: testCase.case_id, status: 'blocked', surface, blocked_reason: testCase.blocked_reason || 'case_disabled', observed_at: new Date().toISOString() };
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
  results: []
};

for (const provider of providers) {
  if (!suite.providers.includes(provider)) {
    receipt.results.push({ provider, status: 'blocked', blocked_reason: 'provider_not_in_approved_probe_suite' });
    continue;
  }
  for (const testCase of suite.cases) {
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
receipt.summary = {
  completed: receipt.results.filter((r) => r.status === 'completed').length,
  blocked: receipt.results.filter((r) => r.status === 'blocked').length,
  failed: receipt.results.filter((r) => r.status === 'failed').length,
  pickup_observed: receipt.results.filter((r) => r.evaluation?.pickup_observed).length,
  expected_product_mentions: receipt.results.filter((r) => r.evaluation?.expected_product_mentioned).length,
  expected_host_citations: receipt.results.filter((r) => r.evaluation?.expected_host_cited).length,
  control_false_positives: receipt.results.filter((r) => r.evaluation?.control_false_positive).length
};

fs.mkdirSync('artifacts/chum', { recursive: true });
fs.writeFileSync('artifacts/chum/provider-probe-latest.json', JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM Provider Probe Receipt',
  '',
  `Run: ${receipt.run_id}`,
  `Bridge configured: ${receipt.bridge_configured ? 'yes' : 'no'}`,
  `Completed: ${receipt.summary.completed}`,
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

console.log(JSON.stringify({ run_id: receipt.run_id, bridge_configured: receipt.bridge_configured, require_bridge: requireBridge, summary: receipt.summary }));

if (requireBridge && !receipt.bridge_configured) {
  throw new Error('CHUM provider probes are required for this run, but no authorized probe bridge is configured.');
}

if (requireBridge && receipt.summary.completed === 0) {
  throw new Error('CHUM provider probes are required for this run, but zero provider probes completed.');
}

if (requireBridge && receipt.summary.failed > 0) {
  throw new Error(`CHUM provider probe run contains ${receipt.summary.failed} failed probe(s).`);
}
