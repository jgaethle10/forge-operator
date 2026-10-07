#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function commandOk(command, args = []) {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function diskFreeGiB(target) {
  let current = path.resolve(target);
  while (!fs.existsSync(current) && path.dirname(current) !== current) current = path.dirname(current);
  try {
    const stats = fs.statfsSync(current);
    return Number(stats.bavail * stats.bsize) / (1024 ** 3);
  } catch {
    return 0;
  }
}

export function evaluateMacNode001Preflight(observed) {
  const checks = {
    darwin: observed.platform === 'darwin',
    apple_silicon: observed.architecture === 'arm64',
    node_22_or_newer: Number(observed.node_major || 0) >= 22,
    memory_at_least_16_gib: Number(observed.memory_gib || 0) >= 16,
    free_disk_at_least_64_gib: Number(observed.free_disk_gib || 0) >= 64,
    launchd_available: observed.launchd_available === true,
  };
  return {
    schema: 'evercraft.node001.macos-preflight.v1',
    passed: Object.values(checks).every(Boolean),
    checks,
    observed: {
      platform: observed.platform,
      architecture: observed.architecture,
      node_major: Number(observed.node_major || 0),
      memory_gib: Number(Number(observed.memory_gib || 0).toFixed(2)),
      free_disk_gib: Number(Number(observed.free_disk_gib || 0).toFixed(2)),
      launchd_available: observed.launchd_available === true,
    },
    target_role: 'private_worker',
    public_ingress_authority_granted: false,
    field_certification_claimed: false,
    truth_boundary:
      'Preflight proves local platform prerequisites only. It does not prove external reachability, production enrollment, public-edge authority, or workload execution.',
  };
}

export function observeMacNode001({ targetRoot } = {}) {
  return {
    platform: process.platform,
    architecture: process.arch,
    node_major: Number(process.versions.node.split('.')[0]),
    memory_gib: os.totalmem() / (1024 ** 3),
    free_disk_gib: diskFreeGiB(targetRoot || '/Library/Application Support/Evercraft'),
    launchd_available: commandOk('/bin/launchctl', ['help']) || commandOk('/bin/launchctl', ['print', 'system']),
  };
}

export function runMacNode001Preflight({ targetRoot } = {}) {
  return evaluateMacNode001Preflight(observeMacNode001({ targetRoot }));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const receipt = runMacNode001Preflight({ targetRoot: arg('--root', '/Library/Application Support/Evercraft') });
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  process.exit(receipt.passed ? 0 : 4);
}
