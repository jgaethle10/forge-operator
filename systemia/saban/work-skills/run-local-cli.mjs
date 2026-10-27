#!/usr/bin/env node
import fs from 'node:fs';
import { runLocalCommercialBrief } from './run-local.mjs';
const arg = flag => { const i = process.argv.indexOf(flag); return i < 0 ? '' : (process.argv[i + 1] || ''); };
try {
  if (!arg('--brief-file') || !arg('--task') || !arg('--out')) {
    throw new Error('usage: --task "commercial request" --brief-file <local-json> --out <local-directory>');
  }
  const brief = JSON.parse(fs.readFileSync(arg('--brief-file'), 'utf8'));
  const receipt = await runLocalCommercialBrief({ task: arg('--task'), brief, outDir: arg('--out') });
  process.stdout.write(JSON.stringify({ state: receipt.state, role_count: receipt.role_count,
    receipt_sha256: receipt.receipt_sha256, external_effects_performed: false,
    receipt_file: 'work-saban-local-receipt.json' }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ status: 'blocked', error: error?.message || String(error),
    external_effects_performed: false }) + '\n');
  process.exitCode = 1;
}
