#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function currentBootHash() {
  try {
    const value = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    return value ? `sha256:${sha(value)}` : null;
  } catch {
    return null;
  }
}

function serviceState() {
  try {
    const active = execFileSync('systemctl', ['is-active', 'evercraft-nodeseed.service'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const enabled = execFileSync('systemctl', ['is-enabled', 'evercraft-nodeseed.service'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return { active: active === 'active', enabled: enabled === 'enabled' };
  } catch {
    return { active: false, enabled: false };
  }
}

const root = path.resolve(arg('--root', '/var/lib/evercraft/nodeseed'));
const preflightFile = path.resolve(arg('--preflight', path.join(root, 'node001-preflight.json')));
const installReceiptFile = path.resolve(arg('--install-receipt', path.join(root, 'install-receipt.json')));
const operatorRef = String(arg('--operator-ref', ''));
const sourceReceipt = String(arg('--receipt-ref', ''));
const physicalObserved = process.argv.includes('--physical-observed');
const offlineReceiptFile = path.resolve(
  arg('--offline-receipt', path.join(root, 'offline-receipt.json'))
);

if (!fs.existsSync(preflightFile)) throw new Error('preflight receipt missing');
if (!fs.existsSync(installReceiptFile)) throw new Error('install receipt missing');
if (!fs.existsSync(offlineReceiptFile)) throw new Error('offline receipt missing');
if (!operatorRef) throw new Error('--operator-ref is required');
if (!sourceReceipt) throw new Error('--receipt-ref is required');

const preflight = readJson(preflightFile);
const install = readJson(installReceiptFile);
const currentBoot = currentBootHash();
const service = serviceState();
const rebootPersistence = Boolean(
  install.install_boot_id_hash &&
  currentBoot &&
  install.install_boot_id_hash !== currentBoot &&
  service.active &&
  service.enabled
);

const nodeReceiptFile = path.join(root, 'nodeseed-receipt.json');
const telemetryVerified = fs.existsSync(nodeReceiptFile) && service.active;
const nodeReceipt = telemetryVerified ? readJson(nodeReceiptFile) : null;
const rebootReceiptRef = rebootPersistence
  ? `sha256:${sha(JSON.stringify({
      install_receipt: install,
      current_boot_id_hash: currentBoot,
      service,
    }))}`
  : null;
const telemetryReceiptRef = telemetryVerified
  ? `sha256:${sha(JSON.stringify(nodeReceipt))}`
  : null;
const offline = readJson(offlineReceiptFile);
const offlineBody = {
  schema: offline.schema,
  node_id: offline.node_id,
  device_fingerprint: offline.device_fingerprint,
  default_route_absent: offline.default_route_absent,
  local_compute_health_verified: offline.local_compute_health_verified,
  runtime: offline.runtime,
  boot_id_hash: offline.boot_id_hash,
  observed_at: offline.observed_at,
};
const offlineHashValid =
  offline.receipt_hash === `sha256:${sha(JSON.stringify(offlineBody))}`;
const offlineFresh =
  Number.isFinite(Date.parse(offline.observed_at)) &&
  Date.now() - Date.parse(offline.observed_at) <= 24 * 60 * 60 * 1000;
const offlineVerified = Boolean(
  offline.schema === 'evercraft.node001.offline-receipt.v1' &&
  offline.verified === true &&
  offlineHashValid &&
  offlineFresh &&
  currentBoot &&
  offline.boot_id_hash === currentBoot &&
  nodeReceipt &&
  offline.node_id === nodeReceipt.node_id &&
  offline.device_fingerprint === nodeReceipt.device_fingerprint
);

const evidence = {
  schema: 'evercraft.node001.field-evidence.v1',
  environment: 'field',
  host_type: physicalObserved ? 'physical' : 'unverified',
  os_family: 'linux',
  distribution_id: preflight.observed?.distribution_id || null,
  distribution_version: preflight.observed?.distribution_version || null,
  systemd_verified: Boolean(preflight.observed?.systemd && service.enabled),
  memory_gib: Number(preflight.observed?.memory_gib || 0),
  free_disk_gib: Number(preflight.observed?.free_disk_gib || 0),
  reboot_persistence_verified: rebootPersistence,
  reboot_receipt_ref: rebootReceiptRef,
  offline_operation_verified: offlineVerified,
  offline_receipt_ref: offlineVerified ? offline.receipt_hash : null,
  telemetry_verified: telemetryVerified,
  telemetry_receipt_ref: telemetryReceiptRef,
  host_identifier_ref: preflight.observed?.host_identifier_ref || null,
  test_date: new Date().toISOString(),
  operator_ref: operatorRef,
  receipt_ref: sourceReceipt,
  device_fingerprint: nodeReceipt?.device_fingerprint || null,
  node_id: nodeReceipt?.node_id || null,
};

const receipt = {
  schema: 'evercraft.node001.field-evidence-candidate.v1',
  ready_for_yard_enrollment:
    evidence.host_type === 'physical' &&
    evidence.systemd_verified &&
    evidence.memory_gib >= 6 &&
    evidence.free_disk_gib >= 8 &&
    evidence.reboot_persistence_verified &&
    evidence.offline_operation_verified &&
    evidence.telemetry_verified &&
    Boolean(evidence.host_identifier_ref) &&
    Boolean(evidence.device_fingerprint) &&
    Boolean(evidence.node_id),
  evidence,
  evidence_digest: `sha256:${sha(JSON.stringify(evidence))}`,
  generated_at: new Date().toISOString(),
};

const output = arg('--out', path.join(root, 'field-evidence-candidate.json'));
fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(receipt, null, 2));
process.exit(receipt.ready_for_yard_enrollment ? 0 : 5);
