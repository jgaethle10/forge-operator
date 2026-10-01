import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const src=fs.readFileSync(new URL('../scripts/evercraft-public-edge-map.mjs',import.meta.url),'utf8');

test('public edge mapper is credential-free and supports Chromebook or dedicated gateway targets',()=>{
  assert.match(src,/18080/);
  assert.match(src,/8443/);
  assert.match(src,/httpInternal/);
  assert.match(src,/httpsInternal/);
  assert.match(src,/brokerExternal/);
  assert.match(src,/host_forward_preflight/);
  assert.match(src,/chromeos_host_forward_unreachable/);
  assert.match(src,/router_target_unreachable/);
  assert.match(src,/probePorts/);
  assert.match(src,/external: 80/);
  assert.match(src,/external: 443/);
  assert.match(src,/Evercraft Saban Broker/);
  assert.doesNotMatch(src,/password|token|secret/i);
});

test('public edge mapper supports owned NAT traversal protocols',()=>{
  assert.match(src,/UPnP-IGD/);
  assert.match(src,/NAT-PMP/);
  assert.match(src,/PCP/);
  assert.match(src,/AddPortMapping/);
  assert.match(src,/5351/);
});


test('UPnP parser handles namespaced service descriptors and emits diagnostics',()=>{
  assert.match(src,/tagValue\(block, 'serviceType'\)/);
  assert.match(src,/matching_services/);
  assert.match(src,/advertised_service_types/);
  assert.match(src,/descriptor_status/);
});


test('router mapper parses under the repository Node runtime',()=>{
  const scriptPath = fileURLToPath(new URL('../scripts/evercraft-public-edge-map.mjs', import.meta.url));
  const checked = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});
