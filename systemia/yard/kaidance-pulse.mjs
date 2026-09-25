#!/usr/bin/env node
import path from 'node:path';
import { YardOperator } from './operator.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const stateDir = arg('--state-dir');
const deploymentId = arg('--deployment-id');
if (!stateDir || !deploymentId) {
  console.error('usage: kaidance-pulse.mjs --state-dir /private/yard --deployment-id <id>');
  process.exit(2);
}

const yard = new YardOperator({ stateDir: path.resolve(stateDir) });
try {
  const pulse = await yard.getKaidancePulse(deploymentId);
  console.log(JSON.stringify(pulse, null, 2));
  process.exit(pulse.state === 'healthy' ? 0 : 5);
} catch (error) {
  console.error(JSON.stringify({
    schema: 'evercraft.kaidance.pulse-error.v1',
    deployment_id: deploymentId,
    error: String(error?.message || error),
  }, null, 2));
  process.exit(4);
}
