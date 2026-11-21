import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {proveIsolatedBrokerCandidate} from '../scripts/prove-isolated-broker-candidate.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'scripts/prove-isolated-broker-candidate.mjs');
const labPaths=()=>fs.readdirSync(os.tmpdir())
  .filter(name=>name.startsWith('evercraft-broker-candidate-lab-')).sort();

test('isolated cold broker uses new identity, zero authority and refuses automatic cutover',async()=>{
  const before=labPaths();
  const result=await proveIsolatedBrokerCandidate();
  assert.equal(result.schema,'evercraft.yard.isolated-broker-candidate-proof.v1');
  assert.equal(result.state,'passed');
  assert.equal(result.scope,'synthetic_loopback_lab_only');
  assert.equal(result.authorized_devices,0);
  assert.equal(result.registered_nodes,0);
  assert.equal(result.deployment_receipt_bound,false);
  assert.equal(result.previous_deployment_reuse_denied,true);
  assert.equal(result.automatic_cutover_denied,true);
  assert.equal(result.restart_authorized,false);
  assert.equal(result.live_system_access,false);
  assert.equal(result.physical_node_access,false);
  assert.deepEqual(labPaths(),before,'ephemeral lab state must be removed');
});

test('CLI without exact explicit --lab refuses execution',()=>{
  const run=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,2,run.stderr);
  assert.match(run.stderr,/explicit --lab required/);
  assert.equal(run.stdout,'');
});

test('CLI lab emits secret-free pass and no production authority',()=>{
  const run=spawnSync(process.execPath,[script,'--lab'],{encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr);
  const receipt=JSON.parse(run.stdout.trim());
  assert.equal(receipt.state,'passed');
  assert.equal(receipt.restart_authorized,false);
  assert.equal(receipt.live_system_access,false);
  assert.equal(receipt.deployment_receipt_bound,false);
  assert.ok(!run.stdout.includes('allocator_token'));
  assert.ok(!run.stdout.includes('device_fingerprint'));
});

test('proof source contains no production state paths or service control',()=>{
  const source=fs.readFileSync(script,'utf8');
  for(const forbidden of [
    '/var/lib/evercraft',
    'systemctl',
    'remote-broker-resident.service',
    '127.0.0.1:8797',
    '100.115.92.205',
    'device-authorizations.json',
    'control-grants.json',
  ])assert.ok(!source.includes(forbidden),'forbidden production boundary: '+forbidden);
  assert.match(source,/host:'127\.0\.0\.1'/);
  assert.match(source,/port:0/);
  assert.match(source,/authorizedDevices:\{\}/);
});
