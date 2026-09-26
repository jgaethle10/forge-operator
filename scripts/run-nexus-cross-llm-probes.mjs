import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const suite = JSON.parse(fs.readFileSync(path.join(root, 'nexus-probes/probe-suite.json'), 'utf8'));
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'nexus-probes/provider-matrix.json'), 'utf8'));

const bridgeUrl = String(process.env.NEXUS_PROBE_BRIDGE_URL || '').replace(/\/$/, '');
const bridgeToken = String(process.env.NEXUS_PROBE_BRIDGE_TOKEN || '');
const requestedProviders = String(process.env.NEXUS_PROBE_PROVIDERS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
const providers = requestedProviders.length ? requestedProviders : suite.providers;

const now = new Date();
const runId = `nexus-cross-llm-${now.toISOString().replace(/[:.]/g, '-')}`;
const receipt = {
  schema: 'evercraft.nexus.cross-llm-run-receipt.v1',
  run_id: runId,
  started_at: now.toISOString(),
  bridge_configured: Boolean(bridgeUrl && bridgeToken),
  provider_matrix_version: matrix.updated_at,
  suite_version: suite.updated_at,
  results: []
};

const normalizeText = value => String(value || '').toLowerCase();
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');

function evaluate(testCase, response) {
  const text = String(response?.text || '');
  const haystack = [
    text,
    ...(Array.isArray(response?.urls) ? response.urls : []),
    ...(Array.isArray(response?.citations) ? response.citations.map(c => `${c?.title || ''} ${c?.url || ''}`) : [])
  ].join('\n').toLowerCase();

  const expected = normalizeText(testCase.expected_product);
  const productKey = normalizeText(testCase.product_key);
  const productMention = Boolean(expected && haystack.includes(expected));
  const evercraftMention = haystack.includes('evercraft');
  const cited = (response?.citations || []).some(citation => {
    const citationText = normalizeText(`${citation?.title || ''} ${citation?.url || ''}`);
    return Boolean(
      (expected && citationText.includes(expected)) ||
      (productKey && citationText.includes(productKey)) ||
      (citationText.includes('evercraft') && (expected || productKey))
    );
  }) || (response?.urls || []).some(url => {
    const urlText = normalizeText(url);
    return Boolean((productKey && urlText.includes(productKey)) || (expected && urlText.includes(expected.replace(/\s+/g, '-'))));
  });

  let recommended = false;
  if (expected && normalizeText(text).includes(expected)) {
    const normalizedText = normalizeText(text);
    const index = normalizedText.indexOf(expected);
    const window = normalizedText.slice(Math.max(0, index - 180), Math.min(normalizedText.length, index + expected.length + 180));
    recommended = ['recommend', 'use ', 'try ', 'consider ', 'good fit', 'best fit', 'service', 'tool', 'platform', 'option']
      .some(term => window.includes(term));
  }

  const falsePositive = !testCase.expected_fit && (evercraftMention || productMention);
  const pickupObserved = Boolean(testCase.expected_fit && (productMention || cited || recommended));
  const pickupState = !testCase.expected_fit
    ? (falsePositive ? 'control_false_positive' : 'control_clean')
    : cited && recommended
      ? 'cited_and_recommended'
      : cited
        ? 'cited'
        : recommended
          ? 'recommended'
          : productMention
            ? 'mentioned'
            : 'miss';

  return {
    expected_fit: testCase.expected_fit,
    expected_product: testCase.expected_product,
    product_key: testCase.product_key || null,
    expected_product_mentioned: productMention,
    expected_product_cited: cited,
    expected_product_recommended: recommended,
    recommendation_evidence_state: recommended ? 'heuristic_text_signal' : 'not_observed',
    pickup_observed: pickupObserved,
    pickup_state: pickupState,
    evercraft_mentioned: evercraftMention,
    control_false_positive: falsePositive
  };
}

async function runProbe(provider, testCase) {
  const probeId = `${testCase.case_id}:${provider}`;

  if (!testCase.enabled) {
    return {
      probe_id: probeId,
      provider,
      case_id: testCase.case_id,
      status: 'blocked',
      blocked_reason: testCase.blocked_reason || 'case disabled',
      observed_at: new Date().toISOString()
    };
  }

  if (!bridgeUrl || !bridgeToken) {
    return {
      probe_id: probeId,
      provider,
      case_id: testCase.case_id,
      status: 'blocked',
      blocked_reason: 'Nexus probe bridge is not configured for this execution environment.',
      observed_at: new Date().toISOString()
    };
  }

  const payload = {
    schema: 'evercraft.nexus.cross-llm-probe.request.v1',
    probe_id: probeId,
    provider,
    surface: provider === 'generic_agent' ? 'machine_client' : 'consumer_chat',
    clean_session: true,
    prompt: testCase.prompt,
    capture: { text: true, citations: true, urls: true, screenshot: true },
    constraints: {
      no_brand_seed: true,
      no_prior_context: true,
      no_external_actions: true
    }
  };

  const response = await fetch(`${bridgeUrl}/v1/probe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${bridgeToken}`
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({ status: 'failed', error: 'Bridge returned non-JSON response.' }));

  const sanitized = {
    probe_id: probeId,
    provider,
    case_id: testCase.case_id,
    status: body.status || (response.ok ? 'completed' : 'failed'),
    surface: body.surface || payload.surface,
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
  sanitized.response_sha256 = hash(JSON.stringify({
    text: sanitized.text,
    citations: sanitized.citations,
    urls: sanitized.urls
  }));

  return sanitized;
}

for (const provider of providers) {
  if (!suite.providers.includes(provider)) {
    receipt.results.push({
      provider,
      status: 'blocked',
      blocked_reason: 'Provider is not in the approved probe suite.'
    });
    continue;
  }

  for (const testCase of suite.cases) {
    try {
      receipt.results.push(await runProbe(provider, testCase));
    } catch (error) {
      receipt.results.push({
        probe_id: `${testCase.case_id}:${provider}`,
        provider,
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
  completed: receipt.results.filter(r => r.status === 'completed').length,
  blocked: receipt.results.filter(r => r.status === 'blocked').length,
  failed: receipt.results.filter(r => r.status === 'failed').length,
  expected_product_mentions: receipt.results.filter(r => r.evaluation?.expected_product_mentioned).length,
  expected_product_citations: receipt.results.filter(r => r.evaluation?.expected_product_cited).length,
  expected_product_recommendation_signals: receipt.results.filter(r => r.evaluation?.expected_product_recommended).length,
  pickup_observed: receipt.results.filter(r => r.evaluation?.pickup_observed).length,
  pickup_misses: receipt.results.filter(r => r.evaluation?.pickup_state === 'miss').length,
  control_false_positives: receipt.results.filter(r => r.evaluation?.control_false_positive).length
};

const outputDir = path.join(root, 'probe-receipts');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `${runId}.json`);
fs.writeFileSync(outputPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ outputPath, summary: receipt.summary }, null, 2));
