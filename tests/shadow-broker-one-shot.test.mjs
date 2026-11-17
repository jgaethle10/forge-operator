import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCanaryGate,
  verifyCanaryOutcome,
} from '../systemia/yard/shadow-broker-one-shot.mjs';

const fingerprint='sha256:'+'a'.repeat(64);
const receipt={
  schema:'evercraft.compute.nodeseed-receipt.v1',
  node_id:'synthetic-shadow-node',
  device_fingerprint:fingerprint,
  endpoint:'http://127.0.0.1:42420/',
};
const capacity={
  protocol:'evercraft.capacity.v1',
  node_id:receipt.node_id,
  device_fingerprint:fingerprint,
  supported_workloads:['systemia.remote-capacity-broker.v1'],
};
const states={nodeActive:'active',legacyActive:'inactive',legacyEnabled:'disabled'};

test('physical shadow canary admits a compatible loopback-only capacity offer',()=>{
  const g=assessCanaryGate({receipt,capacity,...states});
  assert.equal(g.ok,true);
  assert.deepEqual(g.reasons,[]);
  assert.equal(g.local_capacity_origin,'http://127.0.0.1:42420');
  assert.equal(g.authority_reuse_allowed,false);
  assert.equal(g.device_enrollment_allowed,false);
  assert.equal(g.external_route_allowed,false);
});

test('legacy broker active or enabled fails closed',()=>{
  for(const delta of [
    {legacyActive:'active'},
    {legacyEnabled:'enabled'},
    {nodeActive:'inactive'},
  ]){
    const g=assessCanaryGate({receipt,capacity,...states,...delta});
    assert.equal(g.ok,false);
    assert.ok(g.reasons.length>0);
  }
});

test('a different physical identity, unsupported workload or invalid receipt is rejected',()=>{
  const cases=[
    {receipt,capacity:{...capacity,node_id:'other'}},
    {receipt,capacity:{...capacity,supported_workloads:[]}},
    {receipt:{...receipt,endpoint:'https://external.example.invalid/'},capacity},
  ];
  for(const pair of cases){
    const g=assessCanaryGate({...pair,...states});
    assert.equal(g.ok,false);
  }
});

const hash='sha256:'+'b'.repeat(64);
const instance='remote_broker_'+'c'.repeat(24);
const record={
  result:{instance_id:instance},
  receipt:{receipt_hash:hash},
};
const health={
  ok:true,
  schema:'evercraft.remote-capacity.broker-health.v1',
  service:'remote-capacity-broker',
  runtime:'Evercraft Compute',
  instance_id:instance,
  deployment_receipt_bound:true,
  deployment_receipt_ref:hash,
  secure_envelope_schema:'evercraft.secure-envelope.v1',
  authorized_devices:0,
  registered_nodes:0,
  pending_enrollment_requests:0,
};
const route={
  ok:false,
  state:'public_route_unbound',
  local_health_ok:true,
};

test('receipt-bound empty broker with unbound public route is accepted as a one-shot canary',()=>{
  const result=verifyCanaryOutcome({health,record,route});
  assert.equal(result.no_public_route,true);
  assert.equal(result.zero_authorized_devices,true);
});

test('inherited authorizations, active nodes, pending enrollments or public route fail closed',()=>{
  for(const delta of [
    {authorized_devices:1},
    {registered_nodes:1},
    {pending_enrollment_requests:1},
    {deployment_receipt_bound:false},
    {instance_id:'remote_broker_'+'d'.repeat(24)},
  ]){
    assert.throws(()=>verifyCanaryOutcome({
      health:{...health,...delta},record,route
    }));
  }
  assert.throws(()=>verifyCanaryOutcome({
    health,record,route:{...route,ok:true,state:'public_route_verified'}
  }));
});

test('live canary cannot execute even if an approval and token are supplied',async()=>{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const entry=fileURLToPath(new URL('../systemia/yard/shadow-broker-one-shot.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[entry,'--run','--ack-one-shot-canary'],{
    timeout:5_000,encoding:'utf8',
    env:{
      ...process.env,
      EVERCRAFT_SHADOW_CANARY_APPROVED:'YES',
      EVERCRAFT_ALLOCATOR_TOKEN:'synthetic-test-only-not-a-credential',
    },
  });
  assert.equal(run.status,3,run.error?.message||run.stderr);
  assert.match(run.stderr,/live_canary_blocked_pending_partial_deployment_cleanup_proof/);
  assert.equal(run.stdout,'');
});
