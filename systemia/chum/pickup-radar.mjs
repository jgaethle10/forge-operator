#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = (value) => clean(value).toLowerCase();

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(dir, name));
}

function recommendationSignal(text, product) {
  const haystack = lower(text);
  const expected = lower(product);
  if (!haystack || !expected || !haystack.includes(expected)) return false;
  const verbs = ['recommend', 'use ', 'try ', 'consider ', 'good fit', 'best fit', 'service', 'tool', 'platform', 'option'];
  const index = haystack.indexOf(expected);
  const window = haystack.slice(Math.max(0, index - 180), Math.min(haystack.length, index + expected.length + 180));
  return verbs.some((term) => window.includes(term));
}

function citationSignal(result, productKey, expectedProduct) {
  const productNeedle = lower(expectedProduct);
  const keyNeedle = lower(productKey);
  return (result.citations || []).some((citation) => {
    const text = lower(`${citation?.title || ''} ${citation?.url || ''}`);
    return (productNeedle && text.includes(productNeedle)) ||
      (keyNeedle && text.includes(keyNeedle)) ||
      (text.includes('evercraft') && (productNeedle || keyNeedle));
  }) || (result.urls || []).some((url) => {
    const text = lower(url);
    return (keyNeedle && text.includes(keyNeedle)) || (productNeedle && text.includes(productNeedle.replace(/\s+/g, '-')));
  });
}

function evaluateResult(result, testCase) {
  const text = clean(result.text || '');
  const expectedProduct = clean(testCase?.expected_product || result.evaluation?.expected_product || '');
  const productKey = clean(testCase?.product_key || result.product_key || '');
  const mention = result.evaluation?.expected_product_mentioned === true ||
    (expectedProduct && lower(text).includes(lower(expectedProduct)));
  const cited = result.evaluation?.expected_product_cited === true ||
    citationSignal(result, productKey, expectedProduct);
  const recommended = result.evaluation?.expected_product_recommended === true ||
    recommendationSignal(text, expectedProduct);
  const expectedFit = testCase?.expected_fit ?? result.evaluation?.expected_fit ?? false;
  const falsePositive = result.evaluation?.control_false_positive === true ||
    (!expectedFit && (lower(text).includes('evercraft') || Boolean(expectedProduct && mention)));

  const score = expectedFit
    ? Math.min(10, (mention ? 4 : 0) + (cited ? 3 : 0) + (recommended ? 2 : 0) + (result.provider_receipt ? 1 : 0))
    : (falsePositive ? -4 : 0);

  const state = !expectedFit
    ? (falsePositive ? 'control_false_positive' : 'control_clean')
    : cited && recommended
      ? 'cited_and_recommended'
      : cited
        ? 'cited'
        : recommended
          ? 'recommended'
          : mention
            ? 'mentioned'
            : 'miss';

  return {
    expected_fit: Boolean(expectedFit),
    product_key: productKey || null,
    expected_product: expectedProduct || null,
    mentioned: Boolean(mention),
    cited: Boolean(cited),
    recommended: Boolean(recommended),
    recommendation_evidence_state: recommended ? 'heuristic_text_signal' : 'not_observed',
    false_positive: Boolean(falsePositive),
    pickup_observed: Boolean(expectedFit && (mention || cited || recommended)),
    state,
    score,
    provider_receipt_present: Boolean(result.provider_receipt),
  };
}

function loadProbeReceipts(dir, suite) {
  const caseById = new Map((suite?.cases || []).map((row) => [row.case_id, row]));
  const rows = [];
  for (const file of listJson(dir)) {
    const receipt = readJson(file);
    if (receipt?.schema !== 'evercraft.nexus.cross-llm-run-receipt.v1') continue;
    for (const result of receipt.results || []) {
      if (result?.status !== 'completed') continue;
      const testCase = caseById.get(result.case_id);
      if (!testCase) continue;
      rows.push({
        source: 'nexus_probe_receipt',
        source_file: file,
        run_id: receipt.run_id,
        observed_at: result.observed_at || receipt.completed_at || receipt.started_at || null,
        provider: clean(result.provider),
        case_id: clean(result.case_id),
        ...evaluateResult(result, testCase),
        receipt_hash: result.provider_receipt ? sha256(JSON.stringify(result.provider_receipt)) : null,
        response_sha256: result.response_sha256 || null,
      });
    }
  }
  return rows;
}

