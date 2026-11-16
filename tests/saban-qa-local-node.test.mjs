import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {probeOperatorQaNode,executeOperatorLocalQa,normalizeLocalQaEndpoint} from '../systemia/saban/qa-local-node.mjs';
test('QA accepts only an explicit localhost HTTP endpoint without credentials',()=>{
 assert.equal(normalizeLocalQaEndpoint('http://127.0.0.1:42420'),'http://127.0.0.1:42420');
 for(const x of ['https://127.0.0.1:42420','http://192.168.1.20:42420','http://localhost:42420/path',
  'http://127.0.0.1:42420?x=1','http://user:pass@127.0.0.1:42420','file:///tmp/test','http://127.0.0.1']){
  assert.throws(()=>normalizeLocalQaEndpoint(x),/qa_endpoint/);
 }
});
test('signed local challenge and authorized Saban QA job return real worker receipts',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-local-qa-'));
 const allocatorToken='test-'+randomBytes(16).toString('hex');
 let seed=null;
 try{
  seed=await startNodeSeed({root,nodeId:'node001-qa-synthetic',host:'127.0.0.1',port:0,
   allocatorToken,announce:false,zeroCost:true,placementLabels:['operator-authorized']});
  const opts={endpoint:seed.endpoint,expectedNodeId:'node001-qa-synthetic',expectedFingerprint:seed.device_fingerprint,
   allocatorToken,operatorApproved:true};
  const probe=await probeOperatorQaNode(opts);
  assert.equal(probe.ok,true,JSON.stringify(probe.report));
  assert.equal(probe.report.state,'signed_loopback_candidate');
  const result=await executeOperatorLocalQa({...opts,execute:true,roles:['work_saban_checker']});
  assert.equal(result.state,'passed_local_qa_not_hardware_certified',JSON.stringify(result));
  assert.ok(result.tests_passed>0);
  assert.equal(result.worker_count,1);
  assert.equal(result.integrity_reviews.length,1);
  assert.equal(result.physical_hardware_independently_verified,false);
  assert.equal(result.node_release_sha_independently_attested,false);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(allocatorToken));
  let calls=0;
  const counted=async(...args)=>{calls++;return fetch(...args)};
  const denied=await executeOperatorLocalQa({...opts,operatorApproved:false,execute:true,fetchImpl:counted});
  assert.equal(denied.state,'held');
  assert.equal(calls,0);
  const invalidPin=await probeOperatorQaNode({...opts,expectedFingerprint:'b'.repeat(64)});
  assert.equal(invalidPin.ok,false);
  assert.equal(invalidPin.report.reason,'device_capacity_held');
  await assert.rejects(()=>executeOperatorLocalQa({...opts,execute:true,roles:['../../../evil']}),/qa_roles_not_allowlisted/);
 }finally{if(seed)await seed.close();fs.rmSync(root,{recursive:true,force:true})}
});
test('forged attestation and contradictory workload roster cannot obtain a lease',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-local-qa-forged-'));
 const allocatorToken='test-'+randomBytes(16).toString('hex');
 let seed;
 try{
  seed=await startNodeSeed({root,nodeId:'node002-qa-synthetic',host:'127.0.0.1',port:0,
   allocatorToken,announce:false,zeroCost:true,placementLabels:['operator-authorized']});
  const opts={endpoint:seed.endpoint,expectedNodeId:'node002-qa-synthetic',
   expectedFingerprint:seed.device_fingerprint,allocatorToken,operatorApproved:true};
  let leases=0;
  const spoof=async(url,options)=>{
   if(String(url).endsWith('/v1/leases'))leases++;
   const r=await fetch(url,options);
   if(String(url).endsWith('/v1/attest')){
    const j=await r.json();j.attestation.signature='AAAA';
    return new Response(JSON.stringify(j),{status:200,headers:{'content-type':'application/json'}});
   }
   return r;
  };
  const failed=await executeOperatorLocalQa({...opts,execute:true,fetchImpl:spoof});
  assert.equal(failed.state,'held');
  assert.equal(failed.reason,'attestation_invalid');
  assert.equal(leases,0);
  const mutated=async(url,options)=>{
   const r=await fetch(url,options);
   if(String(url).endsWith('/v1/capacity')){
    const j=await r.json();
    j.supported_workloads.push('invented.workload.v1');
    return new Response(JSON.stringify(j),{status:200,headers:{'content-type':'application/json'}});
   }
   return r;
  };
  const mismatch=await probeOperatorQaNode({...opts,fetchImpl:mutated});
  assert.equal(mismatch.ok,false);
  assert.equal(mismatch.report.reason,'attested_workload_inventory_mismatch');
 }finally{if(seed)await seed.close();fs.rmSync(root,{recursive:true,force:true})}
});
