#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CADENCE_SECONDS = 300;
const DEFAULT_DELAY_MULTIPLIER = 2;
const DEFAULT_STALE_MULTIPLIER = 4;

function toIso(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

export function evaluateCadenceHealth({
  previous = {},
  now = new Date(),
  cadenceSeconds = DEFAULT_CADENCE_SECONDS,
  delayMultiplier = DEFAULT_DELAY_MULTIPLIER,
  staleMultiplier = DEFAULT_STALE_MULTIPLIER,
  runId = null,
  event = null,
} = {}) {
  const observedAt = toIso(now);
  if (!observedAt) throw new Error('valid now is required');

  const previousAt = toIso(previous.observed_at);
  const expected = Math.max(1, Number(cadenceSeconds || DEFAULT_CADENCE_SECONDS));
  const delayedAfter = expected * Math.max(1, Number(delayMultiplier || DEFAULT_DELAY_MULTIPLIER));
  const staleAfter = expected * Math.max(Number(staleMultiplier || DEFAULT_STALE_MULTIPLIER), Number(delayMultiplier || DEFAULT_DELAY_MULTIPLIER) + 1);

  let gapSeconds = null;
  let state = 'bootstrap';

  if (previousAt) {
    gapSeconds = Math.max(0, Math.round((new Date(observedAt).getTime() - new Date(previousAt).getTime()) / 1000));
    state = gapSeconds <= delayedAfter
      ? 'healthy'
      : gapSeconds <= staleAfter
        ? 'delayed'
        : 'stale';
  }

  return {
    schema: 'evercraft.systemia.cadence-health.v1',
    workflow_key: 'legacy-rescue-opportunity-watch',
    target_cadence_seconds: expected,
    delayed_after_seconds: delayedAfter,
    stale_after_seconds: staleAfter,
    observed_at: observedAt,
    previous_observed_at: previousAt,
    observed_gap_seconds: gapSeconds,
    state,
    run_id: runId ? String(runId) : null,
    event: event ? String(event) : null,
    source: 'resident_execution_receipt',
    truth: {
      configured_schedule_is_not_observed_cadence: true,
      missing_previous_receipt_is_not_failure: true,
      stale_state_does_not_imply_worker_logic_failure: true,
    },
  };
}

function parseArgs(argv) {
  const out = {
    state: 'artifacts/legacy-rescue-watch/heartbeat-state.json',
    receipt: 'artifacts/legacy-rescue-watch/cadence-health.json',
    cadenceSeconds: DEFAULT_CADENCE_SECONDS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--state') out.state = argv[++i];
    else if (v === '--receipt') out.receipt = argv[++i];
    else if (v === '--cadence') out.cadenceSeconds = Number(argv[++i]);
    else if (v === '--help') out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node systemia/organism/legacy-rescue-cadence-health.mjs [--state file] [--receipt file] [--cadence seconds]');
    return;
  }

  const stateFile = path.resolve(args.state);
  const receiptFile = path.resolve(args.receipt);
  const previous = readJson(stateFile, {});
  const receipt = evaluateCadenceHealth({
    previous,
    now: new Date(),
    cadenceSeconds: args.cadenceSeconds,
    runId: process.env.GITHUB_RUN_ID || null,
    event: process.env.GITHUB_EVENT_NAME || null,
  });

  atomicJson(receiptFile, receipt);
  atomicJson(stateFile, {
    schema: 'evercraft.systemia.cadence-state.v1',
    observed_at: receipt.observed_at,
    state: receipt.state,
    run_id: receipt.run_id,
  });

  if (receipt.state === 'stale') {
    console.log('::warning title=Legacy Rescue cadence stale::Observed resident execution gap exceeded the stale threshold. See cadence-health.json.');
  } else if (receipt.state === 'delayed') {
    console.log('::warning title=Legacy Rescue cadence delayed::Observed resident execution gap exceeded the delay threshold. See cadence-health.json.');
  }

  console.log(JSON.stringify({
    ok: true,
    state: receipt.state,
    target_cadence_seconds: receipt.target_cadence_seconds,
    observed_gap_seconds: receipt.observed_gap_seconds,
    receipt: args.receipt,
  }));
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  await main();
}
