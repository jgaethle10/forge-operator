#!/usr/bin/env node
import path from 'node:path';
import { SystemiaCoreResidentSupervisor } from './resident-supervisor.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const repoRoot = path.resolve(arg('--repo-root', '.'));
const configPath = path.resolve(
  arg('--config', 'systemia/core/resident-services.json')
);
const stateDir = path.resolve(
  arg('--state-dir', process.env.SYSTEMIA_CORE_STATE_DIR || 'artifacts/systemia-core-supervisor')
);

const supervisor = new SystemiaCoreResidentSupervisor({
  repoRoot,
  configPath,
  stateDir,
  env: process.env,
});
const started = supervisor.start({ immediateCycles: true });
console.log(JSON.stringify(started, null, 2));

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  const stopped = await supervisor.stop();
  console.log(JSON.stringify(stopped, null, 2));
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
