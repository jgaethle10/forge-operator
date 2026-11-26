import test from 'node:test';
import assert from 'node:assert/strict';
import {narrowContentHashCommandAllowed as allowed,startOutboundNodeAgent} from './outbound-node-agent.mjs';
const W='systemia.content-hash.v1';
test('restore exact installed hash-only policy and deny commercial work without admission',()=>{
 const lease={method:'POST',route:'/v1/leases',body:{workload_class:W,requested_ttl_ms:30000}};
 const job={method:'POST',route:'/v1/jobs',body:{workload_class:W,idempotency_key:'test-key-001',lease_id:'fixture',token:'fixture',input:{idempotency_key:'test-key-001',payload:{value:{synthetic:true}}}}};
 assert.equal(allowed(lease),true);
 assert.equal(allowed(job),true);
 for(const command of [
  {...lease,body:{...lease.body,workload_class:'systemia.findmypart-desk-shadow-review.v1'}},
  {...job,body:{...job.body,workload_class:'systemia.findmypart-desk-shadow-review.v1'}},
  {...lease,body:{...lease.body,requested_ttl_ms:120001}},
  {...job,body:{...job.body,input:{...job.body.input,idempotency_key:'wrong'}}},
  {...job,body:{...job.body,input:{...job.body.input,payload:{value:'x'.repeat(5000)}}}},
  {method:'POST',route:'/v1/operator/exec',body:{}},
  {method:'POST',route:'/v1/operator/fs/read',body:{}},
  {method:'POST',route:'/v1/services/test/stop',body:{}},
  {method:'POST',route:'/v1/services/test/http-bridge',body:{}},
  {method:'GET',route:'/v1/operator/status'},
 ]) assert.equal(allowed(command),false,command.route);
});
test('unsupported command policy fails before network access',async()=>{
 await assert.rejects(startOutboundNodeAgent({brokerUrl:'http://127.0.0.1:1',commandPolicy:'findmypart-desk-shadow-review'}),/unsupported_worker_command_policy/);
});
test('pre-registration guard fails before any local capacity request',async()=>{
 await assert.rejects(startOutboundNodeAgent({brokerUrl:'http://127.0.0.1:1',localCapacityEndpoint:'http://127.0.0.1:1',localAllocatorToken:'fixture',commandPolicy:'content-hash-only',preRegisterGuard:async()=>{throw Error('fixture_guard_denied')}}),/fixture_guard_denied/);
});
