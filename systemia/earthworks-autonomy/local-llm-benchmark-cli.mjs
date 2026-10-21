/**
 * Explicit operator-invoked localhost benchmark. NO hardware, movement, Saban
 * lease, remote dispatch, network scan, payment or external service access.
 *
 * node .../local-llm-benchmark-cli.mjs --live-local-inference
 *   --endpoint=http://127.0.0.1:8080/v1/chat/completions
 *   --model=MODEL_NAME --intent="Move to x 0.25, y 0"
 *   --runs=3 --expect-kind=goto
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { EmbodiedGoalSimulator } from './embodied-goal-simulator.mjs';
import { runLocalModelSimulation, validateLoopbackEndpoint } from './local-llm-simulation-probe.mjs';

const ALLOWED_FLAGS = new Set(['live-local-inference', 'endpoint', 'model', 'intent', 'runs', 'expect-kind']);
export function parseBenchmarkArgs(args = []) {
  if (!Array.isArray(args)) throw new Error('args_array_required');
  const fields = new Map();
  for (const part of args) {
    if (part === '--live-local-inference') {
      if (fields.has('live-local-inference')) throw new Error('duplicate_flag');
      fields.set('live-local-inference', true);
      continue;
    }
    if (typeof part !== 'string' || !part.startsWith('--') || !part.includes('=')) throw new Error('invalid_flag');
    const split = part.indexOf('='), key = part.slice(2, split), value = part.slice(split + 1);
    if (!ALLOWED_FLAGS.has(key) || fields.has(key)) throw new Error('invalid_or_duplicate_flag');
    fields.set(key, value);
  }
  if (fields.get('live-local-inference') !== true) throw new Error('explicit_live_local_inference_flag_required');
  const endpoint = validateLoopbackEndpoint(fields.get('endpoint'));
  const model = fields.get('model'), intent = fields.get('intent');
  if (typeof model !== 'string' || !model.trim() || Buffer.byteLength(model) > 160) throw new Error('model_invalid');
  if (typeof intent !== 'string' || !intent.trim() || Buffer.byteLength(intent) > 512) throw new Error('intent_invalid');
  const runs = fields.has('runs') ? Number(fields.get('runs')) : 3;
  if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('runs_out_of_bounds');
  const expect_kind = fields.get('expect-kind') ?? 'none';
  if (!['goto', 'stop', 'none'].includes(expect_kind)) throw new Error('expect_kind_invalid');
  return { endpoint, model, intent, runs, expect_kind };
}

export function summarizeBenchmark(rows, expect_kind = 'none') {
  if (!Array.isArray(rows) || !['none', 'goto', 'stop'].includes(expect_kind)) throw new Error('summary_input_invalid');
  const latency = rows.filter(row => row.ok && Number.isFinite(row.latency_ms))
    .map(row => row.latency_ms).sort((a, b) => a - b);
  const percentile = pct => latency.length ? latency[Math.max(0, Math.ceil(pct * latency.length) - 1)] : null;
  const successes = rows.filter(row => row.ok).length;
  return {
    schema: 'evercraft.embodied.local-model-benchmark.v1',
    attempts: rows.length,
    accepted_in_simulation: successes,
    rejected: rows.length - successes,
    proposed_goto: rows.filter(row => row.ok && row.kind === 'goto').length,
    proposed_stop: rows.filter(row => row.ok && row.kind === 'stop').length,
    expected_kind: expect_kind,
    labeled_kind_mismatches: expect_kind === 'none' ? null
      : rows.filter(row => row.ok && row.kind !== expect_kind).length,
    latency_ms_p50: percentile(0.50),
    latency_ms_p95: percentile(0.95),
    latency_ms_max: latency.at(-1) ?? null,
    failure_codes: rows.filter(row => !row.ok).map(row => row.error_code),
    evidence_state: 'operator_local_loopback_inference_and_simulation_only',
    physical_actuation_enabled: false,
  };
}

export async function runBenchmark(config, queryRunner = runLocalModelSimulation) {
  const { endpoint, model, intent, runs, expect_kind } = config;
  validateLoopbackEndpoint(endpoint);
  if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('runs_out_of_bounds');
  const rows = [];
  for (let index = 0; index < runs; index++) {
    const simulator = new EmbodiedGoalSimulator({ robot_id: 'sim.local-probe.' + (index + 1) });
    simulator.observe({
      observed_at_s: 0, lease_until_s: 3, estop: false, human_nearby: false, obstacles: [],
    });
    try {
      const result = await queryRunner({
        endpoint, model, intent, request_id: 'local-probe-' + (index + 1),
        simulator,
        authority_context: { authority_state: 'simulation', robot_id: simulator.robot_id },
      });
      rows.push({
        ok: result.accepted_in_simulation === true,
        kind: result.proposed_goal?.kind,
        latency_ms: result.inference_elapsed_ms,
        error_code: result.accepted_in_simulation === true ? null : 'simulation_rejected',
      });
    } catch (error) {
      // Never emit raw prompt, model output or potentially sensitive error contents.
      const code = String(error?.message ?? 'probe_failed').split(':')[0].slice(0, 80);
      rows.push({ ok: false, error_code: /^[a-z_0-9-]+$/.test(code) ? code : 'probe_failed' });
    }
  }
  return summarizeBenchmark(rows, expect_kind);
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  try {
    const settings = parseBenchmarkArgs(process.argv.slice(2));
    const report = await runBenchmark(settings);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.rejected || report.labeled_kind_mismatches) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(JSON.stringify({
      error: /^[a-z0-9_-]+$/.test(String(error.message)) ? error.message : 'benchmark_failed',
      physical_actuation_enabled: false,
    }) + '\n');
    process.exitCode = 2;
  }
}
