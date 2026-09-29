#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  emptyResidentState,
  runSentinelResidentCycle,
  buildSentinelMissionSnapshot,
  buildBuiltinSentinelSources
} from './resident-cycle.mjs';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function has(name) {
  return process.argv.includes(name);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

const stateDir = path.resolve(
  arg('--state-dir', process.env.SYSTEMIA_SENTINEL_STATE_DIR || 'artifacts/sentinel-resident')
);
const intervalMs = Math.max(
  30_000,
  Number(arg('--interval-ms', process.env.SYSTEMIA_SENTINEL_INTERVAL_MS || 30000))
);
const nwsArea = String(
  arg('--nws-area', process.env.SYSTEMIA_SENTINEL_NWS_AREA || '')
).trim().toUpperCase() || null;
const nwpsGaugeIds = String(
  arg('--nwps-gauges', process.env.SYSTEMIA_SENTINEL_NWPS_GAUGES || '')
).split(',').map((value) => value.trim()).filter(Boolean);
const once = has('--once');

const stateFile = path.join(stateDir, 'state.json');
let state = readJson(stateFile, emptyResidentState());
let running = true;
let cycleRunning = false;

async function cycle() {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    const result = await runSentinelResidentCycle({
      inputState: state,
      now: new Date().toISOString(),
      sources: buildBuiltinSentinelSources({ nwpsGaugeIds }),
      sourceOptions: {
        'nws-active-alerts': nwsArea ? { area: nwsArea } : {}
      }
    });
    state = result.state;
    atomicJson(stateFile, state);
    atomicJson(path.join(stateDir, 'latest.json'), result.snapshot);
    atomicJson(path.join(stateDir, 'event-graph.json'), result.snapshot.event_graph);
    atomicJson(path.join(stateDir, 'operator-pictures.json'), {
      schema: 'systemia.sentinel.operator-pictures.v1',
      observed_at: result.snapshot.observed_at,
      items: result.snapshot.operator_pictures
    });
    atomicJson(path.join(stateDir, 'signals.json'), {
      schema: 'systemia.sentinel.signal-batch.v1',
      observed_at: result.snapshot.observed_at,
      items: result.snapshot.signals
    });
    atomicJson(
      path.join(stateDir, 'mission-snapshot.json'),
      buildSentinelMissionSnapshot(result.snapshot)
    );
    process.stdout.write(JSON.stringify({
      ok: true,
      cycle_count: result.snapshot.cycle_count,
      observed_at: result.snapshot.observed_at,
      ...result.snapshot.summary
    }) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({
      ok: false,
      at: new Date().toISOString(),
      error: String(error?.stack || error?.message || error)
    }) + '\n');
    if (once) process.exitCode = 1;
  } finally {
    cycleRunning = false;
  }
}

await cycle();

if (!once) {
  const timer = setInterval(() => {
    if (running) cycle();
  }, intervalMs);

  const stop = async () => {
    if (!running) return;
    running = false;
    clearInterval(timer);
    while (cycleRunning) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise(() => {});
}
