import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startNodeSeed} from '../compute/node-seed.mjs';
import {probeLocalNode,validateLoopbackOrigin} from './field-node-probe.mjs';

const scratch=mkdtempSync(join(tmpdir(),'os-pinned-node-proof-'));
const nodeId='ephemeral-local-node-not-a-field-device';
const token='private-ephemeral-token-do-not-return';
const seed=await startNodeSeed({
  root:join(scratch,'seed'),
  nodeId,
  host:'127.0.0.1',
  advertiseHost:'127.0.0.1',
  port:0,
  allocatorToken:token,
  announce:false
});
const args={
  endpoint:seed.endpoint,
  expectedNodeId:nodeId,
  expectedFingerprint:seed.device_fingerprint,
  bearerToken:token
};
test.after(async()=>{await seed.close();rmSync(scratch,{recursive:true,force:true});});

test('a real live NodeSeed signs a fresh locally pinned challenge and receipt grants no authority',async()=>{
  const receipt=await probeLocalNode(args);
  assert.equal(receipt.state,'local_signed_identity_verified',receipt.reason);
  assert.equal(receipt.signed_identity_verified,true);
  assert.equal(receipt.capacity_consistent,true);
  assert.equal(receipt.device_fingerprint,seed.device_fingerprint);
  assert.ok(receipt.attestation_receipt_sha256.startsWith('sha256:'));
  assert.ok(receipt.supported_workloads.includes('saban.multiplier-assignment.v1'));
  for(const key of ['real_field_host_independently_verified','broker_authorized','yard_authorized',
      'remote_jobs_enabled','production_execution_granted','deployment_performed',
      'credentials_in_receipt']) {
    assert.equal(receipt[key],false,key);
  }
  assert.ok(!JSON.stringify(receipt).includes(token));
  assert.ok(!JSON.stringify(receipt).includes('private_key_pem'));
});

test('missing or incorrect independent pin fails closed',async()=>{
  const none=await probeLocalNode({...args,expectedFingerprint:null,
    fetchFn:()=>{throw new Error('no_network_before_pin')}});
  assert.equal(none.state,'held');
  assert.equal(none.reason,'independent_device_pin_required');
  const wrong=await probeLocalNode({...args,expectedFingerprint:'sha256:'+'0'.repeat(64)});
  assert.equal(wrong.state,'held');
  const wrongId=await probeLocalNode({...args,expectedNodeId:'other-node'});
  assert.equal(wrongId.state,'held');
});

test('nonloopback or credential-bearing URL rejected before contacting any host',()=>{
  for(const url of [
    'http://192.168.88.5:42420/',
    'http://localhost:42420/',
    'https://example.com:443/',
    'http://user:pass@127.0.0.1:42420/',
    'http://127.0.0.1:42420/steal',
    'http://localhost:42420/?bad=1',
    'http://127.0.0.1/',
    'http://127.0.0.1:42420/#user'
  ]) assert.throws(()=>validateLoopbackOrigin(url),/loopback/);
  assert.equal(validateLoopbackOrigin(seed.endpoint),new URL(seed.endpoint).origin);
});

test('no secret or full error payload can be printed on unauthorized attest',async()=>{
  const denied=await probeLocalNode({...args,bearerToken:'wrong-token'});
  assert.equal(denied.state,'held');
  assert.equal(denied.reason,'fresh_attestation_unavailable');
  assert.equal(denied.credentials_in_receipt,false);
  assert.ok(!JSON.stringify(denied).includes('wrong-token'));
});

test('malicious signature or replayed nonce fails closed',async()=>{
  const forged=await probeLocalNode({
    ...args,
    fetchFn:async(url,options)=>{
      const actual=await fetch(url,options);
      if (!url.endsWith('/v1/attest') || !actual.ok) return actual;
      const obj=await actual.json();
      obj.attestation.signature='AA==';
      return new Response(JSON.stringify(obj),{
        status:200,headers:{'content-type':'application/json'}
      });
    }
  });
  assert.equal(forged.state,'held');
  assert.equal(forged.reason,'signature_or_challenge_invalid');
  const replay=await probeLocalNode({
    ...args,
    fetchFn:async(url,options)=>{
      const actual=await fetch(url,options);
      if (!url.endsWith('/v1/attest') || !actual.ok) return actual;
      const obj=await actual.json();
      obj.attestation.statement.nonce='replayed-different-nonce';
      return new Response(JSON.stringify(obj),{
        status:200,headers:{'content-type':'application/json'}
      });
    }
  });
  assert.equal(replay.state,'held');
});

test('capacity cannot be swapped independently of the signed attestation',async()=>{
  const forged=await probeLocalNode({
    ...args,
    fetchFn:async(url,options)=>{
      const actual=await fetch(url,options);
      if (!url.endsWith('/v1/capacity') || !actual.ok) return actual;
      const obj=await actual.json();
      obj.supported_workloads.push('unapproved-production-execution.v1');
      return new Response(JSON.stringify(obj),{
        status:200,headers:{'content-type':'application/json'}
      });
    }
  });
  assert.equal(forged.state,'held');
  assert.equal(forged.reason,'capacity_attestation_contents_mismatch');
});
