#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readOsRelease() {
  const file = '/etc/os-release';
  if (!fs.existsSync(file)) return {};
  const result = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return result;
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
  try {
    const stats = fs.statfsSync(target);
    return Number(stats.bavail * stats.bsize) / (1024 ** 3);
  } catch {
    return 0;
  }
}

function hashedMachineRef() {
  for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value) return `machine:sha256:${sha(value)}`;
    } catch {}
  }
  return null;
}

function virtualizationHint() {
  const values = [];
  for (const file of [
    '/sys/class/dmi/id/product_name',
    '/sys/class/dmi/id/sys_vendor',
    '/sys/class/dmi/id/board_vendor',
  ]) {
    try { values.push(fs.readFileSync(file, 'utf8').trim()); } catch {}
  }
  try {
    const cpu = fs.readFileSync('/proc/cpuinfo', 'utf8');
    if (/\bhypervisor\b/i.test(cpu)) values.push('cpu-hypervisor-flag');
  } catch {}
  const joined = values.join(' ').toLowerCase();
  const virtual = /(kvm|qemu|vmware|virtualbox|hyper-v|xen|parallels|amazon ec2|google compute|digitalocean|linode|droplet|cloud)/i.test(joined) ||
    joined.includes('cpu-hypervisor-flag');
  return {
    state: virtual ? 'virtual_detected' : 'not_proven',
    evidence_hash: values.length ? `sha256:${sha(JSON.stringify(values))}` : null,
  };
}

function distroAllowed(id, version) {
  const n = Number.parseFloat(String(version || ''));
  if (!Number.isFinite(n)) return false;
  if (id === 'debian') return n >= 12;
  if (id === 'ubuntu') return n >= 22.04;
  return false;
}

const targetRoot = path.resolve(arg('--root', '/var/lib/evercraft/nodeseed'));
const osRelease = readOsRelease();
const distro = String(osRelease.ID || '').toLowerCase();
const version = String(osRelease.VERSION_ID || '');
const memoryGiB = os.totalmem() / (1024 ** 3);
const freeDiskGiB = diskFreeGiB(path.dirname(targetRoot));
const virtualization = virtualizationHint();
const systemd = process.platform === 'linux' &&
  commandOk('systemctl', ['--version']) &&
  fs.existsSync('/run/systemd/system');

const checks = {
  linux: process.platform === 'linux',
  supported_distribution: distroAllowed(distro, version),
  systemd,
  memory_at_least_6_gib: memoryGiB >= 6,
  free_disk_at_least_8_gib: freeDiskGiB >= 8,
  virtualization_not_detected: virtualization.state !== 'virtual_detected',
};

const receipt = {
  schema: 'evercraft.node001.preflight.v1',
  passed: Object.values(checks).every(Boolean),
  checks,
  observed: {
    platform: process.platform,
    architecture: process.arch,
    distribution_id: distro || null,
    distribution_version: version || null,
    memory_gib: Number(memoryGiB.toFixed(2)),
    free_disk_gib: Number(freeDiskGiB.toFixed(2)),
    systemd,
    host_identifier_ref: hashedMachineRef(),
    virtualization_state: virtualization.state,
    virtualization_evidence_hash: virtualization.evidence_hash,
  },
  target_root: targetRoot,
  observed_at: new Date().toISOString(),
};

console.log(JSON.stringify(receipt, null, 2));
process.exit(receipt.passed ? 0 : 4);
