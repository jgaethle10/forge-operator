import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPairSync} from 'node:crypto';
import {createNodeAttestation,fingerprintPublicKey} from '../compute/device-identity.mjs';
import {
  createLocalSignedMicroSeedAdapter,
  validateLocalMicroSeedOrigin,
  assertLocalSignedMicroSeedAdapter
} from './local-signed-microseed-adapter.mjs';

const digest='sha256:'+'a'.repeat(64);
const pin=Object.freeze({
  node_id:'test-only-ephemeral-node',device_fingerprint:digest,
  lease_id:'lease_test_only',nonce:'test-only-challenge-0123456789'
});
const payload={value:{task:'test-only-content-hash'}};
const job={
  job_id:'fenced-123',idempotency_key:'fenced-idempotency-123',
  item:{payload},
  work:{workload_class:'systemia.content-hash.v1'},
  role:'source_readiness_auditor'
};
const workDigest='sha256:'+'b'.repeat(64);
const create=(props={})=>createLocalSignedMicroSeedAdapter({
  endpoint:'http://127.0.0.1:8765',
  leaseToken:'test-only-token-not-a-production-credential',
  attestationToken:'test-only-attestation-authority',
  nodePin:pin,jobKey:job.job_id,workDigest,
  idempotencyKey:job.idempotency_key,payload,...props
});

test('only literal IPv4 and IPv6 loopback HTTP origins with explicit ports are accepted',()=>{
  assert.equal(validateLocalMicroSeedOrigin('http://127.0.0.1:8765/'),'http://127.0.0.1:8765');
  assert.equal(validateLocalMicroSeedOrigin('http://[::1]:8766'),'http://[::1]:8766');
  for(const endpoint of [
    'https://127.0.0.1:8765',
    'http://localhost:8765',
    'http://127.0.0.1',
    'http://127.0.0.1:80',
    'http://127.0.0.1:8765/v1/jobs',
    'http://127.0.0.1:8765?debug=true',
    'http://127.0.0.1:8765/#fragment',
    'http://user:pass@127.0.0.1:8765',
    'http://127.0.0.2:8765',
    'http://127.1:8765',
    'http://169.254.169.254:8765',
    'http://192.168.1.12:8765',
    'http://evil.invalid:8765',
    'http://[::ffff:127.0.0.1]:8765',
    'http://127.0.0.1.evil.invalid:8765',
    'file:///etc/passwd',
    '',
  ]){
    assert.throws(()=>validateLocalMicroSeedOrigin(endpoint),
      /fenced_nodeseed_loopback_origin_/,'should reject '+endpoint);
  }
});

test('adapter proves private factory provenance and exact job/device/payload binding',()=>{
  const adapter=create();
  assert.equal(Object.isFrozen(adapter),true);
  const outcome=assertLocalSignedMicroSeedAdapter({
    adapter,job,nodePin:pin,workDigest
  });
  assert.equal(outcome.verified,true);
  assert.equal(outcome.production_authority_granted,false);
  assert.equal(outcome.physical_field_device_verified,false);
  for(const mutation of [
    {job:{...job,idempotency_key:'different-key'}},
    {job:{...job,job_id:'another-job'}},
    {job:{...job,item:{payload:{value:'altered'}}}},
    {nodePin:{...pin,node_id:'other-node'}},
    {nodePin:{...pin,lease_id:'other-lease'}},
    {nodePin:{...pin,nonce:'wrong-challenge-nonce-0123456'}},
    {workDigest:'sha256:'+'0'.repeat(64)}
  ]){
    assert.throws(()=>assertLocalSignedMicroSeedAdapter({
      adapter,job,nodePin:pin,workDigest,...mutation
    }),/fenced_scheduler_first_party_local_adapter_binding_denied/);
  }
  assert.throws(()=>assertLocalSignedMicroSeedAdapter({
    adapter:{runAssignment:adapter.runAssignment},job,nodePin:pin,workDigest
  }),/fenced_scheduler_first_party_local_adapter_binding_denied/);
  assert.throws(()=>assertLocalSignedMicroSeedAdapter({
    adapter:{runAssignment:async()=>({ok:true})},job,nodePin:pin,workDigest
  }),/fenced_scheduler_first_party_local_adapter_binding_denied/);
});

