import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPhysicalBrokerPreflight} from '../scripts/remote-broker-physical-preflight.mjs';

const workload='systemia.remote-capacity-broker.v1';
const fixture={
  receipt:{
    schema:'evercraft.compute.nodeseed-receipt.v1',
    node_id:'evercraft-penguin',
    device_fingerprint:'sha256:'+'a'.repeat(64),
  },
  capacity:{
    protocol:'evercraft.capacity.v1',
    node_id:'evercraft-penguin',
    device_fingerprint:'sha256:'+'a'.repeat(64),
    supported_workloads:[workload],
  },
  runtimeSource:'if (workloadClass === "'+workload+'") {}',
  caddyText:'reverse_proxy 127.0.0.1:8787',
  observedAt:'2026-10-27T18:00:00Z',
};

test('green local capacity is not green production route or permission',()=>{
  const status=projectPhysicalBrokerPreflight(fixture);
  assert.equal(status.local_broker_staging_eligible,true);
  assert.equal(status.verified_public_broker_https,false);
  assert.equal(status.cross_machine_dispatch_verified,false);
  assert.equal(status.production_device_authorized,'not_tested');
  assert.equal(status.mutations_performed,false);
  assert.equal(status.credentials_reported,false);
  assert.equal(status.next_gate,'deploy_supervised_local_only_broker_with_receipt_and_lease_keeper');
});

test('fingerprint mismatch holds local staging',()=>{
  const status=projectPhysicalBrokerPreflight({
    ...fixture,capacity:{...fixture.capacity,device_fingerprint:'sha256:'+'b'.repeat(64)},
  });
  assert.equal(status.local_broker_staging_eligible,false);
  assert.equal(status.nodeseed_identity_matches_live_capacity,false);
});

test('missing live broker workload holds local staging',()=>{
  const status=projectPhysicalBrokerPreflight({
    ...fixture,capacity:{...fixture.capacity,supported_workloads:[]},
  });
  assert.equal(status.local_broker_staging_eligible,false);
});

test('route text never implies independently verified HTTPS',()=>{
  const status=projectPhysicalBrokerPreflight({
    ...fixture,caddyText:'handle /v1/remote/* {} handle /nodes/* {}',
  });
  assert.equal(status.caddy_broker_paths_mentioned,true);
  assert.equal(status.verified_public_broker_https,false);
  assert.equal(status.broker_deployment_exists,'not_tested');
});
