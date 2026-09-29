#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ingestYvlBrowserResult } from '../household-fabric/yvl-pipeline.mjs';
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
  const run = ingestYvlBrowserResult(browserResult, {
    now: sourceObservedAt,
    ledger,
    geography: 'yakima-wa',
    mode: 'holiday_pressure',
  });

  const fingerprint = materialFingerprint(run.today);
  const materialChange = clean(previousState?.material_fingerprint) !== fingerprint;

  return {
    schema: 'evercraft.household-fabric.yakima-cycle.v1',
    workflow_key: 'household-fabric-yakima',
    mission_key: 'household-flourishing-yakima-2026',
    cycle_key: cycleKeyFor(cycleNow),
    cadence_seconds: CADENCE_SECONDS,
    observed_at: cycleNow.toISOString(),
    source_observed_at: sourceObservedAt.toISOString(),
    material_change: materialChange,
    material_fingerprint: fingerprint,
    collector: {
      key: run.collector,
      source_url: run.source_url,
      evidence_receipt_sha256: run.browser_evidence_receipt_sha256,
      collected_count: run.collected_count,
      accepted_count: run.receipts.filter(row => row.status === 'accepted').length,
      deduped_count: run.receipts.filter(row => row.status === 'deduped').length,
    },
    today: run.today,
    ledger: run.ledger,
    receipts: run.receipts,
    mission_snapshot: {
      schema: 'evercraft.household-fabric.mission-snapshot.v1',
      mission_key: 'household-flourishing-yakima-2026',
      cycle_key: cycleKeyFor(cycleNow),
      state: run.today.status,
      material_change: materialChange,
      opportunity_count: run.today.headline.opportunities_shown,
      money_kept_cents: run.today.headline.money_kept_cents,
      money_earned_cents: run.today.headline.money_earned_cents,
      degraded_categories: run.today.coverage.degraded_categories,
      evidence_refs: [
        'url:' + run.source_url,
        'browser-receipt:' + run.browser_evidence_receipt_sha256,
      ],
      observed_at: cycleNow.toISOString(),
    },
    state: {
      schema: 'evercraft.household-fabric.yakima-state.v1',
      material_fingerprint: fingerprint,
      last_cycle_key: cycleKeyFor(cycleNow),
      last_material_change_at: materialChange
        ? cycleNow.toISOString()
        : previousState?.last_material_change_at || null,
      last_source_observed_at: sourceObservedAt.toISOString(),
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

  const report = evaluateYakimaHouseholdCycle({
    browserResult,
    ledger: loadJson(ledgerFile, emptyLedger()),
    previousState: loadJson(stateFile, null),
    now: new Date(),
  });

  atomicJson(path.join(outDir, 'latest.json'), {
    ...report,
    ledger: undefined,
  });
  atomicJson(ledgerFile, report.ledger);
  atomicJson(path.join(outDir, 'today.json'), report.today);
  atomicJson(path.join(outDir, 'mission-snapshot.json'), report.mission_snapshot);
  atomicJson(path.join(outDir, 'collector-receipts.json'), report.receipts);
  atomicJson(stateFile, report.state);

  console.log(JSON.stringify({
    ok: true,
    cycle_key: report.cycle_key,
    material_change: report.material_change,
    collected_count: report.collector.collected_count,
    today_status: report.today.status,
    opportunities_shown: report.today.headline.opportunities_shown,
    degraded_categories: report.today.coverage.degraded_categories,
    mission_snapshot: path.join(outDir, 'mission-snapshot.json'),
  }));
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  await main();
}
