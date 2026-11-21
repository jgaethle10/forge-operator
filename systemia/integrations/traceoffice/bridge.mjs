#!/usr/bin/env node
/**
 * Evercraft Saban -> TraceOffice snapshot v1, read-only and metadata-only.
 *
 * Each seat represents one Saban JOB, not an LLM session, human, live NodeSeed,
 * or verified physical process. No network calls, action execution or secrets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SABAN_SCHEMA = 'evercraft.saban.work-state.v1';
const MAX_JOBS = 50; // TraceOffice v1 snapshot importer maximum.
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_STALE_MS = 10 * 60 * 1000;
const SOURCE_STATUSES = new Set(['queued', 'leased', 'completed', 'dead_letter']);
const TRACEOFFICE_STATUSES = new Set(['working', 'idle', 'blocked', 'error', 'offline', 'unknown']);

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`invalid_${label}_timestamp`);
  }
  return new Date(value).toISOString();
}
function boundedClock(nowMs) {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('invalid_clock');
  return nowMs;
}
function safeKey(key) {
  if (typeof key !== 'string' || Buffer.byteLength(key, 'utf8') < 32)
    throw new Error('TRACEOFFICE_EXPORT_KEY must contain at least 32 UTF-8 bytes');
  return key;
}
function pseudonym(key, kind, value) {
  return createHmac('sha256', key).update(`evercraft-traceoffice-v1|${kind}|${value}`).digest('hex').slice(0, 24);
}
function validatedJobs(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      state.schema !== SABAN_SCHEMA || typeof state.software_id !== 'string' ||
      !state.software_id || !state.jobs || typeof state.jobs !== 'object' ||
      Array.isArray(state.jobs)) throw new Error('invalid_saban_work_state_schema');
  const entries = Object.entries(state.jobs).sort(([a],[b]) => a.localeCompare(b));
  if (entries.length > MAX_JOBS) throw new Error('traceoffice_v1_limit_50_jobs_exceeded; select a bounded scope at the source');
  for (const [index, job] of entries) {
    if (!job || typeof job !== 'object' || Array.isArray(job) ||
        typeof job.job_id !== 'string' || job.job_id !== index ||
        typeof job.agent_id !== 'string' || !job.agent_id ||
        !SOURCE_STATUSES.has(job.state)) throw new Error('invalid_saban_job_contract');
    iso(job.updated_at, 'job_updated_at');
  }
  return entries.map(([, job]) => job);
}
function statusFor(job, nowMs, staleAfterMs) {
  const updatedMs = Date.parse(job.updated_at);
  // A future timestamp is not a valid proof of freshness.
  if (updatedMs > nowMs + 60_000) return ['unknown', 'Future-dated state; source clock needs review'];
  const stale = nowMs - updatedMs > staleAfterMs;
  if (job.state === 'completed') return ['idle', stale ? 'Previously completed job (historical record)' : 'Completed job; no active execution claimed'];
  if (job.state === 'dead_letter') return ['error', stale ? 'Historical dead-letter state; not a live incident claim' : 'Recorded dead-letter state; review required'];
  if (job.state === 'queued') return stale
    ? ['unknown', 'Queued state is stale; current status unverified']
    : ['idle', 'Queued job; no active execution'];
  // Leases alone do not prove that a worker or model is actually executing.
  const heartbeat = typeof job.lease?.heartbeat_at === 'string' ? Date.parse(job.lease.heartbeat_at) : NaN;
  const expiry = typeof job.lease?.expires_at === 'string' ? Date.parse(job.lease.expires_at) : NaN;
  if (!Number.isFinite(heartbeat) || !Number.isFinite(expiry) ||
      heartbeat > nowMs + 60_000 || expiry <= nowMs ||
      nowMs - heartbeat > staleAfterMs || stale) {
    return ['unknown', 'Lease or heartbeat stale/missing; execution unverified'];
  }
  return ['working', 'Active lease and recent heartbeat; execution not independently verified'];
}

/** Output intentionally does not copy private input fields, raw IDs, errors, tasks, paths or URLs. */
export function exportSabanToTraceOffice(state, { key, nowMs = Date.now(), staleAfterMs = DEFAULT_STALE_MS } = {}) {
  safeKey(key);
  boundedClock(nowMs);
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1000) throw new Error('invalid_stale_window');
  const jobs = validatedJobs(state);
  const agents = jobs.map(job => {
    const stableId = pseudonym(key, 'job', `${state.software_id}|${job.job_id}`);
    const [status, activityLabel] = statusFor(job, nowMs, staleAfterMs);
    const agent = {
      id: `evercraft-saban-job:${stableId}`,
      name: `Saban job ${stableId.slice(0, 6)}`,
      harness: 'Evercraft Saban (job, not agent session)',
      model: null,
      status,
      task: null,
      contextUsed: null,
      contextWindow: null,
      updatedAt: iso(job.updated_at, 'job_updated_at'),
      activityLabel,
    };
    if (!TRACEOFFICE_STATUSES.has(agent.status)) throw new Error('internal_status_mapping_invalid');
    return agent;
  });
  const output = { version: 1, agents, interactions: [] };
  if (Buffer.byteLength(JSON.stringify(output)) > MAX_OUTPUT_BYTES) throw new Error('traceoffice_v1_snapshot_too_large');
  return output;
}

