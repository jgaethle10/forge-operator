import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseBenchmarkArgs, summarizeBenchmark, runBenchmark,
} from './local-llm-benchmark-cli.mjs';

const args = ['--live-local-inference',
  '--endpoint=http://127.0.0.1:8080/v1/chat/completions',
  '--model=unit-local-model', '--intent=Navigate within the 1m synthetic area',
  '--runs=3', '--expect-kind=goto'];

test('benchmark requires explicit opt-in and numeric loopback', () => {
  assert.throws(() => parseBenchmarkArgs(args.slice(1)), /explicit_live_local_inference_flag_required/);
  assert.throws(() => parseBenchmarkArgs(args.map(a =>
    a.startsWith('--endpoint=') ? '--endpoint=https://example.com/v1/chat/completions' : a)),
    /loopback_endpoint_required/);
  assert.equal(parseBenchmarkArgs(args).runs, 3);
});

test('invalid and duplicate flags, run counts and kind labels fail closed', () => {
  for (const bad of [['--extra=yes'], ['--runs=21'], ['--runs=0'], ['--runs=NaN'],
    ['--runs=1.5'], ['--expect-kind=physical'], ['--intent='],
    ['--endpoint=http://127.0.0.1:65536/v1/chat/completions']]) {
    assert.throws(() => parseBenchmarkArgs([...args, ...bad]));
  }
  assert.throws(() => parseBenchmarkArgs([...args, '--live-local-inference']), /duplicate_flag/);
});

test('summarizes p50/p95 of successful observations, not failure attempts', () => {
  const rows = [
    { ok: true, latency_ms: 10, kind: 'stop' },
    { ok: true, latency_ms: 20, kind: 'goto' },
    { ok: true, latency_ms: 30, kind: 'goto' },
    { ok: false, error_code: 'model_http_status_500', latency_ms: 1 },
  ];
  const x = summarizeBenchmark(rows, 'stop');
  assert.equal(x.attempts, 4);
  assert.equal(x.accepted_in_simulation, 3);
  assert.equal(x.rejected, 1);
  assert.equal(x.latency_ms_p50, 20);
  assert.equal(x.latency_ms_p95, 30);
  assert.equal(x.labeled_kind_mismatches, 2);
  assert.equal(x.physical_actuation_enabled, false);
});

test('single-run injection benchmark only receives synthetic simulation authority', async () => {
  let actual = 0;
  const result = await runBenchmark({ ...parseBenchmarkArgs(args), runs: 1 },
    async options => {
      actual++;
      assert.equal(options.authority_context.authority_state, 'simulation');
      assert.equal(options.simulator.snapshot().physical_actuation_enabled, false);
      assert.equal(options.simulator.robot_id, options.authority_context.robot_id);
      return { accepted_in_simulation: true, proposed_goal: { kind: 'goto' },
        inference_elapsed_ms: 12.5 };
    });
  assert.equal(actual, 1);
  assert.equal(result.latency_ms_p95, 12.5);
  assert.equal(result.labeled_kind_mismatches, 0);
});

test('benchmark reports failures without leaking arbitrary error text', async () => {
  const settings = { ...parseBenchmarkArgs(args), runs: 2 };
  const summary = await runBenchmark(settings, async () => {
    throw new Error('password=my-secret-token');
  });
  assert.equal(summary.rejected, 2);
  assert.deepEqual(summary.failure_codes, ['probe_failed', 'probe_failed']);
  assert.equal(JSON.stringify(summary).includes('secret-token'), false);
});

test('default benchmark CLI invokes no localhost model and exits nonzero', () => {
  const file = fileURLToPath(new URL('./local-llm-benchmark-cli.mjs', import.meta.url));
  const proc = spawnSync(process.execPath, [file], { encoding: 'utf-8', timeout: 5000 });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /explicit_live_local_inference_flag_required/);
  assert.equal(proc.stdout, '');
});
