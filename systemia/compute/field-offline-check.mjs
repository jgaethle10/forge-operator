#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function defaultRoutePresent() {
  try {
    const lines = fs.readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1);
    return lines.some((line) => {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 4) return false;
      const destination = fields[1];
      const flags = Number.parseInt(fields[3], 16);
      return destination === '00000000' && Number.isFinite(flags) && (flags & 0x1) === 0x1;
    });
  } catch {
    return true;
  }
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function bootHash() {
  try {
    const value = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    return value ? `sha256:${sha(value)}` : null;
  } catch {
    return null;
  }
}

const root = path.resolve(arg('--root', '/var/lib/evercraft/nodeseed'));
const nodeReceiptFile = path.join(root, 'nodeseed-receipt.json');
if (!fs.existsSync(nodeReceiptFile)) throw new Error('NodeSeed receipt missing');
const nodeReceipt = JSON.parse(fs.readFileSync(nodeReceiptFile, 'utf8'));
const endpoint = new URL(nodeReceipt.endpoint);
const localBase = `http://127.0.0.1:${endpoint.port}`;

const routePresent = defaultRoutePresent();
let health = null;
let capacity = null;
let localHealthOk = false;
try {
  health = await getJson(`${localBase}/v1/health`);
  capacity = await getJson(`${localBase}/v1/capacity`);
  localHealthOk =
    health.ok === true &&
    capacity.protocol === 'evercraft.capacity.v1' &&
    capacity.node_id === nodeReceipt.node_id &&
    capacity.device_fingerprint === nodeReceipt.device_fingerprint;
} catch {}

const body = {
  schema: 'evercraft.node001.offline-receipt.v1',
  node_id: nodeReceipt.node_id,
  device_fingerprint: nodeReceipt.device_fingerprint,
  default_route_absent: !routePresent,
  local_compute_health_verified: localHealthOk,
  runtime: capacity?.runtime || null,
  boot_id_hash: bootHash(),
  observed_at: new Date().toISOString(),
};
const receipt = {
  ...body,
  receipt_hash: `sha256:${sha(JSON.stringify(body))}`,
  verified: body.default_route_absent && body.local_compute_health_verified,
};

const out = path.resolve(arg('--out', path.join(root, 'offline-receipt.json')));
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(receipt, null, 2));
process.exit(receipt.verified ? 0 : 6);
