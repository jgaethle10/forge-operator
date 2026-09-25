#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  LEGACY_RESCUE_WATCH,
  buildLegacyRescueMissionSnapshot,
  classifyLegacyRescueSignal,
  dedupeLegacyRescueSignals,
  normalizeLegacyRescueSignal,
  shouldSurfaceLegacyRescueChange,
} from './legacy-rescue-watch.mjs';
import { admitLegacyRescueStrike } from './legacy-rescue-strike-admission.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function cycleKeyFor(now = new Date(), cadenceSeconds = LEGACY_RESCUE_WATCH.cadence_seconds) {
  const ms = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const bucketMs = cadenceSeconds * 1000;
  return new Date(Math.floor(ms / bucketMs) * bucketMs).toISOString();
}

export function evaluateLegacyRescueCycle({
  signals = [],
  cycleKey = '',
  now = new Date(),
} = {}) {
  const observedAt = now instanceof Date ? now : new Date(now);
  const key = clean(cycleKey) || cycleKeyFor(observedAt);
  const normalized = dedupeLegacyRescueSignals(signals).map((signal) => {
    const classification = classifyLegacyRescueSignal(signal);
    return {
      ...normalizeLegacyRescueSignal(signal),
      ...classification,
      material_change: shouldSurfaceLegacyRescueChange(signal),
    };
  });

  const changed = normalized.filter((row) => row.material_change);
  const admitted = changed
    .filter((row) => row.disposition === 'strike_candidate' || row.disposition === 'research_queue')
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const held = changed.filter((row) => row.disposition === 'hold_noise');

  const evidenceRefs = admitted
    .flatMap((row) => [
      ...(row.evidence_refs || []),
      row.url ? `url:${row.url}` : '',
      `signal:${row.signal_key}`,
    ])
    .filter(Boolean);

  const missionSnapshot = buildLegacyRescueMissionSnapshot({
    cycleKey: key,
    scanned: normalized.length,
    changed: changed.length,
    admitted: admitted.length,
    held: held.length,
    evidenceRefs,
    observedAt,
  });

  const strikeAdmission = admitted[0]
    ? admitLegacyRescueStrike({
        signal: admitted[0],
        cycleKey: key,
        now: observedAt,
      })
    : {
        schema: 'evercraft.legacy-rescue.strike-admission.v1',
        admitted: false,
        reason: 'no_material_candidate',
        cycle_key: key,
        observed_at: observedAt.toISOString(),
      };

  return {
    schema: 'evercraft.legacy-rescue-watch.cycle.v1',
    workflow_key: LEGACY_RESCUE_WATCH.workflow_key,
    mission_key: LEGACY_RESCUE_WATCH.mission_key,
    cycle_key: key,
    cadence_seconds: LEGACY_RESCUE_WATCH.cadence_seconds,
    observed_at: observedAt.toISOString(),
    counts: missionSnapshot.counts,
    top_candidate: admitted[0] || null,
    admitted,
    held,
    unchanged: normalized.filter((row) => !row.material_change),
    mission_snapshot: missionSnapshot,
    strike_admission: strikeAdmission,
    doctrine: {
      material_change_only: true,
      no_touch_shadow_builds_may_advance: true,
      named_outreach_requires_human_gate: true,
      payment_request_requires_human_gate: true,
      private_system_access_requires_explicit_authorization: true,
      production_mutation_requires_explicit_authorization: true,
    },
  };
}

function parseArgs(argv) {
  const out = {
    signals: 'artifacts/legacy-rescue-watch/signals.json',
    outDir: 'artifacts/legacy-rescue-watch',
    cycleKey: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--signals') out.signals = argv[++i];
    else if (value === '--out') out.outDir = argv[++i];
    else if (value === '--cycle') out.cycleKey = argv[++i];
    else if (value === '--help') out.help = true;
  }
  return out;
}

function loadSignals(file) {
  if (!fs.existsSync(file)) return [];
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.signals)) return payload.signals;
  throw new Error('signals file must be an array or object with signals[]');
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node systemia/organism/legacy-rescue-watch-runner.mjs [--signals file] [--out dir] [--cycle key]');
    return;
  }

  const signalsFile = path.resolve(args.signals);
  const outDir = path.resolve(args.outDir);
  const report = evaluateLegacyRescueCycle({
    signals: loadSignals(signalsFile),
    cycleKey: args.cycleKey,
    now: new Date(),
  });

  atomicJson(path.join(outDir, 'latest.json'), report);
  atomicJson(path.join(outDir, 'mission-snapshot.json'), report.mission_snapshot);
  atomicJson(path.join(outDir, 'radar-input.json'), {
    schema: 'evercraft.public-rescue.radar-input.v1',
    generated_at: report.observed_at,
    cycle_key: report.cycle_key,
    candidates: report.admitted,
  });
  atomicJson(path.join(outDir, 'strike-admission.json'), report.strike_admission);

  console.log(JSON.stringify({
    ok: true,
    cycle_key: report.cycle_key,
    counts: report.counts,
    top_candidate: report.top_candidate
      ? { title: report.top_candidate.title, score: report.top_candidate.score }
      : null,
    strike_admitted: Boolean(report.strike_admission?.admitted),
    strike_goal_key: report.strike_admission?.goal_state?.goal_key || null,
    mission_snapshot: path.join(outDir, 'mission-snapshot.json'),
  }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