function loadProviderObservations(dir) {
  const rows = [];
  for (const file of listJson(dir)) {
    const observation = readJson(file);
    if (observation?.schema !== 'evercraft.provider-observation.v1') continue;
    const surfaced = Object.entries(observation)
      .filter(([key]) => key.startsWith('surfaced_'))
      .some(([, value]) => value === true);
    rows.push({
      source: 'provider_observation',
      source_file: file,
      run_id: null,
      observed_at: observation.observed_at || null,
      provider: clean(observation.provider),
      case_id: clean(observation.case_id || ''),
      expected_fit: true,
      product_key: clean(observation.product_key || ''),
      expected_product: null,
      mentioned: surfaced,
      cited: false,
      recommended: false,
      recommendation_evidence_state: 'not_measured',
      false_positive: false,
      pickup_observed: surfaced,
      state: surfaced ? 'mentioned' : 'miss',
      score: surfaced ? 4 : 0,
      provider_receipt_present: Boolean(observation.provider_receipt_sha256 || observation.evidence_state === 'provider_receipt_hashed'),
      receipt_hash: observation.provider_receipt_sha256 || null,
      response_sha256: observation.response_sha256 || null,
    });
  }
  return rows;
}

function latestRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = [row.provider, row.case_id || row.product_key, row.product_key || 'control'].join('|');
    const prior = byKey.get(key);
    const currentTime = Date.parse(row.observed_at || '') || 0;
    const priorTime = Date.parse(prior?.observed_at || '') || 0;
    if (!prior || currentTime >= priorTime || (row.source === 'nexus_probe_receipt' && prior.source !== 'nexus_probe_receipt')) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function repairActions(productKey, providerStates) {
  const misses = providerStates.filter((row) => row.state === 'miss');
  const cited = providerStates.filter((row) => row.cited);
  const mentioned = providerStates.filter((row) => row.mentioned);
  const recommended = providerStates.filter((row) => row.recommended);
  const actions = [];

  if (misses.length) {
    actions.push({
      action: 'strengthen_problem_language',
      target: `public/chum/products/${productKey}/llms.txt`,
      reason: 'At least one clean provider probe did not surface the expected product.',
    });
    actions.push({
      action: 'strengthen_answer_door',
      target: 'public/chum/answers/',
      reason: 'Brand-blind problem language needs a stronger public answer path.',
    });
    actions.push({
      action: 'raise_crawl_pressure',
      target: `/chum/products/${productKey}/`,
      reason: 'Pickup miss should feed CHUM crawl priority until a fresh provider receipt improves.',
    });
  }

  if (mentioned.length && !cited.length) {
    actions.push({
      action: 'improve_citation_surface',
      target: `public/chum/products/${productKey}/ai-discovery.json`,
      reason: 'Providers mention the product but are not linking or citing a machine-readable source.',
    });
  }

  if ((mentioned.length || cited.length) && !recommended.length) {
    actions.push({
      action: 'clarify_fit_language',
      target: `public/chum/products/${productKey}/index.html`,
      reason: 'The product is surfacing but recommendation-fit language is weak or not observed.',
    });
  }

  actions.push({
    action: 'rerun_brand_blind_probe',
    target: productKey,
    reason: 'Repairs are not considered successful until a later authorized clean-session provider receipt improves the pickup state.',
  });

  return actions;
}

