#!/usr/bin/env node
// Operates on private owned files only. No network, jobs, canon, or publishing side effects.
import fs from 'node:fs';
import path from 'node:path';
import { auditProductionLedger } from './ledger.mjs';
import { planSabanRecovery, reconcileSabanArtifacts } from './receipt-bridge.mjs';

function arg(flag) { const i = process.argv.indexOf(flag); return i < 0 ? null : process.argv[i + 1]; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function isInside(root, dest) { return dest === root || dest.startsWith(root + path.sep); }
function writePrivate(file, data) {
  const dest = path.resolve(file);
  // Fail closed: never write a potentially sensitive ledger into the source repository.
  if (isInside(process.cwd(), dest)) throw new Error('Private output path cannot be inside working source repository');
  fs.mkdirSync(path.dirname(dest), {recursive:true, mode:0o700});
  const temp = `${dest}.pending-${process.pid}`;
  try { fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', {flag:'wx', mode:0o600}); fs.renameSync(temp,dest); }
  finally { if (fs.existsSync(temp)) fs.rmSync(temp); }
}
function main() {
  const ledgerPath = arg('--ledger'), out = arg('--out');
  if (!ledgerPath || !out) throw new Error('Usage: run-private.mjs --ledger PRIVATE.json --out PRIVATE-OUTPUT.json [--saban WORK-STATE.json --artifacts ARTIFACT-ROOT]');
  const ledger = readJson(ledgerPath);
  const sabanPath = arg('--saban');
  if (sabanPath && !arg('--artifacts')) throw new Error('--artifacts required when --saban is given');
  const result = sabanPath
    ? reconcileSabanArtifacts(ledger, readJson(sabanPath), {artifactRoot:arg('--artifacts')})
    : {ledger:structuredClone(ledger),summary:{imported_count:0,rejected_count:0,source:'no_saban_state_supplied'}};
  const audit = auditProductionLedger(result.ledger);
  const plan = planSabanRecovery(audit);
  const payload = { schema:'evercraft.production.continuity.private-run.v1',
    read_only:true, release_performed:false, jobs_dispatched:false,
    reconciliation:result.summary, audit, saban_plan:plan, private_ledger:result.ledger };
  writePrivate(out, payload);
  console.log(JSON.stringify({schema:payload.schema,projects:audit.project_count,
    attention:audit.attention_count, verified_artifacts:result.summary.imported_count,
    proposed_recovery_jobs:plan.assignments.length, dispatch_performed:false,
    publication_performed:false}));
}
try { main(); } catch (err) { console.error('Production continuity private run refused:', err.message); process.exitCode = 1; }
