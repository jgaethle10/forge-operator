#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEvercraftComputeNode } from './runtime-node.mjs';
import { startCapacityBeacon } from './capacity-beacon.mjs';
import { ensureNodeIdentity, publicIdentityProjection } from './node-identity.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function has(name) { return process.argv.includes(name); }

function firstLanIpv4() {
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows || []) {
      if (row.family === 'IPv4' && !row.internal) return row.address;
    }
  }
  return null;
}

export async function startNodeSeed({
  root,
  nodeId = `evercraft-${os.hostname()}`,
  host = '127.0.0.1',
  port = 42420,
  advertiseHost,
  allocatorToken = '',
  announce = true,
  announceAddress = '239.42.24.42',
  announcePort = 42424,
  announceIntervalMs = 5_000,
} = {}) {
  if (!root) throw new Error('root is required');
  const resolvedRoot = path.resolve(root);
  fs.mkdirSync(resolvedRoot, { recursive: true, mode: 0o750 });
  const identity = ensureNodeIdentity({ root: resolvedRoot, nodeId });
  const publicIdentity = publicIdentityProjection(identity);

  const compute = await startEvercraftComputeNode({
    nodeId,
    root: resolvedRoot,
    host,
    port,
    allocatorToken,
    nodeIdentity: publicIdentity,
  });

  const actualPort = Number(new URL(compute.endpoint).port);
  const publishedHost = advertiseHost ||
    (host === '0.0.0.0' ? firstLanIpv4() : host);
  if (!publishedHost || publishedHost === '0.0.0.0') {
    await compute.close();
    throw new Error('advertiseHost is required when no LAN address can be resolved');
  }

  const endpoint = `http://${publishedHost}:${actualPort}`;
  let beacon = null;
  if (announce) {
    beacon = await startCapacityBeacon({
      nodeId,
      endpoint,
      identity,
      address: announceAddress,
      port: announcePort,
      intervalMs: announceIntervalMs,
    });
  }

  const receipt = {
    schema: 'evercraft.compute.nodeseed-receipt.v1',
    node_id: nodeId,
    runtime: 'Evercraft Compute',
    endpoint,
    node_identity: publicIdentity,
    root: resolvedRoot,
    allocation_auth: allocatorToken ? 'bearer' : 'loopback_only',
    beacon: announce ? {
      schema: 'evercraft.capacity.beacon.v2',
      address: announceAddress,
      port: announcePort,
    } : null,
    named_cloud_required: false,
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(resolvedRoot, 'nodeseed-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { mode: 0o600 }
  );

  return {
    ...receipt,
    compute,
    beacon,
    node_identity: publicIdentity,
    close: async () => {
      if (beacon) await beacon.close();
      await compute.close();
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = arg('--root');
  if (!root) {
    console.error('usage: node-seed.mjs --root /private/evercraft [--host 0.0.0.0] [--port 42420] [--advertise-host 192.168.1.20] [--no-announce]');
    process.exit(2);
  }

  const host = arg('--host', '127.0.0.1');
  const allocatorToken = String(process.env.EVERCRAFT_ALLOCATOR_TOKEN || '');
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost' && !allocatorToken) {
    console.error('EVERCRAFT_ALLOCATOR_TOKEN is required for a network-exposed NodeSeed');
    process.exit(3);
  }

  const seed = await startNodeSeed({
    root,
    nodeId: arg('--node-id', `evercraft-${os.hostname()}`),
    host,
    port: Number(arg('--port', '42420')),
    advertiseHost: arg('--advertise-host', null),
    allocatorToken,
    announce: !has('--no-announce'),
    announceAddress: arg('--announce-address', '239.42.24.42'),
    announcePort: Number(arg('--announce-port', '42424')),
  });

  console.log(JSON.stringify({
    schema: seed.schema,
    node_id: seed.node_id,
    endpoint: seed.endpoint,
    allocation_auth: seed.allocation_auth,
    node_identity_fingerprint_sha256: seed.node_identity.public_key_fingerprint_sha256,
    beacon: seed.beacon ? { address: seed.beacon.address, port: seed.beacon.port } : null,
    named_cloud_required: false,
  }, null, 2));

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await seed.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
