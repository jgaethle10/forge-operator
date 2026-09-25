#!/usr/bin/env node
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { SystemiaMissionPublisher } from './mission-publisher.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const stateDir = arg('--yard-state');
const deploymentId = arg('--deployment-id');
const configPath = arg('--config', 'systemia/collider/mission-sources.json');
const allowedRoot = arg('--allowed-root', '.');
const ledgerPath = arg('--ledger', 'artifacts/systemia-mission-publisher/latest.json');
const watch = process.argv.includes('--watch');

if (!stateDir || !deploymentId) {
  console.error('usage: mission-publisher-runner.mjs --yard-state <private-state-dir> --deployment-id <kaidance-id> [--watch]');
  process.exit(2);
}

const yard = new YardOperator({ stateDir: path.resolve(stateDir) });
const publisher = new SystemiaMissionPublisher({
  yard,
  deploymentId,
  configPath: path.resolve(configPath),
  allowedRoot: path.resolve(allowedRoot),
  ledgerPath: path.resolve(ledgerPath),
});

if (!watch) {
  const report = await publisher.syncOnce();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'degraded' ? 4 : 0);
}

const intervalMs = Number(arg('--interval-ms', '60000'));
publisher.start({ intervalMs, immediate: true });
console.log(JSON.stringify({
  schema: 'evercraft.systemia.mission-publisher-service.v1',
  deployment_id: deploymentId,
  interval_ms: intervalMs,
  config: path.relative(process.cwd(), path.resolve(configPath)),
  ledger: path.relative(process.cwd(), path.resolve(ledgerPath)),
}, null, 2));

let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  publisher.stop();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