export function buildPickupRadar({
  root = process.cwd(),
  probeReceiptsDir = path.join(root, 'probe-receipts'),
  observationsDir = path.join(root, 'conformance', 'provider-observations'),
  suitePath = path.join(root, 'nexus-probes', 'probe-suite.json'),
  now = new Date(),
} = {}) {
  const suite = readJson(suitePath);
  if (suite?.schema !== 'evercraft.nexus.cross-llm-probe-suite.v1') {
    throw new Error('nexus-probes/probe-suite.json is required.');
  }

  const rawRows = [
    ...loadProviderObservations(observationsDir),
    ...loadProbeReceipts(probeReceiptsDir, suite),
  ];
  const rows = latestRows(rawRows);

  const productKeys = [...new Set((suite.cases || [])
    .filter((row) => row.expected_fit === true && row.product_key)
    .map((row) => row.product_key))];

  const products = productKeys.map((productKey) => {
    const states = rows.filter((row) => row.product_key === productKey && row.expected_fit);
    const providersObserved = new Set(states.map((row) => row.provider).filter(Boolean));
    const pickup = states.filter((row) => row.pickup_observed).length;
    const cited = states.filter((row) => row.cited).length;
    const recommended = states.filter((row) => row.recommended).length;
    const misses = states.filter((row) => row.state === 'miss').length;
    const denom = states.length || 1;
    const pickupRate = states.length ? pickup / denom : null;
    const score = states.length
      ? Math.round(states.reduce((sum, row) => sum + Math.max(0, row.score), 0) / (states.length * 10) * 100)
      : null;

    return {
      product_key: productKey,
      expected_product: suite.cases.find((row) => row.product_key === productKey)?.expected_product || productKey,
      providers_observed: [...providersObserved].sort(),
      observations: states.length,
      pickup_count: pickup,
      citation_count: cited,
      recommendation_signal_count: recommended,
      miss_count: misses,
      pickup_rate: pickupRate,
      pickup_score_100: score,
      state: states.length === 0
        ? 'unmeasured'
        : misses > 0
          ? 'repair_needed'
          : cited > 0 || recommended > 0
            ? 'pickup_observed'
            : 'mention_only',
      provider_states: states
        .map((row) => ({
          provider: row.provider,
          case_id: row.case_id || null,
          observed_at: row.observed_at,
          state: row.state,
          score: row.score,
          mentioned: row.mentioned,
          cited: row.cited,
          recommended: row.recommended,
          recommendation_evidence_state: row.recommendation_evidence_state,
          provider_receipt_present: row.provider_receipt_present,
          evidence_ref: row.source_file,
        }))
        .sort((a, b) => String(a.provider).localeCompare(String(b.provider))),
      repair_queue: repairActions(productKey, states),
    };
  }).sort((a, b) => {
    const aScore = a.pickup_score_100 ?? -1;
    const bScore = b.pickup_score_100 ?? -1;
    return aScore - bScore || b.miss_count - a.miss_count || a.product_key.localeCompare(b.product_key);
  });

  const controls = rows.filter((row) => !row.expected_fit);
  const payload = {
    schema: 'evercraft.chum.pickup-radar.v1',
    generated_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    coordinator: 'CHUM',
    measurement_owner: 'Nexus',
    evidence: {
      clean_session_required: true,
      brand_seed_forbidden: true,
      provider_behavior_requires_receipt: true,
      recommendation_signal_is_heuristic: true,
      mention_is_not_recommendation: true,
      recommendation_is_not_conversion: true,
    },
    privacy: {
      full_provider_response_published: false,
      session_reference_published: false,
      credentials_published: false,
    },
    summary: {
      products: products.length,
      measured_products: products.filter((row) => row.state !== 'unmeasured').length,
      repair_needed: products.filter((row) => row.state === 'repair_needed').length,
      pickup_observed: products.filter((row) => row.state === 'pickup_observed').length,
      provider_observations: rows.filter((row) => row.expected_fit).length,
      negative_controls: controls.length,
      control_false_positives: controls.filter((row) => row.false_positive).length,
    },
    products,
    controls: controls.map((row) => ({
      provider: row.provider,
      case_id: row.case_id,
      state: row.state,
      false_positive: row.false_positive,
      observed_at: row.observed_at,
      evidence_ref: row.source_file,
    })),
  };

  const publicDir = path.join(root, 'public', 'chum');
  const artifactDir = path.join(root, 'artifacts', 'chum');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'pickup-radar.json'), JSON.stringify(payload, null, 2) + '\n');

  const lines = [
    'Evercraft CHUM Pickup Radar',
    'Generated: ' + payload.generated_at,
    'Measured products: ' + payload.summary.measured_products + '/' + payload.summary.products,
    'Repair needed: ' + payload.summary.repair_needed,
    'Control false positives: ' + payload.summary.control_false_positives,
    '',
    ...products.map((row) =>
      `${row.product_key}: state=${row.state} pickup_score=${row.pickup_score_100 ?? 'unmeasured'} misses=${row.miss_count} citations=${row.citation_count} recommendation_signals=${row.recommendation_signal_count}`
    ),
    '',
    'Truth boundary: a product mention is not a recommendation, a recommendation signal is heuristic unless the provider supplies a structured recommendation field, and neither recommendation nor citation is conversion.',
    ''
  ];
  fs.writeFileSync(path.join(publicDir, 'pickup-radar.txt'), lines.join('\n'));
  fs.writeFileSync(path.join(artifactDir, 'pickup-radar-latest.json'), JSON.stringify(payload, null, 2) + '\n');

  return payload;
}

async function main() {
  const payload = buildPickupRadar();
  console.log(JSON.stringify({
    ok: true,
    schema: payload.schema,
    products: payload.summary.products,
    measured: payload.summary.measured_products,
    repair_needed: payload.summary.repair_needed,
    control_false_positives: payload.summary.control_false_positives,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