/** Explicit simulated example. Never identify these records as production telemetry. */
export function demoSnapshot({ nowMs = Date.now() } = {}) {
  boundedClock(nowMs);
  const at = new Date(nowMs).toISOString();
  const sample = [
    ['coord', 'Systemia Coordinator (SYNTHETIC)', 'working', 'SYNTHETIC: coordinating test mission'],
    ['worker', 'Saban Job (SYNTHETIC)', 'blocked', 'SYNTHETIC: waiting on approval'],
    ['review', 'Verification (SYNTHETIC)', 'idle', 'SYNTHETIC: test review finished'],
  ];
  return {
    version: 1,
    agents: sample.map(([id, name, status, label]) => ({
      id: `evercraft-synthetic:${id}`, name, harness: 'Evercraft synthetic integration fixture',
      model: null, status, task: null, contextUsed: null, contextWindow: null,
      updatedAt: at, activityLabel: label,
    })),
    interactions: [
      { fromId: 'evercraft-synthetic:coord', toId: 'evercraft-synthetic:worker', at, kind: 'delegation' },
      { fromId: 'evercraft-synthetic:worker', toId: 'evercraft-synthetic:review', at, kind: 'message' },
    ],
  };
}

function usage() {
  return 'Usage: node bridge.mjs --demo [--output snapshot.json] OR node bridge.mjs --input state.json --output private-snapshot.json\n'
    + 'Real input requires TRACEOFFICE_EXPORT_KEY (>=32 bytes) and an explicit output file. Output must not exist. No network or execution.\n';
}
function parseCli(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const options = { demo: false, input: null, output: null };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--demo', '--input', '--output'].includes(flag) || seen.has(flag)) {
      throw new Error('unrecognized_or_duplicate_argument');
    }
    seen.add(flag);
    if (flag === '--demo') { options.demo = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('missing_argument_value');
    options[flag.slice(2)] = value;
  }
  if (options.demo === Boolean(options.input)) throw new Error('choose_exactly_one_input_or_demo');
  // Real operational metadata stays out of shell history, terminal scrollback, and CI logs.
  if (options.input && !options.output) throw new Error('private_export_requires_output_file');
  return options;
}
function writeSnapshot(value, output) {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(text) > MAX_OUTPUT_BYTES) throw new Error('traceoffice_v1_snapshot_too_large');
  if (!output) { process.stdout.write(text); return; }
  const target = path.resolve(output);
  const fd = fs.openSync(target, 'wx', 0o600); // do not overwrite or follow an existing symlink
  try { fs.writeFileSync(fd, text, { encoding: 'utf8' }); }
  finally { fs.closeSync(fd); }
  process.stderr.write(`Created ${target} with mode 0600\n`);
}
function main(args) {
  const options = parseCli(args);
  if (options.help) { process.stdout.write(usage()); return; }
  const result = options.demo ? demoSnapshot() : (() => {
    const file = fs.statSync(options.input);
    if (!file.isFile() || file.size > MAX_INPUT_BYTES) throw new Error('invalid_input_file_size');
    const source = JSON.parse(fs.readFileSync(options.input, 'utf8'));
    return exportSabanToTraceOffice(source, { key: process.env.TRACEOFFICE_EXPORT_KEY });
  })();
  writeSnapshot(result, options.output);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`TraceOffice export refused: ${error.message}\n${usage()}`); process.exitCode = 1; }
}

