#!/usr/bin/env node
import path from 'node:path';
import { writeCrmHeartbeatArtifacts } from './heartbeat.mjs';
function arg(flag, fallback='') {
  const i=process.argv.indexOf(flag);
  return i>=0 && process.argv[i+1] ? process.argv[i+1] : fallback;
}
const outDir=path.resolve(arg('--out','artifacts/crm-heartbeat'));
const r=writeCrmHeartbeatArtifacts({
  inputPath:arg('--input',process.env.EVERCRAFT_CRM_HEARTBEAT_INPUT||''),
  outDir,
  now:new Date()
});
// Status contains counts and source-health classifications ONLY. No private IDs.
console.log(JSON.stringify({schema:'evercraft.crm.resident-cycle-receipt.v1',
  state:r.report.state, observed_at:r.report.observed_at,
  open:r.report.coverage?.open??null, due:r.report.coverage?.due??null,
  held:r.snapshot.counts.held, receipt_hash:r.report.receipt_hash,
  action_authority:'none'}));
