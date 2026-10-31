import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {startOutboundCapacityBroker} from '../systemia/network/outbound-capacity-broker.mjs';
import {startOutboundNodeAgent} from '../systemia/network/outbound-node-agent.mjs';

// Runs on an ephemeral loopback-only NodeSeed and broker with synthetic
// software identity. Never represents physical NextGen enrollment or a
// production Systemia/Compute signed permit.
test('Node002 pinned outbound policy executes a real content hash through the private broker only', {timeout:25000}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'node002-hash-transport-'));
  const localAllocatorToken='node002-test-local-allocator-only';
  const nodeId='evercraft-node002-nextgen';
  let seed=null,broker=null,agent=null;
  const json=async(r)=>{
    const body=await r.json().catch(()=>({}));
    return {status:r.status,body};
  };
  try{
    seed=await startNodeSeed({
      root:path.join(root,'node'),
      nodeId,host:'127.0.0.1',port:0,
      advertiseHost:'127.0.0.1',announce:false,
      allocatorToken:localAllocatorToken,
    });
    broker=await startOutboundCapacityBroker({
      stateDir:path.join(root,'broker'),
      authorizedDevices:{[seed.device_fingerprint]:nodeId},
      pollWaitMs:100,commandTimeoutMs:7000,capacityFreshMs:500,
    });
    agent=await startOutboundNodeAgent({
      brokerUrl:broker.endpoint,
      localCapacityEndpoint:seed.endpoint,
      localAllocatorToken,
      expectedNodeId:nodeId,
      expectedDeviceFingerprint:seed.device_fingerprint,
      commandPolicy:'content-hash-only',
      capacityWorkloadAllowlist:['systemia.content-hash.v1'],
      pollBackoffMs:25,
    });
    const grant=broker.controlGrant(nodeId);
    assert.equal(grant.device_fingerprint,seed.device_fingerprint);
    const capacity=await json(await fetch(grant.capacity_endpoint+'/v1/capacity'));
    assert.equal(capacity.status,200);
    assert.deepEqual(capacity.body.supported_workloads,['systemia.content-hash.v1']);
    const lease=await json(await fetch(grant.capacity_endpoint+'/v1/leases',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+grant.allocator_token},
      body:JSON.stringify({workload_class:'systemia.content-hash.v1',requested_ttl_ms:90000}),
    }));
    assert.equal(lease.status,201,JSON.stringify(lease.body));
    assert.ok(lease.body.lease_id);
    const value={saban:'node002-owned-transport',canary:true};
    const key='node002-test-contenthash-20261028';
    // Deliberately the canonical NodeSeed job shape: input has payload,
    // not a duplicated input.idempotency_key.
    const body={
      lease_id:lease.body.lease_id,token:lease.body.token,
      workload_class:'systemia.content-hash.v1',idempotency_key:key,
      input:{payload:{value}},
    };
    const submit=async()=>json(await fetch(grant.capacity_endpoint+'/v1/jobs',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(body),
    }));
    const job=await submit();
    assert.equal(job.status,200,JSON.stringify(job.body));
    assert.equal(job.body.ok,true);
    const expectedDigest='sha256:'+createHash('sha256').update(
      JSON.stringify({canary:true,saban:'node002-owned-transport'})
    ).digest('hex');
    assert.equal(job.body.result?.digest,expectedDigest,
      'must return the actual digest for the supplied canonical JSON');
    assert.equal(job.body.worker_receipt?.registered_workload_only,true);
    assert.equal(job.body.deduplicated,false);
    const repeated=await submit();
    assert.equal(repeated.status,200,JSON.stringify(repeated.body));
    assert.equal(repeated.body.result?.digest,expectedDigest);
    assert.equal(repeated.body.deduplicated,true,
      'same-key retry must reuse durable NodeSeed job, not execute a second time');
    const conflict=await json(await fetch(grant.capacity_endpoint+'/v1/jobs',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...body,input:{payload:{value:{different:true}}}}),
    }));
    assert.equal(conflict.status,409,'same-key changed payload must fail closed');
    assert.equal(conflict.body.error,'nodeseed_registered_worker_idempotency_conflict');
    const agentStatus=agent.status();
    assert.equal(agentStatus.device_fingerprint,seed.device_fingerprint);
    assert.equal(agentStatus.command_policy,'content-hash-only');
    assert.ok(agentStatus.secure_commands_opened>0);
    // This policy is a leaf; an operator status route is not exposed by the
    // constrained worker even when the generic broker supports other paths.
    const denied=await json(await fetch(grant.capacity_endpoint+'/v1/operator/status',{
      headers:{authorization:'Bearer '+grant.allocator_token},
    }));
    assert.equal(denied.status,403,JSON.stringify(denied.body));
    assert.equal(denied.body.error,'remote_route_not_allowed',
      'denial must happen at the device command policy, not as broker 404');
    const release=await json(await fetch(grant.capacity_endpoint+
      '/v1/leases/'+encodeURIComponent(lease.body.lease_id)+'/release',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({token:lease.body.token}),
    }));
    assert.equal(release.status,200,JSON.stringify(release.body));
    console.log(JSON.stringify({
      mode:'ephemeral_ci_only',
      content_hash_completed:true,
      exact_digest_independently_recomputed:true,
      same_key_retry_deduplicated:true,
      conflicting_idempotency_rejected:true,
      lease_released:true,
      device_fingerprint_bound:true,
      advertised_workloads:['systemia.content-hash.v1'],
      remote_operator_status_denied:true,
      physical_host_attestation_verified:false,
      systemia_production_permission_granted:false,
    }));
  }finally{
    if(agent)await agent.close();
    if(broker)await broker.close();
    if(seed)await seed.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
