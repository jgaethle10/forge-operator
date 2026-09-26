import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { discoverEligibleCapacity } from './capacity-resolver.mjs';

async function freeUdpPort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  const port = typeof address === 'object' ? address.port : 0;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yard-capacity-resolver-'));
const announcePort = await freeUdpPort();
const token = 'resolver-proof-secret';

const seedB = await startNodeSeed({
  root: path.join(root, 'b'),
  nodeId: 'node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});
const seedA = await startNodeSeed({
  root: path.join(root, 'a'),
  nodeId: 'node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  placementLabels: ['public-edge'],
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});

const tlsDir=path.join(root,'tls');
fs.mkdirSync(tlsDir,{recursive:true});
const tlsKey=path.join(tlsDir,'edge.key.pem');
const tlsCert=path.join(tlsDir,'edge.cert.pem');
execFileSync('openssl',[
  'req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',tlsKey,
  '-out',tlsCert,
  '-days','10',
  '-subj','/CN=*.edge.evercraft.test',
  '-addext','subjectAltName=DNS:*.edge.evercraft.test',
],{stdio:'ignore'});

const previousEdgeEnv={
  domain:process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN,
  key:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH,
  cert:process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH,
  port:process.env.EVERCRAFT_PUBLIC_EDGE_PORT,
};
process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN='edge.evercraft.test';
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=tlsKey;
process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=tlsCert;
process.env.EVERCRAFT_PUBLIC_EDGE_PORT='443';

const seedC = await startNodeSeed({
  root: path.join(root, 'c'),
  nodeId: 'node-c',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  placementLabels: ['public-edge'],
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});

try {
  const resolved = await discoverEligibleCapacity({
    workloadClass: 'systemia.kaidance-collider.v1',
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
  });

  assert.equal(resolved.schema, 'evercraft.yard.capacity-resolution.v1');
  assert.equal(resolved.discovered_count, 3);
  assert.equal(resolved.eligible_count, 3);
  assert.equal(resolved.selected.node_id, 'node-a');
  assert.equal(resolved.selected.allocation_auth, 'bearer');
  assert.ok(resolved.receipt_hash);

  const edgeReady = await discoverEligibleCapacity({
    workloadClass: 'systemia.public-edge.v1',
    requiredWorkloads: [
      'systemia.public-edge.v1',
      'systemia.specialist-handoff-mcp.v1',
    ],
    requiredPlacementLabels: ['public-edge'],
    requiredServiceCapabilities: ['public_edge'],
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
  });
  assert.equal(edgeReady.eligible_count, 1);
  assert.equal(edgeReady.selected.node_id, 'node-c');
  assert.equal(edgeReady.selected.service_capabilities.public_edge.ready, true);
  assert.equal(edgeReady.selected.service_capabilities.public_edge.public_https, true);
  assert.equal(
    edgeReady.candidates.find((x) => x.node_id === 'node-a').reason,
    'service_capability_not_ready'
  );
  assert.equal(
    edgeReady.candidates.find((x) => x.node_id === 'node-b').reason,
    'placement_label_missing'
  );

  const unsupported = await discoverEligibleCapacity({
    workloadClass: 'systemia.not-real.v1',
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 250,
      joinMulticast: false,
    },
  });
  assert.equal(unsupported.eligible_count, 0);
  assert.ok(unsupported.candidates.every((x) => x.reason === 'workload_unsupported'));

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.yard.capacity-resolver-proof.v1',
    discovered: resolved.discovered_count,
    eligible: resolved.eligible_count,
    selected_node: resolved.selected.node_id,
    deterministic_selection: true,
    workload_filtering: true,
    multi_workload_filtering: true,
    placement_label_filtering: true,
    edge_tls_readiness_filtering: true,
    selected_edge_node: edgeReady.selected.node_id,
    edge_resolver_receipt: edgeReady.receipt_hash,
    resolver_receipt: resolved.receipt_hash,
  }, null, 2));
} finally {
  await seedA.close();
  await seedB.close();
  await seedC.close();
  if(previousEdgeEnv.domain===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN;
  else process.env.EVERCRAFT_PUBLIC_EDGE_BASE_DOMAIN=previousEdgeEnv.domain;
  if(previousEdgeEnv.key===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_KEY_PATH=previousEdgeEnv.key;
  if(previousEdgeEnv.cert===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH;
  else process.env.EVERCRAFT_PUBLIC_EDGE_TLS_CERT_PATH=previousEdgeEnv.cert;
  if(previousEdgeEnv.port===undefined) delete process.env.EVERCRAFT_PUBLIC_EDGE_PORT;
  else process.env.EVERCRAFT_PUBLIC_EDGE_PORT=previousEdgeEnv.port;
  fs.rmSync(root, { recursive: true, force: true });
}
