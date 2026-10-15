#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectSiteSightExport } from './evidence.mjs';

const file = process.argv[2];
if (!file || process.argv.length !== 3) {
  console.error('Usage: node pilots/sitesight/verify-export.mjs <downloaded-fictional-evidence.json>');
  process.exitCode = 2;
} else {
  let report;
  try {
    const location = resolve(file);
    if (statSync(location).size > 1024 * 1024) {
      throw new Error('Evidence export exceeds 1 MiB internal prototype limit');
    }
    const record = JSON.parse(readFileSync(location, 'utf8'));
    report = inspectSiteSightExport(record);
  } catch (error) {
    report = {
      ok: false, mode: 'synthetic_only', authenticated: false,
      admission: 'unverified', detection: 'not_connected',
      errors: [{ code: 'read_or_parse_failed', detail: error.message }],
    };
  }
  process.stdout.write(JSON.stringify({
    schema: 'evercraft.sitesight.review-check.v1',
    ...report,
    declaration: 'Offline synthetic consistency only. Not real camera evidence, tamper-proof history, admission, certified site safety or a verified checkout.',
  }, null, 2) + '\n');
  if (!report.ok) process.exitCode = 1;
}