test('first-party adapter denies other workload classes or altered payload before network',async()=>{
  const adapter=create();
  for(const assignment of [
    {...job,work:{workload_class:'systemia.shell-command.v1'}},
    {...job,role:'unapproved_role'},
    {...job,idempotency_key:'some-other-key'},
    {...job,item:{payload:{value:{task:'changed'}}}}
  ]){
    await assert.rejects(adapter.runAssignment({assignment}),
      /fenced_nodeseed_local_assignment_mismatch/);
  }
});

test('invalid lease, pin or timeout rejected before an HTTP request',()=>{
  for(const item of [
    {leaseToken:'short'},
    {attestationToken:'short'},
    {nodePin:{...pin,device_fingerprint:'forged'}},
    {nodePin:{...pin,nonce:'short'}},
    {workDigest:'not-a-digest'},
    {timeoutMs:60000},
    {timeoutMs:0},
    {jobKey:'bad/job'}
  ]){
    assert.throws(()=>create(item),/fenced_nodeseed_local_transport_binding_invalid/);
  }
});



function ephemeralAttestationIdentity(){
  const key=generateKeyPairSync('ed25519');
  const public_key_pem=key.publicKey.export({type:'spki',format:'pem'});
  return {
    node_id:pin.node_id,
    public_key_pem,
    private_key_pem:key.privateKey.export({type:'pkcs8',format:'pem'}),
    fingerprint:fingerprintPublicKey(public_key_pem)
  };
}

test('oversized localhost response is rejected while streaming, after valid attestation',async()=>{
  let requests=0,attested=0;
  const identity=ephemeralAttestationIdentity();
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/v1/attest'){
      attested++;
      let raw='';
      for await(const chunk of req)raw+=chunk.toString('utf8');
      const body=JSON.parse(raw);
      assert.equal(req.headers.authorization,
        'Bearer test-only-attestation-authority');
      const attestation=createNodeAttestation({identity,nonce:body.nonce});
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({ok:true,attestation}));
      return;
    }
    requests++;
    assert.equal(req.method,'POST');
    assert.equal(req.url,'/v1/jobs');
    res.writeHead(200,{'content-type':'application/json'});
    res.end('x'.repeat(130*1024));
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const adapter=create({
      endpoint:'http://127.0.0.1:'+server.address().port,
      nodePin:{...pin,device_fingerprint:identity.fingerprint}
    });
    await assert.rejects(
      adapter.runAssignment({assignment:job}),
      /fenced_nodeseed_local_response_too_large/
    );
    assert.equal(attested,1);
    assert.equal(requests,1);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});

test('forged or wrong-device attestation blocks job HTTP before any execution',async()=>{
  const identity=ephemeralAttestationIdentity();
  let attestCalls=0,jobCalls=0;
  const server=http.createServer(async(req,res)=>{
    let raw='';
    for await(const chunk of req)raw+=chunk.toString('utf8');
    res.setHeader('content-type','application/json');
    if(req.url==='/v1/attest'){
      attestCalls++;
      const body=JSON.parse(raw);
      res.end(JSON.stringify({ok:true,
        attestation:createNodeAttestation({
          identity,nonce:body.nonce
        })
      }));
    }else {
      jobCalls++;
      res.end(JSON.stringify({ok:true}));
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const adapter=create({endpoint:'http://127.0.0.1:'+server.address().port});
    await assert.rejects(adapter.runAssignment({assignment:job}),
      /fenced_nodeseed_local_attestation_identity_denied/);
    assert.equal(attestCalls,1);
    assert.equal(jobCalls,0);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
