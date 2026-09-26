#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { collectPendingDeviceTrustWatch } from './pending-device-trust-watch.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const yardState = arg('--yard-state');
const brokerDeploymentId = arg('--broker-deployment', '');
const out = path.resolve(
  arg('--out', 'artifacts/remote-device-trust-watch')
);

if (!yardState) {
  console.error('--yard-state is required');
  process.exit(2);
}

const yard = new YardOperator({ stateDir: path.resolve(yardState) });
const result = await collectPendingDeviceTrustWatch({
  yard,
  brokerDeploymentId,
});

atomicJson(path.join(out, 'latest.json'), result.state);
atomicJson(path.join(out, 'mission-snapshot.json'), result.mission_snapshot);

console.log(JSON.stringify({
  ok: true,
  schema: result.state.schema,
  status: result.state.status,
  pending_count: result.state.pending_count,
  human_approval_required: result.state.human_approval_required,
  next_action: result.state.next_action,
  mission_snapshot: path.join(out, 'mission-snapshot.json'),
}, null, 2));
