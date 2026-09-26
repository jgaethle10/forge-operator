import assert from 'node:assert/strict';
import { YardPublicRouteBroker } from '../systemia/yard/public-route-broker.mjs';

function fakeRecord(){
  return {
    state:'ready',
    receipt:{
      workload_class:'systemia.specialist-handoff-mcp.v1',
      receipt_hash:'sha256:'+'a'.repeat(64),
    },
    result:{
      local_url:'http://127.0.0.1:43123',
      instance_id:'specialist_test_instance',
    },
  };
}

function goodHealth(){
  return {
    ok:true,
    service:'specialist-handoff-mcp',
    runtime:'Evercraft Compute',
    instance_id:'specialist_test_instance',
    identity_attestation_bound:true,
    same_device_binding:true,
    field_enrollment_bound:true,
    field_verified:true,
    device_fingerprint:'sha256:'+'b'.repeat(64),
    field_enrollment_receipt_ref:'sha256:'+'c'.repeat(64),
    public_edge_admission_receipt_ref:'sha256:'+'d'.repeat(64),
  };
}

test('production specialist route is rejected before lease creation without field proof',async()=>{
  let createCalls=0;
  const yard={
    deploymentStatus:()=>fakeRecord(),
    verifyRoute:async()=>({
      ok:false,
      state:'public_route_unbound',
      local_health_ok:true,
      health:{...goodHealth(),field_verified:false},
    }),
    verifyPublicRoute:async()=>{throw new Error('must not verify');},
  };
  const broker=new YardPublicRouteBroker({
    yard,
    providerClient:{
      capabilities:async()=>({
        protocol:'evercraft.public-route.v1',
        provider:'test-edge',
        https_required:true,
      }),
      createLease:async()=>{
        createCalls++;
        throw new Error('must not create lease');
      },
      releaseLease:async()=>({released:true}),
    },
  });

  await assert.rejects(
    broker.bindDeployment('specialist-prod'),
    /production_specialist_field_preflight_failed/
  );
  assert.equal(createCalls,0);
});

test('production specialist route may lease only after field and identity preflight',async()=>{
  let createCalls=0;
  const record=fakeRecord();
  const yard={
    deploymentStatus:()=>record,
    verifyRoute:async()=>({
      ok:false,
      state:'public_route_unbound',
      local_health_ok:true,
      health:goodHealth(),
    }),
    verifyPublicRoute:async(_id,{origin})=>({
      origin,
      scope:'public_https',
      verified:true,
      receipt_hash:'sha256:'+'e'.repeat(64),
    }),
  };
  const broker=new YardPublicRouteBroker({
    yard,
    providerClient:{
      capabilities:async()=>({
        protocol:'evercraft.public-route.v1',
        provider:'test-edge',
        https_required:true,
      }),
      createLease:async(route)=>{
        createCalls++;
        assert.equal(route.deployment_receipt_hash,record.receipt.receipt_hash);
        assert.equal(route.instance_id,record.result.instance_id);
        return {
          protocol:'evercraft.public-route.v1',
          lease_id:'lease-prod',
          origin:'https://specialists.evercraft.example',
          deployment_receipt_hash:route.deployment_receipt_hash,
          instance_id:route.instance_id,
          receipt_hash:'sha256:'+'f'.repeat(64),
        };
      },
      releaseLease:async()=>({released:true}),
    },
  });

  const binding=await broker.bindDeployment('specialist-prod',{
    requestedHostname:'specialists',
  });
  assert.equal(createCalls,1);
  assert.equal(binding.route_scope,'public_https');
  assert.equal(binding.route_verified,true);
  assert.equal(binding.provider_transport,'compute_lease');
  assert.equal(binding.origin,'https://specialists.evercraft.example');
});

test('proof-loopback route does not falsely require physical field enrollment',async()=>{
  let createCalls=0;
  const record=fakeRecord();
  const yard={
    deploymentStatus:()=>record,
    verifyRoute:async()=>{throw new Error('production preflight must not run');},
    verifyPublicRoute:async(_id,{origin})=>({
      origin,
      scope:'loopback_proof',
      verified:false,
      receipt_hash:'sha256:'+'1'.repeat(64),
    }),
  };
  const broker=new YardPublicRouteBroker({
    yard,
    providerClient:{
      capabilities:async()=>({
        protocol:'evercraft.public-route.v1',
        provider:'proof-edge',
        https_required:false,
      }),
      createLease:async(route)=>{
        createCalls++;
        return {
          protocol:'evercraft.public-route.v1',
          lease_id:'lease-proof',
          origin:'http://127.0.0.1:49999',
          deployment_receipt_hash:route.deployment_receipt_hash,
          instance_id:route.instance_id,
        };
      },
      releaseLease:async()=>({released:true}),
    },
    allowLoopbackProof:true,
  });

  const binding=await broker.bindDeployment('specialist-proof');
  assert.equal(createCalls,1);
  assert.equal(binding.route_scope,'loopback_proof');
  assert.equal(binding.route_verified,false);
});
