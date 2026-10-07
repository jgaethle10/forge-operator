#!/usr/bin/env node
import assert from 'node:assert/strict';
import { evaluateMacNode001Preflight } from './node001-macos-preflight.mjs';

const ready = evaluateMacNode001Preflight({
  platform: 'darwin',
  architecture: 'arm64',
  node_major: 24,
  memory_gib: 24,
  free_disk_gib: 300,
  launchd_available: true,
});
assert.equal(ready.passed, true);
assert.equal(ready.target_role, 'private_worker');
assert.equal(ready.public_ingress_authority_granted, false);
assert.equal(ready.field_certification_claimed, false);

const intel = evaluateMacNode001Preflight({
  platform: 'darwin',
  architecture: 'x64',
  node_major: 24,
  memory_gib: 32,
  free_disk_gib: 300,
  launchd_available: true,
});
assert.equal(intel.passed, false);
assert.equal(intel.checks.apple_silicon, false);

const underMemory = evaluateMacNode001Preflight({
  platform: 'darwin',
  architecture: 'arm64',
  node_major: 24,
  memory_gib: 8,
  free_disk_gib: 300,
  launchd_available: true,
});
assert.equal(underMemory.passed, false);
assert.equal(underMemory.checks.memory_at_least_16_gib, false);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.node001.macos-preflight-proof.v1',
  apple_silicon_required: true,
  minimum_memory_gib: 16,
  minimum_free_disk_gib: 64,
  public_ingress_authority_granted: false,
  field_certification_claimed: false,
}, null, 2));
