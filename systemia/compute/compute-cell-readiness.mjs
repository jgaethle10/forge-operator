#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Source-only review: no network, node discovery, admissions or execution.
export const GATES = Object.freeze([
  'edge_local_health',
  'fabric_route',
  'broker_authenticated_status',
  'systemia_mission_admission',
  'node002_scoped_permission',
  'device_signed_bounded_canary',
  'recovery_and_revoke',
]);
const DIGEST = /^sha256:[0-9a-f]{64}$/i;
const FRESHNESS_MS = 15 * 60 * 1000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function evaluateGate(value, nowMs) {
  if (!isRecord(value)) return 'missing';
  if (value.state !== 'pass') return value.state === 'fail' ? 'failed' : 'unverified';
  if (typeof value.receipt_ref !== 'string' || !DIGEST.test(value.receipt_ref)) return 'missing_receipt_reference';
  const timestamp = typeof value.observed_at === 'string' ? Date.parse(value.observed_at) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > nowMs + 30_000) return 'invalid_time';
  if (nowMs - timestamp > FRESHNESS_MS) return 'stale';
  // Receipt reference formatting does NOT independently verify its signature or contents.
  return 'reported_pass';
}
export function evaluateComputeCellReadiness(input, { nowMs = Date.now() } = {}) {
  if (!isRecord(input) || input.schema !== 'evercraft.compute-cell.observation.v1') {
    throw new Error('compute_cell_observation_schema_required');
  }
  if (!Number.isFinite(nowMs)) throw new Error('valid_clock_required');
  const evidence = isRecord(input.gates) ? input.gates : {};
  const gateResults = GATES.map((name) => ({ name, state: evaluateGate(evidence[name], nowMs) }));
  const worker = isRecord(input.worker) ? input.worker : {};
  const workerMode = worker.mode === 'shadow' ? 'shadow' : worker.mode === 'admitted' ? 'admitted' : 'unknown';
  const workerEnabled = worker.remote_jobs_enabled === true;
  const blockers = gateResults.filter((g) => g.state !== 'reported_pass').map((g) => g.name + ':' + g.state);
  if (workerMode !== 'admitted') blockers.push('worker_mode:' + workerMode);
  if (!workerEnabled) blockers.push('remote_jobs_disabled_or_unverified');

  const sourceReviewCandidate = blockers.length === 0;
  return {
    schema: 'evercraft.compute-cell.readiness-review.v1',
    evaluated_at: new Date(nowMs).toISOString(),
    state: sourceReviewCandidate ? 'SOURCE_REVIEW_CANDIDATE' : 'HELD',
    reported_gates: gateResults,
    worker_mode: workerMode,
    worker_jobs_reported_enabled: workerEnabled,
    blockers,
    // Never infer independent execution authority from caller-supplied JSON.
    live_device_identity_verified: false,
    execution_authorized: false,
    production_ready: false,
    next_gate: sourceReviewCandidate
      ? 'independent_authenticated_live_verification_and_systemia_approval'
      : 'collect_fresh_authorized_receipts_without_changing_device_permissions',
    source_only: true,
  };
}
function main() {
  const i = process.argv.indexOf('--input');
  if (i < 0 || !process.argv[i + 1]) {
    process.stderr.write('Usage: node compute-cell-readiness.mjs --input /path/to/private-observation.json\n');
    process.exitCode = 2;
    return;
  }
  try {
    const input = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
    const report = evaluateComputeCellReadiness(input);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    // Exit code 0 never means execution is authorized.
    if (report.state !== 'SOURCE_REVIEW_CANDIDATE') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(String(error?.message || error) + '\n');
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
