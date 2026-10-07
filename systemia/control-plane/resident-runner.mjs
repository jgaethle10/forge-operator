#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ResidentControlPlane } from './resident-runtime.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function has(name) {
  return process.argv.includes(name);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}
function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function normalizeEvents(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.events)) return value.events;
  return [value];
}

export function node001DefaultStateRoot() {
  if (process.platform === 'darwin') {
    return path.join('/Library', 'Application Support', 'Evercraft', 'state', 'systemia');
  }
  return path.join(os.homedir(), '.local', 'state', 'evercraft', 'systemia');
}

export async function runResidentCycle({
  controlPlane,
  inboxDir,
  healthPath,
  now = () => new Date(),
} = {}) {
  const accepted = [];
  const rejected = [];
  const deadLetters = [];

  if (inboxDir) {
    const inbox = path.resolve(inboxDir);
    const processed = path.join(inbox, 'processed');
    const dead = path.join(inbox, 'dead-letter');
    fs.mkdirSync(processed, { recursive: true });
    fs.mkdirSync(dead, { recursive: true });

    const files = fs.readdirSync(inbox)
      .filter((name) => name.endsWith('.json'))
      .sort();

    for (const name of files) {
      const sourcePath = path.join(inbox, name);
      try {
        const payload = loadJson(sourcePath);
        for (const event of normalizeEvents(payload)) {
          const receipt = controlPlane.ingest(event);
          (receipt.admitted ? accepted : rejected).push(receipt);
        }
        fs.renameSync(sourcePath, path.join(processed, name));
      } catch (error) {
        const target = path.join(dead, name);
        fs.renameSync(sourcePath, target);
        deadLetters.push({
          file: name,
          error: String(error?.message || error),
        });
      }
    }
  }

  const tick = controlPlane.tick();
  const health = {
    schema: 'evercraft.systemia.resident-control-plane-health.v1',
    ok: true,
    hostname: os.hostname(),
    platform: process.platform,
    architecture: process.arch,
    accepted_events: accepted.length,
    deduplicated_or_rejected_events: rejected.length,
    dead_letters: deadLetters.length,
    wakes: tick.wakes.length,
    pending_events: tick.queue.pending,
    observed_at: now().toISOString(),
    authority_granted: false,
  };
  if (healthPath) atomicWrite(path.resolve(healthPath), health);

  return { accepted, rejected, deadLetters, tick, health };
}

export async function main() {
  const rootDir = path.resolve(arg('--root', process.cwd()));
  const configPath = path.resolve(arg(
    '--config',
    path.join(rootDir, 'systemia', 'control-plane', 'node001.config.json')
  ));
  const stateRoot = path.resolve(arg('--state-root', node001DefaultStateRoot()));
  const config = loadJson(configPath);
  const statePath = path.join(stateRoot, 'resident-state.json');
  const inboxDir = path.join(stateRoot, 'inbox');
  const healthPath = path.join(stateRoot, 'resident-health.json');
  const cadenceMs = Math.max(1000, Number(arg('--cadence-ms', String(config.cadence_ms || 5000))));

  fs.mkdirSync(stateRoot, { recursive: true });
  const controlPlane = new ResidentControlPlane({
    statePath,
    rootDir,
    triggers: Array.isArray(config.triggers) ? config.triggers : [],
    schedules: Array.isArray(config.schedules) ? config.schedules : [],
  });

  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  do {
    const result = await runResidentCycle({
      controlPlane,
      inboxDir,
      healthPath,
    });
    if (has('--once')) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    await sleep(cadenceMs);
  } while (!stopping);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  await main();
}
