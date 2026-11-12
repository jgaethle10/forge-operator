#!/usr/bin/env node
// Run a single private, bounded Systemia continuity cycle on an OWNED node.
// This never starts a resident service or dispatches agents on its own.
import { runResidentCycle, defaultPrivateDir } from './resident.mjs';

const args = process.argv.slice(2);
function opt(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}
try {
  if (args.includes('--help')) {
    console.log('Usage: node systemia/production-continuity/resident-once.mjs [--private-dir /absolute/owner-only/path]');
    process.exit(0);
  }
  const privateDir = opt('--private-dir') || defaultPrivateDir();
  const receipt = runResidentCycle({privateDir});
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  // Do not log arbitrary untrusted file contents or private ledger paths.
  console.error('Continuity cycle refused:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
}
