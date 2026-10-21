import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {makeTestReviewGate,signDocument,fingerprint,digest,CANDIDATE_SCHEMA,REVIEW_SCHEMA,TEST_SCOPE} from '../review-gate.mjs';
import {startLabBridge,exerciseReviewedRemoteTool} from '../reviewed-http-bridge.mjs';

function scenario(clock=()=>Date.now()){
  const publisher=crypto.generateKeyPairSync('ed25519');
  const reviewer=crypto.generateKeyPairSync('ed25519');
  const now=clock();
  const candidateBody={
    schema:CANDIDATE_SCHEMA,id:'test.operator.nonce',version:'0.1.0',
    publisher_key_id:fingerprint(publisher.publicKey),transport:'mcp-stdio',
    server_name:'evercraft-operator-test-tool',tool_name:'operator_probe_nonce',
    side_effects:'read_only'
  };
  const candidate=signDocument(candidateBody,publisher.privateKey);
  const receipt=signDocument({
    schema:REVIEW_SCHEMA,candidate_sha256:digest(candidateBody),
    reviewer_key_id:fingerprint(reviewer.publicKey),scope:TEST_SCOPE,
    allowed_tool:'operator_probe_nonce',
    issued_at:new Date(now-30000).toISOString(),
    expires_at:new Date(now+30000).toISOString()
  },reviewer.privateKey);
  const gate=()=>makeTestReviewGate({candidate,approval:receipt,
    publisherPublicKey:publisher.publicKey,reviewerPublicKey:reviewer.publicKey,clock});
  return {publisher,reviewer,candidate,receipt,gate};
}
test('review-gated local tool is remotely discoverable and invocable through real HTTP + separate stdio process',async()=>{
 const s=scenario(),gate=s.gate();const lab=await startLabBridge({gate});
 try{
   const health=await fetch(lab.origin+'/health').then(r=>r.json());
   assert.equal(health.state,'reviewed_test_loopback_only');
   assert.equal(health.independent_human_review_verified,false);
   assert.equal(health.evercraft_publication_granted,false);
   assert.equal(health.commerce_granted,false);
   const r=await exerciseReviewedRemoteTool({origin:lab.origin,nonce:'CHALLENGE_remote_readonly_20261017'});
   assert.equal(r.state,'reviewed_loopback_remote_invocation_verified');
   assert.equal(r.real_http_transport,true);
   assert.equal(r.real_separate_stdio_process,true);
   assert.equal(r.public_fabric_modified,false);
   assert.equal(r.payment_verified,false);
   assert.equal(r.outside_publisher_adopted,false);
   assert.match(r.returned_digest,/^[a-f0-9]{64}$/);
 }finally{await lab.close();}
});
test('initial absence of signed human-review simulation never permits a test capability',()=>{
 const s=scenario();
 assert.throws(()=>makeTestReviewGate({candidate:s.candidate,approval:null,
   publisherPublicKey:s.publisher.publicKey,reviewerPublicKey:s.reviewer.publicKey}),/Review/);
});
test('forged publisher or reviewer signature never creates approved capability',()=>{
 const s=scenario();const forgedCandidate={...s.candidate,body:{...s.candidate.body,side_effects:'financial'}};
 assert.throws(()=>makeTestReviewGate({candidate:forgedCandidate,approval:s.receipt,
   publisherPublicKey:s.publisher.publicKey,reviewerPublicKey:s.reviewer.publicKey}),/signature/);
 const forgedReceipt={...s.receipt,body:{...s.receipt.body,allowed_tool:'pay_now'}};
 assert.throws(()=>makeTestReviewGate({candidate:s.candidate,approval:forgedReceipt,
   publisherPublicKey:s.publisher.publicKey,reviewerPublicKey:s.reviewer.publicKey}),/signature/);
});
test('self-signed publisher review and non-read-only candidate are rejected',()=>{
 const s=scenario();
 assert.throws(()=>makeTestReviewGate({candidate:s.candidate,approval:s.receipt,
   publisherPublicKey:s.publisher.publicKey,reviewerPublicKey:s.publisher.publicKey}),/cannot approve/);
 const changed={...s.candidate.body,side_effects:'financial'};
 const sign=signDocument(changed,s.publisher.privateKey);
 assert.throws(()=>makeTestReviewGate({candidate:sign,approval:s.receipt,
   publisherPublicKey:s.publisher.publicKey,reviewerPublicKey:s.reviewer.publicKey}),/exceeds fixed/);
});
test('review is exact-content-bound, time-bounded and cannot be repurposed for money',()=>{
 const s=scenario();
 const altered={...s.receipt.body,scope:'production'};
 const forgery=signDocument(altered,s.reviewer.privateKey);
 assert.throws(()=>makeTestReviewGate({candidate:s.candidate,approval:forgery,
   publisherPublicKey:s.publisher.publicKey,reviewerPublicKey:s.reviewer.publicKey}),/does not authorize/);
 let time=Date.now();
 const expired=scenario(()=>time);
 const gate=expired.gate();
 time+=60001;
 assert.throws(()=>gate.check(),/currently valid/);
});
test('revocation clears tool inventory and denies tool invocation without affecting Fabric',async()=>{
 const s=scenario(),gate=s.gate(),lab=await startLabBridge({gate});
 const rpc=async(id,method,params={})=>fetch(lab.origin+'/mcp',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id,method,params})
 }).then(r=>r.json());
 try{
   assert.equal((await rpc(1,'tools/list')).result.tools.length,1);
   gate.revoke();
   assert.equal((await rpc(2,'tools/list')).result.tools.length,0);
   const result=await rpc(3,'tools/call',{name:'operator_probe_nonce',arguments:{nonce:'disposable_nonce_AAAAAA'}});
   assert.equal(result.error.code,-32003);
   const health=await fetch(lab.origin+'/health').then(r=>r.json());
   assert.equal(health.state,'held');
   assert.equal(health.production_execution_granted,false);
 }finally{await lab.close();}
});
test('bridge rejects network exposure, unreviewed call and unsupported methods',async()=>{
 const s=scenario(),gate=s.gate();
 await assert.rejects(()=>startLabBridge({gate,host:'0.0.0.0'}),/127.0.0.1/);
 const lab=await startLabBridge({gate});
 try{
   const invalid=await fetch(lab.origin+'/mcp',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',
      params:{name:'purchase',arguments:{nonce:'disposable_nonce_AAAAAA'}}})}).then(r=>r.json());
   assert.equal(invalid.error.code,-32601);
   const outside=await fetch(lab.origin+'/mcp',{method:'POST',
     headers:{'content-type':'application/json'},body:'x'.repeat(5000)});
   assert.equal(outside.status,413);
 }finally{await lab.close();}
});
test('outside-client helper refuses public addresses despite real HTTP transport',async()=>{
 await assert.rejects(()=>exerciseReviewedRemoteTool({origin:'https://fabric.systemiacommandcenters.com'}),/loopback lab bridge/);
 await assert.rejects(()=>exerciseReviewedRemoteTool({origin:'http://localhost:9000'}),/loopback lab bridge/);
});
