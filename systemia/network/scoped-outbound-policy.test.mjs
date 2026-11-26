import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopedOutboundPolicy} from './scoped-outbound-policy.mjs';
const hash='systemia.content-hash.v1';
const restore='systemia.evermaps-cemetery-restore.v1';
const ingest='systemia.evermaps-cemetery-ingest.v1';
const job=workload=>({method:'POST',route:'/v1/jobs',body:{workload_class:workload}});
test('default permits hash only',()=>{
 const p=createScopedOutboundPolicy();
 assert.equal(p(job(hash)),true);
 for(const w of [restore,ingest,'shell',undefined])assert.equal(p(job(w)),false);
});
test('explicit restore phase does not admit ingestion',()=>{
 const p=createScopedOutboundPolicy({policy:'node002-cemetery-scoped',workloads:[hash,restore]});
 assert.equal(p(job(restore)),true);
 assert.equal(p(job(ingest)),false);
});
test('invalid configuration fails closed',()=>{
 for(const options of [{policy:'unknown'},{workloads:[restore]},{policy:'node002-cemetery-scoped',workloads:[restore,ingest]},{workloads:[]}])assert.throws(()=>createScopedOutboundPolicy(options));
});
test('operator mutation and service lifecycle routes remain forbidden',()=>{
 const p=createScopedOutboundPolicy({policy:'node002-cemetery-scoped',workloads:[ingest]});
 for(const route of ['/v1/operator/exec','/v1/operator/fs/write','/v1/operator/fs/read','/v1/services/foo/stop','/v1/jobs?x=1','/v1/field-enrollment-packet'])assert.equal(p({method:'POST',route,body:{workload_class:ingest}}),false);
});
test('lease requests require explicit admitted workload',()=>{
 const p=createScopedOutboundPolicy({policy:'node002-cemetery-scoped',workloads:[ingest]});
 const lease=workload=>({method:'POST',route:'/v1/leases',body:{workload_class:workload}});
 assert.equal(p(lease(ingest)),true);
 assert.equal(p(lease(restore)),false);
 assert.equal(p(lease(undefined)),false);
});
