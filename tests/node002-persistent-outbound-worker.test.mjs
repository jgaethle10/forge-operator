import test from 'node:test';
import assert from 'node:assert/strict';
import {narrowContentHashCommandAllowed as allow, startOutboundNodeAgent} from '../systemia/network/outbound-node-agent.mjs';
import {verifyNode002PersistentPreflight as verify, assessNode002PersistentStatus as assess} from '../scripts/node002-persistent-outbound-worker.mjs';

test('persistent policy permits liveness, bounded hash workload and release',()=>{
  assert.equal(allow({method:'GET',route:'/v1/health'}),true);
  assert.equal(allow({method:'GET',route:'/v1/capacity'}),true);
  assert.equal(allow({method:'POST',route:'/v1/leases',body:{workload_class:'systemia.content-hash.v1',requested_ttl_ms:90000}}),true);
  const input={idempotency_key:'evercraft-node002-hash-1234',payload:{value:{a:1}}};
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{workload_class:'systemia.content-hash.v1',lease_id:'lease123',token:'token123',idempotency_key:input.idempotency_key,input}}),true);
  // The real registered NodeSeed worker does not require a second
  // idempotency_key nested inside input.
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{
    workload_class:'systemia.content-hash.v1',lease_id:'lease123',token:'token123',
    idempotency_key:input.idempotency_key,input:{payload:{value:{a:1}}}
  }}),true);
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{
    workload_class:'systemia.content-hash.v1',lease_id:'lease123',token:'token123',
    idempotency_key:input.idempotency_key,input:{idempotency_key:'different-key',payload:{value:{a:1}}}
  }}),false);
  assert.equal(allow({method:'POST',route:'/v1/leases/lease123/release',body:{token:'token123'}}),true);
});
test('persistent policy blocks arbitrary code, read/write fs, deployments, wide leases and incompatible jobs',()=>{
  for(const route of ['/v1/operator/exec','/v1/operator/fs/read','/v1/operator/fs/write','/v1/operator/status','/v1/attest','/v1/field-enrollment-packet','/v1/services/a/stop']){
    assert.equal(allow({method:'POST',route,body:{}}),false,route);
  }
  assert.equal(allow({method:'POST',route:'/v1/leases',body:{workload_class:'saban.logical-agent',requested_ttl_ms:1000}}),false);
  assert.equal(allow({method:'POST',route:'/v1/leases',body:{workload_class:'systemia.content-hash.v1',requested_ttl_ms:86400000}}),false);
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{workload_class:'saban.logical-agent'}}),false);
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{workload_class:'systemia.content-hash.v1',idempotency_key:'valid-example-123',input:{idempotency_key:'valid-example-123',payload:{bytes_base64:'AA=='}}}}),false);
});
const receipt={
 schema:'evercraft.compute.nodeseed-receipt.v1',node_id:'evercraft-node002-nextgen',
 device_fingerprint:'sha256:'+'a'.repeat(64),endpoint:'http://192.168.88.3:7777',
};
const cap={
 protocol:'evercraft.capacity.v1',node_id:receipt.node_id,
 device_fingerprint:receipt.device_fingerprint,supported_workloads:['systemia.content-hash.v1'],
};
const health={
 ok:true,schema:'evercraft.remote-capacity.broker-health.v1',runtime:'Evercraft Compute',
 service:'remote-capacity-broker',
 instance_id:'remote_broker_8a9b5bfcec4231bd15ed375c',
 deployment_receipt_bound:true,
 deployment_receipt_ref:'e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c',
 secure_envelope_schema:'evercraft.secure-envelope.v1',
 authorized_devices:1,
};
test('physical preflight requires exact NextGen device + broker and uses loopback',()=>{
 assert.deepEqual(verify({receipt,capacity:cap,health}),{endpoint:'http://127.0.0.1:7777',node_id:receipt.node_id,device_fingerprint:receipt.device_fingerprint});
 assert.throws(()=>verify({receipt,capacity:cap,health:{...health,instance_id:'other'}}));
 assert.throws(()=>verify({receipt:{...receipt,node_id:'unknown'},capacity:cap,health}));
 assert.throws(()=>verify({receipt,capacity:{...cap,device_fingerprint:'sha256:'+'b'.repeat(64)},health}));
 assert.throws(()=>verify({receipt,capacity:{...cap,supported_workloads:[]},health}));
});



test('persistent agent rejects a different fingerprint before issuing any broker challenge',async()=>{
  const saved=globalThis.fetch;
  let brokerRequests=0;
  try{
    globalThis.fetch=async url=>{
      const target=String(url);
      if(target.endsWith('/v1/capacity'))return new Response(JSON.stringify(cap),{
        status:200,headers:{'content-type':'application/json'},
      });
      brokerRequests++;
      throw Error('unapproved_remote_request');
    };
    await assert.rejects(startOutboundNodeAgent({
      brokerUrl:'https://fabric.example.invalid',
      localCapacityEndpoint:'http://127.0.0.1:7777',
      localAllocatorToken:'synthetic-test-only',
      expectedNodeId:receipt.node_id,
      expectedDeviceFingerprint:'sha256:'+'f'.repeat(64),
      commandPolicy:'content-hash-only',
      capacityWorkloadAllowlist:['systemia.content-hash.v1'],
    }),/remote_agent_physical_device_fingerprint_mismatch/);
    assert.equal(brokerRequests,0);
  }finally{globalThis.fetch=saved}
});

