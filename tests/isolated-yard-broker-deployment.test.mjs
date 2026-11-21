import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {proveIsolatedYardBrokerDeployment} from '../systemia/yard/isolated-resident-broker-deployment.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'systemia/yard/isolated-resident-broker-deployment.mjs');
const labRoots=()=>fs.readdirSync(os.tmpdir())
  .filter(name=>name.startsWith('evercraft-isolated-yard-broker-')).sort();

test('disposable Yard deploy binds local broker receipt but never grants restart or public authority',async()=>{
  const baseline=labRoots();
  const result=await proveIsolatedYardBrokerDeployment();
  assert.equal(result.schema,'evercraft.yard.isolated-resident-broker-deployment-proof.v1');
  assert.equal(result.state,'passed');
  assert.equal(result.scope,'ephemeral_localhost_only');
  assert.equal(result.broker_deployed_through_yard,true);
  assert.equal(result.local_receipt_bound,true);
  assert.equal(result.authorized_devices,0);
  assert.equal(result.registered_nodes,0);
  assert.equal(result.public_https_verified,false);
  assert.equal(result.loopback_route_only,true);
  assert.equal(result.cold_restart_authorized,false);
  assert.equal(result.legacy_yard_deployment_reuse_authorized,false);
  assert.equal(result.live_service_changed,false);
  assert.equal(result.physical_node_contacted,false);
  assert.deepEqual(labRoots(),baseline,'temporary Yard and NodeSeed state cleaned up');
});

test('CLI must require explicit --lab and never start by default',()=>{
  const run=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,2,run.stderr);
  assert.match(run.stderr,/explicit --lab required/);
  assert.equal(run.stdout,'');
});

test('CLI proof returns bounded, redacted receipt without broker tokens',()=>{
  const run=spawnSync(process.execPath,[script,'--lab'],{encoding:'utf8',timeout:90000});
  assert.equal(run.status,0,run.stderr);
  const receipt=JSON.parse(run.stdout.trim());
  assert.equal(receipt.state,'passed');
  assert.equal(receipt.cold_restart_authorized,false);
  assert.equal(receipt.public_https_verified,false);
  assert.equal(receipt.authorized_devices,0);
  assert.ok(!run.stdout.includes('allocatorToken'));
  assert.ok(!run.stdout.includes('control_token'));
  assert.ok(!run.stdout.includes('device_fingerprint'));
});

test('lab source has no production paths or systemd lifecycle commands',()=>{
  const source=fs.readFileSync(script,'utf8');
  for(const forbidden of [
    '/var/lib/evercraft',
    '/opt/evercraft',
    'systemctl',
    'evercraft-remote-broker-resident.service',
    '127.0.0.1:8797',
    '100.115.92.205',
    'device-authorizations.json',
    'control-grants.json',
  ])assert.ok(!source.includes(forbidden),'forbidden production reference: '+forbidden);
  assert.match(source,/host:'127\.0\.0\.1'/);
  assert.match(source,/port:0/);
  assert.match(source,/authorized_devices:\{\}/);
  assert.match(source,/allowLoopbackProof:true/);
});
