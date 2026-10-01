#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ingestYvlBrowserResult } from '../household-fabric/yvl-pipeline.mjs';
import { runYakimaPriceProviderCycle } from '../household-fabric/price-provider-cycle.mjs';
import { emptyLedger } from '../household-fabric/ingest.mjs';

const CADENCE_SECONDS = 300;
const DEFAULT_OUT = 'artifacts/household-fabric/yakima';
const YVL_URL = 'https://www.yvl.org/events/';

function clean(value) {
  return String(value ?? '').trim();
}

function cycleKeyFor(now = new Date()) {
  const ms = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const bucket = CADENCE_SECONDS * 1000;
  return new Date(Math.floor(ms / bucket) * bucket).toISOString();
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function materialFingerprint(today) {
  const payload = {
    status: today.status,
    headline: today.headline,
    degraded_categories: [...(today.coverage?.degraded_categories || [])].sort(),
    opportunities: (today.opportunities || []).map(row => ({
      id: row.id,
      title: row.title,
      category: row.category,
      net_value_cents: row.net_value_cents,
      source_name: row.source_name,
      sponsored: Boolean(row.sponsored),
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function finalizeCycle({
  eventRun,
  today,
  ledger,
  receipts,
  sourceRuns = [],
  priceIndex = null,
  observationCount = 0,
  previousState,
  cycleNow,
  sourceObservedAt,
} = {}) {
  const fingerprint = materialFingerprint(today);
  const materialChange = clean(previousState?.material_fingerprint) !== fingerprint;

  return {
    schema: 'evercraft.household-fabric.yakima-cycle.v2',
    workflow_key: 'household-fabric-yakima',
    mission_key: 'household-flourishing-yakima-2026',
    cycle_key: cycleKeyFor(cycleNow),
    cadence_seconds: CADENCE_SECONDS,
    observed_at: cycleNow.toISOString(),
    source_observed_at: sourceObservedAt.toISOString(),
    material_change: materialChange,
    material_fingerprint: fingerprint,
    collector: {
      key: eventRun.collector,
      source_url: eventRun.source_url,
      evidence_receipt_sha256: eventRun.browser_evidence_receipt_sha256,
      collected_count: eventRun.collected_count,
      accepted_count: eventRun.receipts.filter(row => row.status === 'accepted').length,
      deduped_count: eventRun.receipts.filter(row => row.status === 'deduped').length,
    },
    price_sources: sourceRuns,
    price_observation_count: observationCount,
    price_index: priceIndex,
    today,
    ledger,
    receipts,
    mission_snapshot: {
      schema: 'evercraft.household-fabric.mission-snapshot.v2',
      mission_key: 'household-flourishing-yakima-2026',
      cycle_key: cycleKeyFor(cycleNow),
      state: today.status,
      material_change: materialChange,
      opportunity_count: today.headline.opportunities_shown,
      money_kept_cents: today.headline.money_kept_cents,
      money_earned_cents: today.headline.money_earned_cents,
      degraded_categories: today.coverage.degraded_categories,
      source_states: sourceRuns.map(row => ({
        source: row.source,
        state: row.state,
      })),
      evidence_refs: [
        'url:' + eventRun.source_url,
        'browser-receipt:' + eventRun.browser_evidence_receipt_sha256,
      ],
      observed_at: cycleNow.toISOString(),
    },
    state: {
      schema: 'evercraft.household-fabric.yakima-state.v2',
      material_fingerprint: fingerprint,
      last_cycle_key: cycleKeyFor(cycleNow),
      last_material_change_at: materialChange
        ? cycleNow.toISOString()
        : previousState?.last_material_change_at || null,
      last_source_observed_at: sourceObservedAt.toISOString(),
      last_price_source_states: sourceRuns.map(row => ({
        source: row.source,
        state: row.state,
      })),
    },
  };
}

export function evaluateYakimaHouseholdCycle({
  browserResult,
  ledger = emptyLedger(),
  previousState = null,
  now = new Date(),
} = {}) {
  if (!browserResult || browserResult.ok !== true) {
    throw new Error('successful browser result is required');
  }

  const cycleNow = now instanceof Date ? now : new Date(now);
  const sourceObservedAt = new Date(browserResult.finished_at || cycleNow);
  const eventRun = ingestYvlBrowserResult(browserResult, {
    now: sourceObservedAt,
    ledger,
    geography: 'yakima-wa',
    mode: 'holiday_pressure',
  });

  return finalizeCycle({
    eventRun,
    today: eventRun.today,
    ledger: eventRun.ledger,
    receipts: eventRun.receipts,
    previousState,
    cycleNow,
    sourceObservedAt,
  });
}

export async function executeYakimaHouseholdCycle({
  browserResult,
  ledger = emptyLedger(),
  previousState = null,
  now = new Date(),
  google = {},
  kroger = {},
  priceOptions = {},
  fetchImpl = fetch,
  priceClients = {},
} = {}) {
  if (!browserResult || browserResult.ok !== true) {
    throw new Error('successful browser result is required');
  }

  const cycleNow = now instanceof Date ? now : new Date(now);
  const sourceObservedAt = new Date(browserResult.finished_at || cycleNow);
  const eventRun = ingestYvlBrowserResult(browserResult, {
    now: sourceObservedAt,
    ledger,
    geography: 'yakima-wa',
    mode: 'holiday_pressure',
  });

  const priceRun = await runYakimaPriceProviderCycle({
    now: cycleNow,
    ledger: eventRun.ledger,
    google,
    kroger,
    price_options: priceOptions,
    fetch_impl: fetchImpl,
    clients: priceClients,
  });

  return finalizeCycle({
    eventRun,
    today: priceRun.today,
    ledger: priceRun.ledger,
    receipts: [...eventRun.receipts, ...priceRun.receipts],
    sourceRuns: priceRun.source_runs,
    priceIndex: priceRun.price_index,
    observationCount: priceRun.observation_count,
    previousState,
    cycleNow,
    sourceObservedAt,
  });
}

function parseJsonArray(value, fallback = []) {
  const raw = clean(value);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function providerConfigFromEnvironment(env = process.env) {
  return {
    google: {
      api_key: clean(env.HOUSEHOLD_GOOGLE_PLACES_API_KEY),
      latitude: env.HOUSEHOLD_GOOGLE_CENTER_LAT || undefined,
      longitude: env.HOUSEHOLD_GOOGLE_CENTER_LONG || undefined,
      radius_meters: env.HOUSEHOLD_GOOGLE_RADIUS_METERS || undefined,
      max_results: env.HOUSEHOLD_GOOGLE_MAX_RESULTS || undefined,
    },
    kroger: {
      client_id: clean(env.HOUSEHOLD_KROGER_CLIENT_ID),
      client_secret: clean(env.HOUSEHOLD_KROGER_CLIENT_SECRET),
      zip_code: clean(env.HOUSEHOLD_KROGER_ZIP_CODE) || '98902',
      locations: parseJsonArray(env.HOUSEHOLD_KROGER_LOCATIONS_JSON, []),
      terms: clean(env.HOUSEHOLD_KROGER_TERMS)
        ? clean(env.HOUSEHOLD_KROGER_TERMS).split(',').map(clean).filter(Boolean)
        : undefined,
      limit_per_term: env.HOUSEHOLD_KROGER_LIMIT_PER_TERM || undefined,
    },
    priceOptions: {
      mileage_cost_cents: env.HOUSEHOLD_MILEAGE_COST_CENTS || undefined,
      time_value_cents_per_hour: env.HOUSEHOLD_TIME_VALUE_CENTS_PER_HOUR || undefined,
      friction_cents_per_step: env.HOUSEHOLD_FRICTION_CENTS_PER_STEP || undefined,
    },
  };
}

function parseArgs(argv) {
  const out = {
    browserResult: '',
    browserEdge: process.env.HOUSEHOLD_FABRIC_BROWSER_EDGE_URL || '',
    browserToken: process.env.HOUSEHOLD_FABRIC_BROWSER_TOKEN || '',
    outDir: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--browser-result') out.browserResult = argv[++i];
    else if (value === '--browser-edge') out.browserEdge = argv[++i];
    else if (value === '--browser-token') out.browserToken = argv[++i];
    else if (value === '--out') out.outDir = argv[++i];
    else if (value === '--help') out.help = true;
  }
  return out;
}

async function fetchBrowserResult(edgeUrl, token = '') {
  const base = clean(edgeUrl).replace(/\/$/, '');
  if (!base) throw new Error('browser_result_or_edge_required');
  const response = await fetch(base + '/v1/browser/render', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({
      url: YVL_URL,
      timeout_ms: 12000,
      max_text_chars: 100000,
      include_screenshot: false,
      actions: [{ type: 'wait', ms: 500 }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok !== true || !payload.result) {
    throw new Error('browser_edge_collection_failed');
  }
  return payload.result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node systemia/organism/household-fabric-yakima-runner.mjs [--browser-result file | --browser-edge url] [--out dir]');
    return;
  }

  const outDir = path.resolve(args.outDir);
  const ledgerFile = path.join(outDir, 'ledger.json');
  const stateFile = path.join(outDir, 'state.json');

  const browserResult = args.browserResult
    ? loadJson(path.resolve(args.browserResult), null)
    : await fetchBrowserResult(args.browserEdge, args.browserToken);

  if (!browserResult) throw new Error('browser_result_unreadable');

  const providerConfig = providerConfigFromEnvironment(process.env);
  const report = await executeYakimaHouseholdCycle({
    browserResult,
    ledger: loadJson(ledgerFile, emptyLedger()),
    previousState: loadJson(stateFile, null),
    now: new Date(),
    ...providerConfig,
  });

  atomicJson(path.join(outDir, 'latest.json'), {
    ...report,
    ledger: undefined,
  });
  atomicJson(ledgerFile, report.ledger);
  atomicJson(path.join(outDir, 'today.json'), report.today);
  atomicJson(path.join(outDir, 'mission-snapshot.json'), report.mission_snapshot);
  atomicJson(path.join(outDir, 'collector-receipts.json'), report.receipts);
  atomicJson(path.join(outDir, 'price-index.json'), report.price_index);
  atomicJson(path.join(outDir, 'price-source-runs.json'), report.price_sources);
  atomicJson(stateFile, report.state);

  console.log(JSON.stringify({
    ok: true,
    cycle_key: report.cycle_key,
    material_change: report.material_change,
    collected_count: report.collector.collected_count,
    price_observation_count: report.price_observation_count,
    price_source_states: report.price_sources.map(row => ({
      source: row.source,
      state: row.state,
    })),
    today_status: report.today.status,
    opportunities_shown: report.today.headline.opportunities_shown,
    degraded_categories: report.today.coverage.degraded_categories,
    mission_snapshot: path.join(outDir, 'mission-snapshot.json'),
  }));
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  await main();
}