test('device key rotation after registration fails closed before broker polling',async()=>{
  const saved=globalThis.fetch;
  let capacityReads=0,polls=0,agent=null;
  const json=(v)=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
  const waitFor=async(predicate)=>{
    const end=Date.now()+2500;
    while(Date.now()<end){
      if(predicate())return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw Error('test_timed_out_waiting_for_fingerprint_mismatch');
  };
  try{
    globalThis.fetch=async url=>{
      const target=String(url);
      if(target.endsWith('/v1/capacity')){
        capacityReads++;
        return json(capacityReads===1?cap:{...cap,device_fingerprint:'sha256:'+'f'.repeat(64)});
      }
      if(target.endsWith('/v1/remote/challenge'))return json({nonce:'test-nonce'});
      if(target.endsWith('/v1/attest'))return json({attestation:{synthetic:true}});
      if(target.endsWith('/v1/remote/register'))return json({
        session_token:'synthetic-session-token',transport_key:'synthetic-transport-key'
      });
      if(target.endsWith('/v1/remote/agent/poll')){polls++;return new Response(null,{status:204});}
      throw Error('unexpected_mock_network_request');
    };
    agent=await startOutboundNodeAgent({
      brokerUrl:'https://fabric.example.invalid',
      localCapacityEndpoint:'http://127.0.0.1:7777',
      localAllocatorToken:'synthetic-test-only',
      expectedNodeId:receipt.node_id,
      expectedDeviceFingerprint:receipt.device_fingerprint,
      commandPolicy:'content-hash-only',
      capacityWorkloadAllowlist:['systemia.content-hash.v1'],
      pollBackoffMs:100,
    });
    await waitFor(()=>agent.status().last_error==='remote_agent_physical_device_fingerprint_mismatch');
    assert.equal(polls,0);
    assert.equal(agent.status().last_successful_poll_at,null);
    assert.equal(agent.status().last_error,'remote_agent_physical_device_fingerprint_mismatch');
  }finally{
    if(agent)await agent.close();
    globalThis.fetch=saved;
  }
});

test('outbound agent clears transient broker failure after a successful empty poll', async()=>{
  const originalFetch=globalThis.fetch;
  let polls=0;
  let agent=null;
  const json=(value,status=200)=>new Response(JSON.stringify(value),{
    status,headers:{'content-type':'application/json'},
  });
  const capacity={
    protocol:'evercraft.capacity.v1',
    node_id:receipt.node_id,
    device_fingerprint:receipt.device_fingerprint,
    supported_workloads:['systemia.content-hash.v1'],
  };
  const waitFor=async predicate=>{
    const deadline=Date.now()+2500;
    while(Date.now()<deadline){
      if(predicate())return;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    throw Error('test_timed_out_waiting_for_expected_poll_state');
  };
  try{
    globalThis.fetch=async url=>{
      const target=String(url);
      if(target.endsWith('/v1/capacity'))return json(capacity);
      if(target.endsWith('/v1/remote/challenge'))return json({nonce:'synthetic-nonce'});
      if(target.endsWith('/v1/attest'))return json({attestation:{synthetic:true}});
      if(target.endsWith('/v1/remote/register'))return json({
        session_token:'synthetic-session-token',
        transport_key:'synthetic-transport-key',
      });
      if(target.endsWith('/v1/remote/agent/poll')){
        polls++;
        if(polls===1)return json({error:'synthetic_transient'},500);
        await new Promise(resolve=>setTimeout(resolve,15));
        return new Response(null,{status:204});
      }
      throw Error('unexpected_network_request_in_offline_test');
    };
    agent=await startOutboundNodeAgent({
      brokerUrl:'https://fabric.example.invalid',
      localCapacityEndpoint:'http://127.0.0.1:7777',
      localAllocatorToken:'synthetic-test-only',
      expectedNodeId:receipt.node_id,
      commandPolicy:'content-hash-only',
      capacityWorkloadAllowlist:['systemia.content-hash.v1'],
      pollBackoffMs:90,
    });
    await waitFor(()=>agent.status().last_error==='remote_poll_failed:500');
    await waitFor(()=>polls>=2&&agent.status().last_error===null);
    assert.equal(agent.status().running,true);
    assert.ok(agent.status().last_poll_at);
    assert.equal(agent.status().last_error,null);
  } finally {
    if(agent)await agent.close();
    globalThis.fetch=originalFetch;
  }
});

test('worker readiness requires a fresh status AND a recent successful poll',()=>{
  const nowMs=Date.parse('2026-10-28T23:00:00.000Z');
  const stamp=ms=>new Date(nowMs-ms).toISOString();
  const healthy={
    observed_at:stamp(1000),
    last_successful_poll_at:stamp(2000),
    state:'registered',
    ready:true,
    last_error_code:null,
  };
  const result=assess(healthy,{nowMs});
  assert.equal(result.status_fresh,true);
  assert.equal(result.successful_poll_fresh,true);
  assert.equal(result.ready_now,true);
  assert.equal(result.systemd_service_independently_verified,false);
  assert.equal(result.yard_connected_capacity_independently_verified,false);
  assert.equal(result.production_job_verified,false);
  for(const bad of [
    {...healthy,observed_at:stamp(22000)},
    {...healthy,last_successful_poll_at:stamp(40000)},
    {...healthy,last_successful_poll_at:null},
    {...healthy,last_successful_poll_at:new Date(nowMs+100000).toISOString()},
    {...healthy,observed_at:new Date(nowMs+100000).toISOString()},
    {...healthy,state:'awaiting_healthy_poll'},
    {...healthy,ready:false},
    {...healthy,last_error_code:'remote_poll_failed:500'},
  ])assert.equal(assess(bad,{nowMs}).ready_now,false);
});
