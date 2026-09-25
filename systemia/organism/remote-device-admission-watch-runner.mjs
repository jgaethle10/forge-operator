#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runRemoteDeviceAdmissionWatch } from './remote-device-admission-watch.mjs';

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

const yardStateDir = arg(
  '--yard-state',
  process.env.SYSTEMIA_YARD_STATE_DIR || ''
);
const brokerDeploymentId = arg(
  '--broker-deployment-id',
  process.env.SYSTEMIA_REMOTE_BROKER_DEPLOYMENT_ID || ''
);
const out = path.resolve(
  arg('--out', 'artifacts/remote-device-admission-watch')
);

const result = await runRemoteDeviceAdmissionWatch({
  yardStateDir,
  brokerDeploymentId,
});

atomicJson(path.join(out, 'latest.json'), result.state);
atomicJson(path.join(out, 'mission-snapshot.json'), result.mission_snapshot);

console.log(JSON.stringify({
  ok: result.state.status !== 'degraded',
  schema: result.state.schema,
  status: result.state.status,
  pending_count: result.state.pending_count,
  human_approval_required: result.state.human_approval_required,
  automatic_authorization_permitted:
    result.state.automatic_authorization_permitted,
  mission_snapshot: path.join(out, 'mission-snapshot.json'),
}, null, 2));

process.exit(result.state.status === 'degraded' ? 4 : 0);
