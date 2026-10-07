import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installer = fs.readFileSync('scripts/install-evercraft-node001-macos.sh', 'utf8');
const profile = JSON.parse(fs.readFileSync('systemia/compute/node001-macos-profile.json', 'utf8'));

test('Node 001 macOS bootstrap supervises NodeSeed and resident Systemia with launchd', () => {
  assert.match(installer, /com\.evercraft\.nodeseed/);
  assert.match(installer, /com\.evercraft\.systemia-resident/);
  assert.match(installer, /launchctl bootstrap system/);
  assert.match(installer, /KeepAlive/);
  assert.match(installer, /RunAtLoad/);
  assert.match(installer, /resident-runner\.mjs/);
  assert.match(installer, /node-seed\.mjs/);
});

test('Node 001 macOS bootstrap keeps allocator secret out of plist and receipts', () => {
  assert.match(installer, /nodeseed-allocator-token/);
  assert.match(installer, /chmod 0600/);
  assert.match(installer, /allocator_secret_exposed_in_receipt.*false/);
  assert.doesNotMatch(installer, /<key>EVERCRAFT_ALLOCATOR_TOKEN<\/key>/);
});

test('Node 001 target is a private worker and grants no consequential authority', () => {
  assert.ok(profile.roles.includes('private_worker'));
  assert.equal(profile.authority.public_edge, false);
  assert.equal(profile.authority.payment_authority, false);
  assert.equal(profile.authority.publish_authority, false);
  assert.equal(profile.authority.trust_change_authority, false);
  assert.equal(profile.authority.resident_wakeups_grant_execution_authority, false);
  assert.match(installer, /node_role.*private_worker/);
  assert.match(installer, /public_ingress_authority_granted.*false/);
});
