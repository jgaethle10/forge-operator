#!/usr/bin/env node
import path from 'node:path';
import { createFaieRuntime } from './runtime.mjs';

const args = new Set(process.argv.slice(2));
const resident = args.has('--resident');
const once = args.has('--once') || !resident;

const runtime = createFaieRuntime({
  stateDir: process.env.FAIE_STATE_DIR || path.resolve('.runtime', 'faie'),
  intervalMs: Number(process.env.FAIE_INTERVAL_MS || 5 * 60 * 1000)
});

if (once) {
  const receipt = await runtime.runOnce();
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
}

if (resident) {
  runtime.start();
  process.stdout.write(JSON.stringify({
    schema: 'evercraft.faie.cli.v1',
    status: 'resident_started',
    interval_ms: Number(process.env.FAIE_INTERVAL_MS || 5 * 60 * 1000),
    state_dir: process.env.FAIE_STATE_DIR || path.resolve('.runtime', 'faie')
  }, null, 2) + '\n');

  const shutdown = () => {
    runtime.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => {});
}
