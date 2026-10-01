#!/usr/bin/env node
import path from 'node:path';
import { createRadarResident } from './resident.mjs';

const args = new Set(process.argv.slice(2));
const mode = args.has('--resident') ? 'resident' : 'once';

const resident = createRadarResident({
  stateDir: process.env.RADAR_STATE_DIR || path.resolve('.runtime', 'radar'),
  intervalMs: Number(process.env.RADAR_INTERVAL_MS || 5 * 60 * 1000),
  materialityThreshold: Number(process.env.RADAR_MATERIALITY_THRESHOLD || 0.58),
  maxSignals: Number(process.env.RADAR_MAX_SIGNALS || 8),
  journalUrl: process.env.RADAR_JOURNAL_URL || 'https://journal.evercraft.global/'
});

if (mode === 'once') {
  const receipt = await resident.runOnce();
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  process.exitCode = receipt.status === 'failed' ? 1 : 0;
} else {
  resident.start();
  process.stdout.write(JSON.stringify({
    ok: true,
    mode: 'resident',
    interval_ms: Number(process.env.RADAR_INTERVAL_MS || 5 * 60 * 1000),
    state_dir: process.env.RADAR_STATE_DIR || path.resolve('.runtime', 'radar'),
    rule: 'Resident collection does not grant publication authority.'
  }, null, 2) + '\n');

  const shutdown = () => {
    resident.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => {});
}
