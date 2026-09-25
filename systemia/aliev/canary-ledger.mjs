import fs from 'node:fs';
import { evaluateRuntimeCertification } from './runtime-certification.mjs';

export function buildCanaryLedger(receipts = [], { now = new Date().toISOString() } = {}) {
  const certification = evaluateRuntimeCertification(receipts);
  return {
    schema: 'evercraft.aliev-rivet.canary-ledger.v1',
    generated_at: now,
    release_state: certification.certified ? 'certified' : 'blocked',
    certification,
    next_actions: certification.blockers.map((canary) => ({
      canary,
      action: `obtain_authenticated_source_backed_receipt:${canary}`
    }))
  };
}

export function loadReceiptFile(path) {
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.receipts ?? [];
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node systemia/aliev/canary-ledger.mjs <receipts.json>');
    process.exit(2);
  }
  const ledger = buildCanaryLedger(loadReceiptFile(file));
  console.log(JSON.stringify(ledger, null, 2));
  process.exitCode = ledger.release_state === 'certified' ? 0 : 1;
}
